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
const TERM_OPTIONS = ['15', '20', '30'];

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const num = (value: string) => parseFloat(value) || 0;

// Keeps digits and one decimal point
const cleanNumeric = (raw: string) => {
  const [whole, ...rest] = raw.replace(/[^0-9.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
};

// 400000.5 -> "400,000.5"; the stored value stays unformatted
const withCommas = (raw: string) => {
  const [whole, decimal] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${grouped}.${decimal}` : grouped;
};

// Next calendar month as YYYY-MM, computed in local time (toISOString would use UTC)
const nextMonthKey = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const labelClass = 'mb-1 flex items-center text-[12.5px] font-semibold text-brand-muted';
const inputClass = 'w-full rounded-[10px] border border-brand-line bg-white py-[11px] text-[15px] text-brand-ink focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary';
const selectClass = 'w-full rounded-[10px] border border-brand-line bg-white px-3 py-[11px] text-[15px] text-brand-ink focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  grouped?: boolean;
  description?: string;
  tooltip?: string;
}

const TextField: React.FC<TextFieldProps> = ({ id, label, value, onChange, prefix, suffix, grouped, description, tooltip }) => (
  <div className="min-w-0">
    <label htmlFor={id} className={labelClass}>
      {label}
      {tooltip && <InfoTooltip text={tooltip} />}
    </label>
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px] text-brand-muted">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={grouped ? withCommas(value) : value}
        onChange={(e) => onChange(cleanNumeric(e.target.value))}
        className={`${inputClass} ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-9' : 'pr-3'}`}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[15px] text-brand-muted">{suffix}</span>}
    </div>
    {description && <p className="mt-1 text-[12px] text-brand-muted">{description}</p>}
  </div>
);

export const CalculatorForm: React.FC<CalculatorFormProps> = ({ onCalculate, appreciationRate, onAppreciationRateChange }) => {
  const [homePrice, setHomePrice] = useState('400000');
  const [downPayment, setDownPayment] = useState('100000');
  const [downPaymentPercent, setDownPaymentPercent] = useState('25');
  const [loanTerm, setLoanTerm] = useState('30');
  const [showCustomTerm, setShowCustomTerm] = useState(false);
  const [interestRate, setInterestRate] = useState('6.50');
  const [propertyTaxes, setPropertyTaxes] = useState('5400');
  const [homeownersInsurance, setHomeownersInsurance] = useState('1500');
  const [hoaDues, setHoaDues] = useState('0');
  const [pmi, setPmi] = useState('0');
  const [extraPayment, setExtraPayment] = useState('200');
  const [extraPaymentFrequency, setExtraPaymentFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly' | 'annually'>('monthly');
  const [appreciationText, setAppreciationText] = useState(String(appreciationRate));

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

  // Down payment: the percentage is kept when the price changes; dollars and the slider stay in step
  const handleHomePriceChange = (value: string) => {
    setHomePrice(value);
    setDownPayment(String(Math.round((num(value) * num(downPaymentPercent)) / 100)));
  };

  const handleDownPaymentDollars = (value: string) => {
    setDownPayment(value);
    const price = num(homePrice);
    if (price > 0) setDownPaymentPercent(String(Number(((num(value) / price) * 100).toFixed(2))));
  };

  const handleDownPaymentPercent = (percent: number) => {
    setDownPaymentPercent(String(percent));
    setDownPayment(String(Math.round((num(homePrice) * percent) / 100)));
  };

  const handleAppreciation = (value: string) => {
    setAppreciationText(value);
    onAppreciationRateChange(num(value));
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
  const downPercent = num(downPaymentPercent);
  const needsPmi = num(homePrice) > 0 && (num(homePrice) - num(downPayment)) / num(homePrice) > 0.8;
  const shortMoney = (value: number) => (value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${Math.round(value)}`);
  const scenarioSummary = `${shortMoney(num(homePrice))} · ${Number(downPercent.toFixed(1))}% down · ${num(interestRate)}% · ${loanTerm} yr`;

  return (
    <div className="rounded-[18px] border border-brand-line bg-white p-[22px]">
      <h2 className="font-serif text-[20px] font-semibold text-brand-ink">Your scenario</h2>
      <p className="mt-1 text-[12.5px] text-brand-muted">{scenarioSummary}</p>
      <p className="mb-5 mt-1 text-[13px] text-brand-muted">Change any number. Results update as you go.</p>

      <div className="space-y-4">
        <TextField id="homePrice" label="Home price" prefix="$" grouped value={homePrice} onChange={handleHomePriceChange} />

        <div>
          <TextField id="downPayment" label="Down payment" prefix="$" grouped value={downPayment} onChange={handleDownPaymentDollars} />
          <div className="mt-1.5 flex justify-between text-[12.5px] text-brand-muted">
            <span>{Number(downPercent.toFixed(1))}% down</span>
            <span>{needsPmi ? 'PMI estimated' : 'No PMI needed'}</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={0.5}
            value={downPercent}
            onChange={(e) => handleDownPaymentPercent(parseFloat(e.target.value))}
            aria-label="Down payment as a percentage of the home price"
            className="mt-2 w-full accent-brand-primary"
          />
        </div>

        <div className="grid grid-cols-[1fr_1.35fr] gap-3">
          <TextField id="interestRate" label="Interest rate" suffix="%" value={interestRate} onChange={setInterestRate} />
          <div className="min-w-0">
            <span className={labelClass}>Loan term</span>
            {/* Same rendered height as the interest rate input: 11px padding + 22.5px line + 1px border, top and bottom */}
            <div className="flex h-[46.5px] rounded-[10px] border border-brand-line bg-white p-[3px]">
              {[...TERM_OPTIONS, 'Other'].map(option => {
                const selected = option === 'Other' ? showCustomTerm : !showCustomTerm && loanTerm === option;
                const label = option === '30' ? '30 yr' : option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (option === 'Other') { setShowCustomTerm(true); return; }
                      setShowCustomTerm(false);
                      setLoanTerm(option);
                    }}
                    className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-0.5 text-[12.5px] ${selected ? 'bg-brand-primary font-semibold text-white' : 'text-brand-muted hover:text-brand-ink'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {showCustomTerm && (
              <div className="mt-2">
                <TextField id="loanTerm" label="Years" value={loanTerm} onChange={setLoanTerm} />
              </div>
            )}
          </div>
        </div>

        <div>
          <TextField id="extraPayment" label="Extra payment" prefix="$" grouped value={extraPayment} onChange={setExtraPayment} />
          <label htmlFor="extraFrequency" className={`${labelClass} mt-4`}>
            How often
            <InfoTooltip text={`Applied to the Bi-Weekly v2.0 plan${annualExtra > 0 ? ` · about ${currency(annualExtra)} a year` : ''}.`} />
          </label>
          <select id="extraFrequency" value={extraPaymentFrequency} onChange={(e) => setExtraPaymentFrequency(e.target.value as any)} className={selectClass}>
            <option value="weekly">Every week</option>
            <option value="bi-weekly">Every two weeks</option>
            <option value="monthly">Every month</option>
            <option value="annually">Once a year</option>
          </select>
        </div>
      </div>

      <details className="mt-5 border-t border-brand-line pt-4">
        <summary className="cursor-pointer text-[14px] font-semibold text-brand-primary">More details</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField id="propertyTaxes" label="Property taxes" prefix="$" grouped value={propertyTaxes} onChange={setPropertyTaxes} description="Per year" />
            <TextField id="pmi" label="PMI" prefix="$" grouped value={pmi} onChange={setPmi} description="Per month"
              tooltip="Private Mortgage Insurance (PMI) is typically required if your down payment is less than 20%. We estimate this for you, but you can adjust it. It is automatically removed when equity reaches 20%." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField id="insurance" label="Homeowners insurance" prefix="$" grouped value={homeownersInsurance} onChange={setHomeownersInsurance} description="Per year" />
            <TextField id="hoa" label="HOA dues" prefix="$" grouped value={hoaDues} onChange={setHoaDues} description="Per month" />
          </div>
          <TextField id="appreciation" label="Sale appreciation" suffix="%" value={appreciationText} onChange={handleAppreciation} description="Per year, used for the sale figures" />

          <div>
            {!showOneTimePayment ? (
              <button type="button" onClick={() => setShowOneTimePayment(true)} className="text-[14px] font-semibold text-brand-primary">
                + Add a one-time payment
              </button>
            ) : (
              <div className="space-y-3 rounded-[10px] border border-brand-line p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center text-[12.5px] font-semibold text-brand-muted">
                    One-time payment
                    <InfoTooltip text="A single lump-sum payment applied to your principal balance on a specific date. Great for calculating the impact of bonuses or tax returns." />
                  </span>
                  <button type="button" onClick={() => setShowOneTimePayment(false)} className="text-[12px] font-semibold text-brand-muted hover:text-brand-ink">Remove</button>
                </div>
                <TextField id="oneTimeAmount" label="Amount" prefix="$" grouped value={oneTimePaymentAmount} onChange={setOneTimePaymentAmount} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={selectedMonth} onChange={(e) => handleDateChange('month', e.target.value)} className={selectClass} aria-label="Payment month">
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={selectedYear} onChange={(e) => handleDateChange('year', e.target.value)} className={selectClass} aria-label="Payment year">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <select value={oneTimePaymentMode} onChange={(e) => setOneTimePaymentMode(e.target.value as any)} className={selectClass} aria-label="Apply to">
                  <option value="biWeeklyWithExtra">Apply to: Bi-Weekly v2.0</option>
                  <option value="monthly">Apply to: Monthly</option>
                  <option value="biWeekly">Apply to: Bi-Weekly</option>
                  <option value="all">Apply to: All plans</option>
                </select>
                <p className="text-[12px] text-brand-muted">Applied to the first payment on or after this month.</p>
              </div>
            )}
          </div>
        </div>
      </details>

      {validationError && <p role="alert" className="mt-5 text-[13px] text-red-700">{validationError}</p>}
    </div>
  );
};
