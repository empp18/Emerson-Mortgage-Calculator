
import React, { useState, useEffect, useMemo } from 'react';
import { getMortgageInsights, getScenarioSnapshots } from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface GeminiInsightsProps {
  params: MortgageParams | null;
  results: CalculationResults | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  appreciationRate: number;
  includeCarryingCosts: boolean;
  setIncludeCarryingCosts: (include: boolean) => void;
}

interface Insight {
  title: string;
  tip: string;
}

const DEFINITIONS: Record<string, string> = {
  "True Net Gain": "The most critical metric. It is True Gain minus Total Interest Paid (and taxes, insurance, HOA and PMI, if included). This reveals if you truly profited after accounting for the cost of owning the home.",
  "True Net Loss": "When your True Net Gain is negative. This means the total cost of borrowing (interest) plus closing costs exceeded the home's appreciation, resulting in an overall financial loss compared to your initial investment.",
  "True Gain": "Your Net Proceeds minus your Down Payment and the Principal you paid down. Principal is your own money coming back at closing, so it is not profit. This equals the sale price minus closing costs minus what you originally paid for the home.",
  "Net Proceeds": "The estimated amount you receive at closing after paying off the mortgage balance and closing costs (approx. 8%).",
  "Total Interest Cost": "Money paid to the bank for the loan. This is a pure expense that reduces your actual profit from the home.",
  "Total Interest": "Money paid to the bank for the loan. This is a pure expense that reduces your actual profit from the home.",
  "Equity": "The market value of your home minus what you still owe the bank."
};

