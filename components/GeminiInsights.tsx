
import React, { useState, useEffect, useMemo } from 'react';
import { getMortgageInsights } from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface GeminiInsightsProps {
  params: MortgageParams | null;
  results: CalculationResults | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  appreciationRate: number;
  includeCarryingCosts: boolean;
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

export const GeminiInsights: React.FC<GeminiInsightsProps> = ({ params, results, isLoading, setIsLoading, appreciationRate, includeCarryingCosts }) => {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  // What the current insights were generated from, so a stale analysis can be flagged
  const [analysedFor, setAnalysedFor] = useState<string | null>(null);

  if (!params || !results) return null;

  const currentInputs = JSON.stringify([params, appreciationRate, includeCarryingCosts]);
  const isStale = insights !== null && analysedFor !== currentInputs;

  const generate = async () => {
    setIsLoading(true);
    try {
      const insightsString = await getMortgageInsights(params, results, appreciationRate, includeCarryingCosts);
      setInsights(JSON.parse(insightsString));
    } catch (error) {
      console.error('Failed to parse Gemini insights:', error);
      setInsights([{ title: 'Error Parsing', tip: 'Could not parse insights. The AI may have returned an unexpected format.' }]);
    } finally {
      setAnalysedFor(currentInputs);
      setIsLoading(false);
    }
  };

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
      ) : insights === null ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-brand-light">Get a plain-language read on these numbers. It runs when you ask, so changing inputs does not trigger a new request.</p>
            <button type="button" onClick={generate} className="shrink-0 bg-brand-secondary text-brand-dark font-bold py-2 px-5 rounded-lg hover:bg-yellow-500 transition">
                Generate analysis
            </button>
        </div>
      ) : (
        <>
            {isStale && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 rounded-lg bg-white/10 p-3">
                    <p className="text-sm">Your numbers have changed since this analysis was written.</p>
                    <button type="button" onClick={generate} className="shrink-0 bg-brand-secondary text-brand-dark font-bold py-1.5 px-4 rounded-lg text-sm">Regenerate</button>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight, index) => <InsightCard key={index} insight={insight} />)}
            </div>
        </>
      )}
    </div>
  );
};
