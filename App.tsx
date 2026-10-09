import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, Legend, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculatorForm } from './components/CalculatorForm';
import { GeminiInsights } from './components/GeminiInsights';
import { FinancialBreakdown } from './components/FinancialBreakdown';
import { WalkAwayCard, PlanCards, BalanceChartCard } from './components/ResultsOverview';
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
    
    const COLORS = ['#005A9C', '#A67700', '#1E7B4F', '#7AA7C7', '#B8C4D6'];
    const totalPaymentForPercentage = summary.totalMonthlyPayment > 0 ? summary.totalMonthlyPayment : 1;

    return (
        <div>
            <h3 className="font-serif text-[21px] font-semibold text-brand-ink">Monthly payment breakdown</h3>
            <p className="mb-4 mt-1 text-[13px] text-brand-muted">What the first month&apos;s payment covers</p>
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
                <div>
                    <p className="font-serif text-[34px] font-semibold leading-none text-brand-ink tabular-nums">{formatCurrency(summary.totalMonthlyPayment)}</p>
                    <ul className="mt-4 divide-y divide-brand-line">
                        {paymentData.map((entry, index) => {
                            const percentage = (entry.value / totalPaymentForPercentage) * 100;
                            return (
                                <li key={entry.name} className="flex items-center justify-between py-2.5 text-[15px]">
                                    <span className="flex items-center gap-3 text-brand-ink">
                                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        {entry.name}
                                    </span>
                                    <span className="tabular-nums">
                                        <span className="mr-2 text-[13px] text-brand-muted">{`${percentage.toFixed(1)}%`}</span>
                                        <span className="font-bold text-brand-ink">{formatCurrency(entry.value)}</span>
                                    </span>
                                </li>
                            );
                        })}
                        <li className="flex items-center justify-between py-2.5 text-[15px] font-semibold">
                            <span className="text-brand-ink">Total monthly</span>
                            <span className="tabular-nums text-brand-ink">{formatCurrency(summary.totalMonthlyPayment)}</span>
                        </li>
                    </ul>
                </div>
                <div className="h-52 w-full">
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
                            <Tooltip
                                contentStyle={{ borderRadius: 12, borderColor: '#E3E6EC', boxShadow: 'none', fontSize: 13 }}
                                formatter={(value: number) => {
                                    const percentage = (value / totalPaymentForPercentage) * 100;
                                    return `${formatCurrency(value)} (${percentage.toFixed(1)}%)`;
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const AmortizationSchedule: React.FC<{ results: CalculationResults, params: MortgageParams, appreciationRate: number }> = ({ results, params, appreciationRate }) => {
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
                <div className="rounded-[12px] border border-brand-line bg-white p-3 text-left">
                    <p className="mb-2 font-semibold text-brand-ink">{`Year: ${label}`}</p>
                    <ul className="list-none p-0 m-0">
                        {payload.map((pld: any) => (
                            <li key={pld.dataKey} style={{ color: pld.stroke || pld.fill }} className="flex items-center justify-between space-x-4 text-[13px]">
                               <span>{pld.name}:</span>
                               <span className="font-bold tabular-nums">{formatCurrency(pld.value)}</span>
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
            <div>
                 <button onClick={() => setShowSchedule(true)} className="rounded-[12px] bg-brand-primary px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-dark">
                     Show interactive charts & schedule
                 </button>
            </div>
        )
    }

    const tabClass = (active: boolean) =>
        `whitespace-nowrap border-b-2 pb-2 text-[14px] font-semibold transition-colors ${active ? 'border-brand-primary text-brand-primary' : 'border-transparent text-brand-muted hover:text-brand-ink'}`;

    return (
        <div id="amortization-section">
            <div className="mb-5 flex items-center justify-between gap-4">
                <h3 className="font-serif text-[21px] font-semibold text-brand-ink">Analysis and schedule</h3>
                <button onClick={() => setShowSchedule(false)} className="text-[13px] text-brand-muted hover:text-brand-primary">&times; Hide section</button>
            </div>

            {/* Chart Tabs */}
            <div className="mb-5 flex gap-5 border-b border-brand-line">
                <button onClick={() => setChartTab('balance')} className={tabClass(chartTab === 'balance')}>
                    Loan balance comparison
                </button>
                <button onClick={() => setChartTab('equity')} className={tabClass(chartTab === 'equity')}>
                    Equity vs. interest
                </button>
            </div>

            {/* Chart Area */}
            <div className="relative mb-8 h-[350px] w-full md:h-[400px]">
                {chartTab === 'balance' ? (
                    <>
                        <h4 className="mb-3 text-center text-[15px] font-semibold text-brand-ink">Loan balance over time</h4>
                        <ResponsiveContainer>
                            <LineChart data={yearlyBalanceData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E3E6EC" />
                                <XAxis 
                                    dataKey="year" 
                                    label={{ value: '(years)', position: 'insideBottomRight', offset: -10, fill: '#5B6577', fontSize: 12 }}
                                    tick={{ fill: '#5B6577', fontSize: 12 }}
                                    minTickGap={20}
                                />
                                <YAxis 
                                    tickFormatter={(tick) => formatCurrency(tick)} 
                                    tick={{ fill: '#5B6577', fontSize: 12 }}
                                    width={80}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: 13 }}/>
                                <Line type="monotone" dataKey="Monthly" stroke="#005A9C" dot={false} strokeWidth={2.5} />
                                <Line type="monotone" dataKey="Bi-Weekly" stroke="#1E7B4F" dot={false} strokeWidth={2.5} />
                                <Line type="monotone" dataKey="Bi-Weekly v2.0" stroke="#A67700" dot={false} strokeWidth={2.5} />
                            </LineChart>
                        </ResponsiveContainer>
                    </>
                ) : (
                    <>
                        <div className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center justify-center gap-2">
                            <select 
                                value={equityScenario} 
                                onChange={(e) => setEquityScenario(e.target.value as any)}
                                className="rounded-[10px] border border-brand-line bg-white px-2.5 py-1.5 text-[13px] text-brand-ink focus:border-brand-primary focus:outline-none"
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
                                        <stop offset="5%" stopColor="#1E7B4F" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#1E7B4F" stopOpacity={0.05}/>
                                    </linearGradient>
                                    <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#A67700" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#A67700" stopOpacity={0.05}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E3E6EC" />
                                <XAxis dataKey="year" label={{ value: '(years)', position: 'insideBottomRight', offset: -10, fill: '#5B6577', fontSize: 12 }} tick={{ fill: '#5B6577', fontSize: 12 }} />
                                <YAxis tickFormatter={(tick) => formatCurrency(tick)} tick={{ fill: '#5B6577', fontSize: 12 }} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: 13 }}/>
                                <Line type="monotone" dataKey="homeValue" name="Home Value" stroke="#5B6577" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                <Area type="monotone" dataKey="equity" name="Equity Gained" stroke="#1E7B4F" fillOpacity={1} fill="url(#colorEquity)" />
                                <Area type="monotone" dataKey="interestPaid" name="Interest Paid" stroke="#A67700" fillOpacity={1} fill="url(#colorInterest)" />
                                <Line type="monotone" dataKey="balance" name="Remaining Balance" stroke="#14213D" strokeWidth={2.5} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </>
                )}
            </div>

            {/* Schedule Table */}
            <div>
                <nav className="flex gap-6 overflow-x-auto border-b border-brand-line" aria-label="Schedule scenarios">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(activeTab === tab.id)}>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="mt-4 max-h-[600px] overflow-auto rounded-[12px] border border-brand-line">
                    <table className="min-w-full">
                        <thead className="sticky top-0 z-20 bg-brand-paper">
                            <tr>
                                {['Period', 'Date', 'Balance', 'Principal', 'Interest', 'Extra', 'Total payment', 'Ending balance'].map(header => (
                                     <th key={header} scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                                         {header}
                                     </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-line bg-white">
                            {activeData.schedule.map((entry) => (
                                <tr key={entry.month} className="text-[13px] tabular-nums">
                                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-brand-ink">{entry.month}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-brand-muted">{entry.paymentDate}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-brand-muted">{formatCurrency(entry.beginningBalance)}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-brand-muted">{formatCurrency(entry.principal)}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-brand-muted">{formatCurrency(entry.interest)}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 text-[#1E7B4F]">{formatCurrency(entry.extraPayment)}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-brand-ink">{formatCurrency(entry.totalPayment)}</td>
                                    <td className="whitespace-nowrap px-4 py-2.5 font-bold text-brand-ink">{formatCurrency(entry.remainingBalance)}</td>
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

    const DetailRow: React.FC<{ label: string; value: string; tooltip?: string; placement?: 'top' | 'bottom' }> = ({ label, value, tooltip, placement }) => (
        <li className="flex items-center justify-between py-2.5 text-[15px]">
            <div className="flex items-center">
                <span className="text-brand-muted">{label}</span>
                {tooltip && <InfoTooltip text={tooltip} alignment="left" placement={placement} />}
            </div>
            <span className="font-semibold tabular-nums text-brand-ink">{value}</span>
        </li>
    );

    return (
        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
            <div>
                <h3 className="font-serif text-[21px] font-semibold text-brand-ink">Loan details</h3>
                <ul className="mt-3 divide-y divide-brand-line">
                    {coreDetails.map(detail => <DetailRow key={detail.label} {...detail} />)}
                </ul>
            </div>
            <div>
                <h3 className="font-serif text-[21px] font-semibold text-brand-ink">Ownership costs</h3>
                <ul className="mt-3 divide-y divide-brand-line">
                    {escrowDetails.map(detail => <DetailRow key={detail.label} {...detail} />)}
                </ul>
            </div>
        </div>
    );
};

export default function App() {
  const [params, setParams] = useState<MortgageParams | null>(null);
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [appreciationRate, setAppreciationRate] = useState(3.5);
  const [closingCostRate, setClosingCostRate] = useState(6);
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
          `Estimates only. Assumes ${appreciationRate}% appreciation & ${closingCostRate}% closing costs${includeCarryingCosts ? '; includes taxes, insurance, HOA & PMI' : ''}.`,
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

    const { monthly: mSnap, biWeekly: bSnap, biWeeklyExtra: eSnap } = getScenarioSnapshots(results, params, year, appreciationRate, includeCarryingCosts, closingCostRate);

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
    <div className="bg-brand-paper min-h-screen text-brand-ink">
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-8">
          <span className="rounded-full border border-brand-line bg-brand-paper px-3 py-1 text-[12.5px] font-semibold text-brand-dark">
            Presented by Emerson Pinto
          </span>
          <span className="font-serif text-[17px] font-semibold text-brand-ink">Mortgage Calculator</span>
          <div className="flex gap-2">
            <button type="button" onClick={handlePreviewPdf} disabled={!results} className="rounded-full border border-brand-line bg-white px-3.5 py-[7px] text-[13px] font-semibold text-brand-ink hover:bg-brand-paper disabled:cursor-not-allowed disabled:opacity-40">
              Print
            </button>
            <button type="button" onClick={handleDownloadPdf} disabled={!results || isDownloadingPdf} className="rounded-full border border-brand-line bg-white px-3.5 py-[7px] text-[13px] font-semibold text-brand-ink hover:bg-brand-paper disabled:cursor-not-allowed disabled:opacity-40">
              {isDownloadingPdf ? 'Saving…' : 'Save PDF'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-8 md:px-8">
        <div id="main-content" className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-9">
          <aside className="mb-8 lg:mb-0 lg:sticky lg:top-6">
            <CalculatorForm onCalculate={handleCalculate} appreciationRate={appreciationRate} onAppreciationRateChange={setAppreciationRate} closingCostRate={closingCostRate} onClosingCostRateChange={setClosingCostRate} />
          </aside>

          <div className="min-w-0 space-y-6">
            {results && params && (
              <div id="results-container" className="space-y-6">
                <ResultHeadline params={params} results={results} appreciationRate={appreciationRate} closingCostRate={closingCostRate} includeCarryingCosts={includeCarryingCosts} />
                <WalkAwayCard params={params} results={results} appreciationRate={appreciationRate} closingCostRate={closingCostRate} includeCarryingCosts={includeCarryingCosts} onIncludeCarryingCostsChange={setIncludeCarryingCosts} />
                <PlanCards params={params} results={results} appreciationRate={appreciationRate} closingCostRate={closingCostRate} includeCarryingCosts={includeCarryingCosts} />
                <BalanceChartCard params={params} results={results} />

                <details className="group min-w-0 overflow-hidden rounded-2xl border border-brand-line bg-white p-6 md:p-8">
                  <summary className="cursor-pointer font-serif text-xl font-semibold text-brand-dark">Show the math</summary>
                  <div className="mt-6">
                    <FinancialBreakdown params={params} results={results} appreciationRate={appreciationRate} closingCostRate={closingCostRate} includeCarryingCosts={includeCarryingCosts} />
                  </div>
                </details>

                <details className="group min-w-0 overflow-hidden rounded-2xl border border-brand-line bg-white p-6 md:p-8">
                  <summary className="cursor-pointer font-serif text-xl font-semibold text-brand-dark">Payment details and schedule</summary>
                  <div className="mt-6 space-y-8">
                    <PaymentBreakdown results={results} />
                    <div className="border-t border-brand-line pt-8">
                      <LoanDetails params={params} />
                    </div>
                    <div className="border-t border-brand-line pt-8">
                      <AmortizationSchedule results={results} params={params} appreciationRate={appreciationRate} />
                    </div>
                  </div>
                </details>
              </div>
            )}

            <div className="no-print">
              <GeminiInsights params={params} results={results} isLoading={isLoading} setIsLoading={setIsLoading} appreciationRate={appreciationRate} closingCostRate={closingCostRate} includeCarryingCosts={includeCarryingCosts} />
            </div>
          </div>
        </div>
      </main>

    </div>
    </>
  );
}