# Economic Monitor

A GitHub Pages dashboard tracking US macroeconomic indicators with seven live-updating charts powered by the [FRED API](https://fred.stlouisfed.org/docs/api/fred/) and NBER recession data.

**Live site:** [https://pablolgg.github.io/EconomicMonitor/](https://pablolgg.github.io/EconomicMonitor/)

## Charts

1. Real GDP YoY vs S&P 500 (with NBER recession bands)
2. Real GDP YoY vs Jobs Created (with rolling correlation inset)
3. Fed Funds YoY change (shifted +12 months) vs Jobs Created
4. 10Y–3M yield spread vs Real GDP YoY (with recession bands)
5. 10Y–3M yield spread vs Jobless Claims
6. Corporate profits per unit of real GVA (with 5-year inset)
7. CPI surprise (reported − consensus) vs S&P 500

## One-time setup

### 1. FRED API key

Register a free key at [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html).

### 2. GitHub repository secret

In your repo **Settings → Secrets and variables → Actions**, add:

| Name | Value |
|------|-------|
| `FRED_API_KEY` | Your FRED API key |

### 3. Enable GitHub Pages

In **Settings → Pages**, set source to **Deploy from a branch**, branch **`gh-pages`**, folder **`/ (root)`**.

The GitHub Actions workflow builds on every push to `main` and daily at 06:00 UTC, then publishes to `gh-pages`.

## Local development

### Prerequisites

Install **Node.js 24+** if you do not have it yet:

```bash
brew install node
# or: nvm install   (uses .nvmrc)
```

Verify:

```bash
node -v   # should print v24.x or newer
npm -v
```

### Setup

```bash
cd EconomicMonitor
npm install
cp .env.example .env.local
```

Edit `.env.local` and paste your real FRED API key (not the placeholder text):

```
VITE_FRED_API_KEY=abc123youractualkey
```

Get a free key at [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html).

### Run

```bash
npm run dev
```

Open **http://localhost:5173/** in your browser. (Local dev uses `/` as the base path; GitHub Pages uses `/EconomicMonitor/`.)

FRED blocks direct browser requests (CORS). Local dev automatically proxies API calls through Vite — just run `npm run dev` and keep that terminal open.

If charts fail to load, restart the dev server after editing `.env.local` so the new API key is picked up.

## Build

```bash
VITE_FRED_API_KEY=your_key_here npm run build
npm run preview
```

## Data sources

| Series | FRED ID |
|--------|---------|
| Real GDP YoY | `A191RO1Q156NBEA` |
| S&P 500 | `SP500` |
| Nonfarm payroll change | `PAYEMS` (`units=chg`) |
| Fed Funds rate | `FEDFUNDS` |
| 10Y–3M spread | `T10Y3M` |
| Initial jobless claims | `ICSA` |
| Corporate profits / real GVA | `A466RD3Q052SBEA` |
| CPI YoY | `CPIAUCSL` (`units=pc1`) |
| Inflation expectations (consensus proxy) | `MICH` |
| NBER recessions | `USREC` |

Chart 7 uses Cleveland Fed CPI nowcast when available; otherwise Michigan Survey inflation expectations (`MICH`) as consensus.
