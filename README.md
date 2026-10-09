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

- `services/`: the maths. `mortgageCalculator.ts` builds the amortization schedules. `geminiService.ts` computes sale-side figures (closing costs, net proceeds, true gain) and holds the AI analysis prompt and its non-AI fallback text.
- `components/`: the UI. `CalculatorForm` is the input panel, `ResultsOverview` and `ResultHeadline` are the summary, `FinancialBreakdown` shows the ledger, and `GeminiInsights` shows the written analysis.
- `App.tsx`: page state, the payment details and schedule section, and PDF export.
- `types.ts`: shared types for parameters, schedules and results.
- `index.css`, `tailwind.config.js`, `postcss.config.js`: Tailwind is compiled at build time. The brand colours and fonts live in `tailwind.config.js`.

## Gemini key

The Gemini key must stay on the server. Anything in the browser bundle is public. Right now `vite.config.ts` inlines `GEMINI_API_KEY` into the client build, so treat any key used by this build as exposed until the AI call moves behind a server endpoint. Do not add the key to a `VITE_` variable or to `.env.local` for the browser.
