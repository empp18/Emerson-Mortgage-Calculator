import type { MortgageParams, AmortizationEntry, MortgageSummary, CalculationResults, AnnualSummaryEntry } from '../types';

const PMI_LTV_CUTOFF = 0.8; // LTV ratio at which PMI is removed

// Adds whole months, clamping to the last day of the target month
// (Jan 31 + 1 month = Feb 28, not Mar 3).
function addMonths(base: Date, months: number): Date {
  const targetMonth = base.getMonth() + months;
  const lastDayOfTargetMonth = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDayOfTargetMonth));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function paymentDateFor(startDate: Date, period: number, isBiWeekly: boolean): Date {
  return isBiWeekly ? addDays(startDate, period * 14) : addMonths(startDate, period);
}

function calculatePAndI(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const numberOfPayments = years * 12;
  if (monthlyRate === 0) return principal / numberOfPayments;

  const growth = Math.pow(1 + monthlyRate, numberOfPayments);
  return principal * (monthlyRate * growth) / (growth - 1);
}

// Balance at the end of a loan year, or null once the loan is gone so a chart line stops at payoff
export function yearEndBalance(schedule: AmortizationEntry[], periodsPerYear: number, year: number, principal: number): number | null {
  if (year === 0) return principal;
  const lastMonth = schedule.length ? schedule[schedule.length - 1].month : 0;
  const payoffYear = Math.ceil(lastMonth / periodsPerYear);
  if (year > payoffYear) return null;
  const row = schedule.find(e => e.month >= year * periodsPerYear);
  return row ? Math.round(row.remainingBalance) : 0;
}

// Annual extra-payment total implied by the form's amount and frequency
export function annualExtraPaymentFor(params: Pick<MortgageParams, 'extraPayment' | 'extraPaymentFrequency'>): number {
  switch (params.extraPaymentFrequency) {
    case 'weekly': return params.extraPayment * 52;
    case 'bi-weekly': return params.extraPayment * 26;
    case 'monthly': return params.extraPayment * 12;
    case 'annually': return params.extraPayment;
    default: return 0;
  }
}

interface ScheduleOptions {
  principal: number;
  annualRate: number;        // percent
  loanTermYears: number;
  isBiWeekly: boolean;
  extraPerPeriod: number;    // extra principal on every payment
  annualLumpSum: number;     // extra principal once per contract year, on the last payment of that year
  homePrice: number;
  monthlyPmi: number;
  oneTimePayment: number;
  oneTimePaymentDate: string; // YYYY-MM
  startDate: Date;
}

function generateAmortizationSchedule(opts: ScheduleOptions): { schedule: AmortizationEntry[], summary: Partial<MortgageSummary> } {
  const { principal, annualRate, loanTermYears, isBiWeekly, extraPerPeriod, annualLumpSum, homePrice, monthlyPmi, oneTimePayment, oneTimePaymentDate, startDate } = opts;

  if (principal <= 0 || loanTermYears <= 0) {
    return {
      schedule: [],
      summary: {
        principalAndInterest: 0,
        totalPrincipal: 0,
        totalInterest: 0,
        totalCost: 0,
        payoffDate: 'N/A',
        payoffTermYears: 0,
        payoffTermMonths: 0,
      },
    };
  }

  const pAndI = calculatePAndI(principal, annualRate, loanTermYears);
  const paymentPerPeriod = isBiWeekly ? pAndI / 2 : pAndI;
  const ratePerPeriod = isBiWeekly ? annualRate / 100 / 26 : annualRate / 100 / 12;
  const periodsPerYear = isBiWeekly ? 26 : 12;

  let balance = principal;
  const schedule: AmortizationEntry[] = [];
  let totalInterest = 0;
  let totalPmiPaid = 0;
  let period = 0;

  // PMI only exists when the loan starts above the LTV cutoff, and only with a known home price
  const pmiApplies = homePrice > 0 && monthlyPmi > 0 && principal / homePrice > PMI_LTV_CUTOFF;
  const oneTimePaymentMonthIndex = oneTimePaymentDate
    ? (() => { const [y, m] = oneTimePaymentDate.split('-').map(Number); return y * 12 + (m - 1); })()
    : NaN;
  let oneTimePaymentApplied = false;

  while (balance > 0) {
    period++;
    const beginningBalance = balance;
    const currentDate = paymentDateFor(startDate, period, isBiWeekly);
    const interest = balance * ratePerPeriod;

    let pmiPayment = 0;
    if (pmiApplies && balance / homePrice > PMI_LTV_CUTOFF) {
      pmiPayment = isBiWeekly ? (monthlyPmi * 12) / 26 : monthlyPmi;
      totalPmiPaid += pmiPayment;
    }

    let principalPayment = paymentPerPeriod - interest;

    let currentExtraPayment = extraPerPeriod;
    if (annualLumpSum > 0 && period % periodsPerYear === 0) {
      currentExtraPayment += annualLumpSum;
    }

    // One-time payment goes on the first scheduled payment dated in or after the chosen month.
    // Same rule for every plan, so monthly and bi-weekly always receive it in the same calendar month.
    // A month before the first payment lands on the first payment; a month past payoff is never applied.
    if (oneTimePayment > 0 && !oneTimePaymentApplied && !Number.isNaN(oneTimePaymentMonthIndex)) {
      const paymentMonthIndex = currentDate.getFullYear() * 12 + currentDate.getMonth();
      if (paymentMonthIndex >= oneTimePaymentMonthIndex) {
        currentExtraPayment += oneTimePayment;
        oneTimePaymentApplied = true;
      }
    }

    // Cap payments at the remaining balance
    let appliedExtraPayment = currentExtraPayment;
    if (principalPayment > balance) {
      principalPayment = balance;
      appliedExtraPayment = 0;
    } else if (principalPayment + appliedExtraPayment > balance) {
      appliedExtraPayment = balance - principalPayment;
    }

    balance -= principalPayment + appliedExtraPayment;
    if (balance < 0.01) balance = 0; // floating-point drift near zero

    schedule.push({
      month: period,
      paymentDate: currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      beginningBalance,
      interest,
      principal: principalPayment,
      extraPayment: appliedExtraPayment,
      totalPayment: principalPayment + appliedExtraPayment + interest + pmiPayment,
      remainingBalance: balance,
    });
    totalInterest += interest;

    if (period > loanTermYears * periodsPerYear * 2) { // safety break
      console.error('Calculation exceeded expected term * 2, breaking loop.');
      break;
    }
  }

  const periods = schedule.length;
  const payoffDate = paymentDateFor(startDate, periods, isBiWeekly);
  const payoffTermMonths = Math.ceil(periods / (periodsPerYear / 12));

  const summary: Partial<MortgageSummary> = {
    principalAndInterest: pAndI,
    totalPrincipal: principal,
    totalInterest,
    totalCost: principal + totalInterest + totalPmiPaid,
    payoffDate: payoffDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    payoffTermYears: payoffTermMonths / 12,
    payoffTermMonths,
  };

  return { schedule, summary };
}

