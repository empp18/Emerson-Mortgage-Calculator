import React, { useState, useEffect } from 'react';
import { InfoTooltip } from './ui/InfoTooltip';
import type { MortgageParams } from '../types';

interface CalculatorFormProps {
  onCalculate: (params: MortgageParams) => void;
  isLoading: boolean;
}

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: string; description?: string; tooltip?: string }> = ({ label, icon, description, tooltip, ...props }) => (
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
        className={`bg-transparent w-full p-3 rounded-md border-gray-300 ${icon ? 'pl-7' : ''} focus:ring-brand-primary focus:border-brand-primary transition duration-150 ease-in-out disabled:bg-gray-100 disabled:text-gray-400`}
      />
    </div>
    {description && <p className="mt-1 text-xs text-gray-500 truncate">{description}</p>}
  </div>
);

export const CalculatorForm: React.FC<CalculatorFormProps> = ({ onCalculate, isLoading }) => {
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
  
  // One-time Payment State
  const [showOneTimePayment, setShowOneTimePayment] = useState(false);
  const [oneTimePaymentAmount, setOneTimePaymentAmount] = useState('5000');
  
  // Fix: safely initialize date to next month without overflow (e.g. Jan 31 -> Mar 3)
  const [oneTimePaymentDate, setOneTimePaymentDate] = useState(() => {
      const d = new Date();
      d.setDate(1); // Reset to 1st of month to prevent overflow
      d.setMonth(d.getMonth() + 1); 
      return d.toISOString().slice(0, 7); // YYYY-MM
  });
  const [oneTimePaymentMode, setOneTimePaymentMode] = useState<'monthly' | 'biWeekly' | 'biWeeklyWithExtra' | 'all'>('biWeeklyWithExtra');

  // Auto-calculate PMI when Home Price or Down Payment changes
  useEffect(() => {
      const price = parseFloat(homePrice) || 0;
      const dp = parseFloat(downPayment) || 0;
      const loanAmount = price - dp;
      
      if (price > 0) {
          const ltv = loanAmount / price;
          if (ltv > 0.8) {
              // Estimate PMI at 0.55% annually
              const estimatedMonthlyPmi = (loanAmount * 0.0055) / 12;
              // Only update if the value is significantly different or currently 0 to allow user override
              if (pmi === '0' || Math.abs(parseFloat(pmi) - estimatedMonthlyPmi) > 1) {
                  setPmi(estimatedMonthlyPmi.toFixed(2));
              }
          } else if (ltv <= 0.8 && parseFloat(pmi) > 0) {
             // Auto-remove PMI if LTV drops below 80%
              setPmi('0');
          }
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePrice, downPayment]); 
  // We exclude 'pmi' from dependency array to prevent loops, but check it inside

  const handleDownPaymentTypeChange = (type: 'dollar' | 'percent') => {
    setDownPaymentType(type);
    const price = parseFloat(homePrice) || 0;
    if (type === 'percent') {
        const percent = parseFloat(downPaymentPercent) || 0;
        setDownPayment(String((price * percent) / 100));
    } else { // dollar
        if (price > 0) {
            setDownPaymentPercent(String(((parseFloat(downPayment) || 0) / price) * 100));
        }
    }
  };
  
  const handleDownPaymentChange = (value: string) => {
    const price = parseFloat(homePrice) || 0;
    if (downPaymentType === 'dollar') {
        setDownPayment(value);
        if (price > 0) {
            setDownPaymentPercent(String(((parseFloat(value) || 0) / price) * 100));
        }
    } else { // percent
        setDownPaymentPercent(value);
        setDownPayment(String((price * (parseFloat(value) || 0)) / 100));
    }
  };

  const handleHomePriceChange = (value: string) => {
    setHomePrice(value);
    const price = parseFloat(value) || 0;
    if (downPaymentType === 'percent') {
      const percent = parseFloat(downPaymentPercent) || 0;
      setDownPayment(String((price * percent) / 100));
    } else {
      if(price > 0) {
        setDownPaymentPercent(String(((parseFloat(downPayment) || 0) / price) * 100));
      }
    }
  };

  // Setup for date dropdowns
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 31 }, (_, i) => currentYear + i);
  const months = [
    { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' }
  ];
  
  const [selectedYear, selectedMonth] = oneTimePaymentDate.split('-');

  const handleDateChange = (part: 'year' | 'month', value: string) => {
      let newDate = '';
      if (part === 'year') {
          newDate = `${value}-${selectedMonth}`;
      } else {
          newDate = `${selectedYear}-${value}`;
      }
      setOneTimePaymentDate(newDate);
  };

  const calculateAnnualExtra = () => {
      const amount = parseFloat(extraPayment) || 0;
      if (amount <= 0) return 0;
      
      switch(extraPaymentFrequency) {
          case 'weekly': return amount * 52;
          case 'bi-weekly': return amount * 26;
          case 'monthly': return amount * 12;
          case 'annually': return amount;
          default: return 0;
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate({
      homePrice: parseFloat(homePrice) || 0,
      downPayment: parseFloat(downPayment) || 0,
      loanTerm: parseInt(loanTerm) || 0,
      interestRate: parseFloat(interestRate) || 0,
      propertyTaxes: parseFloat(propertyTaxes) || 0,
      homeownersInsurance: parseFloat(homeownersInsurance) || 0,
      hoaDues: parseFloat(hoaDues) || 0,
      pmi: parseFloat(pmi) || 0,
      extraPayment: parseFloat(extraPayment) || 0,
      extraPaymentFrequency: extraPaymentFrequency,
      oneTimePayment: showOneTimePayment ? parseFloat(oneTimePaymentAmount) || 0 : 0,
      oneTimePaymentDate: showOneTimePayment ? oneTimePaymentDate : undefined,
      oneTimePaymentMode: oneTimePaymentMode,
    });
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <button type="button" onClick={() => handleDownPaymentTypeChange('dollar')} className={`relative -ml-px inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium ${downPaymentType === 'dollar' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                        $
                    </button>
                    <button type="button" onClick={() => handleDownPaymentTypeChange('percent')} className={`relative -ml-px inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-r-md ${downPaymentType === 'percent' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                        %
                    </button>
                </div>
            </div>
            
            <Input label="Loan Term (Years)" type="number" min="1" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} required />
            <Input label="Interest Rate" icon="%" type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} required />
            
            {/* Property Taxes and PMI sharing the row */}
            <div className="grid grid-cols-2 gap-4">
                <Input 
                    label="Property Taxes" 
                    icon="$" 
                    type="number" 
                    min="0" 
                    value={propertyTaxes} 
                    onChange={(e) => setPropertyTaxes(e.target.value)} 
                    description="Annual" 
                />
                <Input 
                    label="PMI" 
                    icon="$" 
                    type="number" 
                    min="0" 
                    value={pmi} 
                    onChange={(e) => setPmi(e.target.value)} 
                    description="Monthly"
                    tooltip="Private Mortgage Insurance (PMI) is typically required if your down payment is less than 20%. We estimate this for you, but you can adjust it. It is automatically removed when equity reaches 20%."
                />
            </div>
            
            {/* Split column for Insurance and HOA */}
            <div className="grid grid-cols-2 gap-4">
                <Input 
                    label="Homeowner's Ins." 
                    icon="$" 
                    type="number" 
                    min="0" 
                    value={homeownersInsurance} 
                    onChange={(e) => setHomeownersInsurance(e.target.value)} 
                    description="Annual"
                />
                <Input 
                    label="HOA Dues" 
                    icon="$" 
                    type="number" 
                    min="0" 
                    value={hoaDues} 
                    onChange={(e) => setHoaDues(e.target.value)} 
                    description="Monthly" 
                />
            </div>
            
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6 mt-2">
                <div>
                    <label htmlFor="extraPayment" className="block text-sm font-medium text-gray-700 flex items-center">
                        Extra Recurring Payment
                        <InfoTooltip text="Any additional amount you pay every period goes directly towards reducing your principal balance, saving you interest and shortening your loan term." />
                    </label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <span className="inline-flex items-center px-3 rounded-l-md bg-gray-50 text-gray-500 sm:text-sm">$</span>
                        <input type="number" id="extraPayment" min="0" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} className="bg-transparent flex-1 block w-full rounded-none p-3 focus:ring-brand-primary focus:border-brand-primary transition duration-150 ease-in-out" />
                        <select value={extraPaymentFrequency} onChange={(e) => setExtraPaymentFrequency(e.target.value as any)} className="bg-transparent inline-flex items-center rounded-r-md text-gray-700 sm:text-sm focus:ring-brand-primary focus:border-brand-primary">
                            <option value="weekly">Weekly</option>
                            <option value="bi-weekly">Bi-Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="annually">Annually</option>
                        </select>
                    </div>
                    <div className="mt-1 flex justify-between items-start">
                        <p className="text-xs text-gray-500">Applied to 'Bi-Weekly v2.0' scenario.</p>
                        {calculateAnnualExtra() > 0 && (
                            <p className="text-xs font-semibold text-brand-secondary">
                                ≈ {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(calculateAnnualExtra())} / year
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center space-x-3">
                             <label className="block text-sm font-medium text-gray-700 flex items-center">
                                One-Time Prepayment
                                <InfoTooltip text="A single lump-sum payment applied to your principal balance on a specific date. Great for calculating the impact of bonuses or tax returns." />
                             </label>
                             <button 
                                type="button" 
                                onClick={() => setShowOneTimePayment(!showOneTimePayment)}
                                className={`${showOneTimePayment ? 'bg-brand-primary' : 'bg-gray-200'} relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2`}
                             >
                                 <span className="sr-only">Use setting</span>
                                 <span aria-hidden="true" className={`${showOneTimePayment ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}></span>
                             </button>
                         </div>
                         
                         <select
                             disabled={!showOneTimePayment}
                             value={oneTimePaymentMode}
                             onChange={(e) => setOneTimePaymentMode(e.target.value as any)}
                             className="text-xs border-none bg-transparent p-0 pr-1 text-brand-primary font-medium focus:ring-0 cursor-pointer disabled:text-gray-400 disabled:cursor-not-allowed text-right"
                         >
                             <option value="biWeeklyWithExtra">Apply to: Bi-Weekly v2.0</option>
                             <option value="monthly">Apply to: Monthly</option>
                             <option value="biWeekly">Apply to: Bi-Weekly</option>
                             <option value="all">Apply to: All Scenarios</option>
                         </select>
                    </div>
                    
                    <div className={`grid grid-cols-2 gap-2 transition-opacity duration-200 ${showOneTimePayment ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                        <div className="relative rounded-md shadow-sm col-span-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-500 sm:text-sm">$</span></div>
                            <input 
                                type="number" 
                                disabled={!showOneTimePayment}
                                value={oneTimePaymentAmount} 
                                onChange={(e) => setOneTimePaymentAmount(e.target.value)}
                                className="bg-transparent w-full p-3 pl-7 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:bg-gray-50"
                                placeholder="Amount"
                            />
                        </div>
                        
                        {/* User Friendly Date Selection */}
                        <div className="col-span-1 flex space-x-2">
                            <div className="relative w-1/2">
                                <select
                                    disabled={!showOneTimePayment}
                                    value={selectedMonth}
                                    onChange={(e) => handleDateChange('month', e.target.value)}
                                    className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:bg-gray-50 text-sm appearance-none"
                                >
                                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                </div>
                            </div>
                            <div className="relative w-1/2">
                                <select
                                    disabled={!showOneTimePayment}
                                    value={selectedYear}
                                    onChange={(e) => handleDateChange('year', e.target.value)}
                                    className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:bg-gray-50 text-sm appearance-none"
                                >
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                </div>
                            </div>
                        </div>
                        <p className="col-span-2 text-xs text-gray-500">Lump sum payment applied on specified date.</p>
                    </div>
                </div>
            </div>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-6 bg-brand-secondary text-brand-dark font-bold py-3 px-4 rounded-lg hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-secondary transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isLoading ? (
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : 'Calculate Scenarios'}
        </button>
      </form>
    </div>
  );
};