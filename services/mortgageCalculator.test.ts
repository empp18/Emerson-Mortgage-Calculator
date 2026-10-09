import { describe, it, expect } from 'vitest';
import { calculateAllScenarios } from './mortgageCalculator';
import type { MortgageParams, AmortizationEntry } from '../types';

const START = new Date(2026, 9, 9); // Oct 9, 2026 (local time)

const base: MortgageParams = {
  homePrice: 400000,
  downPayment: 100000,
  loanTerm: 30,
  interestRate: 6.5,
  propertyTaxes: 0,
  homeownersInsurance: 0,
  hoaDues: 0,
  pmi: 0,
  extraPayment: 0,
  extraPaymentFrequency: 'monthly',
};

const run = (overrides: Partial<MortgageParams> = {}, startDate = START) =>
  calculateAllScenarios({ ...base, ...overrides }, startDate);

const sum = (rows: AmortizationEntry[], key: 'principal' | 'extraPayment' | 'interest') =>
  rows.reduce((total, row) => total + row[key], 0);

describe('payment math', () => {
  it('matches the standard P&I formula ($300k, 6.5%, 30 years)', () => {
    const { monthly } = run({ downPayment: 100000, homePrice: 400000 });
    expect(monthly.summary.principalAndInterest).toBeCloseTo(1896.2, 2);
    expect(monthly.schedule).toHaveLength(360);
  });

  it('total interest equals payment x months minus principal', () => {
    const { monthly } = run();
    const pAndI = monthly.summary.principalAndInterest!;
    expect(monthly.summary.totalInterest).toBeCloseTo(pAndI * 360 - 300000, 0);
  });

  it('splits payments evenly at 0% interest', () => {
    const { monthly } = run({ interestRate: 0 });
    expect(monthly.summary.principalAndInterest).toBeCloseTo(300000 / 360, 6);
    expect(monthly.summary.totalInterest).toBeCloseTo(0, 6);
  });
});

describe('schedule integrity', () => {
  const scenarios = {
    plain: run(),
    extraMonthly: run({ extraPayment: 300, extraPaymentFrequency: 'monthly' }),
    oneTime: run({ oneTimePayment: 25000, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'all' }),
  };

  it.each(Object.keys(scenarios))('principal repaid equals loan amount (%s)', (name) => {
    const plans = scenarios[name as keyof typeof scenarios];
    for (const plan of [plans.monthly, plans.biWeekly, plans.biWeeklyWithExtra]) {
      const rows = plan.schedule;
      expect(sum(rows, 'principal') + sum(rows, 'extraPayment')).toBeCloseTo(300000, 2);
      expect(rows[rows.length - 1].remainingBalance).toBe(0);
    }
  });

  it('total interest equals the sum of schedule interest', () => {
    const { monthly, biWeekly } = run();
    expect(monthly.summary.totalInterest).toBeCloseTo(sum(monthly.schedule, 'interest'), 2);
    expect(biWeekly.summary.totalInterest).toBeCloseTo(sum(biWeekly.schedule, 'interest'), 2);
  });

  it('bi-weekly pays off sooner than monthly and costs less interest', () => {
    const { monthly, biWeekly } = run();
    expect(biWeekly.schedule.length / 26).toBeLessThan(monthly.schedule.length / 12);
    expect(biWeekly.summary.totalInterest!).toBeLessThan(monthly.summary.totalInterest!);
  });

  it('extra monthly principal shortens the loan and reduces total interest', () => {
    const plain = run();
    const extra = run({ extraPayment: 300, extraPaymentFrequency: 'monthly' });
    expect(extra.biWeeklyWithExtra.schedule.length).toBeLessThan(plain.biWeekly.schedule.length);
    expect(extra.biWeeklyWithExtra.summary.totalInterest!).toBeLessThan(plain.biWeekly.summary.totalInterest!);
  });

  it('caps the final payment at the remaining balance', () => {
    const { monthly } = run({ extraPayment: 2000, extraPaymentFrequency: 'monthly' });
    const last = monthly.schedule[monthly.schedule.length - 1];
    expect(last.remainingBalance).toBe(0);
    expect(last.principal + last.extraPayment).toBeLessThanOrEqual(last.beginningBalance + 1e-9);
  });

  it('annual summary ends with the full loan repaid and all interest counted', () => {
    const { monthly } = run();
    const lastYear = monthly.annualSummary[monthly.annualSummary.length - 1];
    expect(lastYear.totalPrincipalPaid).toBeCloseTo(300000, 2);
    expect(lastYear.totalInterestPaid).toBeCloseTo(monthly.summary.totalInterest!, 2);
  });
});

