import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import { rollingCorrelation } from '../utils/correlation';
import { dualAxisLayout, FOOTNOTES } from './common';

const CORRELATION_WINDOW = 36;

export function renderGdpJobs(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  jobsCreated: DataPoint[],
): void {
  const timeline = mergeMonthlyTimeline(jobsCreated, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = rollingCorrelation(gdpFilled, jobsCreated, timeline, CORRELATION_WINDOW);

  const layout = dualAxisLayout({
    title: 'Real GDP YoY vs Jobs Created',
    yLeftTitle: 'Real GDP YoY (%)',
    yRightTitle: 'Jobs Created (000s)',
  });

  layout.xaxis2 = {
    domain: [0.62, 0.98],
    anchor: 'y3',
    type: 'date',
    showgrid: false,
    tickfont: { size: 9, color: '#8b9cb3' },
  };
  layout.yaxis3 = {
    domain: [0.55, 0.95],
    anchor: 'x2',
    title: { text: 'Rolling corr.', font: { size: 9, color: '#fbbf24' } },
    tickfont: { size: 9, color: '#fbbf24' },
    gridcolor: '#2d3a4f',
  };

  Plotly.newPlot(
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
      },
      {
        x: jobsCreated.map((p) => formatDate(p.date)),
        y: jobsCreated.map((p) => p.value),
        name: 'Jobs Created (000s)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
      },
      {
        x: corr.map((p) => formatDate(p.date)),
        y: corr.map((p) => p.value),
        name: `${CORRELATION_WINDOW}m correlation`,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fbbf24', width: 1.5 },
        xaxis: 'x2',
        yaxis: 'y3',
        showlegend: false,
      },
    ],
    layout,
    { responsive: true, displayModeBar: false },
  );
}

export const CHART2_META = {
  id: 'chart2',
  title: '2. US Economic Growth & Jobs Created',
  subtitle: `${CORRELATION_WINDOW}-month rolling correlation shown in inset (upper right).`,
  footnote: FOOTNOTES.fredNber,
};
