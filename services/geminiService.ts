
import { GoogleGenAI, Type } from "@google/genai";
import type { MortgageParams, CalculationResults, AmortizationEntry } from '../types';

export interface SnapshotMetrics {
    year: number;
    futureValue: number;
    remainingBalance: number;
    totalInterestToDate: number;
    closingCosts: number;
    netProceeds: number;
    principalPaidToDate: number;
    carryingCostsToDate: number; // taxes, insurance, HOA and PMI paid so far (0 unless opted in)
    trueGain: number;
    trueNetGain: number;
}

// Ownership costs beyond the loan itself. Passing this to getSnapshotAtYear opts in to counting them.
export interface CarryingCosts {
    propertyTaxes: number;       // annual
    homeownersInsurance: number; // annual
    hoaDues: number;             // monthly
}

// Helper to get data at a specific year
export function getSnapshotAtYear(
    schedule: AmortizationEntry[], 
    year: number, 
    initialHomePrice: number, 
    downPayment: number,
    isBiWeekly: boolean,
    appreciationRate: number = 3.5,
    carrying?: CarryingCosts
): SnapshotMetrics {
    const rateDecimal = appreciationRate / 100;
    const growthFactor = Math.pow(1 + rateDecimal, year);

    // Safety check for empty schedules (e.g. 100% down payment)
    if (!schedule || schedule.length === 0) {
        const futureVal = initialHomePrice * growthFactor;
        const carryingCostsToDate = carrying
            ? (carrying.propertyTaxes + carrying.homeownersInsurance + carrying.hoaDues * 12) * year
            : 0;
        return {
            year,
            futureValue: futureVal,
            remainingBalance: 0,
            totalInterestToDate: 0,
            closingCosts: futureVal * 0.08,
            netProceeds: futureVal * 0.92,
            principalPaidToDate: 0,
            carryingCostsToDate,
            trueGain: (futureVal * 0.92) - initialHomePrice,
            trueNetGain: (futureVal * 0.92) - initialHomePrice - carryingCostsToDate
        };
    }

    // Critical Fix: Calculate periods based on frequency
    const periodsPerYear = isBiWeekly ? 26 : 12;
    const targetPeriod = year * periodsPerYear;
    
    // Find the entry closest to the target period
    let entry = schedule.find(e => e.month >= targetPeriod);
    
    // If paid off early (entry is undefined), use the very last entry of the schedule
    if (!entry) entry = schedule[schedule.length - 1];

    // Appreciation Calc
    const futureValue = initialHomePrice * growthFactor;
    const closingCosts = futureValue * 0.08; // 8% fees
    
    // If the loan was paid off before this year, balance is 0.
    // We check if the last entry in the schedule happened BEFORE our target year.
    const lastEntry = schedule[schedule.length - 1];
    const paidOffEarly = lastEntry.month < targetPeriod;
    const remainingBalance = paidOffEarly ? 0 : entry.remainingBalance;
    
    // Net Proceeds: What hits the bank account at closing
    // (Sale Price - Closing Costs - Mortgage Payoff)
    const netProceeds = (futureValue - closingCosts) - remainingBalance;
    
    // Calculate total interest paid up to this point
    // If paid off early, we sum ALL interest. If not, we sum up to the target entry.
    let totalInterestToDate = 0;
    let pmiToDate = 0;
    const limitPeriod = paidOffEarly ? lastEntry.month : entry.month;
    
    for(const e of schedule) {
        if (e.month <= limitPeriod) {
            totalInterestToDate += e.interest;
            // Schedule rows carry PMI inside totalPayment; recover it by subtraction
            pmiToDate += e.totalPayment - e.principal - e.extraPayment - e.interest;
        } else {
            break;
        }
    }

    // Taxes, insurance and HOA are owed for the whole holding period, even if the loan is paid off early
    const carryingCostsToDate = carrying
        ? (carrying.propertyTaxes + carrying.homeownersInsurance + carrying.hoaDues * 12) * year + pmiToDate
        : 0;

    // Principal is cash out of the owner's pocket that the sale only hands back, so it is not gain.
    const principalPaidToDate = (initialHomePrice - downPayment) - remainingBalance;

    // True Gain: cash received minus every dollar put in toward the home (down payment + principal paid).
    // Equivalent to (sale price - closing costs) - original price.
    const trueGain = netProceeds - downPayment - principalPaidToDate;

    // True Net Gain: True Gain after the cost of borrowing (interest) and, if opted in, carrying costs.
    const trueNetGain = trueGain - totalInterestToDate - carryingCostsToDate;

    return {
        year,
        futureValue,
        remainingBalance,
        totalInterestToDate,
        closingCosts,
        netProceeds,
        principalPaidToDate,
        carryingCostsToDate,
        trueGain,
        trueNetGain
    };
}

