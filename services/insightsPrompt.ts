import type { MortgageParams } from '../types';
import type { TimelinePoint } from './geminiService';

// Built on the server only, so callers cannot send their own prompt to Gemini
export const buildInsightsPrompt = (params: MortgageParams, timeline: TimelinePoint[], appreciationRate: number, includeCarryingCosts: boolean, closingCostRate: number) => `
    You are an expert real estate financial analyst. Analyze the following mortgage scenarios to provide high-level strategic advice.

    **Core Philosophy:**
    When analyzing home-sale outcomes, it is important to recognize that the net proceeds a homeowner receives at closing do not necessarily represent their true financial gain. Homeowners often see a large check when they sell and assume this amount is ‘profit,’ but this is misleading. Mortgage interest is a real cost — money that never comes back — and in many cases it can exceed the amount of appreciation gained during ownership. This means a homeowner can walk away with significant equity at sale while actually experiencing a financial loss once interest costs are accounted for.

    Therefore, you must calculate not only equity and net sale proceeds, but also total interest paid. You must then evaluate the "True Gain" and "True Net Gain":

    - **Net Proceeds**: Sale Price - Closing Costs (${closingCostRate}%) - Remaining Mortgage Balance.
    - **True Gain**: Net Proceeds - Original Down Payment - Principal Paid. (Principal paid came out of the homeowner's pocket, so getting it back at closing is not a gain. This equals Sale Price - Closing Costs - Original Purchase Price.)
    - **True Net Gain**: True Gain - Total Interest Paid${includeCarryingCosts ? ' - Carrying Costs (property taxes, insurance, HOA and PMI paid)' : ''}.

    This allows you to accurately determine whether the homeowner truly profited or incurred a loss, even in cases where the sale appears profitable on the surface.

    **Loan Details:**
    - Original Price: $${params.homePrice.toLocaleString()}
    - Down Payment: $${params.downPayment.toLocaleString()}
    - Rate: ${params.interestRate}%
    - Assumed Appreciation Rate: ${appreciationRate}%

    **Financial Analysis at Median Selling Timelines (assuming ${appreciationRate}% appreciation & ${closingCostRate}% Closing Costs):**

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
