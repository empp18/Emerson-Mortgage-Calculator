import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { getScenarioSnapshots } from '../services/geminiService';
import type { MortgageParams, CalculationResults, AmortizationEntry } from '../types';

// The sale is measured at this year throughout the overview
const SALE_YEAR = 7;

// Typographic minus, as in the mockup
const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value).replace('-', '\u2212');

// "5 Years 10 Months" -> "5 yr 10 mo", as in the mockup
const shortDuration = (text: string) =>
  text.replace(/(\d+) Years?/g, '$1 yr').replace(/(\d+) Months?/g, '$1 mo');

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-[18px] border border-brand-line bg-white px-[18px] py-[18px] md:px-[22px] md:py-[20px]">{children}</section>
);

const CardTitle: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <>
    <h2 className="font-serif text-[21px] font-semibold text-brand-ink">{children}</h2>
    {sub && <p className="mb-2 mt-1 text-[13px] text-brand-muted">{sub}</p>}
  </>
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
    <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3 py-[11px] text-[15px]">
      <span className={`grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold ${final ? 'bg-brand-primary text-white' : 'bg-brand-chip text-brand-primary'}`}>{n}</span>
      <span className={`text-brand-ink ${final ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`text-[16px] font-bold tabular-nums ${value < 0 ? 'text-red-700' : 'text-brand-ink'}`}>{money(value)}</span>
    </div>
  );

  return (
    <Card>
      <CardTitle sub={`Monthly plan · ${appreciationRate}% appreciation · 8% closing costs`}>Where the check goes</CardTitle>
      <div className="divide-y divide-brand-line">
        <Step n="1" label="Check at closing" value={s.netProceeds} />
        <Step n="2" label="Less the down payment you put in" value={-params.downPayment} />
        <Step n="3" label="Less the principal you repaid (your own money)" value={-s.principalPaidToDate} />
        <Step n="4" label="Less the interest you paid the bank" value={-s.totalInterestToDate} />
        {includeCarryingCosts && <Step n="5" label={`Less taxes, insurance, HOA and PMI over ${SALE_YEAR} years`} value={-s.carryingCostsToDate} />}
        <Step n="=" label="What you actually gained" value={s.trueNetGain} final />
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[12px] bg-brand-paper p-3.5">
        <input
          type="checkbox"
          checked={includeCarryingCosts}
          onChange={(e) => onIncludeCarryingCostsChange(e.target.checked)}
          className="mt-1 h-[18px] w-[18px] accent-brand-primary"
        />
        <span className="text-[14px]">
          <span className="font-semibold text-brand-ink">Count ownership costs too</span>
          <span className="block text-[12.5px] text-brand-muted">Adds taxes, insurance, HOA and PMI to the math above</span>
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
      <CardTitle sub={`True net gain is what you keep after interest, measured at a ${SALE_YEAR}-year sale.`}>Your three plans</CardTitle>
      {plans.map(plan => {
        const saved = plan.summary.interestSaved ?? 0;
        const isBaseline = plan.summary.timeSaved === '(Baseline)';
        return (
          <div key={plan.name} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-brand-line py-3.5 last:border-0">
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-brand-ink">
                {plan.name}
                <span className="ml-2 inline-block rounded-full bg-brand-secondary px-[9px] py-[2px] align-[1px] text-[12px] font-bold text-brand-ink">
                  {isBaseline ? 'Baseline' : `${shortDuration(plan.summary.timeSaved)} sooner`}
                </span>
              </div>
              <div className="text-[13.5px] text-brand-muted">{money(plan.summary.totalMonthlyPayment)} a month · pays off {plan.summary.payoffDate}</div>
            </div>
            <div className="text-right">
              <div className={`text-[15px] font-bold tabular-nums ${plan.gain < 0 ? 'text-red-700' : 'text-brand-ink'}`}>{money(plan.gain)}</div>
              <div className="text-[12px] text-brand-muted">true net gain</div>
            </div>
            {saved > 0 && (
              <>
                <div className="col-span-2 mt-1 h-2 overflow-hidden rounded-full bg-brand-chip" aria-hidden="true">
                  <div className="h-full bg-[#1E7B4F]" style={{ width: `${(saved / maxSaved) * 100}%` }} />
                </div>
                <div className="col-span-2 text-[12.5px] text-brand-muted">Saves {money(saved)} in interest</div>
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
  const principal = results.monthly.summary.totalPrincipal ?? 0;

  // Balance at the end of a year. Null once the loan is gone, so the line stops at payoff.
  const balanceAt = (schedule: AmortizationEntry[], periodsPerYear: number, year: number): number | null => {
    if (year === 0) return principal;
    const lastMonth = schedule.length ? schedule[schedule.length - 1].month : 0;
    const payoffYear = Math.ceil(lastMonth / periodsPerYear);
    if (year > payoffYear) return null;
    const row = schedule.find(e => e.month >= year * periodsPerYear);
    return row ? Math.round(row.remainingBalance) : 0;
  };

  const data = Array.from({ length: params.loanTerm + 1 }, (_, year) => ({
    year,
    monthly: balanceAt(results.monthly.schedule, 12, year),
    biWeekly: balanceAt(results.biWeekly.schedule, 26, year),
    biWeeklyExtra: balanceAt(results.biWeeklyWithExtra.schedule, 26, year),
  }));
  const ticks = Array.from({ length: Math.floor(params.loanTerm / 5) + 1 }, (_, i) => i * 5);
  // Balance axis in round steps up to the loan amount
  const step = principal > 500000 ? 200000 : 100000;
  const balanceTicks = Array.from({ length: Math.floor(principal / step) + 1 }, (_, i) => i * step);

  return (
    <Card>
      <CardTitle sub="How much you still owe over the life of the loan, for each plan.">Your loan balance</CardTitle>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 24, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E6EC" />
          <XAxis dataKey="year" ticks={ticks} tick={{ fontSize: 12, fill: '#5B6577' }} label={{ value: 'Years', position: 'insideBottomRight', offset: -4, fontSize: 12, fill: '#5B6577' }} />
          <YAxis ticks={balanceTicks} domain={[0, principal]} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 12, fill: '#5B6577' }} width={56} />
          <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(y) => `Year ${y}`} />
          <ReferenceLine x={SALE_YEAR} stroke="#14213D" strokeDasharray="4 4" label={{ value: `You sell · year ${SALE_YEAR}`, position: 'top', fill: '#14213D', fontSize: 12 }} />
          <Line type="monotone" dataKey="monthly" name="Monthly" stroke="#005A9C" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="biWeekly" name="Bi-Weekly" stroke="#1E7B4F" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="biWeeklyExtra" name="Bi-Weekly v2.0" stroke="#A67700" strokeWidth={2.5} dot={false} />
          <Legend verticalAlign="bottom" height={28} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
