
import { GoogleGenAI, Type } from "@google/genai";
import type { MortgageParams, CalculationResults, AmortizationEntry } from '../types';

export interface SnapshotMetrics {
    year: number;
    futureValue: number;
    remainingBalance: number;
    totalInterestToDate: number;
    closingCosts: number;
    netProceeds: number;
    trueGain: number;
    trueNetGain: number;
}

// Helper to get data at a specific year
export function getSnapshotAtYear(schedule: AmortizationEntry[], year: number, initialHomePrice: number, downPayment: number): SnapshotMetrics {
    const targetMonth = year * 12;
    // Find the entry closest to the target month
    let entry = schedule.find(e => e.month >= targetMonth);
    // If paid off early, get the last entry
    if (!entry) entry = schedule[schedule.length - 1];

    // Appreciation Calc (Standard 3.5%)
    const futureValue = initialHomePrice * Math.pow(1.035, year);
    const closingCosts = futureValue * 0.08; // 8% fees
    const remainingBalance = entry.remainingBalance;
    
    // Net Proceeds: What hits the bank account at closing
    // (Sale Price - Closing Costs - Mortgage Payoff)
    const netProceeds = (futureValue - closingCosts) - remainingBalance;
    
    // Calculate total interest paid up to this point
    let totalInterestToDate = 0;
    for(const e of schedule) {
        if (e.month <= entry.month) {
            totalInterestToDate += e.interest;
        } else {
            break;
        }
    }

    // True Gain: Net Proceeds - Initial Investment (Down Payment)
    const trueGain = netProceeds - downPayment;

    // True Net Gain: The real profit/loss after accounting for the cost of borrowing
    // (Net Proceeds - Total Interest Paid - Down Payment)
    const trueNetGain = netProceeds - totalInterestToDate - downPayment;

    return {
        year,
        futureValue,
        remainingBalance,
        totalInterestToDate,
        closingCosts,
        netProceeds,
        trueGain,
        trueNetGain
    };
}

export async function getMortgageInsights(params: MortgageParams, results: CalculationResults): Promise<string> {
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
  const snapshots = timelines.map(year => {
      return {
          year,
          monthly: getSnapshotAtYear(results.monthly.schedule, year, params.homePrice, params.downPayment),
          biWeekly: getSnapshotAtYear(results.biWeekly.schedule, year, params.homePrice, params.downPayment),
          biWeeklyExtra: getSnapshotAtYear(results.biWeeklyWithExtra.schedule, year, params.homePrice, params.downPayment)
      };
  });

  const prompt = `
    You are an expert real estate financial analyst. Analyze the following mortgage scenarios to provide high-level strategic advice.
    
    **Core Philosophy:**
    When analyzing home-sale outcomes, it is important to recognize that the net proceeds a homeowner receives at closing do not necessarily represent their true financial gain. Homeowners often see a large check when they sell and assume this amount is ‘profit,’ but this is misleading. Mortgage interest is a real cost — money that never comes back — and in many cases it can exceed the amount of appreciation gained during ownership. This means a homeowner can walk away with significant equity at sale while actually experiencing a financial loss once interest costs are accounted for.

    Therefore, you must calculate not only equity and net sale proceeds, but also total interest paid. You must then evaluate the "True Gain" and "True Net Gain":
    
    - **Net Proceeds**: Sale Price - Closing Costs (8%) - Remaining Mortgage Balance.
    - **True Gain**: Net Proceeds - Original Down Payment.
    - **True Net Gain**: Net Proceeds - Total Interest Paid - Original Down Payment.
    
    This allows you to accurately determine whether the homeowner truly profited or incurred a loss, even in cases where the sale appears profitable on the surface.
    
    **Loan Details:**
    - Original Price: $${params.homePrice.toLocaleString()}
    - Down Payment: $${params.downPayment.toLocaleString()}
    - Rate: ${params.interestRate}%
    
    **Financial Analysis at Median Selling Timelines (assuming 3.5% appreciation & 8% Closing Costs):**
    
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
