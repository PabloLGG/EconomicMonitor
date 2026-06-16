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

const chartsContainer = document.querySelector<HTMLElement>('#charts')!;
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

    const recessionBands = parseRecessionBands(data.usRec);
    const updated = new Date().toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await Promise.all([
      safeRender(el1, () =>
        renderGdpSp500(el1, data.gdpYoy, data.sp500, recessionBands),
      ),
      safeRender(el2, () =>
        renderGdpJobs(el2, data.gdpYoy, data.jobsCreated, recessionBands),
      ),
      safeRender(el3, () =>
        renderFedFundsJobs(el3, data.fedFundsChange, data.jobsCreated, recessionBands),
      ),
      safeRender(el4, () =>
        renderYieldGdp(el4, data.yieldCurve, data.gdpYoy, recessionBands),
      ),
      safeRender(el5, () =>
        renderYieldClaims(el5, data.yieldCurve, data.joblessClaims, recessionBands),
      ),
      safeRender(el6, () =>
        renderCorporateProfits(el6, data.corpProfits, recessionBands),
      ),
      safeRender(el7, () => {
        const surprise = buildCpiSurpriseSeries(
          data.cpiYoy,
          data.michExpectations,
          nowcasts,
        );
        if (surprise.length === 0) {
          throw new Error('No CPI surprise data could be computed.');
        }
        renderCpiSurpriseSp500(el7, surprise, data.sp500, recessionBands);
      }),
    ]);

    setStatus(`Data loaded · Last refreshed ${updated}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load data: ${message}`, true);
  }
}

init();
