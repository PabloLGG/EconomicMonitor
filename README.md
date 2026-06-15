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

```bash
npm install
echo "VITE_FRED_API_KEY=your_key_here" > .env.local
npm run dev
```

For local dev without a subpath, temporarily set `base: '/'` in `vite.config.ts`.

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