// The three payment plans compared throughout the app, at one holding period
export function getScenarioSnapshots(
    results: CalculationResults,
    params: MortgageParams,
    year: number,
    appreciationRate: number,
    includeCarryingCosts: boolean
) {
    const carrying = includeCarryingCosts
        ? { propertyTaxes: params.propertyTaxes, homeownersInsurance: params.homeownersInsurance, hoaDues: params.hoaDues }
        : undefined;
    return {
        monthly: getSnapshotAtYear(results.monthly.schedule, year, params.homePrice, params.downPayment, false, appreciationRate, carrying),
        biWeekly: getSnapshotAtYear(results.biWeekly.schedule, year, params.homePrice, params.downPayment, true, appreciationRate, carrying),
        biWeeklyExtra: getSnapshotAtYear(results.biWeeklyWithExtra.schedule, year, params.homePrice, params.downPayment, true, appreciationRate, carrying),
    };
}

export type ScenarioSnapshots = ReturnType<typeof getScenarioSnapshots>;
export type PlanKey = keyof ScenarioSnapshots;

// The sale points the analysis compares
export const INSIGHT_YEARS = [7, 13, 20] as const;
export type InsightYear = (typeof INSIGHT_YEARS)[number];

export const PLAN_KEYS: PlanKey[] = ['monthly', 'biWeekly', 'biWeeklyExtra'];
export const PLAN_NAMES: Record<PlanKey, string> = {
    monthly: 'Monthly',
    biWeekly: 'Bi-Weekly',
    biWeeklyExtra: 'Bi-Weekly v2.0',
};

export interface TimelinePoint {
    year: InsightYear;
    plans: ScenarioSnapshots;
}

export interface MortgageInsights {
    timeline: { year: InsightYear; subtitle: string; takeaway: string }[];
    bottomLine: { lead: string; emphasis: string }; // one sentence; emphasis is the closing clause
    fullAnalysis: { label: string; text: string }[];
    source: 'ai' | 'fallback'; // fallback text is built from the numbers, not written by the AI
}

// -$62k / +$101k, with a typographic minus. Shared by the analysis card and the fallback text.
export const formatSignedThousands = (value: number): string => {
    const thousands = Math.round(Math.abs(value) / 1000);
    if (thousands === 0) return '$0';
    return `${value < 0 ? '−' : '+'}$${thousands}k`;
};

export function getTimelineSnapshots(
    results: CalculationResults,
    params: MortgageParams,
    appreciationRate: number,
    includeCarryingCosts: boolean
): TimelinePoint[] {
    return INSIGHT_YEARS.map(year => ({
        year,
        plans: getScenarioSnapshots(results, params, year, appreciationRate, includeCarryingCosts),
    }));
}

const bestPlan = (point: TimelinePoint) => {
    const gains = PLAN_KEYS.map(key => ({ key, gain: point.plans[key].trueNetGain }));
    return gains.reduce((best, current) => (current.gain > best.gain ? current : best));
};

