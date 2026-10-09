import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { getScenarioSnapshots } from '../services/geminiService';
import type { MortgageParams, CalculationResults, AmortizationEntry } from '../types';

// The sale is measured at this year throughout the overview
const SALE_YEAR = 7;

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-brand-light ${className}`}>{children}</section>
);

interface WalkAwayCardProps {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  includeCarryingCosts: boolean;
  onIncludeCarryingCostsChange: (include: boolean) => void;
}

// Where the sale check goes, one step at a time, ending at the true net gain
export const WalkAwayCard: React.FC<WalkAwayCardProps> = ({ params, results, appreciationRate, includeCarryingCosts, onIncludeCarryingCostsChange }) => {
  const s = getScenarioSnapshots(results, params, SALE_YEAR, appreciationRate, includeCarryingCosts).monthly;

  const Step: React.FC<{ n: string; label: string; value: number; final?: boolean }> = ({ n, label, value, final }) => (
    <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3">
      <span className={`h-8 w-8 rounded-full grid place-items-center text-sm font-bold ${final ? 'bg-brand-primary text-white' : 'bg-brand-light text-brand-primary'}`}>{n}</span>
      <span className={final ? 'font-semibold text-brand-dark' : 'text-gray-700'}>{label}</span>
      <span className={`tabular-nums font-semibold ${final ? 'text-lg' : ''} ${value < 0 ? 'text-red-700' : 'text-brand-dark'}`}>{money(value)}</span>
    </div>
  );

  return (
    <Card>
      <h2 className="font-serif text-xl font-semibold text-brand-dark">Where the check goes</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">Monthly plan, sold after {SALE_YEAR} years.</p>
      <div className="divide-y divide-gray-100">
        <Step n="1" label="Check at closing" value={s.netProceeds} />
        <Step n="2" label="Less the down payment you put in" value={-params.downPayment} />
        <Step n="3" label="Less the principal you repaid (your own money)" value={-s.principalPaidToDate} />
        <Step n="4" label="Less the interest you paid the bank" value={-s.totalInterestToDate} />
        {includeCarryingCosts && <Step n="5" label={`Less taxes, insurance, HOA and PMI over ${SALE_YEAR} years`} value={-s.carryingCostsToDate} />}
        <Step n="=" label="What you actually gained" value={s.trueNetGain} final />
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-xl bg-brand-paper p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={includeCarryingCosts}
          onChange={(e) => onIncludeCarryingCostsChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-brand-primary"
        />
        <span className="text-sm">
          <span className="font-semibold text-gray-800">Count ownership costs too</span>
          <span className="block text-gray-500">Adds taxes, insurance, HOA and PMI to the math above</span>
        </span>
      </label>
    </Card>
  );
};

interface PlanCardsProps {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  includeCarryingCosts: boolean;
}

// The three payment plans side by side: monthly payment, payoff, interest saved, and true net gain
export const PlanCards: React.FC<PlanCardsProps> = ({ params, results, appreciationRate, includeCarryingCosts }) => {
  const snaps = getScenarioSnapshots(results, params, SALE_YEAR, appreciationRate, includeCarryingCosts);
  const plans = [
    { name: 'Monthly', summary: results.monthly.summary, gain: snaps.monthly.trueNetGain },
    { name: 'Bi-Weekly', summary: results.biWeekly.summary, gain: snaps.biWeekly.trueNetGain },
    { name: 'Bi-Weekly v2.0', summary: results.biWeeklyWithExtra.summary, gain: snaps.biWeeklyExtra.trueNetGain },
  ];
  const maxSaved = Math.max(1, ...plans.map(p => p.summary.interestSaved ?? 0));

  return (
    <Card>
      <h2 className="font-serif text-xl font-semibold text-brand-dark">Your three plans</h2>
      <p className="text-sm text-gray-500 mt-1 mb-2">True net gain is what you keep after interest, measured at a {SALE_YEAR}-year sale.</p>
      {plans.map(plan => {
        const saved = plan.summary.interestSaved ?? 0;
        const isBaseline = plan.summary.timeSaved === '(Baseline)';
        return (
          <div key={plan.name} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-4 border-b border-gray-100 last:border-0">
            <div>
              <div className="font-semibold text-gray-900">
                {plan.name}
                <span className="ml-2 inline-block rounded-full bg-brand-secondary/90 px-2 py-0.5 text-xs font-bold text-brand-dark align-middle">
                  {isBaseline ? 'Baseline' : plan.summary.timeSaved + ' sooner'}
                </span>
              </div>
              <div className="text-sm text-gray-500">{money(plan.summary.totalMonthlyPayment)} a month · pays off {plan.summary.payoffDate}</div>
            </div>
            <div className="text-right">
              <div className={`font-bold tabular-nums ${plan.gain < 0 ? 'text-red-700' : 'text-brand-dark'}`}>{money(plan.gain)}</div>
              <div className="text-xs text-gray-500">true net gain</div>
            </div>
            {saved > 0 && (
              <>
                <div className="col-span-2 h-2 rounded-full bg-brand-light overflow-hidden mt-1" aria-hidden="true">
                  <div className="h-full bg-brand-primary" style={{ width: `${(saved / maxSaved) * 100}%` }} />
                </div>
                <div className="col-span-2 text-xs text-gray-500">Saves {money(saved)} in interest</div>
              </>
            )}
          </div>
        );
      })}
    </Card>
  );
};

interface BalanceChartCardProps {
  params: MortgageParams;
  results: CalculationResults;
}

// Remaining loan balance at the end of each year, for each plan
export const BalanceChartCard: React.FC<BalanceChartCardProps> = ({ params, results }) => {
  const balanceAt = (schedule: AmortizationEntry[], periodsPerYear: number, year: number) => {
    if (year === 0) return results.monthly.summary.totalPrincipal ?? 0;
    const row = schedule.find(e => e.month >= year * periodsPerYear);
    return row ? row.remainingBalance : 0;
  };

  const data = Array.from({ length: params.loanTerm + 1 }, (_, year) => ({
    year,
    monthly: Math.round(balanceAt(results.monthly.schedule, 12, year)),
    biWeekly: Math.round(balanceAt(results.biWeekly.schedule, 26, year)),
    biWeeklyExtra: Math.round(balanceAt(results.biWeeklyWithExtra.schedule, 26, year)),
  }));
  const ticks = Array.from({ length: Math.floor(params.loanTerm / 5) + 1 }, (_, i) => i * 5);

  return (
    <Card>
      <h2 className="font-serif text-xl font-semibold text-brand-dark">Your loan balance</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">How much you still owe over the life of the loan, for each plan.</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 24, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" ticks={ticks} tick={{ fontSize: 12, fill: '#4b5563' }} label={{ value: 'Years', position: 'insideBottomRight', offset: -4, fontSize: 12, fill: '#6b7280' }} />
          <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 12, fill: '#4b5563' }} width={56} />
          <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(y) => `Year ${y}`} />
          <ReferenceLine x={SALE_YEAR} stroke="#111827" strokeDasharray="4 4" label={{ value: `You sell · year ${SALE_YEAR}`, position: 'top', fill: '#111827', fontSize: 12 }} />
          <Line type="monotone" dataKey="monthly" name="Monthly" stroke="#005A9C" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="biWeekly" name="Bi-Weekly" stroke="#1E7B4F" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="biWeeklyExtra" name="Bi-Weekly v2.0" stroke="#A67700" strokeWidth={2.5} dot={false} />
          <Legend verticalAlign="bottom" height={28} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
