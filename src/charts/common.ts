import type { Layout, Shape } from 'plotly.js';
import type { RecessionBand } from '../utils/align';
import { formatDate } from '../api/fred';
import type { SubplotLayout } from './subplotLayout';
import { chartFontSize, chartHeight, chartMargins, isCoarsePointer, isMobileViewport } from './subplotLayout';

const RECESSION_FILL = 'rgba(248, 113, 113, 0.25)';
const PREDICTED_RECESSION_FILL = 'rgba(251, 191, 36, 0.28)';

export function recessionShapes(
  bands: RecessionBand[],
  xrefs: Array<NonNullable<Shape['xref']>> = ['x'],
): Partial<Shape>[] {
  return xrefs.flatMap((xref) =>
    bands.map((band) => ({
      type: 'rect' as const,
      xref,
      yref: 'paper' as const,
      x0: formatDate(band.start),
      x1: formatDate(band.end),
      y0: 0,
      y1: 1,
      fillcolor: RECESSION_FILL,
      line: { width: 0 },
      layer: 'below' as const,
    })),
  );
}

export function predictedRecessionShapes(
  bands: RecessionBand[],
  xrefs: Array<NonNullable<Shape['xref']>> = ['x'],
): Partial<Shape>[] {
  return xrefs.flatMap((xref) =>
    bands.map((band) => ({
      type: 'rect' as const,
      xref,
      yref: 'paper' as const,
      x0: formatDate(band.start),
      x1: formatDate(band.end),
      y0: 0,
      y1: 1,
      fillcolor: PREDICTED_RECESSION_FILL,
      line: { color: '#fbbf24', width: 2, dash: 'dash' },
      layer: 'below' as const,
    })),
  );
}

export interface DualAxisLayoutOptions {
  yLeftTitle: string;
  yRightTitle: string;
  recessionBands?: RecessionBand[];
  predictedBands?: RecessionBand[];
  recessionXrefs?: Array<NonNullable<Shape['xref']>>;
  height?: number;
  yaxisRange?: [number, number];
  yaxis2Range?: [number, number];
}

/** Unit suffix for series reported in thousands. */
export const THOUSANDS_UNIT = '× 10³';

export const SP500_AXIS_TITLE = 'S&P 500 (points)';
export const SP500_TRACE_NAME = 'S&P 500 (points)';

export interface CorrelationPanelOptions {
  windowMonths: number;
}

/** Split layout: dual-axis time series (left) + rolling correlation (right). */
export function applyCorrelationSidePanel(
  layout: Partial<Layout>,
  domains: SubplotLayout,
  options: CorrelationPanelOptions,
): void {
  layout.xaxis!.domain = domains.leftX;
  layout.yaxis!.domain = domains.mainY;

  const margins = chartMargins(true);
  layout.margin = {
    t: layout.margin?.t ?? margins.t,
    r: margins.r,
    b: layout.margin?.b ?? margins.b,
    l: layout.margin?.l ?? margins.l,
  };

  if (layout.yaxis2) {
    const y2Title =
      typeof layout.yaxis2.title === 'object'
        ? layout.yaxis2.title
        : { text: String(layout.yaxis2.title ?? '') };
    layout.yaxis2 = {
      ...layout.yaxis2,
      side: 'right',
      title: { ...y2Title, standoff: isMobileViewport() ? 4 : 12 },
    };
  }

  const sideBySide = !isMobileViewport();

  layout.xaxis2 = {
    domain: domains.rightX,
    anchor: 'y3',
    type: 'date',
    gridcolor: '#2d3a4f',
    zerolinecolor: '#2d3a4f',
    tickfont: { size: chartFontSize(), color: '#8b9cb3' },
  };
  layout.yaxis3 = {
    domain: domains.corrY,
    anchor: 'x2',
    side: sideBySide ? 'right' : 'left',
    title: {
      text: isMobileViewport()
        ? `${options.windowMonths}m corr.`
        : `${options.windowMonths}m rolling corr.`,
      font: { size: chartFontSize(), color: '#fbbf24' },
      standoff: isMobileViewport() ? 4 : 8,
    },
    tickfont: { size: chartFontSize(), color: '#fbbf24' },
    gridcolor: '#2d3a4f',
    zerolinecolor: '#2d3a4f',
    range: domains.corrRange,
    autorange: false,
  };

  layout.hovermode = 'x';
}

