import './styles.css';
import { fetchAllCoreSeries } from './api/fred';
import { fetchClevelandCpiNowcasts } from './api/clevelandFed';
import { parseRecessionBands } from './data/recessions';
import { renderChartSection, showChartError } from './charts/common';
import { renderGdpSp500, CHART1_META } from './charts/chart1_gdp_sp500';
import { renderGdpJobs, CHART2_META } from './charts/chart2_gdp_jobs';
import { renderFedFundsJobs, CHART3_META } from './charts/chart3_fedfunds_jobs';
import { renderYieldGdp, CHART4_META } from './charts/chart4_yield_gdp';
import { renderYieldClaims, CHART5_META } from './charts/chart5_yield_claims';
import { renderCorporateProfits, CHART6_META } from './charts/chart6_corporate_profits';
import { buildCpiSurpriseSeries } from './data/cpiSurprise';
import { renderCpiSurpriseSp500, CHART7_META } from './charts/chart7_cpi_surprise_sp500';
import { analyzeRecessionSignals } from './analysis/recessionSignals';
import { predictionCache } from './analysis/predictionCache';
import { createTrailingPanel } from './components/trailingPanel';
import { loadRecessionModel } from './analysis/recessionModel';
import {
  createRecessionPredictor,
  initializeForwardOutlooks,
  predictRecessionLatest,
} from './analysis/recessionForecast';

const chartsContainer = document.querySelector<HTMLElement>('#charts')!;
const trailingPanelEl = document.querySelector<HTMLElement>('#trailing-panel')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function safeRender(
  el: HTMLElement,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showChartError(el, message);
  }
}

async function init(): Promise<void> {
  const el1 = renderChartSection(
    chartsContainer,
    CHART1_META.id,
    CHART1_META.title,
    CHART1_META.subtitle,
    CHART1_META.footnote,
  );
  const el2 = renderChartSection(
    chartsContainer,
    CHART2_META.id,
    CHART2_META.title,
    CHART2_META.subtitle,
    CHART2_META.footnote,
  );
  const el3 = renderChartSection(
    chartsContainer,
    CHART3_META.id,
    CHART3_META.title,
    CHART3_META.subtitle,
    CHART3_META.footnote,
  );
  const el4 = renderChartSection(
    chartsContainer,
    CHART4_META.id,
    CHART4_META.title,
    CHART4_META.subtitle,
    CHART4_META.footnote,
  );
  const el5 = renderChartSection(
    chartsContainer,
    CHART5_META.id,
    CHART5_META.title,
    CHART5_META.subtitle,
    CHART5_META.footnote,
  );
  const el6 = renderChartSection(
    chartsContainer,
    CHART6_META.id,
    CHART6_META.title,
    undefined,
    CHART6_META.footnote,
  );
  const el7 = renderChartSection(
    chartsContainer,
    CHART7_META.id,
    CHART7_META.title,
    CHART7_META.subtitle,
    CHART7_META.footnote,
  );

  try {
    setStatus('Fetching data from FRED…');

    const [data, nowcasts] = await Promise.all([
      fetchAllCoreSeries(),
      fetchClevelandCpiNowcasts().catch(() => []),
    ]);

    setStatus('Loading recession model…');
    await loadRecessionModel();

    const recessionBands = parseRecessionBands(data.usRec);
    const macroInput = {
      gdpYoy: data.gdpYoy,
      sp500: data.sp500,
      jobsCreated: data.jobsCreated,
      yieldCurve: data.yieldCurve,
    };

    const medianMonths = Math.round(
      recessionBands
        .filter((b) => b.end < new Date())
        .map((b) => {
          const months =
            (b.end.getUTCFullYear() - b.start.getUTCFullYear()) * 12 +
            (b.end.getUTCMonth() - b.start.getUTCMonth());
          return Math.max(1, months);
        })
        .sort((a, b) => a - b)[Math.floor(recessionBands.length / 2)] || 11,
    );

    const predictor = createRecessionPredictor(macroInput, medianMonths);
    predictionCache.clear();
    predictionCache.setPredictor(predictor);

    await initializeForwardOutlooks(predictor);

    const [pred1, pred2, pred4] = await Promise.all([
      predictRecessionLatest(predictor, 'chart1'),
      predictRecessionLatest(predictor, 'chart2'),
      predictRecessionLatest(predictor, 'chart4'),
    ]);

    const analysis = analyzeRecessionSignals({
      ...macroInput,
      recessionBands,
      predictions: { chart1: pred1, chart2: pred2, chart4: pred4 },
    });

    const surprise = buildCpiSurpriseSeries(
      data.cpiYoy,
      data.michExpectations,
      nowcasts,
    );

    const trailingPanel = createTrailingPanel(trailingPanelEl, {
      recessionBands,
      corr1: analysis.chart1.correlation,
      corr2: analysis.chart2.correlation,
      corr4: analysis.chart4.correlation,
      defaultPredictions: [
        { chartId: 'chart1', label: 'GDP & S&P 500', prediction: pred1 },
        { chartId: 'chart2', label: 'GDP & jobs', prediction: pred2 },
        { chartId: 'chart4', label: 'Yield & GDP', prediction: pred4 },
      ],
      todayDate: predictor.panel[predictor.panel.length - 1]?.date ?? new Date(),
      todayProbability: pred1.recessionProbability,
    });

    const onPanelDate = trailingPanel.update;

    const updated = new Date().toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await Promise.all([
      safeRender(el1, () =>
        renderGdpSp500(el1, data.gdpYoy, data.sp500, recessionBands, medianMonths, analysis.chart1, onPanelDate),
      ),
      safeRender(el2, () =>
        renderGdpJobs(el2, data.gdpYoy, data.jobsCreated, recessionBands, medianMonths, analysis.chart2, onPanelDate),
      ),
      safeRender(el3, () =>
        renderFedFundsJobs(el3, data.fedFundsChange, data.jobsCreated, recessionBands, onPanelDate),
      ),
      safeRender(el4, () =>
        renderYieldGdp(el4, data.yieldCurve, data.gdpYoy, recessionBands, medianMonths, analysis.chart4, onPanelDate),
      ),
      safeRender(el5, () =>
        renderYieldClaims(el5, data.yieldCurve, data.joblessClaims, recessionBands, onPanelDate),
      ),
      safeRender(el6, () =>
        renderCorporateProfits(el6, data.corpProfits, recessionBands, onPanelDate),
      ),
      safeRender(el7, () => {
        if (surprise.length === 0) {
          throw new Error('No CPI surprise data could be computed.');
        }
        return renderCpiSurpriseSp500(el7, surprise, data.sp500, recessionBands, onPanelDate);
      }),
    ]);

    setStatus(`Data loaded · Last refreshed ${updated}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load data: ${message}`, true);
  }
}

init();