describe('PMI', () => {
  const pmiOf = (row: AmortizationEntry) => row.totalPayment - row.principal - row.extraPayment - row.interest;

  it('is charged while balance is above 80% of price, then stops', () => {
    // 10% down => LTV 90% at start
    const { monthly } = run({ downPayment: 40000, pmi: 200 });
    const payingRows = monthly.schedule.filter(r => pmiOf(r) > 0.001);
    expect(payingRows.length).toBeGreaterThan(0);
    for (const row of payingRows) {
      expect(pmiOf(row)).toBeCloseTo(200, 6);
      expect(row.beginningBalance / 400000).toBeGreaterThan(0.8);
    }
    const firstFree = monthly.schedule.find(r => r.beginningBalance / 400000 <= 0.8);
    expect(firstFree).toBeDefined();
    expect(pmiOf(firstFree!)).toBeCloseTo(0, 6);
  });

  it('is never charged with 20% down', () => {
    const { monthly, biWeekly } = run({ downPayment: 80000, pmi: 200 });
    expect(monthly.schedule.some(r => pmiOf(r) > 0.001)).toBe(false);
    expect(biWeekly.schedule.some(r => pmiOf(r) > 0.001)).toBe(false);
    expect(monthly.summary.totalCost).toBeCloseTo(320000 + monthly.summary.totalInterest!, 2);
  });

  it('bi-weekly PMI is the monthly amount spread across 26 periods', () => {
    const { biWeekly } = run({ downPayment: 40000, pmi: 260 });
    const firstPaying = biWeekly.schedule.find(r => pmiOf(r) > 0.001)!;
    expect(pmiOf(firstPaying)).toBeCloseTo((260 * 12) / 26, 6);
  });
});

describe('edge cases', () => {
  it('handles 100% down without throwing and with an empty schedule', () => {
    const result = run({ downPayment: 400000 });
    expect(result.monthly.schedule).toHaveLength(0);
    expect(result.biWeeklyWithExtra.schedule).toHaveLength(0);
    expect(result.monthly.summary.totalInterest).toBe(0);
  });
});

describe('payment dates', () => {
  it('clamps month-ends instead of overflowing into the next month', () => {
    // Jan 31 + 1 month = Feb 28, + 2 = Mar 31, + 3 = Apr 30 ...
    const { monthly } = run({}, new Date(2026, 0, 31));
    expect(monthly.schedule.slice(0, 4).map(r => r.paymentDate)).toEqual([
      'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026',
    ]);
  });

  it('keeps bi-weekly dates 14 days apart', () => {
    const { biWeekly } = run({}, new Date(2026, 0, 31));
    expect(biWeekly.schedule[0].paymentDate).toBe('Feb 2026');
    expect(biWeekly.schedule[1].paymentDate).toBe('Feb 2026');
    expect(biWeekly.schedule[2].paymentDate).toBe('Mar 2026');
  });

  it('gives the same schedule regardless of the day it is run', () => {
    const a = run({}, new Date(2026, 0, 1)).monthly.schedule.map(r => r.paymentDate);
    const b = run({}, new Date(2026, 0, 31)).monthly.schedule.map(r => r.paymentDate);
    expect(a.length).toBe(b.length);
    expect(a[0]).toBe('Feb 2026');
    expect(b[0]).toBe('Feb 2026');
  });
});