function generateAnnualSummary(schedule: AmortizationEntry[], periodsPerYear: number): AnnualSummaryEntry[] {
  if (!schedule || schedule.length === 0) return [];

  const byYear = new Map<number, { principalPaid: number; interestPaid: number; endingBalance: number }>();
  for (const entry of schedule) {
    const year = Math.ceil(entry.month / periodsPerYear);
    if (!byYear.has(year)) byYear.set(year, { principalPaid: 0, interestPaid: 0, endingBalance: 0 });
    const yearData = byYear.get(year)!;
    yearData.principalPaid += entry.principal + entry.extraPayment;
    yearData.interestPaid += entry.interest;
    yearData.endingBalance = entry.remainingBalance;
  }

  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => {
      cumulativePrincipal += data.principalPaid;
      cumulativeInterest += data.interestPaid;
      return { year, ...data, totalPrincipalPaid: cumulativePrincipal, totalInterestPaid: cumulativeInterest };
    });
}

function formatTimeSaved(totalMonthsSaved: number): string {
  if (totalMonthsSaved <= 0) return '0 Months';
  const years = Math.floor(totalMonthsSaved / 12);
  const months = Math.round(totalMonthsSaved % 12);
  let result = '';
  if (years > 0) result += `${years} Year${years > 1 ? 's' : ''}`;
  if (months > 0) result += ` ${months} Month${months > 1 ? 's' : ''}`;
  return result.trim();
}

