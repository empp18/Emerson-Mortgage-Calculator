
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

export async function getMortgageInsights(params: MortgageParams, results: CalculationResults, appreciationRate: number, includeCarryingCosts: boolean = false): Promise<string> {
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set.");
    return JSON.stringify([
        {
          title: "API Key Not Configured",
          tip: "Please configure your Gemini API key as an environment variable (API_KEY) to receive AI-powered mortgage tips."
        }
      ]);
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const timelines = [7, 13, 20];
  const snapshots = timelines.map(year => ({
      year,
      ...getScenarioSnapshots(results, params, year, appreciationRate, includeCarryingCosts)
  }));

  const prompt = `
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
    
    ${snapshots.map(s => `
    --- TIMELINE: ${s.year} YEARS ---
    1. Monthly Scenario:
       - Net Proceeds (Check at Closing): $${Math.round(s.monthly.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(s.monthly.totalInterestToDate).toLocaleString()}
       - True Net Gain (Real Profit/Loss): $${Math.round(s.monthly.trueNetGain).toLocaleString()}
    
    2. Bi-Weekly Scenario:
       - Net Proceeds: $${Math.round(s.biWeekly.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(s.biWeekly.totalInterestToDate).toLocaleString()}
       - True Net Gain: $${Math.round(s.biWeekly.trueNetGain).toLocaleString()}
       
    3. Bi-Weekly v2.0 (Accelerated):
       - Net Proceeds: $${Math.round(s.biWeeklyExtra.netProceeds).toLocaleString()}
       - Total Interest Cost: $${Math.round(s.biWeeklyExtra.totalInterestToDate).toLocaleString()}
       - True Net Gain: $${Math.round(s.biWeeklyExtra.trueNetGain).toLocaleString()}
    `).join('\n')}

    **Task:**
    Provide 4 distinct insights in JSON format.
    1. **Short-Term Sale (7 Years):** Focus on True Net Gain. Are they actually profitable after interest and costs? Or is the "profit" an illusion?
    2. **Mid-Term Sale (13 Years):** Compare the "True Net Gain" across scenarios. How much real wealth is preserved by the accelerated payments?
    3. **Long-Term (20 Years):** Focus on wealth building. Compare the massive difference in True Net Gain.
    4. **Strategic Recommendation:** Suggest an optimal strategy based on the "True Net Gain" analysis. Should they put more down now? Or focus on the aggressive repayment?

    Keep descriptions concise but strictly data-driven based on the provided True Net Gain figures.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "Header for the insight (e.g., '7-Year True Gain Analysis')"
              },
              tip: {
                type: Type.STRING,
                description: "The detailed analysis."
              }
            }
          }
        }
      }
    });
    
    return response.text;
  } catch (error) {
    console.error("Error fetching Gemini insights:", error);
    return JSON.stringify([
      {
        title: "Analysis Unavailable",
        tip: "Could not generate financial analysis at this time."
      }
    ]);
  }
}