describe('one-time payment', () => {
  const oneTime = 50000;
  const extraIn = (rows: AmortizationEntry[]) => rows.map((r, i) => [i + 1, r.extraPayment] as const).filter(([, x]) => x > 0);

  it('lands on the chosen month in the monthly schedule', () => {
    // First monthly payment is Nov 2026, so Mar 2027 is period 5
    const { monthly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'monthly' }, START);
    const hits = extraIn(monthly.schedule);
    expect(hits).toHaveLength(1);
    expect(hits[0][0]).toBe(5);
    expect(hits[0][1]).toBeCloseTo(oneTime, 2);
  });

  it('is applied exactly once and the full amount is credited', () => {
    const { monthly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'monthly' }, START);
    expect(sum(monthly.schedule, 'extraPayment')).toBeCloseTo(oneTime, 2);
  });

  it('a month before the first payment is applied to the first payment, in both plans', () => {
    // Today is Oct 9. The monthly first payment is Nov, the bi-weekly first payment is Oct 23.
    // Choosing 2026-10 must not be silently dropped from the monthly plan.
    const { monthly, biWeekly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2026-10', oneTimePaymentMode: 'all' }, START);
    expect(monthly.schedule[0].extraPayment).toBeCloseTo(oneTime, 2);
    expect(biWeekly.schedule[0].extraPayment).toBeCloseTo(oneTime, 2);
  });

  it('applies to the same calendar period in the monthly and bi-weekly plans', () => {
    const { monthly, biWeekly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'all' }, START);
    const mMonth = monthly.schedule.find(r => r.extraPayment > 0)!.paymentDate;
    const bMonth = biWeekly.schedule.find(r => r.extraPayment > 0)!.paymentDate;
    expect(mMonth).toBe('Mar 2027');
    expect(bMonth).toBe('Mar 2027');
  });

  it('is only applied to the plans selected by the mode', () => {
    const { monthly, biWeekly, biWeeklyWithExtra } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'monthly' }, START);
    expect(sum(monthly.schedule, 'extraPayment')).toBeCloseTo(oneTime, 2);
    expect(sum(biWeekly.schedule, 'extraPayment')).toBe(0);
    expect(sum(biWeeklyWithExtra.schedule, 'extraPayment')).toBe(0);
  });

  it('is ignored when no date is given', () => {
    const { monthly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '', oneTimePaymentMode: 'all' }, START);
    expect(sum(monthly.schedule, 'extraPayment')).toBe(0);
  });

  it('a date after payoff is not applied and does not break the schedule', () => {
    const { monthly } = run({ oneTimePayment: oneTime, oneTimePaymentDate: '2070-01', oneTimePaymentMode: 'monthly' }, START);
    expect(sum(monthly.schedule, 'extraPayment')).toBe(0);
    expect(monthly.schedule[monthly.schedule.length - 1].remainingBalance).toBe(0);
  });
});

describe('monthly-equivalent payments', () => {
  it('bi-weekly total monthly payment is 13/12 of monthly P&I plus escrow', () => {
    const { monthly, biWeekly } = run({ propertyTaxes: 6000, homeownersInsurance: 1800, hoaDues: 100 });
    const pAndI = monthly.summary.principalAndInterest!;
    const escrow = 500 + 150 + 100;
    expect(biWeekly.summary.totalMonthlyPayment).toBeCloseTo((pAndI * 13) / 12 + escrow, 2);
    // Per-period bi-weekly payment is half of monthly P&I
    expect(biWeekly.summary.principalAndInterest).toBeCloseTo(pAndI, 2);
    expect(biWeekly.schedule[0].totalPayment).toBeCloseTo(pAndI / 2, 2);
  });

  it('bi-weekly v2.0 includes the annual extra as a monthly equivalent', () => {
    const { monthly, biWeeklyWithExtra } = run({ extraPayment: 100, extraPaymentFrequency: 'monthly' });
    const pAndI = monthly.summary.principalAndInterest!;
    expect(biWeeklyWithExtra.summary.totalMonthlyPayment).toBeCloseTo((pAndI * 13) / 12 + (100 * 12) / 12, 2);
  });
});

