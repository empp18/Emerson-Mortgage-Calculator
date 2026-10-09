# Mortgage Amortization Planner

Compares three ways of paying the same mortgage and shows what you keep if you sell after 7, 13 or 20 years.

- **Monthly**: one payment a month on the standard schedule.
- **Bi-Weekly**: half the monthly payment every two weeks, which is 13 monthly payments a year.
- **Bi-Weekly v2.0**: bi-weekly payments plus the extra payment set in the form.

Two figures are used throughout:

- **True gain**: sale price minus closing costs minus the purchase price. Principal you repaid is your own money, so it is not gain.
- **True net gain**: true gain minus the total interest paid, and minus taxes, insurance, HOA and PMI when "Count ownership costs" is on.

## Running it

```sh
npm install
npm run dev      # local dev server on port 3000
npm test         # vitest unit tests for the maths
npm run build    # production build into dist/
```

Type-check with `npx tsc --noEmit`.

## Project layout

- `services/`: the maths. `mortgageCalculator.ts` builds the amortization schedules. `geminiService.ts` computes sale-side figures (closing costs, net proceeds, true gain), calls `/api/insights` and holds the non-AI fallback text. `insightsPrompt.ts` builds the AI prompt.
- `api/insights.ts`: Vercel function that validates the calculator inputs, reruns the calculator, builds the prompt and calls Gemini.
- `components/`: the UI. `CalculatorForm` is the input panel, `ResultsOverview` and `ResultHeadline` are the summary, `FinancialBreakdown` shows the ledger, and `GeminiInsights` shows the written analysis.
- `App.tsx`: page state, the payment details and schedule section, and PDF export.
- `types.ts`: shared types for parameters, schedules and results.
- `index.css`, `tailwind.config.js`, `postcss.config.js`: Tailwind is compiled at build time. The brand colours and fonts live in `tailwind.config.js`.

## Gemini key

The Gemini key lives only on the server. `api/insights.ts` reads `GEMINI_API_KEY` from the Vercel project's environment variables; the browser never sees it. The endpoint accepts calculator inputs only and builds the prompt itself, so it cannot be used as a general Gemini proxy.

Locally, `npm run dev` has no `/api` route, so the analysis shows the numbers-only summary. Use `vercel dev` (with the key in your Vercel development environment) to exercise the real endpoint. Never put the key in a `VITE_` variable or in client code.
