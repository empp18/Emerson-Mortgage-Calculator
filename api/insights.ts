import { GoogleGenAI, Type } from '@google/genai';
import { calculateAllScenarios } from '../services/mortgageCalculator.js';
import { getTimelineSnapshots } from '../services/geminiService.js';
import { buildInsightsPrompt } from '../services/insightsPrompt.js';
import type { MortgageParams } from '../types.js';

// Vercel function: POST /api/insights. Holds the Gemini key; the browser only sends calculator inputs.

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        timeline: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    year: { type: Type.INTEGER, description: '7, 13 or 20' },
                    subtitle: { type: Type.STRING, description: 'Six words or fewer' },
                    takeaway: { type: Type.STRING, description: 'One sentence' },
                },
                required: ['year', 'subtitle', 'takeaway'],
            },
        },
        bottomLine: {
            type: Type.OBJECT,
            properties: {
                lead: { type: Type.STRING, description: 'Opening clause' },
                emphasis: { type: Type.STRING, description: 'Closing clause with the key result' },
            },
            required: ['lead', 'emphasis'],
        },
        fullAnalysis: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { label: { type: Type.STRING }, text: { type: Type.STRING } },
                required: ['label', 'text'],
            },
        },
    },
    required: ['timeline', 'bottomLine', 'fullAnalysis'],
};

const FREQUENCIES = ['weekly', 'bi-weekly', 'monthly', 'annually'] as const;
const MODES = ['monthly', 'biWeekly', 'biWeeklyWithExtra', 'all'] as const;

const inRange = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// Rebuilds MortgageParams from untrusted input, keeping only known fields with sane values
function readParams(raw: unknown): MortgageParams | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Record<string, unknown>;
    if (!inRange(p.homePrice, 1, 100_000_000) || !inRange(p.downPayment, 0, p.homePrice as number)) return null;
    if (!inRange(p.loanTerm, 1, 50) || !Number.isInteger(p.loanTerm) || !inRange(p.interestRate, 0, 30)) return null;
    for (const key of ['propertyTaxes', 'homeownersInsurance', 'hoaDues', 'pmi', 'extraPayment']) {
        if (!inRange(p[key], 0, 10_000_000)) return null;
    }
    if (!FREQUENCIES.includes(p.extraPaymentFrequency as any)) return null;
    const oneTime = p.oneTimePayment === undefined ? 0 : p.oneTimePayment;
    if (!inRange(oneTime, 0, 100_000_000)) return null;
    const date = typeof p.oneTimePaymentDate === 'string' && /^\d{4}-\d{2}$/.test(p.oneTimePaymentDate) ? p.oneTimePaymentDate : undefined;
    const mode = MODES.includes(p.oneTimePaymentMode as any) ? (p.oneTimePaymentMode as MortgageParams['oneTimePaymentMode']) : 'monthly';
    return {
        homePrice: p.homePrice as number,
        downPayment: p.downPayment as number,
        loanTerm: p.loanTerm as number,
        interestRate: p.interestRate as number,
        propertyTaxes: p.propertyTaxes as number,
        homeownersInsurance: p.homeownersInsurance as number,
        hoaDues: p.hoaDues as number,
        pmi: p.pmi as number,
        extraPayment: p.extraPayment as number,
        extraPaymentFrequency: p.extraPaymentFrequency as MortgageParams['extraPaymentFrequency'],
        oneTimePayment: oneTime,
        oneTimePaymentDate: date,
        oneTimePaymentMode: mode,
    };
}

export async function POST(request: Request): Promise<Response> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return Response.json({ error: 'AI is not configured' }, { status: 503 });

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const params = readParams(body.params);
    const { appreciationRate, closingCostRate } = body;
    if (!params || !inRange(appreciationRate, -20, 30) || !inRange(closingCostRate, 0, 20)) {
        return Response.json({ error: 'Invalid inputs' }, { status: 400 });
    }
    const includeCarryingCosts = body.includeCarryingCosts === true;

    const results = calculateAllScenarios(params);
    const timeline = getTimelineSnapshots(results, params, appreciationRate, includeCarryingCosts, closingCostRate);

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: buildInsightsPrompt(params, timeline, appreciationRate, includeCarryingCosts, closingCostRate),
            config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        });
        return Response.json({ text: response.text ?? null });
    } catch (error) {
        console.error('Gemini request failed:', error);
        return Response.json({ error: 'AI request failed' }, { status: 502 });
    }
}
