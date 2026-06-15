import type { Layout, Shape } from 'plotly.js';
import type { RecessionBand } from '../utils/align';
import { formatDate } from '../api/fred';

const RECESSION_FILL = 'rgba(248, 113, 113, 0.12)';

export function recessionShapes(bands: RecessionBand[]): Partial<Shape>[] {
  return bands.map((band) => ({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: formatDate(band.start),
    x1: formatDate(band.end),
    y0: 0,
    y1: 1,
    fillcolor: RECESSION_FILL,
    line: { width: 0 },
    layer: 'below',
  }));
}

export interface DualAxisLayoutOptions {
  title: string;
  subtitle?: string;
  yLeftTitle: string;
  yRightTitle: string;
  recessionBands?: RecessionBand[];
  height?: number;
}

export function dualAxisLayout(options: DualAxisLayoutOptions): Partial<Layout> {
  const shapes = options.recessionBands ? recessionShapes(options.recessionBands) : [];

  return {
    title: {
      text: options.subtitle
        ? `${options.title}<br><sup>${options.subtitle}</sup>`
        : options.title,
      font: { size: 14, color: '#e8edf4' },
    },
    paper_bgcolor: '#1a2332',
    plot_bgcolor: '#1a2332',
    font: { color: '#8b9cb3', size: 11 },
    height: options.height ?? 420,
    margin: { t: 60, r: 60, b: 50, l: 60 },
    xaxis: {
      gridcolor: '#2d3a4f',
      zerolinecolor: '#2d3a4f',
      type: 'date',
    },
    yaxis: {
      title: { text: options.yLeftTitle, font: { color: '#60a5fa' } },
      tickfont: { color: '#60a5fa' },
      gridcolor: '#2d3a4f',
      zerolinecolor: '#2d3a4f',
    },
    yaxis2: {
      title: { text: options.yRightTitle, font: { color: '#4ade80' } },
      tickfont: { color: '#4ade80' },
      overlaying: 'y',
      side: 'right',
      gridcolor: 'transparent',
    },
    legend: {
      orientation: 'h',
      y: 1.12,
      x: 0,
      bgcolor: 'transparent',
    },
    shapes,
  };
}

export function singleAxisLayout(
  title: string,
  yTitle: string,
  recessionBands?: RecessionBand[],
  height = 420,
): Partial<Layout> {
  return {
    title: { text: title, font: { size: 14, color: '#e8edf4' } },
    paper_bgcolor: '#1a2332',
    plot_bgcolor: '#1a2332',
    font: { color: '#8b9cb3', size: 11 },
    height,
    margin: { t: 50, r: 40, b: 50, l: 60 },
    xaxis: {
      gridcolor: '#2d3a4f',
      zerolinecolor: '#2d3a4f',
      type: 'date',
    },
    yaxis: {
      title: { text: yTitle, font: { color: '#60a5fa' } },
      tickfont: { color: '#60a5fa' },
      gridcolor: '#2d3a4f',
      zerolinecolor: '#2d3a4f',
    },
    shapes: recessionBands ? recessionShapes(recessionBands) : [],
  };
}

export const FOOTNOTES = {
  fredNber:
    'Source: FRED (St. Louis Fed), NBER recession dates via USREC.',
  corpProfits:
    'Source: FRED A466RD3Q052SBEA — profit per unit of real GVA, after tax (BEA). NBER recessions via USREC.',
  cpiSurprise:
    'Source: FRED CPIAUCSL, MICH, SP500; Cleveland Fed CPI nowcast when available. Surprise = reported YoY − consensus.',
} as const;

export function renderChartSection(
  container: HTMLElement,
  id: string,
  title: string,
  subtitle: string | undefined,
  footnote: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'chart-section';
  section.innerHTML = `
    <h2>${title}</h2>
    ${subtitle ? `<p class="chart-subtitle">${subtitle}</p>` : ''}
    <div id="${id}" class="chart-container" role="img" aria-label="${title}"></div>
    <p class="chart-footnote">${footnote}</p>
  `;
  container.appendChild(section);
  return section.querySelector(`#${id}`)!;
}

export function showChartError(el: HTMLElement, message: string): void {
  el.innerHTML = `<div class="chart-error">${message}</div>`;
}