// startDate is the closing date; the first monthly payment falls one month later. Defaults to today.
export function calculateAllScenarios(params: MortgageParams, startDate: Date = new Date()): CalculationResults {
  const { homePrice, downPayment, loanTerm, interestRate, propertyTaxes, homeownersInsurance, hoaDues, pmi, oneTimePayment, oneTimePaymentDate, oneTimePaymentMode } = params;
  const principal = homePrice - downPayment;

  const monthlyTaxes = propertyTaxes / 12;
  const monthlyInsurance = homeownersInsurance / 12;
  const initialPmi = homePrice > 0 && principal / homePrice > PMI_LTV_CUTOFF ? pmi : 0;
  const monthlyEscrow = monthlyTaxes + monthlyInsurance + hoaDues + initialPmi;

  const applyToMonthly = oneTimePaymentMode === 'monthly' || oneTimePaymentMode === 'all';
  const applyToBiWeekly = oneTimePaymentMode === 'biWeekly' || oneTimePaymentMode === 'all';
  const applyToBiWeeklyExtra = oneTimePaymentMode === 'biWeeklyWithExtra' || oneTimePaymentMode === 'all';

  const base = { principal, annualRate: interestRate, loanTermYears: loanTerm, homePrice, monthlyPmi: pmi, startDate };
  const oneTime = (apply: boolean) => ({
    oneTimePayment: apply ? oneTimePayment : 0,
    oneTimePaymentDate: apply ? oneTimePaymentDate : '',
  });

  // Savings are measured against the standard monthly plan with no extra payments of any kind,
  // so each plan's savings include its own levers (extra payments and/or its one-time payment).
  const baseline = generateAmortizationSchedule({
    ...base, isBiWeekly: false, extraPerPeriod: 0, annualLumpSum: 0, ...oneTime(false),
  }).summary;
  const baselineInterest = baseline.totalInterest ?? 0;
  const baselineMonths = baseline.payoffTermMonths ?? 0;

  // Scenario 1: Monthly
  const monthlyResult = generateAmortizationSchedule({
    ...base, isBiWeekly: false, extraPerPeriod: 0, annualLumpSum: 0, ...oneTime(applyToMonthly),
  });
  const monthlyAnnualSummary = generateAnnualSummary(monthlyResult.schedule, 12);
  const monthlyMonthsSaved = baselineMonths - (monthlyResult.summary.payoffTermMonths ?? 0);
  const monthlySummary: MortgageSummary = {
    ...monthlyResult.summary,
    taxes: monthlyTaxes,
    insurance: monthlyInsurance,
    pmi: initialPmi,
    hoa: hoaDues,
    totalMonthlyPayment: monthlyResult.summary.principalAndInterest! + monthlyEscrow,
    interestSaved: baselineInterest - (monthlyResult.summary.totalInterest ?? 0),
    timeSaved: monthlyMonthsSaved > 0 ? formatTimeSaved(monthlyMonthsSaved) : '(Baseline)',
  } as MortgageSummary;

  // Scenario 2: Bi-Weekly (half of P&I every 14 days, 26 payments a year = 13 monthly payments)
  const biWeeklyResult = generateAmortizationSchedule({
    ...base, isBiWeekly: true, extraPerPeriod: 0, annualLumpSum: 0, ...oneTime(applyToBiWeekly),
  });
  const biWeeklyAnnualSummary = generateAnnualSummary(biWeeklyResult.schedule, 26);
  const biWeeklyPAndI = biWeeklyResult.summary.principalAndInterest!;
  const biWeeklySummary: MortgageSummary = {
    ...biWeeklyResult.summary,
    taxes: monthlyTaxes,
    insurance: monthlyInsurance,
    pmi: initialPmi,
    hoa: hoaDues,
    totalMonthlyPayment: (biWeeklyPAndI * 13) / 12 + monthlyEscrow,
    interestSaved: baselineInterest - (biWeeklyResult.summary.totalInterest ?? 0),
    timeSaved: formatTimeSaved(baselineMonths - (biWeeklyResult.summary.payoffTermMonths ?? 0)),
  } as MortgageSummary;

  // Scenario 3: Bi-Weekly with extra payments AND optional one-time payment.
  // Weekly, bi-weekly and monthly extras are spread across the 26 bi-weekly periods.
  // Annual extras are a single lump sum on each year's last payment.
  const annualExtra = annualExtraPaymentFor(params);
  const isAnnualLumpSum = params.extraPaymentFrequency === 'annually';
  const biWeeklyExtraResult = generateAmortizationSchedule({
    ...base,
    isBiWeekly: true,
    extraPerPeriod: isAnnualLumpSum ? 0 : annualExtra / 26,
    annualLumpSum: isAnnualLumpSum ? annualExtra : 0,
    ...oneTime(applyToBiWeeklyExtra),
  });
  const biWeeklyExtraAnnualSummary = generateAnnualSummary(biWeeklyExtraResult.schedule, 26);
  const biWeeklyWithExtraSummary: MortgageSummary = {
    ...biWeeklyExtraResult.summary,
    taxes: monthlyTaxes,
    insurance: monthlyInsurance,
    pmi: initialPmi,
    hoa: hoaDues,
    totalMonthlyPayment: (biWeeklyPAndI * 13) / 12 + annualExtra / 12 + monthlyEscrow,
    interestSaved: baselineInterest - (biWeeklyExtraResult.summary.totalInterest ?? 0),
    timeSaved: formatTimeSaved(baselineMonths - (biWeeklyExtraResult.summary.payoffTermMonths ?? 0)),
  } as MortgageSummary;

  return {
    monthly: { schedule: monthlyResult.schedule, summary: monthlySummary, annualSummary: monthlyAnnualSummary },
    biWeekly: { schedule: biWeeklyResult.schedule, summary: biWeeklySummary, annualSummary: biWeeklyAnnualSummary },
    biWeeklyWithExtra: { schedule: biWeeklyExtraResult.schedule, summary: biWeeklyWithExtraSummary, annualSummary: biWeeklyExtraAnnualSummary },
  };
}
