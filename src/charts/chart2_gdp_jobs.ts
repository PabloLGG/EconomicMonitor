import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y, THOUSANDS_UNIT } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const GDP_AXIS: [number, number] = [-5, 7.5];
const JOBS_AXIS: [number, number] = [-1000, 1000];

export function renderGdpJobs(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  jobsCreated: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const timeline = mergeMonthlyTimeline(jobsCreated, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = correlatePlottedPair(gdpFilled, jobsCreated);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Real GDP YoY (%)',
    yRightTitle: `Jobs Created ${THOUSANDS_UNIT}`,
    yaxisRange: GDP_AXIS,
    yaxis2Range: JOBS_AXIS,
    recessionBands,
  });

  plotDualPanelChart(
    el,
    [
      {
        x: gdpFilled.map((p) => formatDate(p.date)),
        y: gdpFilled.map((p) => p.value),
        name: 'Real GDP YoY (%)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
        hovertemplate: HOVER_Y.pct2,
      },
      {
        x: jobsCreated.map((p) => formatDate(p.date)),
        y: jobsCreated.map((p) => p.value),
        name: `Jobs Created ${THOUSANDS_UNIT}`,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
        hovertemplate: HOVER_Y.int0,
      },
      correlationTrace(corr),
    ],
    layout,
  );
}

export const CHART2_META = {
  id: 'chart2',
  title: '2. US Economic Growth & Jobs Created',
  subtitle: `${CORRELATION_SUBTITLE} GDP axis: −5% to 7.5%. Jobs axis: ±1,000 ${THOUSANDS_UNIT}.`,
  footnote: FOOTNOTES.fredNber,
};