export function plotDragMode(): false | 'zoom' {
  return isCoarsePointer() ? false : 'zoom';
}

export function dualAxisLayout(options: DualAxisLayoutOptions): Partial<Layout> {
  const xrefs = options.recessionXrefs ?? ['x'];
  const shapes: Partial<Shape>[] = [
    ...(options.recessionBands ? recessionShapes(options.recessionBands, xrefs) : []),
    ...(options.predictedBands ? predictedRecessionShapes(options.predictedBands, xrefs) : []),
  ];

  return {
    paper_bgcolor: '#1a2332',
    plot_bgcolor: '#1a2332',
    font: { color: '#8b9cb3', size: chartFontSize() },
    height: options.height ?? chartHeight(),
    margin: chartMargins(),
    dragmode: plotDragMode(),
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
      ...(options.yaxisRange
        ? { range: options.yaxisRange, autorange: false }
        : {}),
    },
    yaxis2: {
      title: { text: options.yRightTitle, font: { color: '#4ade80' } },
      tickfont: { color: '#4ade80' },
      overlaying: 'y',
      side: 'right',
      gridcolor: 'transparent',
      ...(options.yaxis2Range
        ? { range: options.yaxis2Range, autorange: false }
        : {}),
    },
    legend: {
      orientation: 'h',
      y: isMobileViewport() ? 1.08 : 1.02,
      x: 0,
      bgcolor: 'transparent',
      font: { size: chartFontSize() },
    },
    hovermode: 'x',
    shapes,
  };
}

export function singleAxisLayout(
  yTitle: string,
  recessionBands?: RecessionBand[],
  height = chartHeight(),
): Partial<Layout> {
  return {
    paper_bgcolor: '#1a2332',
    plot_bgcolor: '#1a2332',
    font: { color: '#8b9cb3', size: chartFontSize() },
    height,
    margin: chartMargins(),
    dragmode: plotDragMode(),
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
    hovermode: 'x',
    shapes: recessionBands ? recessionShapes(recessionBands) : [],
  };
}

/** Plotly hover disabled — values shown in trailing panel. */
export const HOVER_SKIP = 'skip' as const;

/** Legacy hover templates (unused when hoverinfo is skip). */
export const HOVER_Y = {
  pct2: '%{y:.2f}<extra></extra>',
  int0: '%{y:.0f}<extra></extra>',
  points0: '%{y:,.0f}<extra></extra>',
} as const;

export const FOOTNOTES = {
  fredNber:
    'Source: FRED (St. Louis Fed), NBER recession dates via USREC.',
  sp500:
    'Source: FRED, NBER via USREC; S&P 500: Shiller monthly history + FRED SP500 (recent).',
  corpProfits:
    'Source: FRED A466RD3Q052SBEA — profit per unit of real GVA, after tax (BEA). NBER recessions via USREC.',
  cpiSurprise:
    'Source: FRED CPIAUCSL, MICH, SP500; Cleveland Fed CPI nowcast when available. S&P 500: Shiller + FRED. Surprise = reported YoY − consensus.',
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
    <div class="chart-section-header">
      <div class="chart-section-titles">
        <h2>${title}</h2>
        ${subtitle ? `<p class="chart-subtitle">${subtitle}</p>` : ''}
      </div>
      <div class="chart-section-actions">
        <button type="button" class="chart-expand-btn" aria-label="Expand chart">Expand</button>
        <button type="button" class="chart-reset-btn" aria-label="Reset chart zoom">Reset</button>
      </div>
    </div>
    <div id="${id}" class="chart-container" role="img" aria-label="${title}"></div>
    <p class="chart-footnote">${footnote}</p>
  `;
  container.appendChild(section);
  return section.querySelector(`#${id}`)!;
}

export function showChartError(el: HTMLElement, message: string): void {
  el.innerHTML = `<div class="chart-error">${message}</div>`;
}
