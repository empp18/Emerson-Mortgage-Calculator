import React, { useMemo, useState } from 'react';
import { getScenarioSnapshots, type SnapshotMetrics } from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface FinancialBreakdownProps {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  closingCostRate: number;
  includeCarryingCosts: boolean;
}

const TIMELINES = [7, 13, 20];

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

type Tone = 'plain' | 'cost' | 'bold' | 'total';

interface Row {
  label: string;
  value: (m: SnapshotMetrics, p: MortgageParams) => number;
  tone?: Tone;
  highlight?: string;
  sub?: (year: number, rate: number) => string;
  onlyWhenCarrying?: boolean;
  closing?: boolean; // label shows the live closing-cost rate
}

// Each row is a positive amount with an operator in its label, so the column reads like a ledger
const ROWS: Row[] = [
  { label: 'Est. home value', value: m => m.futureValue, sub: (year, rate) => `after ${year} yrs at ${rate}%` },
  { label: '(-) Remaining balance', value: m => m.remainingBalance, tone: 'cost' },
  { label: '(=) Gross equity', value: m => m.futureValue - m.remainingBalance, tone: 'bold' },
  { label: '(-) Closing costs', value: m => m.closingCosts, tone: 'cost', closing: true },
  { label: '(=) Check at closing', value: m => m.netProceeds, tone: 'bold', highlight: 'bg-brand-primary/10' },
  { label: '(-) Down payment you put in', value: (_m, p) => p.downPayment, tone: 'cost' },
  { label: '(-) Principal you repaid', value: m => m.principalPaidToDate, tone: 'cost' },
  { label: '(=) True gain', value: m => m.trueGain, tone: 'bold' },
  { label: '(-) Interest paid', value: m => m.totalInterestToDate, tone: 'cost' },
  { label: '(-) Taxes, insurance, HOA & PMI', value: m => m.carryingCostsToDate, tone: 'cost', onlyWhenCarrying: true },
  { label: '(=) True net gain', value: m => m.trueNetGain, tone: 'total', highlight: 'bg-brand-secondary/20' },
];

export const FinancialBreakdown: React.FC<FinancialBreakdownProps> = ({ params, results, appreciationRate, closingCostRate, includeCarryingCosts }) => {
  const [activeYear, setActiveYear] = useState(7);

  const metrics = useMemo(
    () => getScenarioSnapshots(results, params, activeYear, appreciationRate, includeCarryingCosts, closingCostRate),
    [params, results, activeYear, appreciationRate, includeCarryingCosts, closingCostRate]
  );

  const scenarios = [
    { key: 'monthly', title: 'Monthly' },
    { key: 'biWeekly', title: 'Bi-Weekly' },
    { key: 'biWeeklyExtra', title: 'Bi-Weekly v2.0' },
  ] as const;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h3 className="font-serif text-xl font-semibold text-brand-dark">The math</h3>
          <p className="text-sm text-gray-500">Every step from the sale price to your true net gain.</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {TIMELINES.map(year => (
            <button
              key={year}
              type="button"
              onClick={() => setActiveYear(year)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeYear === year ? 'bg-brand-primary text-white shadow-sm' : 'text-gray-600 hover:text-brand-dark'}`}
            >
              {year} years
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm text-left text-gray-800">
          <thead className="text-xs uppercase bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">Metric</th>
              {scenarios.map(s => <th key={s.key} className="px-4 py-3 text-right">{s.title}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ROWS.filter(row => !row.onlyWhenCarrying || includeCarryingCosts).map(row => {
              const tone = row.tone ?? 'plain';
              return (
                <tr key={row.label} className={row.highlight ?? ''}>
                  <td className={`px-4 py-3 ${tone === 'bold' || tone === 'total' ? 'font-semibold text-brand-dark' : 'text-gray-700'}`}>
                    {row.closing ? `(-) Closing costs (${closingCostRate}%)` : row.label}
                    {row.sub && <span className="block text-xs text-gray-500">{row.sub(activeYear, appreciationRate)}</span>}
                  </td>
                  {scenarios.map(s => {
                    const value = row.value(metrics[s.key], params);
                    const colour = value < 0 || tone === 'cost' ? 'text-red-700' : tone === 'bold' || tone === 'total' ? 'font-semibold text-brand-dark' : '';
                    return (
                      <td key={s.key} className={`px-4 py-3 text-right tabular-nums ${tone === 'total' ? 'font-bold text-base' : ''} ${colour}`}>
                        {money(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Assumes {appreciationRate}% annual appreciation and {closingCostRate}% total closing costs (realtor fees + transfer tax). Buyer-side closing costs and maintenance are not included.
      </p>
    </div>
  );
};
