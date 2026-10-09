import React, { useState, useEffect, useMemo } from 'react';
import { InfoTooltip } from './ui/InfoTooltip';
import { annualExtraPaymentFor } from '../services/mortgageCalculator';
import type { MortgageParams } from '../types';

interface CalculatorFormProps {
  onCalculate: (params: MortgageParams) => void;
  appreciationRate: number;
  onAppreciationRateChange: (rate: number) => void;
}

// Results follow the inputs; this waits for a pause in typing before recalculating
const LIVE_DEBOUNCE_MS = 250;

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const num = (value: string) => parseFloat(value) || 0;

// Next calendar month as YYYY-MM, computed in local time (toISOString would use UTC)
const nextMonthKey = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: string; suffix?: string; description?: string; tooltip?: string }> = ({ label, icon, suffix, description, tooltip, ...props }) => (
  <div className="w-full">
    <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-700 flex items-center">
      {label}
      {tooltip && <InfoTooltip text={tooltip} />}
    </label>
    <div className="mt-1 relative rounded-md shadow-sm">
      {icon && <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-500 sm:text-sm">{icon}</span></div>}
      <input
        id={props.id || props.name}
        {...props}
        className={`bg-transparent w-full p-3 rounded-md border-gray-300 ${icon ? 'pl-7' : ''} ${suffix ? 'pr-12' : ''} focus:ring-brand-primary focus:border-brand-primary transition duration-150 ease-in-out`}
      />
      {suffix && <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center"><span className="text-gray-500 sm:text-sm">{suffix}</span></div>}
    </div>
    {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
  </div>
);

export const CalculatorForm: React.FC<CalculatorFormProps> = ({ onCalculate, appreciationRate, onAppreciationRateChange }) => {
  const [homePrice, setHomePrice] = useState('450000');
  const [downPayment, setDownPayment] = useState('90000');
  const [downPaymentType, setDownPaymentType] = useState<'dollar' | 'percent'>('percent');
  const [downPaymentPercent, setDownPaymentPercent] = useState('20');
  const [loanTerm, setLoanTerm] = useState('30');
  const [interestRate, setInterestRate] = useState('6.5');
  const [propertyTaxes, setPropertyTaxes] = useState('5400');
  const [homeownersInsurance, setHomeownersInsurance] = useState('1500');
  const [hoaDues, setHoaDues] = useState('0');
  const [pmi, setPmi] = useState('0');
  const [extraPayment, setExtraPayment] = useState('100');
  const [extraPaymentFrequency, setExtraPaymentFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly' | 'annually'>('monthly');

  // One-time payment
  const [showOneTimePayment, setShowOneTimePayment] = useState(false);
  const [oneTimePaymentAmount, setOneTimePaymentAmount] = useState('5000');
  const [oneTimePaymentDate, setOneTimePaymentDate] = useState(nextMonthKey);
  const [oneTimePaymentMode, setOneTimePaymentMode] = useState<'monthly' | 'biWeekly' | 'biWeeklyWithExtra' | 'all'>('biWeeklyWithExtra');

  // Auto-estimate PMI at 0.55%/yr while the loan is above 80% of the price
  useEffect(() => {
    const price = num(homePrice);
    const loanAmount = price - num(downPayment);
    if (price > 0) {
      const ltv = loanAmount / price;
      if (ltv > 0.8) {
        const estimatedMonthlyPmi = (loanAmount * 0.0055) / 12;
        // Only overwrite when the user has not set their own value
        if (pmi === '0' || Math.abs(num(pmi) - estimatedMonthlyPmi) > 1) {
          setPmi(estimatedMonthlyPmi.toFixed(2));
        }
      } else if (num(pmi) > 0) {
        setPmi('0');
      }
    }
    // pmi is deliberately left out of the dependencies so this does not loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePrice, downPayment]);

  const handleDownPaymentTypeChange = (type: 'dollar' | 'percent') => {
    setDownPaymentType(type);
    const price = num(homePrice);
    if (type === 'percent') {
      setDownPayment(String((price * num(downPaymentPercent)) / 100));
    } else if (price > 0) {
      setDownPaymentPercent(String((num(downPayment) / price) * 100));
    }
  };

  const handleDownPaymentChange = (value: string) => {
    const price = num(homePrice);
    if (downPaymentType === 'dollar') {
      setDownPayment(value);
      if (price > 0) setDownPaymentPercent(String((num(value) / price) * 100));
    } else {
      setDownPaymentPercent(value);
      setDownPayment(String((price * num(value)) / 100));
    }
  };

  const handleHomePriceChange = (value: string) => {
    setHomePrice(value);
    const price = num(value);
    if (downPaymentType === 'percent') {
      setDownPayment(String((price * num(downPaymentPercent)) / 100));
    } else if (price > 0) {
      setDownPaymentPercent(String((num(downPayment) / price) * 100));
    }
  };

  const handleDateChange = (part: 'year' | 'month', value: string) => {
    const [year, month] = oneTimePaymentDate.split('-');
    setOneTimePaymentDate(part === 'year' ? `${value}-${month}` : `${year}-${value}`);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 31 }, (_, i) => currentYear + i);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    .map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
  const [selectedYear, selectedMonth] = oneTimePaymentDate.split('-');

  // Inputs the amortization math cannot handle. Shown to the user; no calculation runs while set.
  const validationError = (() => {
    const price = num(homePrice);
    const dp = num(downPayment);
    const term = parseInt(loanTerm, 10);
    const rate = parseFloat(interestRate);
    if (!(price > 0)) return 'Home price must be greater than $0.';
    if (!(dp >= 0) || dp > price) return 'Down payment must be between $0 and the home price.';
    if (!Number.isInteger(term) || term < 1 || term > 50) return 'Loan term must be a whole number of years from 1 to 50.';
    if (!(rate >= 0) || rate > 30) return 'Interest rate must be between 0% and 30%.';
    return null;
  })();

  const params = useMemo<MortgageParams | null>(() => {
    if (validationError) return null;
    return {
      homePrice: num(homePrice),
      downPayment: num(downPayment),
      loanTerm: parseInt(loanTerm, 10),
      interestRate: num(interestRate),
      propertyTaxes: num(propertyTaxes),
      homeownersInsurance: num(homeownersInsurance),
      hoaDues: num(hoaDues),
      pmi: num(pmi),
      extraPayment: num(extraPayment),
      extraPaymentFrequency,
      oneTimePayment: showOneTimePayment ? num(oneTimePaymentAmount) : 0,
      oneTimePaymentDate: showOneTimePayment ? oneTimePaymentDate : undefined,
      oneTimePaymentMode,
    };
  }, [validationError, homePrice, downPayment, loanTerm, interestRate, propertyTaxes, homeownersInsurance, hoaDues, pmi, extraPayment, extraPaymentFrequency, showOneTimePayment, oneTimePaymentAmount, oneTimePaymentDate, oneTimePaymentMode]);

  // Live updates: recalculate shortly after the inputs settle
  useEffect(() => {
    if (!params) return;
    const timer = setTimeout(() => onCalculate(params), LIVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // onCalculate is not a dependency: a new callback each render would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const annualExtra = annualExtraPaymentFor({ extraPayment: num(extraPayment), extraPaymentFrequency });

  return (
    <div className="bg-white p-5 md:p-6 rounded-2xl shadow-lg border border-brand-light">
      <h2 className="font-serif text-xl font-semibold text-brand-dark">Your scenario</h2>
      <p className="text-sm text-gray-500 mt-1 mb-5">Change any number. Results update as you go.</p>

      <div className="space-y-5">
        <Input label="Home Price" icon="$" type="number" min="0" value={homePrice} onChange={(e) => handleHomePriceChange(e.target.value)} required />

        <div>
          <label htmlFor="downPaymentInput" className="block text-sm font-medium text-gray-700">Down Payment</label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <div className="relative flex-grow focus-within:z-10">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                <span className="text-gray-500 sm:text-sm">{downPaymentType === 'dollar' ? '$' : '%'}</span>
              </div>
              <input
                type="number"
                id="downPaymentInput"
                className="bg-transparent focus:ring-brand-primary focus:border-brand-primary block w-full rounded-none rounded-l-md pl-7 p-3"
                value={downPaymentType === 'dollar' ? downPayment : downPaymentPercent}
                onChange={(e) => handleDownPaymentChange(e.target.value)}
                min="0"
                step={downPaymentType === 'dollar' ? '1' : '0.1'}
                required
              />
            </div>
            <button type="button" onClick={() => handleDownPaymentTypeChange('dollar')} className={`relative -ml-px px-4 py-2 text-sm font-medium ${downPaymentType === 'dollar' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>$</button>
            <button type="button" onClick={() => handleDownPaymentTypeChange('percent')} className={`relative -ml-px px-4 py-2 text-sm font-medium rounded-r-md ${downPaymentType === 'percent' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>%</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Interest Rate" icon="%" type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} required />
          <Input label="Loan Term (Years)" type="number" min="1" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} required />
        </div>

        <div>
          <label htmlFor="extraPayment" className="block text-sm font-medium text-gray-700 flex items-center">
            Extra Recurring Payment
            <InfoTooltip text="Any additional amount you pay every period goes directly towards reducing your principal balance, saving you interest and shortening your loan term." />
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">$</span>
            <input type="number" id="extraPayment" min="0" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} className="bg-transparent flex-1 block w-full rounded-none p-3 focus:ring-brand-primary focus:border-brand-primary" />
            <select value={extraPaymentFrequency} onChange={(e) => setExtraPaymentFrequency(e.target.value as any)} className="bg-transparent rounded-r-md border-gray-300 text-gray-700 sm:text-sm focus:ring-brand-primary focus:border-brand-primary">
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <div className="mt-1 flex justify-between items-start gap-2">
            <p className="text-xs text-gray-500">Applied to the Bi-Weekly v2.0 scenario.</p>
            {annualExtra > 0 && <p className="text-xs font-semibold text-brand-secondary whitespace-nowrap">≈ {currency(annualExtra)} / year</p>}
          </div>
        </div>
      </div>

      <details className="mt-6 pt-4 border-t border-gray-200">
        <summary className="cursor-pointer text-sm font-semibold text-brand-primary">More details</summary>
        <div className="space-y-5 mt-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Property Taxes" icon="$" type="number" min="0" value={propertyTaxes} onChange={(e) => setPropertyTaxes(e.target.value)} description="Annual" />
            <Input label="PMI" icon="$" type="number" min="0" value={pmi} onChange={(e) => setPmi(e.target.value)} description="Monthly"
              tooltip="Private Mortgage Insurance (PMI) is typically required if your down payment is less than 20%. We estimate this for you, but you can adjust it. It is automatically removed when equity reaches 20%." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Homeowner's Ins." icon="$" type="number" min="0" value={homeownersInsurance} onChange={(e) => setHomeownersInsurance(e.target.value)} description="Annual" />
            <Input label="HOA Dues" icon="$" type="number" min="0" value={hoaDues} onChange={(e) => setHoaDues(e.target.value)} description="Monthly" />
          </div>
          <Input label="Sale appreciation" suffix="%" type="number" min="0" step="0.1" value={String(appreciationRate)}
            onChange={(e) => onAppreciationRateChange(num(e.target.value))} description="Per year, used for the sale figures" />

          <div>
            {!showOneTimePayment ? (
              <button type="button" onClick={() => setShowOneTimePayment(true)} className="text-sm font-semibold text-brand-primary">
                + Add a one-time payment
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    One-Time Prepayment
                    <InfoTooltip text="A single lump-sum payment applied to your principal balance on a specific date. Great for calculating the impact of bonuses or tax returns." />
                  </span>
                  <button type="button" onClick={() => setShowOneTimePayment(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Remove</button>
                </div>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-500 sm:text-sm">$</span></div>
                  <input type="number" min="0" value={oneTimePaymentAmount} onChange={(e) => setOneTimePaymentAmount(e.target.value)} className="bg-transparent w-full p-3 pl-7 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary" placeholder="Amount" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={selectedMonth} onChange={(e) => handleDateChange('month', e.target.value)} className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary text-sm" aria-label="Payment month">
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={selectedYear} onChange={(e) => handleDateChange('year', e.target.value)} className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary text-sm" aria-label="Payment year">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <select value={oneTimePaymentMode} onChange={(e) => setOneTimePaymentMode(e.target.value as any)} className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary text-sm" aria-label="Apply to">
                  <option value="biWeeklyWithExtra">Apply to: Bi-Weekly v2.0</option>
                  <option value="monthly">Apply to: Monthly</option>
                  <option value="biWeekly">Apply to: Bi-Weekly</option>
                  <option value="all">Apply to: All Scenarios</option>
                </select>
                <p className="text-xs text-gray-500">Applied to the first payment on or after this month.</p>
              </div>
            )}
          </div>
        </div>
      </details>

      {validationError && <p role="alert" className="mt-5 text-sm text-red-600">{validationError}</p>}
    </div>
  );
};
