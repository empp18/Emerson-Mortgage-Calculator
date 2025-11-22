import type { MortgageParams, AmortizationEntry, MortgageSummary, CalculationResults, AnnualSummaryEntry } from '../types';

const PMI_LTV_CUTOFF = 0.8; // LTV ratio at which PMI is removed

function calculatePAndI(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const numberOfPayments = years * 12;
  if (monthlyRate === 0) return principal / numberOfPayments;
  
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
  return payment;
}

function generateAmortizationSchedule(
    principal: number,
    annualRate: number,
    loanTermYears: number,
    isBiWeekly: boolean,
    extraPaymentPerPeriod: number,
    homePrice: number,
    monthlyPmiAmount: number,
    oneTimePayment: number = 0,
    oneTimePaymentDate: string = ''
): { schedule: AmortizationEntry[], summary: Partial<MortgageSummary> } {
  if (principal <= 0) {
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
        }
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
  const ltv = principal / homePrice;
  // Initial check: does the loan require PMI based on starting params?
  const initialNeedsPmi = ltv > PMI_LTV_CUTOFF;
  let oneTimePaymentApplied = false;
  
  while (balance > 0) {
    period++;
    const beginningBalance = balance;
    
    // Calculate Date for this period
    const currentDate = new Date();
    if(isBiWeekly) {
        currentDate.setDate(currentDate.getDate() + (period * 14));
    } else {
        currentDate.setMonth(currentDate.getMonth() + period);
    }
    
    const interest = balance * ratePerPeriod;

    let pmiPayment = 0;
    // Check if PMI is still required based on current LTV
    // We use the user-provided monthlyPmiAmount as the base
    if (initialNeedsPmi && monthlyPmiAmount > 0 && (balance / homePrice) > PMI_LTV_CUTOFF) {
        // Convert monthly PMI to period PMI if bi-weekly
        pmiPayment = isBiWeekly ? (monthlyPmiAmount * 12) / 26 : monthlyPmiAmount;
        totalPmiPaid += pmiPayment;
    }
    
    let principalPayment = paymentPerPeriod - interest;
    
    // Logic for regular extra payment
    let currentExtraPayment = extraPaymentPerPeriod;

    // Logic for One-Time Payment
    if (oneTimePayment > 0 && oneTimePaymentDate && !oneTimePaymentApplied) {
        const [targetYear, targetMonth] = oneTimePaymentDate.split('-').map(Number);
        // Note: getMonth() is 0-indexed, oneTimePaymentDate format YYYY-MM is 1-indexed
        if (currentDate.getFullYear() === targetYear && (currentDate.getMonth() + 1) === targetMonth) {
            currentExtraPayment += oneTimePayment;
            oneTimePaymentApplied = true;
        }
    }

    // Clean logic to cap payments at remaining balance
    let appliedExtraPayment = currentExtraPayment;
    
    if (principalPayment > balance) {
        principalPayment = balance;
        appliedExtraPayment = 0;
    } else if (principalPayment + appliedExtraPayment > balance) {
        appliedExtraPayment = balance - principalPayment;
    }

    const totalPrincipalPaid = principalPayment + appliedExtraPayment;
    
    balance -= totalPrincipalPaid;

    // Handle floating point drift near zero
    if (balance < 0.01) balance = 0;

    const entry: AmortizationEntry = {
        month: period,
        paymentDate: currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        beginningBalance,
        interest,
        principal: principalPayment,
        extraPayment: appliedExtraPayment,
        totalPayment: principalPayment + appliedExtraPayment + interest + pmiPayment,
        remainingBalance: balance,
    };
    
    totalInterest += interest;
    schedule.push(entry);

    if (period > loanTermYears * periodsPerYear * 2) { // Safety break
        console.error("Calculation exceeded expected term * 2, breaking loop.");
        break;
    }
  }

  const payoffDate = new Date();
  const periods = schedule.length;
  if (isBiWeekly) {
    payoffDate.setDate(payoffDate.getDate() + periods * 14);
  } else {
    payoffDate.setMonth(payoffDate.getMonth() + periods);
  }
  const payoffTermMonths = Math.ceil(periods / (periodsPerYear / 12));

  const summary: Partial<MortgageSummary> = {
    principalAndInterest: pAndI,
    totalPrincipal: principal,
    totalInterest: totalInterest,
    totalCost: principal + totalInterest + totalPmiPaid,
    payoffDate: payoffDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    payoffTermYears: payoffTermMonths / 12,
    payoffTermMonths,
  };
  
  return { schedule, summary };
}

