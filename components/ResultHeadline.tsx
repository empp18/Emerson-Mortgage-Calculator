import React from 'react';
import { getScenarioSnapshots } from '../services/geminiService';
import type { MortgageParams, CalculationResults } from '../types';

interface ResultHeadlineProps {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  includeCarryingCosts: boolean;
}

const SALE_YEAR = 7;

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(value));

// Plain-language summary of the 7-year sale, built from the same figures as the breakdown table
export const ResultHeadline: React.FC<ResultHeadlineProps> = ({ params, results, appreciationRate, includeCarryingCosts }) => {
  const { netProceeds, trueNetGain } = getScenarioSnapshots(results, params, SALE_YEAR, appreciationRate, includeCarryingCosts).monthly;

  const closing = netProceeds >= 0
    ? `you would get ${money(netProceeds)} at closing`
    : `you would owe ${money(netProceeds)} at closing`;
  const costs = includeCarryingCosts ? 'interest and ownership costs' : 'interest';
  const outcome = trueNetGain < 0
    ? `you would still be ${money(trueNetGain)} behind`
    : `you would be ${money(trueNetGain)} ahead`;

  return (
    <section aria-labelledby="result-headline" className="mb-8">
      <h2 id="result-headline" className="font-serif text-2xl md:text-3xl font-semibold text-brand-dark leading-snug">
        If you sold in seven years, {closing}. After {costs}, {outcome}.
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Based on the monthly plan, {appreciationRate}% appreciation and 8% closing costs.
      </p>
    </section>
  );
};
