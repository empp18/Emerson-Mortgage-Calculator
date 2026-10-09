
import type { MortgageParams, CalculationResults, AmortizationEntry } from '../types.js';

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
    carrying?: CarryingCosts,
    closingCostRate: number = 6 // percent of the sale price, paid at closing
): SnapshotMetrics {
    const rateDecimal = appreciationRate / 100;
    const growthFactor = Math.pow(1 + rateDecimal, year);
    const closingShare = closingCostRate / 100;
    const keepShare = 1 - closingShare;

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
            closingCosts: futureVal * closingShare,
            netProceeds: futureVal * keepShare,
            principalPaidToDate: 0,
            carryingCostsToDate,
            trueGain: (futureVal * keepShare) - initialHomePrice,
            trueNetGain: (futureVal * keepShare) - initialHomePrice - carryingCostsToDate
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
    const closingCosts = futureValue * closingShare; // agent fees and transfer taxes
    
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
    includeCarryingCosts: boolean,
    closingCostRate: number = 6
) {
    const carrying = includeCarryingCosts
        ? { propertyTaxes: params.propertyTaxes, homeownersInsurance: params.homeownersInsurance, hoaDues: params.hoaDues }
        : undefined;
    return {
        monthly: getSnapshotAtYear(results.monthly.schedule, year, params.homePrice, params.downPayment, false, appreciationRate, carrying, closingCostRate),
        biWeekly: getSnapshotAtYear(results.biWeekly.schedule, year, params.homePrice, params.downPayment, true, appreciationRate, carrying, closingCostRate),
        biWeeklyExtra: getSnapshotAtYear(results.biWeeklyWithExtra.schedule, year, params.homePrice, params.downPayment, true, appreciationRate, carrying, closingCostRate),
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

// Dot colour for one sale point: red when every plan loses and they lose about the same,
// green when every plan gains, gold otherwise.
export const dotColor = (gains: number[]): string => {
    const lowest = Math.min(...gains);
    const highest = Math.max(...gains);
    if (gains.every(g => g > 0)) return '#1E7B4F';
    if (gains.every(g => g < 0) && highest - lowest < 0.25 * -lowest) return '#B42318';
    return '#A67700';
};

// The plain-language sale sentence shown under the calculator and at the top of the PDF
export const describeSale = (sale: SnapshotMetrics, includeCarryingCosts: boolean): string => {
    const money = (value: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(value));
    const closing = sale.netProceeds >= 0
        ? `you would get ${money(sale.netProceeds)} at closing`
        : `you would owe ${money(sale.netProceeds)} at closing`;
    const costs = includeCarryingCosts ? 'interest and ownership costs' : 'interest';
    const outcome = sale.trueNetGain < 0
        ? `you would still be ${money(sale.trueNetGain)} behind`
        : `you would be ${money(sale.trueNetGain)} ahead`;
    return `If you sold in seven years, ${closing}. After ${costs}, ${outcome}.`;
};

export function getTimelineSnapshots(
    results: CalculationResults,
    params: MortgageParams,
    appreciationRate: number,
    includeCarryingCosts: boolean,
    closingCostRate: number = 6
): TimelinePoint[] {
    return INSIGHT_YEARS.map(year => ({
        year,
        plans: getScenarioSnapshots(results, params, year, appreciationRate, includeCarryingCosts, closingCostRate),
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

// The Gemini call runs server-side (api/insights.ts) so the API key never reaches the browser.
// Any failure, including running without the endpoint (plain `vite` dev), shows the numbers-only summary.
export async function getMortgageInsights(
    params: MortgageParams,
    results: CalculationResults,
    appreciationRate: number,
    includeCarryingCosts: boolean = false,
    closingCostRate: number = 6
): Promise<MortgageInsights> {
    const timeline = getTimelineSnapshots(results, params, appreciationRate, includeCarryingCosts, closingCostRate);
    try {
        const response = await fetch('/api/insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ params, appreciationRate, includeCarryingCosts, closingCostRate }),
        });
        if (!response.ok) return buildFallbackInsights(timeline);
        const { text } = await response.json();
        return parseMortgageInsights(typeof text === 'string' ? text : null, timeline);
    } catch (error) {
        console.error('Error fetching insights:', error);
        return buildFallbackInsights(timeline);
    }
}
