# Economic Monitor

**Live site:** [pablolgg.github.io/EconomicMonitor](https://pablolgg.github.io/EconomicMonitor/)

An interactive dashboard of US macroeconomic indicators — GDP, jobs, the yield curve, corporate profits, inflation surprises, and more — with NBER recession shading and a browser-based recession forecast model.

**No signup or API key is required to use the live site.** Open the link above and the charts load automatically.

---

## What the site shows

Seven synchronized charts compare key macro series from the [FRED](https://fred.stlouisfed.org/) database and NBER recession dates. Hover any point to inspect values; charts share a linked time cursor so you can compare relationships across panels.

| # | Chart | What it compares |
|---|-------|------------------|
| 1 | GDP vs S&P 500 | Real GDP year-over-year growth and the S&P 500, with NBER recession bands |
| 2 | GDP vs jobs | Real GDP YoY and monthly nonfarm payroll change, with a rolling-correlation inset |
| 3 | Fed Funds vs jobs | Fed Funds rate change (shifted 12 months forward) vs payroll growth |
| 4 | Yield curve vs GDP | 10Y–3M Treasury spread vs real GDP YoY |
| 5 | Yield curve vs claims | 10Y–3M spread vs initial jobless claims |
| 6 | Corporate profits | After-tax profits per unit of real GVA, with a 5-year detail inset |
| 7 | CPI surprise vs stocks | Reported CPI YoY minus consensus expectations vs the S&P 500 |

### Recession probability panel

Charts **1, 2, and 4** include a generative ML overlay trained on decades of monthly data:

- **Today** — calibrated probability that a US recession starts within the next **12 months**
- **Hover backtest** — move the cursor over history to see what the model would have forecast from that month, including projected correlation paths and a shaded recession window when hazard is elevated
- **Forward bands** — dashed lines and shaded bands on the latest view extend rolling-correlation forecasts using Monte Carlo roll-forward

The model runs entirely in your browser via [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html); no data is sent to a server for inference.

### How often data updates

The published site loads a pre-built data bundle that GitHub Actions refreshes **daily at 06:00 UTC** and on every push to `main`. When you open the site, it fetches that bundle — you do not need to configure anything.

---

## Do I need a FRED API key?

| Situation | API key needed? |
|-----------|-----------------|
| **Using the live GitHub Pages site** | **No** — data is fetched server-side during deploy and shipped with the site |
| **Running locally (`npm run dev`)** | **Yes** — dev mode calls the FRED API through a local proxy |
| **Forking and deploying your own copy** | **Yes** — add `FRED_API_KEY` as a GitHub Actions secret (see below) |

Register a free key at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) only if you are developing locally or hosting your own deployment.

---

## Data sources

| Series | FRED ID |
|--------|---------|
| Real GDP YoY | `A191RO1Q156NBEA` |
| S&P 500 | `SP500` (+ Shiller monthly history for early years) |
| Nonfarm payroll change | `PAYEMS` (`units=chg`) |
| Fed Funds rate | `FEDFUNDS` |
| 10Y–3M spread | `T10Y3M` |
| Initial jobless claims | `ICSA` |
| Corporate profits / real GVA | `A466RD3Q052SBEA` |
| CPI YoY | `CPIAUCSL` (`units=pc1`) |
| Inflation expectations (consensus proxy) | `MICH` |
| NBER recessions | `USREC` |

Chart 7 uses the Cleveland Fed CPI nowcast when available; otherwise Michigan Survey inflation expectations (`MICH`) as the consensus proxy.

---

## For developers

### Local development

**Prerequisites:** Node.js 24+ (`brew install node` or use `.nvmrc`).

```bash
git clone https://github.com/PabloLGG/EconomicMonitor.git
cd EconomicMonitor
npm install
cp .env.example .env.local
```

Edit `.env.local` and set your FRED key:

```
VITE_FRED_API_KEY=your_key_here
```

```bash
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/). FRED blocks direct browser requests (CORS), so dev mode proxies API calls through Vite — keep the dev server running. Restart it after changing `.env.local`.

### Build and preview

```bash
npm run fetch-data   # writes public/data/economic-data.json
npm run build
npm run preview
```

### Deploy your own fork

1. Add repository secret **`FRED_API_KEY`** under **Settings → Secrets and variables → Actions**
2. Enable **GitHub Pages** from the **`gh-pages`** branch (created automatically by the deploy workflow)
3. Push to `main` — the workflow fetches FRED data, builds, and publishes

### Retrain the recession model

Charts 1, 2, and 4 use a Temporal VAE + discrete hazard model exported to `public/models/recession_v1.onnx`. After refreshing economic data:

```bash
npm run fetch-data
cd ml && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m data.prepare_panel
python -m train.train_all
```

See [`ml/README.md`](ml/README.md) for training and evaluation details.
