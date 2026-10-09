
import React, { useMemo, useState } from 'react';
import {
  PLAN_KEYS,
  formatSignedThousands,
  getMortgageInsights,
  getTimelineSnapshots,
  type MortgageInsights,
  type PlanKey,
} from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface GeminiInsightsProps {
  params: MortgageParams | null;
  results: CalculationResults | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  appreciationRate: number;
  closingCostRate: number;
  includeCarryingCosts: boolean;
}

interface Analysis {
  insights: MortgageInsights;
  // What the analysis was written from, so a stale one can be flagged
  inputs: string;
  generatedOn: string;
}

const GREEN = '#1E7B4F';
const RED = '#B42318';
const GOLD = '#A67700';

const BAR_LABELS: Record<PlanKey, string> = { monthly: 'Monthly', biWeekly: 'Bi-Weekly', biWeeklyExtra: 'v2.0' };
const BAR_COLORS: Record<PlanKey, string> = { monthly: '#005A9C', biWeekly: GREEN, biWeeklyExtra: GOLD };

// Red when every plan loses and they lose about the same; green when every plan gains; gold otherwise
const dotColor = (gains: number[]) => {
  const lowest = Math.min(...gains);
  const highest = Math.max(...gains);
  if (gains.every(g => g > 0)) return GREEN;
  if (gains.every(g => g < 0) && highest - lowest < 0.25 * -lowest) return RED;
  return GOLD;
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-[18px] border border-brand-line bg-white px-[18px] py-[18px] md:px-[22px] md:py-[20px]">{children}</section>
);

const currentMonthYear = () => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// One plan's true net gain as a bar growing left for a loss and right for a gain
const Bar: React.FC<{ plan: PlanKey; value: number; scale: number }> = ({ plan, value, scale }) => {
  const width = `${(Math.abs(value) / scale) * 50}%`;
  const barPosition = value < 0 ? { right: '50%' } : { left: '50%' };
  return (
    <div className="grid grid-cols-[84px_1fr_58px] items-center gap-2 text-[12.5px]">
      <span className="text-brand-muted">{BAR_LABELS[plan]}</span>
      <div className="relative h-2 rounded-full bg-[#EEF1F5]">
        <span aria-hidden="true" className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-brand-ink/50" />
        <span className="absolute bottom-0 top-0 rounded-full" style={{ ...barPosition, width, backgroundColor: BAR_COLORS[plan] }} />
      </div>
      <span className={`text-right font-bold tabular-nums ${value < 0 ? 'text-[#B42318]' : value > 0 ? 'text-[#1E7B4F]' : 'text-brand-ink'}`}>
        {formatSignedThousands(value)}
      </span>
    </div>
  );
};

export const GeminiInsights: React.FC<GeminiInsightsProps> = ({ params, results, isLoading, setIsLoading, appreciationRate, closingCostRate, includeCarryingCosts }) => {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  // Live numbers for the bars; the written analysis is only regenerated on request
  const timeline = useMemo(
    () => (params && results ? getTimelineSnapshots(results, params, appreciationRate, includeCarryingCosts, closingCostRate) : null),
    [params, results, appreciationRate, includeCarryingCosts, closingCostRate]
  );

  if (!params || !results || !timeline) return null;

  const currentInputs = JSON.stringify([params, appreciationRate, closingCostRate, includeCarryingCosts]);
  const isStale = analysis !== null && analysis.inputs !== currentInputs;

  // Bars share one scale: the largest absolute value across all nine numbers fills half the track
  const scale = Math.max(1, ...timeline.flatMap(point => PLAN_KEYS.map(key => Math.abs(point.plans[key].trueNetGain))));

  const generate = async () => {
    setIsLoading(true);
    try {
      const insights = await getMortgageInsights(params, results, appreciationRate, includeCarryingCosts, closingCostRate);
      setAnalysis({ insights, inputs: currentInputs, generatedOn: currentMonthYear() });
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-[21px] font-semibold text-brand-ink">How your outcome changes over time</h2>
        <span className="rounded-full bg-brand-chip px-2 py-[2px] text-[11px] font-bold uppercase text-brand-primary">AI</span>
      </div>
      <p className="mb-2 mt-1 text-[13px] text-brand-muted">True net gain by plan, if you sold at each point. Bars run left for a loss, right for a gain.</p>

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
          <p className="text-[13px] text-brand-muted">Running financial simulations...</p>
        </div>
      ) : analysis === null ? (
        <div className="mt-4 flex flex-col gap-4 rounded-[12px] bg-brand-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-brand-ink">Get a plain-language read on these numbers. It runs when you ask, so changing inputs does not trigger a new request.</p>
          <button type="button" onClick={generate} className="shrink-0 rounded-[10px] bg-brand-primary px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-brand-dark">
            Generate analysis
          </button>
        </div>
      ) : (
        <>
          {isStale && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-brand-chip px-3.5 py-2.5 text-[13px] text-brand-ink">
              <p>Your numbers have changed.</p>
              <button type="button" onClick={generate} className="shrink-0 rounded-[8px] bg-brand-primary px-3 py-1.5 text-[12.5px] font-semibold text-white">
                Regenerate
              </button>
            </div>
          )}

          <div className="relative mt-5 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-0">
            <div aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-[15px] hidden h-px bg-brand-line md:block" />
            {timeline.map(point => {
              const copy = analysis.insights.timeline.find(item => item.year === point.year);
              const gains = PLAN_KEYS.map(key => point.plans[key].trueNetGain);
              return (
                <div key={point.year} className="relative min-w-0 md:px-3">
                  <div className="flex flex-col items-center text-center">
                    <span
                      className="relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold text-white"
                      style={{ backgroundColor: dotColor(gains) }}
                    >
                      {point.year}
                    </span>
                    <h3 className="mt-2 text-[15px] font-bold text-brand-ink">Sell at {point.year} years</h3>
                    {copy && <p className="text-[12.5px] text-brand-muted">{copy.subtitle}</p>}
                  </div>
                  <div className="mt-3 space-y-2">
                    {PLAN_KEYS.map(key => <Bar key={key} plan={key} value={point.plans[key].trueNetGain} scale={scale} />)}
                  </div>
                  {copy && <p className="mt-3 rounded-[10px] bg-[#F7F8FA] px-3.5 py-3 text-[13.5px] leading-snug text-brand-ink">{copy.takeaway}</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-brand-line pt-5">
            <p className="text-[12px] font-bold uppercase tracking-widest text-brand-muted">The bottom line</p>
            <p className="mt-2 font-serif text-[20px] font-semibold leading-snug text-brand-ink md:text-[24px]">
              {analysis.insights.bottomLine.lead.trimEnd()}{' '}
              <span className="text-[#1E7B4F]">{analysis.insights.bottomLine.emphasis}</span>
            </p>
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer text-[14px] font-semibold text-brand-primary">Read the full analysis</summary>
            <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-brand-ink">
              {analysis.insights.fullAnalysis.map(item => (
                <p key={item.label}>
                  <span className="font-bold">{item.label}: </span>
                  {item.text}
                </p>
              ))}
            </div>
          </details>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-brand-line pt-4 text-[12px] text-brand-muted">
            <span>
              {analysis.insights.source === 'ai' ? 'Written by AI from your numbers' : 'Summary built from your numbers (AI not available)'} · {analysis.generatedOn}
            </span>
            <button type="button" onClick={generate} className="rounded-[8px] border border-brand-line px-3 py-1.5 text-[12.5px] font-semibold text-brand-primary transition hover:bg-brand-light">
              Regenerate
            </button>
          </div>
        </>
      )}
    </Card>
  );
};
