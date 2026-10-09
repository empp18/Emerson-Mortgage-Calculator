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

// Tried in order: the second is used only if the first call fails (e.g. Google retires or limits a model)
const MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash'];

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

// Short, key-free description of a failure, so the page can say why the AI is unavailable
const describe = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    const reason = /"reason":"([A-Z_]+)"/.exec(message)?.[1] ?? /"status":"([A-Z_]+)"/.exec(message)?.[1];
    return (reason ?? message).replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]').slice(0, 160);
};

// Health check: open /api/insights in a browser to see whether the function loads and sees the key
export function GET(): Response {
    return Response.json({ ok: true, keyConfigured: Boolean(process.env.GEMINI_API_KEY), models: MODELS, node: process.version });
}

export async function POST(request: Request): Promise<Response> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return Response.json({ error: 'AI is not configured', reason: 'GEMINI_API_KEY is not set for this environment' }, { status: 503 });

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

    const ai = new GoogleGenAI({ apiKey });
    const contents = buildInsightsPrompt(params, timeline, appreciationRate, includeCarryingCosts, closingCostRate);
    let lastError: unknown;
    for (const model of MODELS) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents,
                config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
            });
            return Response.json({ text: response.text ?? null, model });
        } catch (error) {
            console.error(`Gemini request failed with ${model}:`, error);
            lastError = error;
        }
    }
    return Response.json({ error: 'AI request failed', reason: describe(lastError) }, { status: 502 });
}
