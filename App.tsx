import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, Legend, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculatorForm } from './components/CalculatorForm';
import { GeminiInsights } from './components/GeminiInsights';
import { InfoTooltip } from './components/ui/InfoTooltip';
import { calculateAllScenarios, annualExtraPaymentFor } from './services/mortgageCalculator';
import { getScenarioSnapshots } from './services/geminiService';
import { ResultHeadline } from './components/ResultHeadline';
import type { MortgageParams, CalculationResults, AmortizationEntry } from './types';

const formatCurrency = (value: number | null | undefined): string => {
    if (typeof value !== 'number' || !isFinite(value)) {
        return '$0.00';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const PrintPreviewModal: React.FC<{
    show: boolean;
    onClose: () => void;
    pdfUrl: string | null;
    isGenerating: boolean;
    generationStatus: string;
}> = ({ show, onClose, pdfUrl, isGenerating, generationStatus }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
                <header className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="text-xl font-bold text-brand-dark">Print Preview</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl font-light leading-none">&times;</button>
                </header>
                <div className="flex-grow p-2 bg-gray-200">
                    {isGenerating || !pdfUrl ? (
                        <div className="w-full h-full flex flex-col justify-center items-center">
                            <svg className="animate-spin h-10 w-10 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="mt-4 text-lg text-brand-dark">{generationStatus}</p>
                        </div>
                    ) : (
                        <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Preview" />
                    )}
                </div>
                <footer className="p-3 border-t text-center text-sm text-gray-500 bg-gray-50 rounded-b-lg">
                    <p>Use the controls within the preview (usually top-right) to print or download the PDF.</p>
                </footer>
            </div>
        </div>
    );
};


const ComparisonTable: React.FC<{ results: CalculationResults, params: MortgageParams }> = ({ results, params }) => {
    const biWeeklyPAndI = results.biWeekly.summary.principalAndInterest / 2;
    const monthlyEscrow = results.monthly.summary.taxes + results.monthly.summary.insurance + results.monthly.summary.hoa + results.monthly.summary.pmi;
    const biWeeklyEscrow = monthlyEscrow * 12 / 26;
    const biWeeklyPayment = biWeeklyPAndI + biWeeklyEscrow;

    const annualExtraPayment = annualExtraPaymentFor(params);
    const extraLabel = params.extraPaymentFrequency === 'annually'
        ? `+ ${formatCurrency(annualExtraPayment)} / yr`
        : `+ ${formatCurrency(annualExtraPayment / 26)} Extra`;

    const getOneTimeMsg = (modeMatch: boolean) => {
         if (params.oneTimePayment && params.oneTimePayment > 0 && modeMatch) {
             return `+ ${formatCurrency(params.oneTimePayment)} (1x)`;
         }
         return '';
    };

    const scenarios = [
        { 
            title: 'Monthly', 
            data: results.monthly.summary, 
            paymentAmount: `${formatCurrency(results.monthly.summary.totalMonthlyPayment)} ${getOneTimeMsg(params.oneTimePaymentMode === 'monthly' || params.oneTimePaymentMode === 'all')}`
        },
        { 
            title: 'Bi-Weekly', 
            data: results.biWeekly.summary, 
            paymentAmount: `${formatCurrency(biWeeklyPayment)} ${getOneTimeMsg(params.oneTimePaymentMode === 'biWeekly' || params.oneTimePaymentMode === 'all')}`
        },
        { 
            title: 'Bi-Weekly v2.0', 
            data: results.biWeeklyWithExtra.summary, 
            paymentAmount: `${formatCurrency(biWeeklyPayment)} ${extraLabel} ${getOneTimeMsg(params.oneTimePaymentMode === 'biWeeklyWithExtra' || params.oneTimePaymentMode === 'all')}`
        }
    ];

    const rows = [
        { label: 'Payment', key: 'paymentAmount', tooltip: 'Includes Principal, Interest, and Escrow (Taxes, Insurance, HOA, PMI) per period.' },
        { label: 'Payoff Date', key: 'payoffDate', tooltip: 'The projected date you will be completely debt-free.' },
        { label: 'Time Saved', key: 'timeSaved', tooltip: 'How much sooner you pay off the loan compared to the standard Monthly schedule.' },
        { label: 'Total Interest Paid', key: 'totalInterest', format: formatCurrency, tooltip: 'Total money paid to the bank in interest over the life of the loan. This is the true cost of borrowing.' },
        { label: 'Interest Savings', key: 'interestSaved', format: formatCurrency, highlight: true, tooltip: 'The amount of money you save in interest payments by choosing this scenario over the standard Monthly plan.' },
    ];

    return (
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-lg h-full">
            <h2 className="text-xl font-bold text-brand-dark mb-3">Payment Scenario Comparison</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full text-center">
                    <thead>
                        <tr>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600">Metric</th>
                            {scenarios.map(s => <th key={s.title} className="py-2 px-3 text-xs font-bold text-brand-dark bg-brand-light rounded-t-lg">{s.title}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.label} className="border-t">
                                <td className="py-3 px-3 text-left text-sm font-medium text-gray-800">
                                    <div className="flex items-center">
                                        {row.label}
                                        {/* Place tooltip at bottom for first 3 rows to avoid clipping */}
                                        {row.tooltip && <InfoTooltip text={row.tooltip} alignment="left" placement={index < 3 ? 'bottom' : 'top'} />}
                                    </div>
                                </td>
                                {scenarios.map(s => {
                                    if (row.key === 'interestSaved' && s.title === 'Monthly' && !s.data.interestSaved) {
                                        return (
                                            <td key={s.title} className="py-3 px-3 text-sm text-gray-800 font-normal">
                                                (Baseline)
                                            </td>
                                        );
                                    }
                                    const value = s.data[row.key] ?? s[row.key];
                                    return (
                                        <td key={s.title} className={`py-3 px-3 text-sm ${row.highlight ? 'font-bold text-green-600' : 'text-gray-700'}`}>
                                            {row.format ? row.format(value) : value}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PaymentBreakdown: React.FC<{ results: CalculationResults }> = ({ results }) => {
    const summary = results.monthly.summary;
    const firstMonthPayment = results.monthly.schedule.length > 0 ? results.monthly.schedule[0] : { principal: 0, interest: 0 };

    const paymentData = [
        { name: 'Principal', value: firstMonthPayment.principal },
        { name: 'Interest', value: firstMonthPayment.interest },
        { name: 'Taxes', value: summary.taxes },
        { name: 'Insurance & HOA', value: summary.insurance + summary.hoa },
        { name: 'PMI', value: summary.pmi },
    ].filter(item => item.value > 0);
    
    const COLORS = ['#005A9C', '#0094d4', '#7ac4e8', '#F2A900', '#ffc74f'];
    const totalPaymentForPercentage = summary.totalMonthlyPayment > 0 ? summary.totalMonthlyPayment : 1;

    return (
         <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg">
             <h2 className="text-2xl font-bold text-brand-dark mb-2">Monthly Payment Breakdown</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="space-y-3">
                    <p className="text-5xl font-extrabold text-brand-dark mb-6">{formatCurrency(summary.totalMonthlyPayment)}</p>
                    {paymentData.map((entry, index) => {
                        const percentage = (entry.value / totalPaymentForPercentage) * 100;
                        return (
                            <div key={entry.name} className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <div className="w-4 h-4 rounded-full mr-3" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                    <span className="text-md text-gray-700">{entry.name}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500 mr-2">{`(${percentage.toFixed(1)}%)`}</span>
                                    <span className="font-bold text-brand-dark">{formatCurrency(entry.value)}</span>
                                </div>
                            </div>
                        );
                    })}
                    <div className="border-t pt-3 mt-3 flex justify-between items-center font-bold">
                       <span className="text-lg text-brand-dark">Total Monthly</span>
                       <span className="text-lg text-brand-dark">{formatCurrency(summary.totalMonthlyPayment)}</span>
                    </div>
                </div>
                <div className="w-full h-52">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={paymentData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                                paddingAngle={5}
                            >
                                {paymentData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => {
                                const percentage = (value / totalPaymentForPercentage) * 100;
                                return `${formatCurrency(value)} (${percentage.toFixed(1)}%)`;
                            }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
             </div>
         </div>
    );
};

const AmortizationSchedule: React.FC<{ results: CalculationResults, params: MortgageParams, appreciationRate: number, setAppreciationRate: (rate: number) => void }> = ({ results, params, appreciationRate, setAppreciationRate }) => {
    const [activeTab, setActiveTab] = useState<'monthly' | 'biWeekly' | 'biWeeklyWithExtra'>('monthly');
    const [chartTab, setChartTab] = useState<'balance' | 'equity'>('balance');
    const [equityScenario, setEquityScenario] = useState<'monthly' | 'biWeekly' | 'biWeeklyWithExtra'>('monthly');
    const [showSchedule, setShowSchedule] = useState(false);

    const yearlyBalanceData = useMemo(() => {
        const { monthly, biWeekly, biWeeklyWithExtra } = results;
        const loanAmount = monthly.summary.totalPrincipal;
    
        if (!loanAmount || !params) return [];
    
        const processSchedule = (schedule: AmortizationEntry[], periodsPerYear: number) => {
            if (!schedule || schedule.length === 0) return [];
            const yearlyBalances = [loanAmount];
            const totalYears = Math.ceil(schedule.length / periodsPerYear);
            for (let year = 1; year <= totalYears; year++) {
                const periodIndex = year * periodsPerYear - 1;
                if (periodIndex < schedule.length) {
                    yearlyBalances.push(schedule[periodIndex].remainingBalance);
                } else {
                    yearlyBalances.push(0);
                }
            }
            if (yearlyBalances[yearlyBalances.length - 1] > 0 && schedule[schedule.length-1].remainingBalance === 0) {
                 yearlyBalances.push(0);
            }
            return yearlyBalances;
        };
        
        const monthlyBalances = processSchedule(monthly.schedule, 12);
        const biWeeklyBalances = processSchedule(biWeekly.schedule, 26);
        const biWeeklyExtraBalances = processSchedule(biWeeklyWithExtra.schedule, 26);
    
        const maxYears = params.loanTerm;
        
        const data = [];
        for (let year = 0; year <= maxYears; year++) {
            data.push({
                year: year,
                'Monthly': monthlyBalances[year] ?? (year > 0 ? 0 : loanAmount),
                'Bi-Weekly': biWeeklyBalances[year] ?? (year > 0 ? 0 : loanAmount),
                'Bi-Weekly v2.0': biWeeklyExtraBalances[year] ?? (year > 0 ? 0 : loanAmount),
            });
        }
    
        return data;
    }, [results, params]);

    const equityData = useMemo(() => {
        if (!params || !results) return [];
        
        // Get the correct annual summary based on selected scenario
        const summary = results[equityScenario].annualSummary;
        const homePrice = params.homePrice;
        const appreciation = (appreciationRate || 0) / 100;
        
        const data = [];
        let currentHomeValue = homePrice;
        
        // Initial Point (Year 0)
        data.push({
            year: 0,
            homeValue: homePrice,
            equity: params.downPayment,
            interestPaid: 0,
            balance: homePrice - params.downPayment
        });

        // Loop through annual summary
        for (const entry of summary) {
            currentHomeValue = currentHomeValue * (1 + appreciation);
            const equity = currentHomeValue - entry.endingBalance;
            data.push({
                year: entry.year,
                homeValue: Math.round(currentHomeValue),
                equity: Math.round(equity),
                interestPaid: Math.round(entry.totalInterestPaid),
                balance: Math.round(entry.endingBalance)
            });
        }
        
        // Fill remaining years if payoff is early
        const lastEntry = data[data.length - 1];
        if (lastEntry.year < params.loanTerm) {
             for(let y = lastEntry.year + 1; y <= params.loanTerm; y++) {
                 currentHomeValue = currentHomeValue * (1 + appreciation);
                 data.push({
                     year: y,
                     homeValue: Math.round(currentHomeValue),
                     equity: Math.round(currentHomeValue), // No balance left
                     interestPaid: lastEntry.interestPaid,
                     balance: 0
                 });
             }
        }

        return data;

    }, [results, params, equityScenario, appreciationRate]);
        
    const activeData = results[activeTab];

    const TABS = [
        { id: 'monthly', label: 'Monthly' },
        { id: 'biWeekly', label: 'Bi-Weekly' },
        { id: 'biWeeklyWithExtra', label: 'Bi-Weekly v2.0' }
    ] as const;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg text-left">
                    <p className="font-bold text-brand-dark mb-2">{`Year: ${label}`}</p>
                    <ul className="list-none p-0 m-0">
                        {payload.map((pld: any) => (
                            <li key={pld.dataKey} style={{ color: pld.stroke || pld.fill }} className="text-sm flex items-center justify-between space-x-4">
                               <span className="capitalize">{pld.name}:</span>
                               <span className="font-bold">{formatCurrency(pld.value)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            );
        }
        return null;
    };

    if (!showSchedule) {
        return (
            <div className="text-center mt-8">
                 <button onClick={() => setShowSchedule(true)} className="bg-brand-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-800 transition duration-300">
                     Show Interactive Charts & Schedule
                 </button>
            </div>
        )
    }

    return (
        <div id="amortization-section" className="bg-white p-6 md:p-8 rounded-2xl shadow-lg mt-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-brand-dark">Analysis & Schedule</h2>
                <button onClick={() => setShowSchedule(false)} className="text-sm text-gray-600 hover:text-brand-primary">&times; Hide Section</button>
            </div>

            {/* Chart Tabs */}
            <div className="flex space-x-4 mb-6 border-b">
                <button 
                    onClick={() => setChartTab('balance')} 
                    className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${chartTab === 'balance' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Loan Balance Comparison
                </button>
                <button 
                    onClick={() => setChartTab('equity')} 
                    className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${chartTab === 'equity' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Equity vs. Interest
                </button>
            </div>

            {/* Chart Area */}
            <div className="w-full h-[350px] md:h-[400px] mb-8 relative">
                {chartTab === 'balance' ? (
                    <>
                        <h3 className="text-xl font-bold text-brand-dark mb-4 text-center">Loan Balance Over Time</h3>
                        <ResponsiveContainer>
                            <LineChart data={yearlyBalanceData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="year" 
                                    label={{ value: '(years)', position: 'insideBottomRight', offset: -10 }}
                                    fontSize={12}
                                    minTickGap={20}
                                />
                                <YAxis 
                                    tickFormatter={(tick) => formatCurrency(tick)} 
                                    fontSize={12}
                                    width={80}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px' }}/>
                                <Line type="monotone" dataKey="Monthly" stroke="#005A9C" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="Bi-Weekly" stroke="#F2A900" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="Bi-Weekly v2.0" stroke="#22c55e" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </>
                ) : (
                    <>
                        <div className="flex flex-wrap justify-center items-center gap-2 sm:space-x-4 mb-4 absolute top-0 left-0 right-0 z-10">
                            <div className="flex items-center rounded-md p-1">
                                <span className="text-xs text-gray-600 mr-2 font-medium">Appreciation %</span>
                                <input 
                                    type="number" 
                                    value={appreciationRate} 
                                    onChange={(e) => setAppreciationRate(parseFloat(e.target.value))} 
                                    className="w-16 text-sm border-gray-300 rounded-md shadow-sm focus:border-brand-primary focus:ring focus:ring-brand-primary focus:ring-opacity-50 p-1 bg-white text-gray-900"
                                    step="0.1"
                                />
                            </div>
                            <select 
                                value={equityScenario} 
                                onChange={(e) => setEquityScenario(e.target.value as any)}
                                className="text-sm border-gray-300 rounded-md shadow-sm focus:border-brand-primary focus:ring focus:ring-brand-primary focus:ring-opacity-50 bg-white/90 backdrop-blur-sm p-1.5"
                            >
                                <option value="monthly">Scenario: Monthly</option>
                                <option value="biWeekly">Scenario: Bi-Weekly</option>
                                <option value="biWeeklyWithExtra">Scenario: Bi-Weekly v2.0</option>
                            </select>
                        </div>
                        <ResponsiveContainer>
                            <AreaChart data={equityData} margin={{ top: 40, right: 20, left: 20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                                    </linearGradient>
                                    <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="year" label={{ value: '(years)', position: 'insideBottomRight', offset: -10 }} fontSize={12} />
                                <YAxis tickFormatter={(tick) => formatCurrency(tick)} fontSize={12} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px' }}/>
                                <Line type="monotone" dataKey="homeValue" name="Home Value" stroke="#8884d8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                <Area type="monotone" dataKey="equity" name="Equity Gained" stroke="#22c55e" fillOpacity={1} fill="url(#colorEquity)" />
                                <Area type="monotone" dataKey="interestPaid" name="Interest Paid" stroke="#ef4444" fillOpacity={1} fill="url(#colorInterest)" />
                                <Line type="monotone" dataKey="balance" name="Remaining Balance" stroke="#F2A900" strokeWidth={3} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </>
                )}
            </div>

            {/* Schedule Table */}
            <div>
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                        {TABS.map(tab => (
                             <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${
                                    activeTab === tab.id
                                    ? 'border-brand-primary text-brand-primary'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="mt-4 overflow-auto max-h-[600px] rounded-lg border">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-20">
                            <tr>
                                {['Period', 'Date', 'Balance', 'Principal', 'Interest', 'Extra', 'Total Payment', 'Ending Balance'].map(header => (
                                     <th key={header} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                         {header}
                                     </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {activeData.schedule.map((entry) => (
                                <tr key={entry.month}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.month}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.paymentDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(entry.beginningBalance)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(entry.principal)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(entry.interest)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">{formatCurrency(entry.extraPayment)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{formatCurrency(entry.totalPayment)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-brand-dark">{formatCurrency(entry.remainingBalance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const LoanDetails: React.FC<{ params: MortgageParams }> = ({ params }) => {
    const loanAmount = params.homePrice - params.downPayment;
    const downPaymentPercent = params.homePrice > 0 ? (params.downPayment / params.homePrice) * 100 : 0;

    const coreDetails = [
        { label: 'Home Price', value: formatCurrency(params.homePrice) },
        { label: 'Down Payment', value: `${formatCurrency(params.downPayment)} (${downPaymentPercent.toFixed(1)}%)`, tooltip: 'The upfront cash paid towards the home price. A higher down payment reduces your loan amount.', placement: 'bottom' as const },
        { label: 'Loan Amount', value: formatCurrency(loanAmount), tooltip: 'The amount you are borrowing from the lender (Home Price minus Down Payment).', placement: 'bottom' as const },
        { label: 'Interest Rate', value: `${params.interestRate}%` },
        { label: 'Loan Term', value: `${params.loanTerm} Years` },
    ];

    const escrowDetails = [
        { label: 'Property Taxes', value: `${formatCurrency(params.propertyTaxes)} / year`, tooltip: 'Estimated annual tax. Typically divided by 12 and collected monthly into an Escrow account.' },
        { label: "Homeowner's Insurance", value: `${formatCurrency(params.homeownersInsurance)} / year`, tooltip: 'Estimated annual insurance premium. Typically divided by 12 and collected monthly into an Escrow account.' },
    ];

    return (
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-lg h-full">
            <h2 className="text-xl font-bold text-brand-dark mb-3">Loan Details</h2>
            <ul className="space-y-2">
                {coreDetails.map(detail => (
                     <li key={detail.label} className="flex justify-between items-center text-sm">
                         <div className="flex items-center">
                             <span className="font-medium text-gray-600">{detail.label}</span>
                             {detail.tooltip && <InfoTooltip text={detail.tooltip} alignment="left" placement={detail.placement} />}
                         </div>
                         <span className="font-bold text-brand-dark">{detail.value}</span>
                     </li>
                ))}
            </ul>
            <hr className="my-3 border-gray-200" />
            <ul className="space-y-2">
                 {escrowDetails.map(detail => (
                     <li key={detail.label} className="flex justify-between items-center text-sm">
                         <div className="flex items-center">
                             <span className="font-medium text-gray-600">{detail.label}</span>
                             {detail.tooltip && <InfoTooltip text={detail.tooltip} alignment="left" />}
                         </div>
                         <span className="font-bold text-brand-dark">{detail.value}</span>
                     </li>
                ))}
            </ul>
        </div>
    );
};


export default function App() {
  const [params, setParams] = useState<MortgageParams | null>(null);
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [appreciationRate, setAppreciationRate] = useState(3.5);
  const [includeCarryingCosts, setIncludeCarryingCosts] = useState(false);
  
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfGenerationStatus, setPdfGenerationStatus] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleCalculate = (newParams: MortgageParams) => {
    setParams(newParams);
    const calculatedResults = calculateAllScenarios(newParams);
    setResults(calculatedResults);
  };

  const generatePdfDocument = async (
  results: CalculationResults,
  params: MortgageParams,
  setStatus: (status: string) => void
): Promise<Blob> => {
  setStatus('Initializing Report...');
  await new Promise(resolve => setTimeout(resolve, 50));

  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Brand Colors
  const brandDark: [number, number, number] = [0, 45, 78];
  const brandSecondary: [number, number, number] = [242, 169, 0]; // KEEP YELLOW
  const textGray: [number, number, number] = [60, 60, 60];
  const lightGray: [number, number, number] = [200, 200, 200];
  const ultraLight: [number, number, number] = [248, 250, 252];

  // Modern Title Renderer (yellow underline preserved)
  const drawTitle = (text: string, yPos: number, xPos: number = margin) => {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
    doc.text(text, xPos, yPos);

    // KEEP your yellow underline
    doc.setDrawColor(brandSecondary[0], brandSecondary[1], brandSecondary[2]);
    doc.setLineWidth(2);
    doc.line(xPos, yPos + 7, xPos + 40, yPos + 7);

    return yPos + 30;
  };

  // Minimal modern header
  const addHeader = () => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      margin,
      margin
    );

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
    doc.text('Mortgage Strategy Report', margin, margin + 22);

    y = margin + 55;
  };

  // Modern footer (clean, no border)
  const addFooter = () => {
    const pageCount = (doc as any).internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      const footerY = pageHeight - 32;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 140, 140);

      doc.text(
        'Emerson Pinto | (609) 286-7269 | emerson.pinto@kw.com',
        margin,
        footerY
      );

      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY, {
        align: 'right',
      });

      if (i === 1) {
        doc.setFontSize(8);
        doc.text(
          `Estimates only. Assumes ${appreciationRate}% appreciation & 8% closing costs${includeCarryingCosts ? '; includes taxes, insurance, HOA & PMI' : ''}.`,
          margin,
          footerY + 12
        );
      }
    }
  };

  // Modern minimalist table defaults
  const tableBase = {
    theme: 'plain' as const,
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineWidth: 0,
      textColor: textGray,
    },
    headStyles: {
      fillColor: brandDark,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      halign: 'left' as const,
      lineWidth: 0,
    },
    alternateRowStyles: {
      fillColor: ultraLight,
    },
    bodyStyles: {
      lineWidth: 0,
    },
  };

  // START CONTENT
  addHeader();

  // TWO-COLUMN SECTION
  setStatus('Generating Loan Analysis...');

  const colWidth = (pageWidth - margin * 2 - 30) / 2;
  const leftX = margin;
  const rightX = margin + colWidth + 30;
  const startTwoColY = y;

  // LEFT: Loan Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text('Loan Details', leftX, startTwoColY);

  doc.setDrawColor(brandSecondary[0], brandSecondary[1], brandSecondary[2]);
  doc.setLineWidth(2);
  doc.line(leftX, startTwoColY + 4, leftX + 40, startTwoColY + 4);

  const loanAmount = params.homePrice - params.downPayment;
  const dpPercent = ((params.downPayment / params.homePrice) * 100).toFixed(1);

  const loanDetailsBody = [
    ['Home Price', formatCurrency(params.homePrice)],
    [
      'Down Payment',
      `${formatCurrency(params.downPayment)} (${dpPercent}%)`,
    ],
    ['Loan Amount', formatCurrency(loanAmount)],
    ['Rate / Term', `${params.interestRate}% / ${params.loanTerm} Years`],
    ['Property Taxes', `${formatCurrency(params.propertyTaxes)}/yr`],
    ['Insurance', `${formatCurrency(params.homeownersInsurance)}/yr`],
  ];

  autoTable(doc, {
    ...tableBase,
    margin: { left: leftX },
    tableWidth: colWidth,
    startY: startTwoColY + 18,
    body: loanDetailsBody,
    columnStyles: {
      0: { fontStyle: 'bold', textColor: textGray },
      1: { halign: 'right', textColor: brandDark },
    },
  });

  const leftY = (doc as any).lastAutoTable.finalY;

  // RIGHT: Monthly Breakdown
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...brandDark);
  doc.text('Monthly Breakdown', rightX, startTwoColY);

  doc.line(rightX, startTwoColY + 4, rightX + 40, startTwoColY + 4);

  const summary = results.monthly.summary;
  const firstMonth = results.monthly.schedule[0];
  const breakdownItems = [
    ['P&I', formatCurrency(firstMonth.principal + firstMonth.interest)],
    ['Taxes', formatCurrency(summary.taxes)],
    ['Ins/HOA', formatCurrency(summary.insurance + summary.hoa)],
    ['PMI', formatCurrency(summary.pmi)],
  ].filter(item => item[1] !== '$0.00');

  breakdownItems.push([
    'TOTAL',
    formatCurrency(summary.totalMonthlyPayment),
  ]);

  autoTable(doc, {
    ...tableBase,
    margin: { left: rightX },
    tableWidth: colWidth,
    startY: startTwoColY + 18,
    body: breakdownItems,
    columnStyles: {
      0: { fontStyle: 'bold', textColor: textGray },
      1: { halign: 'right', textColor: brandDark },
    },
  });

  const rightY = (doc as any).lastAutoTable.finalY;

  y = Math.max(leftY, rightY) + 40;

  // SCENARIO COMPARISON
  setStatus('Comparing Scenarios...');
  y = drawTitle('Payment Scenario Comparison', y);

  const sanitize = (v: any) =>
    v === null || v === undefined ? 'N/A' : v.toString();

  const monthlySummary = results.monthly.summary;
  const biWeeklySummary = results.biWeekly.summary;
  const biWeeklyExtraSummary = results.biWeeklyWithExtra.summary;

  const monthlyPayment = monthlySummary.totalMonthlyPayment;
  const biWeeklyPayment =
    biWeeklySummary.principalAndInterest / 2 +
    (monthlySummary.taxes +
      monthlySummary.insurance +
      monthlySummary.hoa +
      monthlySummary.pmi) *
      12 /
      26;

  const annualExtraPayment = annualExtraPaymentFor(params);
  const biWeeklyAcceleratedDisplay =
    annualExtraPayment <= 0
      ? formatCurrency(biWeeklyPayment)
      : params.extraPaymentFrequency === 'annually'
        ? `${formatCurrency(biWeeklyPayment)} + ${formatCurrency(annualExtraPayment)} / yr`
        : `${formatCurrency(biWeeklyPayment)} + ${formatCurrency(annualExtraPayment / 26)}`;
  const oneTimeMsg = (match: boolean) =>
    params.oneTimePayment && params.oneTimePayment > 0 && match
      ? ` + 1x ${formatCurrency(params.oneTimePayment)}`
      : '';

  const comparisonBody = [
    [
      'Payment',
      formatCurrency(monthlyPayment) +
        oneTimeMsg(
          params.oneTimePaymentMode === 'monthly' ||
            params.oneTimePaymentMode === 'all'
        ),
      formatCurrency(biWeeklyPayment) +
        oneTimeMsg(
          params.oneTimePaymentMode === 'biWeekly' ||
            params.oneTimePaymentMode === 'all'
        ),
      biWeeklyAcceleratedDisplay +
        oneTimeMsg(
          params.oneTimePaymentMode === 'biWeeklyWithExtra' ||
            params.oneTimePaymentMode === 'all'
        ),
    ],
    ['Payoff Date', monthlySummary.payoffDate, biWeeklySummary.payoffDate, biWeeklyExtraSummary.payoffDate],
    ['Time Saved', monthlySummary.timeSaved, biWeeklySummary.timeSaved, biWeeklyExtraSummary.timeSaved],
    ['Total Interest', formatCurrency(monthlySummary.totalInterest), formatCurrency(biWeeklySummary.totalInterest), formatCurrency(biWeeklyExtraSummary.totalInterest)],
    ['Interest Savings', monthlySummary.interestSaved > 0 ? formatCurrency(monthlySummary.interestSaved) : '(Baseline)', formatCurrency(biWeeklySummary.interestSaved), formatCurrency(biWeeklyExtraSummary.interestSaved)],
  ].map(x => x.map(sanitize));

  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [['Metric', 'Monthly', 'Bi-Weekly', 'Bi-Weekly v2.0']],
    body: comparisonBody,
    columnStyles: {
      0: { fontStyle: 'bold', textColor: textGray },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    willDrawCell: data => {
      // Modern savings highlight: bold + dark text
      if (
        data.section === 'body' &&
        data.row.index === 4 &&
        data.column.index > 0 &&
        data.cell.raw !== '(Baseline)'
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = brandDark;
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 40;

  // PROJECTED WEALTH SNAPSHOTS
  setStatus('Analyzing Wealth...');
  if (y > pageHeight - 280) {
    doc.addPage();
    y = margin + 30;
  }

  y = drawTitle('Projected Wealth Analysis (True Net Gain)', y);

  const timelines = [7, 13, 20];

  for (const year of timelines) {
    if (y > pageHeight - 220) {
      doc.addPage();
      y = margin + 30;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandDark);
    doc.text(`Timeline: ${year} Years`, margin, y);
    y += 14;

    const { monthly: mSnap, biWeekly: bSnap, biWeeklyExtra: eSnap } = getScenarioSnapshots(results, params, year, appreciationRate, includeCarryingCosts);

    const fmt = (n: number) => formatCurrency(Math.round(n));

    const snapshotBody = [
      ['Est. Home Value', fmt(mSnap.futureValue), fmt(bSnap.futureValue), fmt(eSnap.futureValue)],
      ['Remaining Balance', fmt(mSnap.remainingBalance), fmt(bSnap.remainingBalance), fmt(eSnap.remainingBalance)],
      ['Net Proceeds (Closing)', fmt(mSnap.netProceeds), fmt(bSnap.netProceeds), fmt(eSnap.netProceeds)],
      ['Principal Paid', fmt(mSnap.principalPaidToDate), fmt(bSnap.principalPaidToDate), fmt(eSnap.principalPaidToDate)],
      ['TRUE GAIN', fmt(mSnap.trueGain), fmt(bSnap.trueGain), fmt(eSnap.trueGain)],
      ['Total Interest Paid', fmt(mSnap.totalInterestToDate), fmt(bSnap.totalInterestToDate), fmt(eSnap.totalInterestToDate)],
      ...(includeCarryingCosts
        ? [['Taxes, Ins., HOA & PMI', fmt(mSnap.carryingCostsToDate), fmt(bSnap.carryingCostsToDate), fmt(eSnap.carryingCostsToDate)]]
        : []),
      ['TRUE NET GAIN', fmt(mSnap.trueNetGain), fmt(bSnap.trueNetGain), fmt(eSnap.trueNetGain)],
    ];

    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [['Metric', 'Monthly', 'Bi-Weekly', 'Bi-Weekly v2.0']],
      body: snapshotBody,
      columnStyles: {
        0: { fontStyle: 'bold', textColor: textGray, cellWidth: 140 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
      willDrawCell: data => {
        if (data.row.index === snapshotBody.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = brandDark;
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 30;
  }

  // ANNUAL SUMMARY PAGE
  const annualSummaryBody = results.monthly.annualSummary.map(row => [
    sanitize(row.year),
    formatCurrency(row.principalPaid),
    formatCurrency(row.totalPrincipalPaid),
    formatCurrency(row.interestPaid),
    formatCurrency(row.totalInterestPaid),
    formatCurrency(row.endingBalance),
  ]);

  if (annualSummaryBody.length > 0) {
    doc.addPage();
    y = margin + 30;

    y = drawTitle('Annual Amortization Summary (Monthly)', y);

    autoTable(doc, {
      ...tableBase,
      head: [['Year', 'Principal Paid', 'Total Principal', 'Interest Paid', 'Total Interest', 'Ending Balance']],
      body: annualSummaryBody,
      startY: y,
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });
  }

  addFooter();

  return doc.output('blob');
};


  const handlePreviewPdf = async () => {
      if (!results || !params) return;
      
      setIsGeneratingPdf(true);
      setShowPrintModal(true);
      setPdfUrl(null);

      try {
          const pdfBlob = await generatePdfDocument(results, params, setPdfGenerationStatus);
          const pdfObjectURL = URL.createObjectURL(pdfBlob);
          setPdfUrl(pdfObjectURL);
      } catch (error) {
          console.error("Error generating PDF for preview:", error);
          setPdfGenerationStatus('An error occurred.');
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  const handleDownloadPdf = async () => {
    if (!results || !params) return;

    setIsDownloadingPdf(true);
    try {
        const pdfBlob = await generatePdfDocument(results, params, () => {}); // No status updates for direct download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Mortgage-Scenario-Report.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error generating PDF for download:", error);
        // Optionally, show an error message to the user
    } finally {
        setIsDownloadingPdf(false);
    }
  };

  return (
    <>
    <PrintPreviewModal 
        show={showPrintModal} 
        onClose={() => {
            setShowPrintModal(false);
            if(pdfUrl) URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
        }}
        pdfUrl={pdfUrl}
        isGenerating={isGeneratingPdf}
        generationStatus={pdfGenerationStatus}
    />
    <div className="bg-brand-paper min-h-screen text-gray-800">
      <div className="bg-brand-dark text-white text-sm px-4 py-2 text-center border-b border-white/10">
        Presented by <span className="font-bold text-brand-secondary">Emerson Pinto</span>
      </div>
      <header className="bg-brand-dark shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <svg className="w-10 h-10 text-brand-secondary mr-3" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Mortgage Amortization Calculator</h1>
          </div>
           {results && (
                <div className="flex items-center space-x-2">
                    <button onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="p-2 rounded-full text-white bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Download PDF">
                        {isDownloadingPdf ? (
                            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        )}
                    </button>
                    <button onClick={handlePreviewPdf} className="p-2 rounded-full text-white bg-white/10 hover:bg-white/20 transition-colors" title="Print Preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    </button>
                </div>
            )}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div id="main-content">
          <CalculatorForm onCalculate={handleCalculate} isLoading={isLoading} />
          
          {results && params && (
            <div id="results-container" className="mt-8">
                <ResultHeadline params={params} results={results} appreciationRate={appreciationRate} includeCarryingCosts={includeCarryingCosts} />

                {/* Monthly Payment Breakdown */}
                <div className="mb-8">
                    <PaymentBreakdown results={results} />
                </div>

                {/* Grid for Loan Details and Comparison Table */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                         <LoanDetails params={params} />
                    </div>
                    <div className="lg:col-span-2">
                        <ComparisonTable results={results} params={params} />
                    </div>
                </div>

                <div className="mt-8">
                    <AmortizationSchedule results={results} params={params} appreciationRate={appreciationRate} setAppreciationRate={setAppreciationRate} />
                </div>
            </div>
          )}

          <div className="no-print">
            <GeminiInsights params={params} results={results} isLoading={isLoading} setIsLoading={setIsLoading} appreciationRate={appreciationRate} includeCarryingCosts={includeCarryingCosts} setIncludeCarryingCosts={setIncludeCarryingCosts} />
          </div>
        </div>
      </main>

    </div>
    </>
  );
}