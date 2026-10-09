import { describe, it, expect } from 'vitest';
import { buildPdfReport } from './pdfReport';
import { calculateAllScenarios } from './mortgageCalculator';
import type { MortgageParams } from '../types';

// The form's default inputs
const defaults: MortgageParams = {
  homePrice: 400000,
  downPayment: 100000,
  loanTerm: 30,
  interestRate: 6.5,
  propertyTaxes: 5400,
  homeownersInsurance: 1500,
  hoaDues: 0,
  pmi: 0,
  extraPayment: 200,
  extraPaymentFrequency: 'monthly',
};

const DATE = new Date(2026, 9, 9);

const build = (params: MortgageParams, overrides: { includeCarryingCosts?: boolean } = {}) =>
  buildPdfReport({
    params,
    results: calculateAllScenarios(params, DATE),
    appreciationRate: 3.5,
    closingCostRate: 6,
    includeCarryingCosts: overrides.includeCarryingCosts ?? false,
    date: DATE,
  });

describe('one-page PDF report', () => {
  it('fits the default inputs on one US Letter page', () => {
    const doc = build(defaults);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(612, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(792, 0);
  });

  it('still fits on one page with ownership costs and a one-time payment', () => {
    const doc = build(
      { ...defaults, hoaDues: 150, pmi: 120, oneTimePayment: 25000, oneTimePaymentDate: '2028-03', oneTimePaymentMode: 'all' },
      { includeCarryingCosts: true }
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('fits when no extra payment is set and the loan is 15 years', () => {
    const doc = build({ ...defaults, extraPayment: 0, loanTerm: 15 });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
