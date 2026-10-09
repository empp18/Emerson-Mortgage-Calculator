import { describe, it, expect } from 'vitest';
import { calculateAllScenarios } from './mortgageCalculator';
import {
  getSnapshotAtYear,
  getScenarioSnapshots,
  buildFallbackInsights,
  parseMortgageInsights,
  type CarryingCosts,
  type InsightYear,
  type SnapshotMetrics,
  type TimelinePoint,
} from './geminiService';
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

describe('AI analysis fallback and parsing', () => {
  const snapshot = (trueNetGain: number): SnapshotMetrics => ({
    year: 7,
    futureValue: 0,
    remainingBalance: 0,
    totalInterestToDate: 0,
    closingCosts: 0,
    netProceeds: 0,
    principalPaidToDate: 0,
    carryingCostsToDate: 0,
    trueGain: trueNetGain,
    trueNetGain,
  });

  // Gains for the monthly, bi-weekly and bi-weekly v2.0 plans at one sale point
  const point = (year: InsightYear, monthly: number, biWeekly: number, biWeeklyExtra: number): TimelinePoint => ({
    year,
    plans: { monthly: snapshot(monthly), biWeekly: snapshot(biWeekly), biWeeklyExtra: snapshot(biWeeklyExtra) },
  });

  const allNegative: TimelinePoint[] = [
    point(7, -90000, -80000, -62000),
    point(13, -70000, -55000, -40000),
    point(20, -30000, -10000, -5000),
  ];
  const allPositive: TimelinePoint[] = [
    point(7, 20000, 25000, 30000),
    point(13, 80000, 90000, 101000),
    point(20, 150000, 160000, 170000),
  ];
  const mixed: TimelinePoint[] = [
    point(7, -10000, 5000, 3000),
    point(13, 40000, 60000, 70000),
    point(20, 100000, 120000, 130000),
  ];

  describe('buildFallbackInsights', () => {
    it('describes an all-negative timeline as losses and keeps the best plan', () => {
      const fallback = buildFallbackInsights(allNegative);
      expect(fallback.timeline.map(t => t.year)).toEqual([7, 13, 20]);
      expect(fallback.timeline.every(t => t.subtitle === 'All plans lose money')).toBe(true);
      expect(fallback.timeline[0].takeaway).toBe('Bi-Weekly v2.0 loses the least, at −$62k true net gain.');
      expect(fallback.bottomLine.lead).toBe('None of the plans come out ahead within 20 years, ');
      expect(fallback.fullAnalysis).toHaveLength(4);
      expect(fallback.fullAnalysis[3].label).toBe('Strategy');
    });

    it('describes an all-positive timeline as gains and names the first year a plan is ahead', () => {
      const fallback = buildFallbackInsights(allPositive);
      expect(fallback.timeline.every(t => t.subtitle === 'All plans gain')).toBe(true);
      expect(fallback.timeline[1].takeaway).toBe('Bi-Weekly v2.0 comes out best, at +$101k true net gain.');
      expect(fallback.bottomLine.lead).toBe('The earliest sale point where a plan comes out ahead is year 7, ');
      expect(fallback.bottomLine.emphasis).toBe('Bi-Weekly v2.0 nets +$30k.');
    });

    it('marks a mixed timeline as mixed and finds the first year a plan turns positive', () => {
      const fallback = buildFallbackInsights(mixed);
      expect(fallback.timeline[0].subtitle).toBe('Results are mixed');
      expect(fallback.timeline[1].subtitle).toBe('All plans gain');
      expect(fallback.bottomLine.lead).toBe('The earliest sale point where a plan comes out ahead is year 7, ');
    });
  });

  describe('parseMortgageInsights', () => {
    const valid = {
      timeline: [
        { year: 7, subtitle: ' Results are mixed ', takeaway: 'Bi-Weekly is ahead.' },
        { year: 13, subtitle: 'All plans gain', takeaway: 'Gains are real.' },
        { year: 20, subtitle: 'All plans gain', takeaway: 'Wealth builds.' },
      ],
      bottomLine: { lead: 'Selling later pays,', emphasis: 'v2.0 leads by $40k.' },
      fullAnalysis: [
        { label: 'Short-term sale (7 years)', text: 'Short.' },
        { label: 'Mid-term (13 years)', text: 'Mid.' },
        { label: 'Long term (20 years)', text: 'Long.' },
      ],
    };

    it('returns the parsed reply for valid JSON, with text trimmed', () => {
      const parsed = parseMortgageInsights(JSON.stringify(valid), mixed);
      expect(parsed.timeline[0]).toEqual({ year: 7, subtitle: 'Results are mixed', takeaway: 'Bi-Weekly is ahead.' });
      expect(parsed.bottomLine).toEqual({ lead: 'Selling later pays,', emphasis: 'v2.0 leads by $40k.' });
      expect(parsed.fullAnalysis).toHaveLength(3);
    });

    it('falls back when the JSON is malformed', () => {
      expect(parseMortgageInsights('{"timeline": [', mixed)).toEqual(buildFallbackInsights(mixed));
      expect(parseMortgageInsights('not json at all', mixed)).toEqual(buildFallbackInsights(mixed));
    });

    it('falls back when there is no text', () => {
      expect(parseMortgageInsights(undefined, mixed)).toEqual(buildFallbackInsights(mixed));
      expect(parseMortgageInsights('', mixed)).toEqual(buildFallbackInsights(mixed));
    });

    it('falls back when a required field is missing', () => {
      const withoutBottomLine = { ...valid, bottomLine: undefined };
      const withoutTakeaway = { ...valid, timeline: [{ year: 7, subtitle: 'x' }, valid.timeline[1], valid.timeline[2]] };
      const withoutYear20 = { ...valid, timeline: valid.timeline.slice(0, 2) };
      const emptyEmphasis = { ...valid, bottomLine: { lead: 'Lead', emphasis: '  ' } };
      for (const reply of [withoutBottomLine, withoutTakeaway, withoutYear20, emptyEmphasis]) {
        expect(parseMortgageInsights(JSON.stringify(reply), mixed)).toEqual(buildFallbackInsights(mixed));
      }
    });
  });
});