function generateAnnualSummary(schedule: AmortizationEntry[], periodsPerYear: number): AnnualSummaryEntry[] {
  if (!schedule || schedule.length === 0) return [];

  const summaryMap: Map<number, { principalPaid: number; interestPaid: number; endingBalance: number }> = new Map();

  for (const entry of schedule) {
    const year = Math.ceil(entry.month / periodsPerYear);
    
    if (!summaryMap.has(year)) {
      summaryMap.set(year, { principalPaid: 0, interestPaid: 0, endingBalance: 0 });
    }

    const yearData = summaryMap.get(year)!;
    yearData.principalPaid += entry.principal + entry.extraPayment;
    yearData.interestPaid += entry.interest;
    yearData.endingBalance = entry.remainingBalance;
  }
  
  const yearlyEntries: { year: number; principalPaid: number; interestPaid: number; endingBalance: number }[] = [];
  summaryMap.forEach((data, year) => {
    yearlyEntries.push({ year, ...data });
  });

  yearlyEntries.sort((a, b) => a.year - b.year);

  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;
  
  const finalSummary: AnnualSummaryEntry[] = yearlyEntries.map(entry => {
    cumulativePrincipal += entry.principalPaid;
    cumulativeInterest += entry.interestPaid;
    return {
      ...entry,
      totalPrincipalPaid: cumulativePrincipal,
      totalInterestPaid: cumulativeInterest,
    };
  });

  return finalSummary;
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

export function calculateAllScenarios(params: MortgageParams): CalculationResults {
    const { homePrice, downPayment, loanTerm, interestRate, propertyTaxes, homeownersInsurance, hoaDues, pmi, extraPayment, extraPaymentFrequency, oneTimePayment, oneTimePaymentDate, oneTimePaymentMode } = params;
    const principal = homePrice - downPayment;
    
    // Common payment components
    const monthlyTaxes = propertyTaxes / 12;
    const monthlyInsurance = homeownersInsurance / 12;
    // const needsPmi = (principal / homePrice) > PMI_LTV_CUTOFF;
    // For display purposes in summary, we use the user provided PMI amount (if active at start)
    const initialPmi = (principal / homePrice) > PMI_LTV_CUTOFF ? pmi : 0;

    // Resolve One-Time Payment application
    const applyToMonthly = oneTimePaymentMode === 'monthly' || oneTimePaymentMode === 'all';
    const applyToBiWeekly = oneTimePaymentMode === 'biWeekly' || oneTimePaymentMode === 'all';
    const applyToBiWeeklyExtra = oneTimePaymentMode === 'biWeeklyWithExtra' || oneTimePaymentMode === 'all';

    // Scenario 1: Monthly
    const monthlyResult = generateAmortizationSchedule(
        principal, interestRate, loanTerm, false, 0, homePrice, 
        pmi, // Pass the monthly PMI amount
        applyToMonthly ? oneTimePayment : 0, 
        applyToMonthly ? oneTimePaymentDate : ''
    );
    const monthlyAnnualSummary = generateAnnualSummary(monthlyResult.schedule, 12);
    const monthlySummary: MortgageSummary = {
        ...monthlyResult.summary,
        taxes: monthlyTaxes,
        insurance: monthlyInsurance,
        pmi: initialPmi,
        hoa: hoaDues,
        totalMonthlyPayment: monthlyResult.summary.principalAndInterest! + monthlyTaxes + monthlyInsurance + initialPmi + hoaDues,
        interestSaved: 0,
        timeSaved: '(Baseline)',
    } as MortgageSummary;

    // Scenario 2: Bi-Weekly
    const biWeeklyResult = generateAmortizationSchedule(
        principal, interestRate, loanTerm, true, 0, homePrice,
        pmi, // Pass the monthly PMI amount
        applyToBiWeekly ? oneTimePayment : 0, 
        applyToBiWeekly ? oneTimePaymentDate : ''
    );
    const biWeeklyAnnualSummary = generateAnnualSummary(biWeeklyResult.schedule, 26);
    const biWeeklyMonthsSaved = monthlySummary.payoffTermMonths - biWeeklyResult.summary.payoffTermMonths!;
    const biWeeklySummary: MortgageSummary = {
        ...biWeeklyResult.summary,
        taxes: monthlyTaxes,
        insurance: monthlyInsurance,
        pmi: initialPmi, 
        hoa: hoaDues,
        totalMonthlyPayment: biWeeklyResult.summary.principalAndInterest! + monthlyTaxes + monthlyInsurance + initialPmi + hoaDues,
        interestSaved: monthlySummary.totalInterest - biWeeklyResult.summary.totalInterest!,
        timeSaved: formatTimeSaved(biWeeklyMonthsSaved),
    } as MortgageSummary;
    
    // Calculate annual extra payment for scenario 3
    let annualExtraPayment = 0;
    switch(extraPaymentFrequency) {
        case 'weekly': annualExtraPayment = extraPayment * 52; break;
        case 'bi-weekly': annualExtraPayment = extraPayment * 26; break;
        case 'monthly': annualExtraPayment = extraPayment * 12; break;
        case 'annually': annualExtraPayment = extraPayment; break;
    }
    
    // Scenario 3: Bi-Weekly with Extra Payment AND Optional One-Time Payment
    const extraPaymentPerBiWeeklyPeriod = annualExtraPayment / 26;
    const biWeeklyExtraResult = generateAmortizationSchedule(
        principal, interestRate, loanTerm, true, extraPaymentPerBiWeeklyPeriod, homePrice, 
        pmi, // Pass the monthly PMI amount
        applyToBiWeeklyExtra ? oneTimePayment : 0, 
        applyToBiWeeklyExtra ? oneTimePaymentDate : ''
    );
    const biWeeklyExtraAnnualSummary = generateAnnualSummary(biWeeklyExtraResult.schedule, 26);
    const biWeeklyExtraMonthsSaved = monthlySummary.payoffTermMonths - biWeeklyExtraResult.summary.payoffTermMonths!;
    
    const biWeeklyWithExtraSummary: MortgageSummary = {
        ...biWeeklyExtraResult.summary,
        taxes: monthlyTaxes,
        insurance: monthlyInsurance,
        pmi: initialPmi, 
        hoa: hoaDues,
        totalMonthlyPayment: biWeeklyExtraResult.summary.principalAndInterest! + (annualExtraPayment / 12) + monthlyTaxes + monthlyInsurance + initialPmi + hoaDues,
        interestSaved: monthlySummary.totalInterest - biWeeklyExtraResult.summary.totalInterest!,
        timeSaved: formatTimeSaved(biWeeklyExtraMonthsSaved),
    } as MortgageSummary;

    return {
        monthly: { schedule: monthlyResult.schedule, summary: monthlySummary, annualSummary: monthlyAnnualSummary },
        biWeekly: { schedule: biWeeklyResult.schedule, summary: biWeeklySummary, annualSummary: biWeeklyAnnualSummary },
        biWeeklyWithExtra: { schedule: biWeeklyExtraResult.schedule, summary: biWeeklyWithExtraSummary, annualSummary: biWeeklyExtraAnnualSummary },
    };
}