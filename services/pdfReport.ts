import jsPDF from 'jspdf';
import {
  PLAN_KEYS,
  PLAN_NAMES,
  buildFallbackInsights,
  describeSale,
  dotColor,
  formatSignedThousands,
  getScenarioSnapshots,
  getTimelineSnapshots,
  type MortgageInsights,
  type PlanKey,
} from './geminiService';
import { yearEndBalance } from './mortgageCalculator';
import type { CalculationResults, MortgageParams } from '../types';

export interface PdfReportInput {
  params: MortgageParams;
  results: CalculationResults;
  appreciationRate: number;
  closingCostRate: number;
  includeCarryingCosts: boolean;
  // The written analysis, when it was made from the current numbers. Otherwise the numbers-only summary is used.
  insights?: MortgageInsights | null;
  date?: Date;
}

// One-page US Letter report, laid out to match docs/pdf-report-mockup.html
const PAGE_WIDTH = 612;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT = PAGE_WIDTH - MARGIN;
const SALE_YEAR = 7;

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const COLOR = {
  ink: rgb('#14213D'),
  body: rgb('#2B3550'),
  navy: rgb('#002D4E'),
  muted: rgb('#5B6577'),
  footer: rgb('#8B93A1'),
  rule: rgb('#E3E6EC'),
  paper: rgb('#FBFAF7'),
  chip: rgb('#EAF2F9'),
  track: rgb('#F1F3F6'),
  zero: rgb('#9AA3B2'),
  gold: rgb('#F2A900'),
  red: rgb('#B42318'),
  green: rgb('#1E7B4F'),
  amber: rgb('#A67700'),
  blue: rgb('#005A9C'),
  white: rgb('#FFFFFF'),
};

const PLAN_COLOR: Record<PlanKey, RGB> = { monthly: COLOR.blue, biWeekly: COLOR.green, biWeeklyExtra: COLOR.amber };
const BAR_LABEL: Record<PlanKey, string> = { monthly: 'Monthly', biWeekly: 'Bi-Weekly', biWeeklyExtra: 'v2.0' };
const PERIODS_PER_YEAR: Record<PlanKey, number> = { monthly: 12, biWeekly: 26, biWeeklyExtra: 26 };
const FREQUENCY_SHORT: Record<MortgageParams['extraPaymentFrequency'], string> = {
  weekly: 'wk',
  'bi-weekly': 'bi-wk',
  monthly: 'mo',
  annually: 'yr',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

// The standard PDF fonts cannot draw the typographic minus used in the app, so it is written as a hyphen
const ascii = (text: string) => text.replace(/−/g, '-');
// "October 2056" -> "Oct 2056"
const shortMonth = (payoff: string) => payoff.replace(/^([A-Za-z]{3})[A-Za-z]*/, '$1');
// "5 Years 10 Months" -> "5 yr 10 mo"
const shortDuration = (text: string) => text.replace(/(\d+) Years?/g, '$1 yr').replace(/(\d+) Months?/g, '$1 mo');

type Family = 'helvetica' | 'times';
interface TextStyle {
  family?: Family;
  bold?: boolean;
  size: number;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
}
interface Segment {
  text: string;
  bold?: boolean;
  color?: RGB;
}
interface Word {
  text: string;
  bold: boolean;
  color: RGB;
}

const applyFont = (doc: jsPDF, style: TextStyle) => {
  doc.setFont(style.family ?? 'helvetica', style.bold ? 'bold' : 'normal');
  doc.setFontSize(style.size);
  doc.setTextColor(...(style.color ?? COLOR.ink));
};

const write = (doc: jsPDF, text: string, x: number, y: number, style: TextStyle) => {
  applyFont(doc, style);
  doc.text(ascii(text), x, y, { align: style.align ?? 'left' });
};

// Breaks styled segments into lines no wider than maxWidth
const wrap = (doc: jsPDF, segments: Segment[], maxWidth: number, style: TextStyle): Word[][] => {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0;
  for (const segment of segments) {
    for (const text of segment.text.split(/\s+/).filter(Boolean)) {
      const word: Word = { text: ascii(text), bold: !!segment.bold, color: segment.color ?? style.color ?? COLOR.ink };
      applyFont(doc, { ...style, bold: word.bold });
      const wordWidth = doc.getTextWidth(word.text);
      const space = doc.getTextWidth(' ');
      if (line.length && width + space + wordWidth > maxWidth) {
        lines.push(line);
        line = [];
        width = 0;
      }
      width = line.length ? width + space + wordWidth : wordWidth;
      line.push(word);
    }
  }
  if (line.length) lines.push(line);
  return lines;
};

const drawLines = (doc: jsPDF, lines: Word[][], x: number, firstBaseline: number, lineHeight: number, style: TextStyle) => {
  lines.forEach((line, index) => {
    const y = firstBaseline + index * lineHeight;
    let cursor = x;
    for (const word of line) {
      applyFont(doc, { ...style, bold: word.bold, color: word.color });
      doc.text(word.text, cursor, y);
      cursor += doc.getTextWidth(word.text) + doc.getTextWidth(' ');
    }
  });
};

const hairline = (doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color: RGB, width: number) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
};

