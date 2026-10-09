import React from 'react';
import { getScenarioSnapshots } from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface ResultHeadlineProps {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  includeCarryingCosts: boolean;
  closingCostRate: number;
}

const SALE_YEAR = 7;

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(value));

// Plain-language summary of the 7-year sale, built from the same figures as the breakdown table
export const ResultHeadline: React.FC<ResultHeadlineProps> = ({ params, results, appreciationRate, includeCarryingCosts, closingCostRate }) => {
  const { netProceeds, trueNetGain } = getScenarioSnapshots(results, params, SALE_YEAR, appreciationRate, includeCarryingCosts, closingCostRate).monthly;

  const closing = netProceeds >= 0
    ? `you would get ${money(netProceeds)} at closing`
    : `you would owe ${money(netProceeds)} at closing`;
  const costs = includeCarryingCosts ? 'interest and ownership costs' : 'interest';
  const outcome = trueNetGain < 0
    ? `you would still be ${money(trueNetGain)} behind`
    : `you would be ${money(trueNetGain)} ahead`;

  return (
    <section aria-labelledby="result-headline">
      <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-muted">Your 7-year sale</p>
      <h2 id="result-headline" className="font-serif text-[28px] font-semibold leading-[1.18] text-brand-ink md:text-[36px]">
        If you sold in seven years, {closing}. After {costs}, {outcome}.
      </h2>
      <p className="mt-3 text-[16px] text-brand-muted">Here is how that happens, and how much the payment plan changes it.</p>
    </section>
  );
};