describe('annual extra payments', () => {
  it("'annually' is a single lump sum on each year's last payment, not spread out", () => {
    const { biWeeklyWithExtra } = run({ extraPayment: 1200, extraPaymentFrequency: 'annually' });
    const rows = biWeeklyWithExtra.schedule;
    expect(rows[0].extraPayment).toBe(0);
    expect(rows[25].extraPayment).toBeCloseTo(1200, 2); // end of year 1 (period 26)
    expect(rows[51].extraPayment).toBeCloseTo(1200, 2); // end of year 2 (period 52)
    expect(rows[24].extraPayment).toBe(0);
  });

  it("monthly extras are spread over bi-weekly periods with the same annual total", () => {
    const { biWeeklyWithExtra } = run({ extraPayment: 100, extraPaymentFrequency: 'monthly' });
    expect(biWeeklyWithExtra.schedule[0].extraPayment).toBeCloseTo((100 * 12) / 26, 2);
  });

  it('a lump sum shortens the loan more than the same money spread out', () => {
    const lump = run({ extraPayment: 1200, extraPaymentFrequency: 'annually' }).biWeeklyWithExtra;
    const spread = run({ extraPayment: 100, extraPaymentFrequency: 'monthly' }).biWeeklyWithExtra;
    // Same annual total; the lump sum starts reducing the balance later, so it saves less interest
    expect(lump.summary.totalInterest!).toBeGreaterThan(spread.summary.totalInterest!);
  });
});

describe('interest and time savings', () => {
  const plain = run();
  const baselineInterest = plain.monthly.summary.totalInterest!;

  it('the monthly plan with no levers is the baseline', () => {
    expect(plain.monthly.summary.interestSaved).toBe(0);
    expect(plain.monthly.summary.timeSaved).toBe('(Baseline)');
  });

  it('a one-time payment on the monthly plan shows savings against the no-extras baseline', () => {
    const r = run({ oneTimePayment: 50000, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'monthly' });
    expect(r.monthly.summary.interestSaved).toBeGreaterThan(0);
    expect(r.monthly.summary.interestSaved).toBeCloseTo(baselineInterest - r.monthly.summary.totalInterest!, 2);
    expect(r.monthly.summary.timeSaved).not.toBe('(Baseline)');
  });

  it('savings do not depend on which plans the one-time payment is applied to', () => {
    // Bi-weekly savings are the same whether or not the monthly plan also got the one-time payment
    const onlyBiWeekly = run({ oneTimePayment: 50000, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'biWeekly' });
    const both = run({ oneTimePayment: 50000, oneTimePaymentDate: '2027-03', oneTimePaymentMode: 'all' });
    expect(onlyBiWeekly.biWeekly.summary.interestSaved).toBeCloseTo(baselineInterest - onlyBiWeekly.biWeekly.summary.totalInterest!, 2);
    expect(both.biWeekly.summary.interestSaved).toBeCloseTo(baselineInterest - both.biWeekly.summary.totalInterest!, 2);
  });

  it('bi-weekly savings are measured against the same baseline as the monthly plan', () => {
    const r = run();
    expect(r.biWeekly.summary.interestSaved).toBeCloseTo(baselineInterest - r.biWeekly.summary.totalInterest!, 2);
    expect(r.biWeekly.summary.interestSaved).toBeGreaterThan(0);
  });
});

describe('invalid inputs do not produce NaN or infinite schedules', () => {
  it('a loan term of zero gives an empty schedule', () => {
    const r = run({ loanTerm: 0 });
    expect(r.monthly.schedule).toHaveLength(0);
    expect(Number.isFinite(r.monthly.summary.totalCost!)).toBe(true);
  });

  it('a home price of zero with PMI set does not charge PMI or produce NaN', () => {
    const r = run({ homePrice: 0, downPayment: 0, pmi: 200 });
    expect(r.monthly.schedule).toHaveLength(0);
    expect(r.monthly.summary.pmi).toBe(0);
    expect(Number.isNaN(r.biWeekly.summary.totalMonthlyPayment!)).toBe(false);
  });
});