// Deterministic analysis from the numbers alone. Used when the AI is unavailable or its reply is unusable.
export function buildFallbackInsights(timeline: TimelinePoint[]): MortgageInsights {
    const rows = timeline.map(point => {
        const gains = PLAN_KEYS.map(key => point.plans[key].trueNetGain);
        const best = bestPlan(point);
        const subtitle = gains.every(g => g < 0)
            ? 'All plans lose money'
            : gains.every(g => g > 0)
                ? 'All plans gain'
                : 'Results are mixed';
        const verdict = best.gain < 0 ? 'loses the least' : 'comes out best';
        const takeaway = `${PLAN_NAMES[best.key]} ${verdict}, at ${formatSignedThousands(best.gain)} true net gain.`;
        return {
            year: point.year,
            subtitle,
            takeaway,
            range: `The plans sit between ${formatSignedThousands(Math.min(...gains))} and ${formatSignedThousands(Math.max(...gains))}.`,
        };
    });

    const labels = ['Short-term sale (7 years)', 'Mid-term (13 years)', 'Long term (20 years)'];
    const fullAnalysis = rows.map((row, i) => ({ label: labels[i], text: `${row.takeaway} ${row.range}` }));

    const last = timeline[timeline.length - 1];
    const bestAtLast = bestPlan(last);
    const edgeOverMonthly = Math.round(Math.abs(bestAtLast.gain - last.plans.monthly.trueNetGain) / 1000);
    fullAnalysis.push({
        label: 'Strategy',
        text: `At ${last.year} years, ${PLAN_NAMES[bestAtLast.key]} gives the best true net gain at ${formatSignedThousands(bestAtLast.gain)}, $${edgeOverMonthly}k more than the Monthly plan.`,
    });

    const firstAhead = timeline.find(point => bestPlan(point).gain > 0);
    const bottomLine = firstAhead
        ? {
            lead: `A plan first comes out ahead if you sell at ${firstAhead.year} years:`,
            emphasis: `${PLAN_NAMES[bestPlan(firstAhead).key]} nets ${formatSignedThousands(bestPlan(firstAhead).gain)}.`,
        }
        : {
            lead: `None of the plans come out ahead within ${last.year} years;`,
            emphasis: `the best one still shows ${formatSignedThousands(bestAtLast.gain)}.`,
        };

    return {
        timeline: rows.map(({ year, subtitle, takeaway }) => ({ year, subtitle, takeaway })),
        bottomLine,
        fullAnalysis,
        source: 'fallback',
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

// Turns the model's JSON reply into MortgageInsights. Any problem returns the fallback instead.
export function parseMortgageInsights(text: string | null | undefined, timeline: TimelinePoint[]): MortgageInsights {
    const fallback = buildFallbackInsights(timeline);
    if (!text) return fallback;

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return fallback;
    }
    if (!isRecord(data)) return fallback;

    const rawTimeline = data.timeline;
    if (!Array.isArray(rawTimeline)) return fallback;
    const parsedTimeline: MortgageInsights['timeline'] = [];
    for (const year of INSIGHT_YEARS) {
        const item = rawTimeline.find(entry => isRecord(entry) && Number(entry.year) === year);
        if (!isRecord(item) || !isText(item.subtitle) || !isText(item.takeaway)) return fallback;
        parsedTimeline.push({ year, subtitle: item.subtitle.trim(), takeaway: item.takeaway.trim() });
    }

    const rawBottomLine = data.bottomLine;
    if (!isRecord(rawBottomLine) || !isText(rawBottomLine.lead) || !isText(rawBottomLine.emphasis)) return fallback;

    const rawAnalysis = data.fullAnalysis;
    if (!Array.isArray(rawAnalysis) || rawAnalysis.length < 3 || rawAnalysis.length > 4) return fallback;
    const fullAnalysis: MortgageInsights['fullAnalysis'] = [];
    for (const item of rawAnalysis) {
        if (!isRecord(item) || !isText(item.label) || !isText(item.text)) return fallback;
        fullAnalysis.push({ label: item.label.trim(), text: item.text.trim() });
    }

    return {
        timeline: parsedTimeline,
        bottomLine: { lead: rawBottomLine.lead.trim(), emphasis: rawBottomLine.emphasis.trim() },
        fullAnalysis,
        source: 'ai',
    };
}

const buildInsightsPrompt = (params: MortgageParams, timeline: TimelinePoint[], appreciationRate: number, includeCarryingCosts: boolean) => `
    You are an expert real estate financial analyst. Analyze the following mortgage scenarios to provide high-level strategic advice.

    **Core Philosophy:**
    When analyzing home-sale outcomes, it is important to recognize that the net proceeds a homeowner receives at closing do not necessarily represent their true financial gain. Homeowners often see a large check when they sell and assume this amount is ‘profit,’ but this is misleading. Mortgage interest is a real cost — money that never comes back — and in many cases it can exceed the amount of appreciation gained during ownership. This means a homeowner can walk away with significant equity at sale while actually experiencing a financial loss once interest costs are accounted for.

    Therefore, you must calculate not only equity and net sale proceeds, but also total interest paid. You must then evaluate the "True Gain" and "True Net Gain":

    - **Net Proceeds**: Sale Price - Closing Costs (8%) - Remaining Mortgage Balance.
    - **True Gain**: Net Proceeds - Original Down Payment - Principal Paid. (Principal paid came out of the homeowner's pocket, so getting it back at closing is not a gain. This equals Sale Price - Closing Costs - Original Purchase Price.)
    - **True Net Gain**: True Gain - Total Interest Paid${includeCarryingCosts ? ' - Carrying Costs (property taxes, insurance, HOA and PMI paid)' : ''}.

    This allows you to accurately determine whether the homeowner truly profited or incurred a loss, even in cases where the sale appears profitable on the surface.

    **Loan Details:**
    - Original Price: $${params.homePrice.toLocaleString()}
    - Down Payment: $${params.downPayment.toLocaleString()}
    - Rate: ${params.interestRate}%
    - Assumed Appreciation Rate: ${appreciationRate}%

    **Financial Analysis at Median Selling Timelines (assuming ${appreciationRate}% appreciation & 8% Closing Costs):**

    ${timeline.map(({ year, plans }) => `
    --- TIMELINE: ${year} YEARS ---
    1. Monthly Scenario:
       - Net Proceeds (Check at Closing): $${Math.round(plans.monthly.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(plans.monthly.totalInterestToDate).toLocaleString()}
       - True Net Gain (Real Profit/Loss): $${Math.round(plans.monthly.trueNetGain).toLocaleString()}

    2. Bi-Weekly Scenario:
       - Net Proceeds: $${Math.round(plans.biWeekly.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(plans.biWeekly.totalInterestToDate).toLocaleString()}
       - True Net Gain: $${Math.round(plans.biWeekly.trueNetGain).toLocaleString()}

    3. Bi-Weekly v2.0 (Accelerated):
       - Net Proceeds: $${Math.round(plans.biWeeklyExtra.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(plans.biWeeklyExtra.totalInterestToDate).toLocaleString()}
       - True Net Gain: $${Math.round(plans.biWeeklyExtra.trueNetGain).toLocaleString()}
    `).join('\n')}

    **Task:**
    Return JSON with exactly these three parts. Use plain language. Do not use markdown, headings, bullet points or bold.
    1. "timeline": exactly 3 items, in this order: the 7-year, 13-year and 20-year sales. Each has "year" (7, 13 or 20), "subtitle" (a short phrase of six words or fewer that sums up the three plans at that point) and "takeaway" (one sentence on the best plan's True Net Gain and whether the sale is really a profit).
    2. "bottomLine": one sentence in two parts. "lead" is the opening clause. "emphasis" is the closing clause and states the key result, such as which plan pulls ahead and by how much.
    3. "fullAnalysis": 3 or 4 items, each with "label" and "text". Use the labels "Short-term sale (7 years)", "Mid-term (13 years)", "Long term (20 years)" and "Strategy". The Strategy item asks whether more down payment or accelerated repayment is the better use of money, based on the True Net Gain figures.

    Keep every statement strictly data-driven, based on the provided True Net Gain figures.
`;

export async function getMortgageInsights(
    params: MortgageParams,
    results: CalculationResults,
    appreciationRate: number,
    includeCarryingCosts: boolean = false
): Promise<MortgageInsights> {
    const timeline = getTimelineSnapshots(results, params, appreciationRate, includeCarryingCosts);

    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return buildFallbackInsights(timeline);
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: buildInsightsPrompt(params, timeline, appreciationRate, includeCarryingCosts),
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        timeline: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    year: { type: Type.INTEGER, description: "7, 13 or 20" },
                                    subtitle: { type: Type.STRING, description: "Six words or fewer" },
                                    takeaway: { type: Type.STRING, description: "One sentence" },
                                },
                                required: ["year", "subtitle", "takeaway"],
                            },
                        },
                        bottomLine: {
                            type: Type.OBJECT,
                            properties: {
                                lead: { type: Type.STRING, description: "Opening clause" },
                                emphasis: { type: Type.STRING, description: "Closing clause with the key result" },
                            },
                            required: ["lead", "emphasis"],
                        },
                        fullAnalysis: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    label: { type: Type.STRING },
                                    text: { type: Type.STRING },
                                },
                                required: ["label", "text"],
                            },
                        },
                    },
                    required: ["timeline", "bottomLine", "fullAnalysis"],
                },
            },
        });
        return parseMortgageInsights(response.text, timeline);
    } catch (error) {
        console.error("Error fetching Gemini insights:", error);
        return buildFallbackInsights(timeline);
    }
}
