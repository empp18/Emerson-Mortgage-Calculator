
import React, { useState } from 'react';
import type { MortgageParams } from '../types';

interface CalculatorFormProps {
  onCalculate: (params: MortgageParams) => void;
  isLoading: boolean;
}

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: string; description?: string }> = ({ label, icon, description, ...props }) => (
  <div className="w-full">
    <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-700 truncate">{label}</label>
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
  const [extraPayment, setExtraPayment] = useState('100');
  const [extraPaymentFrequency, setExtraPaymentFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly' | 'annually'>('monthly');
  
  // One-time Payment State
  const [showOneTimePayment, setShowOneTimePayment] = useState(false);
  const [oneTimePaymentAmount, setOneTimePaymentAmount] = useState('5000');
  const [oneTimePaymentDate, setOneTimePaymentDate] = useState(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1); // Default to next month
      return d.toISOString().slice(0, 7); // YYYY-MM
  });
  const [oneTimePaymentMode, setOneTimePaymentMode] = useState<'monthly' | 'biWeekly' | 'biWeeklyWithExtra' | 'all'>('biWeeklyWithExtra');

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
                            className="bg-transparent focus:ring-brand-primary focus:border-brand-primary block w-full rounded-none rounded-l-md pl-7 p-3 border border-gray-300"
                            value={downPaymentType === 'dollar' ? downPayment : downPaymentPercent}
                            onChange={(e) => handleDownPaymentChange(e.target.value)}
                            min="0"
                            step={downPaymentType === 'dollar' ? '1' : '0.1'}
                            required
                        />
                    </div>
                    <button type="button" onClick={() => handleDownPaymentTypeChange('dollar')} className={`relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-sm font-medium ${downPaymentType === 'dollar' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                        $
                    </button>
                    <button type="button" onClick={() => handleDownPaymentTypeChange('percent')} className={`relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-r-md ${downPaymentType === 'percent' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                        %
                    </button>
                </div>
            </div>
            
            <Input label="Loan Term (Years)" type="number" min="1" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} required />
            <Input label="Interest Rate" icon="%" type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} required />
            
            {/* Property Taxes alone in the cell to balance grid */}
            <Input label="Property Taxes" icon="$" type="number" min="0" value={propertyTaxes} onChange={(e) => setPropertyTaxes(e.target.value)} description="Annual amount" />
            
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
                    <label htmlFor="extraPayment" className="block text-sm font-medium text-gray-700">Extra Recurring Payment</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">$</span>
                        <input type="number" id="extraPayment" min="0" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} className="bg-transparent flex-1 block w-full rounded-none p-3 border border-x-0 border-gray-300 focus:ring-brand-primary focus:border-brand-primary transition duration-150 ease-in-out" />
                        <select value={extraPaymentFrequency} onChange={(e) => setExtraPaymentFrequency(e.target.value as any)} className="bg-transparent inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 text-gray-700 sm:text-sm focus:ring-brand-primary focus:border-brand-primary">
                            <option value="weekly">Weekly</option>
                            <option value="bi-weekly">Bi-Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="annually">Annually</option>
                        </select>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Applied to 'Bi-Weekly v2.0' scenario.</p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center space-x-3">
                             <label className="block text-sm font-medium text-gray-700">One-Time Prepayment</label>
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
                        <div className="relative rounded-md shadow-sm col-span-1">
                            <input 
                                type="month" 
                                disabled={!showOneTimePayment}
                                value={oneTimePaymentDate} 
                                onChange={(e) => setOneTimePaymentDate(e.target.value)}
                                className="bg-transparent w-full p-3 rounded-md border-gray-300 focus:ring-brand-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:bg-gray-50"
                            />
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