const TooltipText: React.FC<{ text: string }> = ({ text }) => {
  // Sort keys by length (descending) to match longer phrases first (e.g. "True Net Gain" before "True Gain")
  const keys = Object.keys(DEFINITIONS).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${keys.join('|')})\\b`, 'gi');
  
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, i) => {
        // Find the definition key that matches this part (case-insensitive)
        const definitionKey = keys.find(k => k.toLowerCase() === part.toLowerCase());
        const definition = definitionKey ? DEFINITIONS[definitionKey] : undefined;
        
        if (definition) {
          return (
            <span key={i} className="group relative cursor-help border-b-2 border-dotted border-brand-secondary/60 hover:border-brand-secondary transition-colors inline-block leading-snug">
              {part}
              {/* Tooltip Container */}
              <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 pointer-events-none text-left leading-snug">
                <span className="block font-bold mb-1 text-brand-secondary capitalize">{part}</span>
                {definition}
                {/* Arrow */}
                <svg className="absolute top-full left-1/2 -translate-x-1/2 -mt-px text-gray-900 h-2 w-4" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0" /></svg>
              </span>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => (
    <div className="relative bg-white/95 p-5 rounded-lg backdrop-blur-sm border border-brand-light shadow-sm hover:shadow-md transition-all hover:z-10 text-gray-900">
        <h4 className="font-bold text-brand-primary text-lg mb-2">{insight.title}</h4>
        <p className="text-sm text-gray-800 leading-relaxed">
            <TooltipText text={insight.tip} />
        </p>
    </div>
);

const FinancialBreakdown: React.FC<{ params: MortgageParams, results: CalculationResults, appreciationRate: number, includeCarryingCosts: boolean, setIncludeCarryingCosts: (include: boolean) => void }> = ({ params, results, appreciationRate, includeCarryingCosts, setIncludeCarryingCosts }) => {
    const [activeYear, setActiveYear] = useState(7);
    const timelines = [7, 13, 20];

    const metrics = useMemo(
        () => getScenarioSnapshots(results, params, activeYear, appreciationRate, includeCarryingCosts),
        [params, results, activeYear, appreciationRate, includeCarryingCosts]
    );

    const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const rows = [
        { label: `Est. Home Value (${activeYear}yrs @ ${appreciationRate}%)`, key: 'futureValue', isCurrency: true },
        { label: '(-) Remaining Balance', key: 'remainingBalance', isCurrency: true, textRed: true },
        { label: '(=) Gross Equity', key: 'equity', isCalculated: true, 
          getValue: (m: any) => m.futureValue - m.remainingBalance, isCurrency: true, bold: true },
        { label: '(-) Est. Closing Costs (8%)', key: 'closingCosts', isCurrency: true, textRed: true },
        { label: '(=) Net Proceeds (Check at Closing)', key: 'netProceeds', isCurrency: true, bold: true, bg: 'bg-brand-primary/10' },
        { label: '(-) Original Down Payment', key: 'downPayment', isCalculated: true, getValue: () => params.downPayment, isCurrency: true, textRed: true },
        { label: '(-) Principal Paid Down (your own money)', key: 'principalPaidToDate', isCurrency: true, textRed: true },
        { label: '(=) TRUE GAIN', key: 'trueGain', isCurrency: true, bold: true },
        { label: '(-) Total Interest Paid', key: 'totalInterestToDate', isCurrency: true, textRed: true },
        ...(includeCarryingCosts ? [{ label: '(-) Taxes, Insurance, HOA & PMI', key: 'carryingCostsToDate', isCurrency: true, textRed: true }] : []),
        { label: '(=) TRUE NET GAIN', key: 'trueNetGain', isCurrency: true, bold: true, bg: 'bg-brand-secondary/20', textBrand: true },
    ];

    return (
        <div className="mt-8 border-t border-white/20 pt-6">
             <div className="flex justify-between items-center mb-4">
                <div>
                    <h4 className="text-xl font-bold text-white">The Math: Financial Breakdown</h4>
                    <label className="flex items-center gap-2 mt-2 text-sm text-gray-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeCarryingCosts}
                            onChange={(e) => setIncludeCarryingCosts(e.target.checked)}
                            className="accent-brand-secondary"
                        />
                        Include property taxes, insurance, HOA &amp; PMI
                    </label>
                </div>
                <div className="flex bg-brand-dark rounded-lg p-1 border border-white/20">
                    {timelines.map(year => (
                        <button
                            key={year}
                            onClick={() => setActiveYear(year)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeYear === year ? 'bg-brand-secondary text-brand-dark shadow-sm' : 'text-gray-300 hover:text-white'}`}
                        >
                            {year} Years
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="w-full text-sm text-left text-gray-200">
                    <thead className="text-xs uppercase bg-brand-dark/50 text-brand-secondary">
                        <tr>
                            <th className="px-4 py-3">Metric</th>
                            <th className="px-4 py-3 text-right">Monthly</th>
                            <th className="px-4 py-3 text-right">Bi-Weekly</th>
                            <th className="px-4 py-3 text-right">Bi-Weekly v2.0</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-white/5">
                        {rows.map((row, idx) => (
                            <tr key={idx} className={`hover:bg-white/10 ${row.bg || ''}`}>
                                <td className={`px-4 py-3 font-medium ${row.bold ? 'text-white' : 'text-gray-300'}`}>{row.label}</td>
                                {['monthly', 'biWeekly', 'biWeeklyExtra'].map((scenario) => {
                                    const m = (metrics as any)[scenario];
                                    let val = row.isCalculated ? row.getValue!(m) : m[row.key];
                                    const formatted = row.isCurrency ? formatMoney(val) : val;
                                    
                                    // Determine styling
                                    let textColor = 'text-gray-200';
                                    if (row.textRed) textColor = 'text-red-300';
                                    if (row.textBrand) textColor = 'text-brand-secondary font-bold text-base';
                                    if (row.bold && !row.textBrand) textColor = 'text-white font-bold';

                                    return (
                                        <td key={scenario} className={`px-4 py-3 text-right ${textColor}`}>
                                            {formatted}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-gray-400 mt-2 italic">*Calculations assume {appreciationRate}% annual appreciation and 8% total closing costs (realtor fees + transfer tax). Buyer-side closing costs and maintenance are not included.</p>
        </div>
    );
};

export const GeminiInsights: React.FC<GeminiInsightsProps> = ({ params, results, isLoading, setIsLoading, appreciationRate, includeCarryingCosts, setIncludeCarryingCosts }) => {
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    if (params && results) {
      const fetchInsights = async () => {
        setIsLoading(true);
        try {
          const insightsString = await getMortgageInsights(params, results, appreciationRate, includeCarryingCosts);
          setInsights(JSON.parse(insightsString));
        } catch (error) {
          console.error("Failed to parse Gemini insights:", error);
          setInsights([
            {
              title: "Error Parsing",
              tip: "Could not parse insights. The AI may have returned an unexpected format."
            }
          ]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, results, appreciationRate, includeCarryingCosts]); // Re-run when rate or cost basis changes

  if (!params || !results) return null;

  return (
    <div className="mt-8 bg-gradient-to-br from-brand-primary to-brand-dark p-6 md:p-8 rounded-2xl shadow-lg text-white">
      <div className="flex items-center mb-6 border-b border-white/20 pb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-secondary h-8 w-8 mr-3"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        <div>
            <h3 className="text-2xl font-bold">AI Strategic Analysis</h3>
            <p className="text-brand-secondary text-sm opacity-90">Analyzing Equity, Net Proceeds (after 8% fees), and Interest Costs</p>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex flex-col justify-center items-center h-48 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-secondary border-t-transparent"></div>
            <p className="text-brand-light animate-pulse">Running financial simulations...</p>
        </div>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight, index) => <InsightCard key={index} insight={insight} />)}
            </div>
            
            <FinancialBreakdown params={params} results={results} appreciationRate={appreciationRate} includeCarryingCosts={includeCarryingCosts} setIncludeCarryingCosts={setIncludeCarryingCosts} />
        </>
      )}
    </div>
  );
};
