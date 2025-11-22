
export interface MortgageParams {
  homePrice: number;
  downPayment: number;
  loanTerm: number; // in years
  interestRate: number; // annual percentage
  propertyTaxes: number; // annual
  homeownersInsurance: number; // annual
  hoaDues: number; // monthly
  pmi: number; // monthly
  extraPayment: number;
  extraPaymentFrequency: 'weekly' | 'bi-weekly' | 'monthly' | 'annually';
  oneTimePayment?: number;
  oneTimePaymentDate?: string; // YYYY-MM format
  oneTimePaymentMode?: 'monthly' | 'biWeekly' | 'biWeeklyWithExtra' | 'all';
}

export interface AmortizationEntry {
  month: number;
  interest: number;
  principal: number;
  extraPayment: number;
  totalPayment: number;
  remainingBalance: number;
  paymentDate: string;
  beginningBalance: number;
}

export interface MortgageSummary {
  // P&I
  principalAndInterest: number;
  // Total monthly payment
  totalMonthlyPayment: number;
  // Components of payment
  taxes: number;
  insurance: number;
  pmi: number;
  hoa: number;
  // Summary stats
  totalPrincipal: number;
  totalInterest: number;
  totalCost: number;
  payoffDate: string;
  payoffTermYears: number;
  payoffTermMonths: number;
  interestSaved: number; // compared to baseline monthly
  timeSaved: string; // compared to baseline monthly
}

export interface AnnualSummaryEntry {
  year: number;
  principalPaid: number;
  interestPaid: number;
  endingBalance: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
}

export interface CalculationResults {
  monthly: {
    schedule: AmortizationEntry[];
    summary: MortgageSummary;
    annualSummary: AnnualSummaryEntry[];
  };
  biWeekly: {
    schedule: AmortizationEntry[];
    summary: MortgageSummary;
    annualSummary: AnnualSummaryEntry[];
  };
  biWeeklyWithExtra: {
    schedule: AmortizationEntry[];
    summary: MortgageSummary;
    annualSummary: AnnualSummaryEntry[];
  };
}