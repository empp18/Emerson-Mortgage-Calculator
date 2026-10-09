import { describe, it, expect } from 'vitest';
import { calculateAllScenarios } from './mortgageCalculator';
import { getSnapshotAtYear, getScenarioSnapshots, type CarryingCosts } from './geminiService';
import type { MortgageParams } from '../types';

const START = new Date(2026, 9, 9);
const HOME = 400000;
const DOWN = 100000;

const params: MortgageParams = {
  homePrice: HOME,
  downPayment: DOWN,
  loanTerm: 30,
  interestRate: 6.5,
  propertyTaxes: 6000,
  homeownersInsurance: 1800,
  hoaDues: 100,
  pmi: 0,
  extraPayment: 0,
  extraPaymentFrequency: 'monthly',
};

const results = calculateAllScenarios(params, START);
const LOAN = HOME - DOWN;

describe('getSnapshotAtYear: sale-side metrics', () => {
  const snap = getSnapshotAtYear(results.monthly.schedule, 7, HOME, DOWN, false, 3.5);

  it('future value compounds appreciation from the purchase price', () => {
    expect(snap.futureValue).toBeCloseTo(HOME * Math.pow(1.035, 7), 2);
  });

  it('closing costs are 8% of future value and net proceeds subtract them and the loan', () => {
    expect(snap.closingCosts).toBeCloseTo(snap.futureValue * 0.08, 2);
    expect(snap.netProceeds).toBeCloseTo(snap.futureValue - snap.closingCosts - snap.remainingBalance, 2);
  });

  it('principal paid to date equals loan minus remaining balance', () => {
    expect(snap.principalPaidToDate).toBeCloseTo(LOAN - snap.remainingBalance, 2);
    expect(snap.principalPaidToDate).toBeGreaterThan(0);
  });

  it('true gain = net proceeds - down payment - principal paid', () => {
    expect(snap.trueGain).toBeCloseTo(snap.netProceeds - DOWN - snap.principalPaidToDate, 2);
  });

  it('true gain equals sale price after closing costs minus original purchase price', () => {
    expect(snap.trueGain).toBeCloseTo(snap.futureValue * 0.92 - HOME, 2);
  });

  it('true net gain = true gain - interest (carrying costs off by default)', () => {
    expect(snap.carryingCostsToDate).toBe(0);
    expect(snap.trueNetGain).toBeCloseTo(snap.trueGain - snap.totalInterestToDate, 2);
  });

  it('interest to date matches the interest in the schedule up to year 7', () => {
    const rows = results.monthly.schedule.filter(r => r.month <= 84);
    const interest = rows.reduce((t, r) => t + r.interest, 0);
    expect(snap.totalInterestToDate).toBeCloseTo(interest, 2);
  });
});

describe('getSnapshotAtYear: carrying costs (opt-in)', () => {
  const carrying: CarryingCosts = {
    propertyTaxes: params.propertyTaxes,
    homeownersInsurance: params.homeownersInsurance,
    hoaDues: params.hoaDues,
  };

  it('counts taxes, insurance and HOA for every year held', () => {
    const snap = getSnapshotAtYear(results.monthly.schedule, 7, HOME, DOWN, false, 3.5, carrying);
    expect(snap.carryingCostsToDate).toBeCloseTo((6000 + 1800 + 100 * 12) * 7, 2);
  });

  it('deducts carrying costs from true net gain only, not true gain', () => {
    const off = getSnapshotAtYear(results.monthly.schedule, 7, HOME, DOWN, false, 3.5);
    const on = getSnapshotAtYear(results.monthly.schedule, 7, HOME, DOWN, false, 3.5, carrying);
    expect(on.trueGain).toBeCloseTo(off.trueGain, 6);
    expect(on.trueNetGain).toBeCloseTo(off.trueNetGain - on.carryingCostsToDate, 2);
  });

  it('includes PMI actually paid when PMI is in the schedule', () => {
    const withPmi = calculateAllScenarios({ ...params, downPayment: 40000, pmi: 200 }, START);
    const snap = getSnapshotAtYear(withPmi.monthly.schedule, 7, HOME, 40000, false, 3.5, carrying);
    const pmiRows = withPmi.monthly.schedule.filter(r => r.month <= 84);
    const pmiPaid = pmiRows.reduce((t, r) => t + (r.totalPayment - r.principal - r.extraPayment - r.interest), 0);
    expect(pmiPaid).toBeGreaterThan(0);
    expect(snap.carryingCostsToDate).toBeCloseTo((6000 + 1800 + 1200) * 7 + pmiPaid, 2);
  });
});

describe('getSnapshotAtYear: loan already paid off', () => {
  // 15-year loan, measured at year 20: balance is zero and all interest has been paid
  const fifteen = calculateAllScenarios({ ...params, loanTerm: 15 }, START);
  const snap = getSnapshotAtYear(fifteen.monthly.schedule, 20, HOME, DOWN, false, 3.5);

  it('remaining balance is zero', () => {
    expect(snap.remainingBalance).toBe(0);
  });

  it('counts all interest over the life of the loan', () => {
    expect(snap.totalInterestToDate).toBeCloseTo(fifteen.monthly.summary.totalInterest!, 2);
  });

  it('principal paid equals the full loan', () => {
    expect(snap.principalPaidToDate).toBeCloseTo(LOAN, 2);
  });
});

describe('getSnapshotAtYear: no loan (100% down)', () => {
  const snap = getSnapshotAtYear([], 7, HOME, HOME, false, 3.5);

  it('true gain is sale net of closing costs minus purchase price', () => {
    expect(snap.trueGain).toBeCloseTo(snap.futureValue * 0.92 - HOME, 2);
    expect(snap.principalPaidToDate).toBe(0);
    expect(snap.totalInterestToDate).toBe(0);
  });
});

describe('getScenarioSnapshots', () => {
  it('returns the three plans and respects the carrying-cost toggle', () => {
    const off = getScenarioSnapshots(results, params, 13, 3.5, false);
    const on = getScenarioSnapshots(results, params, 13, 3.5, true);
    expect(Object.keys(off)).toEqual(['monthly', 'biWeekly', 'biWeeklyExtra']);
    expect(off.monthly.carryingCostsToDate).toBe(0);
    expect(on.monthly.carryingCostsToDate).toBeCloseTo((6000 + 1800 + 1200) * 13, 2);
    expect(on.biWeekly.trueNetGain).toBeCloseTo(off.biWeekly.trueNetGain - on.biWeekly.carryingCostsToDate, 2);
  });
});