export function buildPdfReport({
  params,
  results,
  appreciationRate,
  closingCostRate,
  includeCarryingCosts,
  insights,
  date = new Date(),
}: PdfReportInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const timeline = getTimelineSnapshots(results, params, appreciationRate, includeCarryingCosts, closingCostRate);
  const copy = insights ?? buildFallbackInsights(timeline);
  const sale = getScenarioSnapshots(results, params, SALE_YEAR, appreciationRate, includeCarryingCosts, closingCostRate);
  const plans: Record<PlanKey, CalculationResults['monthly']> = {
    monthly: results.monthly,
    biWeekly: results.biWeekly,
    biWeeklyExtra: results.biWeeklyWithExtra,
  };
  const monthly = results.monthly.summary;
  const preparedOn = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Header: presenter pill, centred name, prepared date, navy rule
  const pill = 'Presented by Emerson Pinto';
  applyFont(doc, { bold: true, size: 8.5 });
  const pillWidth = doc.getTextWidth(pill) + 20;
  doc.setFillColor(...COLOR.paper);
  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, 36, pillWidth, 18, 9, 9, 'FD');
  write(doc, pill, MARGIN + 10, 48.5, { bold: true, size: 8.5, color: COLOR.navy });
  write(doc, 'Mortgage Calculator', PAGE_WIDTH / 2, 49, { family: 'times', bold: true, size: 13, align: 'center' });
  write(doc, `Prepared ${preparedOn}`, RIGHT, 49, { size: 8.5, color: COLOR.muted, align: 'right' });
  hairline(doc, MARGIN, 62, RIGHT, 62, COLOR.navy, 2);

  // Title and the deal in one muted line
  const percentDown = params.homePrice > 0 ? Number(((params.downPayment / params.homePrice) * 100).toFixed(1)) : 0;
  let subtitle = `${money(params.homePrice)} home · ${money(params.downPayment)} down (${percentDown}%) · ${params.interestRate}% · ${params.loanTerm} years`;
  if (params.extraPayment > 0) {
    subtitle += ` · ${money(params.extraPayment)}/${FREQUENCY_SHORT[params.extraPaymentFrequency]} extra on Bi-Weekly v2.0`;
  }
  write(doc, 'Your mortgage, in plain numbers', MARGIN, 92, { family: 'times', bold: true, size: 19 });
  write(doc, subtitle, MARGIN, 109, { size: 9, color: COLOR.muted });

  // The 7-year sale sentence, on a light panel with a gold bar
  const saleTop = 122;
  const saleLines = wrap(doc, [{ text: describeSale(sale.monthly, includeCarryingCosts), bold: true }], CONTENT_WIDTH - 30, { family: 'times', size: 13.5 });
  const saleHeight = saleLines.length * 17 + 14;
  doc.setFillColor(...COLOR.paper);
  doc.rect(MARGIN, saleTop, CONTENT_WIDTH, saleHeight, 'F');
  doc.setFillColor(...COLOR.gold);
  doc.rect(MARGIN, saleTop, 3, saleHeight, 'F');
  drawLines(doc, saleLines, MARGIN + 15, saleTop + 19, 17, { family: 'times', size: 13.5 });

  // Monthly payment composition, first month
  const payBaseline = saleTop + saleHeight + 16;
  const paySegments: Segment[] = [
    { text: 'Monthly payment' },
    { text: money(monthly.totalMonthlyPayment), bold: true, color: COLOR.ink },
    { text: `= principal & interest ${money(monthly.principalAndInterest)}` },
  ];
  if (monthly.taxes > 0) paySegments.push({ text: `+ property taxes ${money(monthly.taxes)}` });
  if (monthly.insurance > 0) paySegments.push({ text: `+ insurance ${money(monthly.insurance)}` });
  if (monthly.hoa > 0) paySegments.push({ text: `+ HOA ${money(monthly.hoa)}` });
  if (monthly.pmi > 0) paySegments.push({ text: `+ PMI ${money(monthly.pmi)}` });
  drawLines(doc, wrap(doc, paySegments, CONTENT_WIDTH, { size: 9.5, color: COLOR.body }), MARGIN, payBaseline, 12, { size: 9.5, color: COLOR.body });

  // Two boxes: where the check goes, and the three plans
  const boxTop = payBaseline + 14;
  const leftWidth = 232;
  const rightX = MARGIN + leftWidth + 14;
  const rightWidth = RIGHT - rightX;

  type Step = { n: string; label: string; value: number; final?: boolean };
  const steps: Step[] = [
    { n: '1', label: 'Check at closing', value: sale.monthly.netProceeds },
    { n: '2', label: 'Less the down payment', value: -params.downPayment },
    { n: '3', label: 'Less the principal you repaid', value: -sale.monthly.principalPaidToDate },
    { n: '4', label: 'Less the interest you paid', value: -sale.monthly.totalInterestToDate },
    ...(includeCarryingCosts
      ? [{ n: '5', label: 'Less taxes, insurance, HOA and PMI', value: -sale.monthly.carryingCostsToDate }]
      : []),
    { n: '=', label: 'What you actually gained', value: sale.monthly.trueNetGain, final: true },
  ];
  const boxHeight = Math.max(38 + steps.length * 18 + 8, 52 + PLAN_KEYS.length * 30 + 6);
  const boxBorder = (x: number, width: number) => {
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, boxTop, width, boxHeight, 6, 6, 'S');
  };

  boxBorder(MARGIN, leftWidth);
  write(doc, 'Where the check goes', MARGIN + 10, boxTop + 17, { family: 'times', bold: true, size: 12.5 });
  write(doc, 'Monthly plan, sold after 7 years', MARGIN + 10, boxTop + 29, { size: 8, color: COLOR.muted });
  steps.forEach((step, index) => {
    const rowTop = boxTop + 38 + index * 18;
    const centre = rowTop + 9;
    doc.setFillColor(...(step.final ? COLOR.navy : COLOR.chip));
    doc.circle(MARGIN + 17, centre, 7, 'F');
    write(doc, step.n, MARGIN + 17, centre + 2.5, { bold: true, size: 7.5, color: step.final ? COLOR.white : COLOR.blue, align: 'center' });
    write(doc, step.label, MARGIN + 31, centre + 3, { bold: !!step.final, size: 8.5 });
    write(doc, money(step.value), MARGIN + leftWidth - 10, centre + 3, {
      bold: true,
      size: 8.5,
      color: step.value < 0 ? COLOR.red : COLOR.ink,
      align: 'right',
    });
    if (index < steps.length - 1) hairline(doc, MARGIN + 10, rowTop + 18, MARGIN + leftWidth - 10, rowTop + 18, COLOR.rule, 0.5);
  });

  boxBorder(rightX, rightWidth);
  const tableLeft = rightX + 10;
  const edge = { month: tableLeft + 124, payoff: tableLeft + 170, saved: tableLeft + 216, net: tableLeft + 266 };
  write(doc, 'Your three plans', rightX + 10, boxTop + 17, { family: 'times', bold: true, size: 12.5 });
  write(doc, 'True net gain at a 7-year sale', rightX + 10, boxTop + 29, { size: 8, color: COLOR.muted });
  const header: TextStyle = { bold: true, size: 6.5, color: COLOR.muted };
  write(doc, 'PLAN', tableLeft, boxTop + 46, header);
  write(doc, 'PER MONTH', edge.month, boxTop + 46, { ...header, align: 'right' });
  write(doc, 'PAYOFF', edge.payoff, boxTop + 46, { ...header, align: 'right' });
  write(doc, 'SAVED', edge.saved, boxTop + 46, { ...header, align: 'right' });
  write(doc, 'NET GAIN', edge.net, boxTop + 46, { ...header, align: 'right' });
  hairline(doc, tableLeft, boxTop + 50, tableLeft + 266, boxTop + 50, COLOR.ink, 1);
  PLAN_KEYS.forEach((key, index) => {
    const { summary } = plans[key];
    const rowTop = boxTop + 52 + index * 30;
    const badge = summary.timeSaved === '(Baseline)' ? 'Baseline' : `${shortDuration(summary.timeSaved)} sooner`;
    write(doc, PLAN_NAMES[key], tableLeft, rowTop + 12, { bold: true, size: 8.5 });
    applyFont(doc, { bold: true, size: 6.5 });
    const badgeWidth = doc.getTextWidth(ascii(badge)) + 10;
    doc.setFillColor(...COLOR.gold);
    doc.roundedRect(tableLeft, rowTop + 15, badgeWidth, 11, 5.5, 5.5, 'F');
    write(doc, badge, tableLeft + 5, rowTop + 22.5, { bold: true, size: 6.5 });

    const net = sale[key].trueNetGain;
    write(doc, money(summary.totalMonthlyPayment), edge.month, rowTop + 12, { size: 8.5, align: 'right' });
    write(doc, shortMonth(summary.payoffDate), edge.payoff, rowTop + 12, { size: 8.5, align: 'right' });
    write(doc, summary.interestSaved > 0 ? money(summary.interestSaved) : '—', edge.saved, rowTop + 12, { size: 8.5, align: 'right' });
    write(doc, money(net), edge.net, rowTop + 12, { bold: true, size: 8.5, color: net < 0 ? COLOR.red : COLOR.ink, align: 'right' });
    if (index < PLAN_KEYS.length - 1) hairline(doc, tableLeft, rowTop + 29, tableLeft + 266, rowTop + 29, COLOR.rule, 0.5);
  });

  // Outcome at 7, 13 and 20 years, with bars around a zero line
  const timelineHeading = boxTop + boxHeight + 22;
  write(doc, 'How your outcome changes over time', MARGIN, timelineHeading, { family: 'times', bold: true, size: 13 });
  write(doc, 'True net gain by plan if you sold at each point. Bars run left for a loss, right for a gain.', MARGIN, timelineHeading + 12, { size: 8, color: COLOR.muted });

  const cardsTop = timelineHeading + 20;
  const cardGap = 12;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  const cardHeight = 88;
  const labelWidth = 38;
  const valueWidth = 36;
  const scale = Math.max(1, ...timeline.flatMap(point => PLAN_KEYS.map(key => Math.abs(point.plans[key].trueNetGain))));
  timeline.forEach((point, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    const gains = PLAN_KEYS.map(key => point.plans[key].trueNetGain);
    const item = copy.timeline.find(entry => entry.year === point.year);
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, cardsTop, cardWidth, cardHeight, 6, 6, 'S');

    doc.setFillColor(...rgb(dotColor(gains)));
    doc.circle(x + 14, cardsTop + 14, 5, 'F');
    write(doc, `Sell at ${point.year} years`, x + 25, cardsTop + 17, { bold: true, size: 9.5 });
    write(doc, item?.subtitle ?? '', x + 10, cardsTop + 30, { size: 8, color: COLOR.muted });

    const trackX = x + 10 + labelWidth;
    const trackWidth = cardWidth - labelWidth - valueWidth - 20;
    const zeroX = trackX + trackWidth / 2;
    PLAN_KEYS.forEach((key, row) => {
      const value = point.plans[key].trueNetGain;
      const rowY = cardsTop + 42 + row * 15;
      const length = (Math.abs(value) / scale) * (trackWidth / 2);
      write(doc, BAR_LABEL[key], x + 10, rowY + 5.5, { size: 7.5, color: COLOR.muted });
      doc.setFillColor(...COLOR.track);
      doc.rect(trackX, rowY, trackWidth, 6, 'F');
      if (length > 0) {
        doc.setFillColor(...PLAN_COLOR[key]);
        doc.rect(value < 0 ? zeroX - length : zeroX, rowY, length, 6, 'F');
      }
      hairline(doc, zeroX, rowY - 1.5, zeroX, rowY + 7.5, COLOR.zero, 0.6);
      write(doc, formatSignedThousands(value), x + cardWidth - 10, rowY + 5.5, {
        bold: true,
        size: 7.5,
        color: value < 0 ? COLOR.red : value > 0 ? COLOR.green : COLOR.ink,
        align: 'right',
      });
    });
  });

  // Bottom line: written analysis or the numbers-only summary, with the closing clause in green
  const bottomTop = cardsTop + cardHeight + 14;
  const bottomLines = wrap(
    doc,
    [
      { text: copy.bottomLine.lead, bold: true },
      { text: copy.bottomLine.emphasis, bold: true, color: COLOR.green },
    ],
    CONTENT_WIDTH - 24,
    { family: 'times', size: 12.5 }
  );
  const bottomHeight = 26 + bottomLines.length * 15 + 4;
  doc.setFillColor(...COLOR.paper);
  doc.rect(MARGIN, bottomTop, CONTENT_WIDTH, bottomHeight, 'F');
  write(doc, 'THE BOTTOM LINE', MARGIN + 12, bottomTop + 13, { bold: true, size: 6.5, color: COLOR.muted });
  drawLines(doc, bottomLines, MARGIN + 12, bottomTop + 27, 15, { family: 'times', size: 12.5 });

  // Loan balance by year, each plan's line ending at its payoff year
  const balanceHeading = bottomTop + bottomHeight + 22;
  write(doc, 'Your loan balance', MARGIN, balanceHeading, { family: 'times', bold: true, size: 13 });
  write(doc, 'How much you still owe at each year-end, for each plan.', MARGIN, balanceHeading + 12, { size: 8, color: COLOR.muted });

  const legendItems = PLAN_KEYS.map(key => ({ key, label: PLAN_NAMES[key] }));
  applyFont(doc, { size: 7.5 });
  const legendWidths = legendItems.map(item => doc.getTextWidth(item.label));
  let legendX = RIGHT - legendWidths.reduce((total, width) => total + width + 17, 0) - 12 * (legendItems.length - 1);
  legendItems.forEach((item, index) => {
    hairline(doc, legendX, balanceHeading - 3, legendX + 12, balanceHeading - 3, PLAN_COLOR[item.key], 2);
    write(doc, item.label, legendX + 17, balanceHeading, { size: 7.5, color: COLOR.muted });
    legendX += legendWidths[index] + 17 + 12;
  });

  const plotLeft = MARGIN + 36;
  const plotRight = RIGHT - 4;
  const plotTop = balanceHeading + 22;
  const plotBottom = plotTop + 98;
  const term = params.loanTerm;
  const principal = results.monthly.summary.totalPrincipal ?? 0;
  const yMax = Math.max(principal, 1);
  const yAt = (value: number) => plotBottom - (value / yMax) * (plotBottom - plotTop);
  const xAt = (year: number) => plotLeft + (year / term) * (plotRight - plotLeft);

  const step = principal > 500000 ? 200000 : 100000;
  for (let value = 0; value <= principal; value += step) {
    const y = yAt(value);
    hairline(doc, plotLeft, y, plotRight, y, COLOR.rule, 0.5);
    write(doc, value === 0 ? '$0' : `$${value / 1000}k`, plotLeft - 6, y + 2.5, { size: 7, color: COLOR.muted, align: 'right' });
  }
  for (let year = 0; year <= term; year += 5) {
    write(doc, String(year), xAt(year), plotBottom + 11, { size: 7, color: COLOR.muted, align: 'center' });
  }

  for (const key of PLAN_KEYS) {
    let previous: { x: number; y: number } | null = null;
    for (let year = 0; year <= term; year++) {
      const balance = yearEndBalance(plans[key].schedule, PERIODS_PER_YEAR[key], year, principal);
      if (balance === null) break;
      const point = { x: xAt(year), y: yAt(balance) };
      if (previous) hairline(doc, previous.x, previous.y, point.x, point.y, PLAN_COLOR[key], 1.6);
      previous = point;
    }
  }

  const saleX = xAt(SALE_YEAR);
  doc.setDrawColor(...COLOR.ink);
  doc.setLineWidth(0.8);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(saleX, plotTop, saleX, plotBottom);
  doc.setLineDashPattern([], 0);
  write(doc, `Sale at year ${SALE_YEAR}`, saleX + 4, plotTop + 8, { bold: true, size: 7 });

  // Footer: contact line, page number, and the assumptions in small print
  hairline(doc, MARGIN, 722, RIGHT, 722, COLOR.rule, 0.5);
  write(doc, 'Emerson Pinto | (609) 286-7269 | emerson.pinto@kw.com', MARGIN, 733, { size: 8, color: COLOR.footer });
  write(doc, 'Page 1 of 1', RIGHT, 733, { size: 8, color: COLOR.footer, align: 'right' });
  const smallPrint = `Estimates only. Assumes ${appreciationRate}% appreciation and ${closingCostRate}% closing costs when you sell. Bi-weekly means half the monthly payment every 14 days; extra payments are spread across bi-weekly payments. True net gain is the check at closing less the down payment, principal repaid and interest. Excludes buying costs, maintenance and taxes.`;
  drawLines(doc, wrap(doc, [{ text: smallPrint }], CONTENT_WIDTH, { size: 6.8, color: COLOR.footer }), MARGIN, 743, 8.5, {
    size: 6.8,
    color: COLOR.footer,
  });

  return doc;
}
