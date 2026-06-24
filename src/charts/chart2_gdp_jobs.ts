import type { DataPoint } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import type { ChartSignalAnalysis } from '../analysis/recessionSignals';
import {
  buildForecastBandTraces,
  buildMarkerTrace,
  createChartBacktestController,
} from '../backtest/chartBacktestController';
import { createPastFutureTraces, latestSeriesDate } from '../backtest/seriesSplit';
import { applyCorrelationForecastLayout } from './correlationForecastPanel';
import { registerChartBacktest } from './chartRegister';
import { FOOTNOTES, HOVER_Y, THOUSANDS_UNIT } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const GDP_AXIS: [number, number] = [-5, 7.5];
const JOBS_AXIS: [number, number] = [-1000, 1000];

const GDP_PAST = 0;
const GDP_FUTURE = 1;
const JOBS_PAST = 2;
const JOBS_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;
const BAND_LOWER = 6;
const BAND_UPPER = 7;
const MEAN_IDX = 8;

export async function renderGdpJobs(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  jobsCreated: DataPoint[],
  recessionBands: RecessionBand[],
  _medianRecessionMonths: number,
  analysis: ChartSignalAnalysis | undefined,
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const timeline = mergeMonthlyTimeline(jobsCreated, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = analysis?.correlation ?? correlatePlottedPair(gdpFilled, jobsCreated);
  const defaultDate = latestSeriesDate([...gdpFilled, ...jobsCreated, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Real GDP YoY (%)',
    yRightTitle: `Jobs Created ${THOUSANDS_UNIT}`,
    yaxisRange: GDP_AXIS,
    yaxis2Range: JOBS_AXIS,
    recessionBands,
  });

  const baseDates = [
    ...gdpFilled.map((p) => p.date),
    ...jobsCreated.map((p) => p.date),
    ...corr.map((p) => p.date),
  ];
  applyCorrelationForecastLayout(layout, baseDates);

  const [gdpPast, gdpFuture] = createPastFutureTraces(gdpFilled, {
    name: 'Real GDP YoY (%)',
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
    hovertemplate: HOVER_Y.pct2,
  });
  const [jobsPast, jobsFuture] = createPastFutureTraces(jobsCreated, {
    name: `Jobs Created ${THOUSANDS_UNIT}`,
    color: '#4ade80',
    width: 1.5,
    yaxis: 'y2',
    hovertemplate: HOVER_Y.int0,
  });
  const [corrPast, corrFuture] = createPastFutureTraces(corr, {
    name: '36m correlation',
    color: '#fbbf24',
    width: 1.5,
    yaxis: 'y3',
    xaxis: 'x2',
    hovertemplate: HOVER_Y.pct2,
  });

  const markerTrace =
    analysis?.historicalSignals.length
      ? buildMarkerTrace(corr, analysis.historicalSignals)
      : null;

  await plotDualPanelChart(
    el,
    [
      gdpPast,
      gdpFuture,
      jobsPast,
      jobsFuture,
      corrPast,
      corrFuture,
      ...buildForecastBandTraces(),
      ...(markerTrace ? [markerTrace] : []),
    ],
    layout,
  );

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x', 'x2'],
    recessionBands,
    series: [
      { full: gdpFilled, pastIndex: GDP_PAST, futureIndex: GDP_FUTURE },
      { full: jobsCreated, pastIndex: JOBS_PAST, futureIndex: JOBS_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
    forecast: {
      chartId: 'chart2',
      bandLowerIndex: BAND_LOWER,
      bandUpperIndex: BAND_UPPER,
      meanIndex: MEAN_IDX,
      historicalSignals: analysis?.historicalSignals,
    },
    forecastAnchorDate: defaultDate,
  });

  registerChartBacktest(
    el,
    ['x', 'x2'],
    controller.getBaseShapes,
    defaultDate,
    controller.update,
    layout,
    onPanelDate,
  );
}

export const CHART2_META = {
  id: 'chart2',
  title: '2. US Economic Growth & Jobs Created',
  subtitle: `${CORRELATION_SUBTITLE} Generative ML hazard forecast.`,
  footnote: FOOTNOTES.fredNber,
};
