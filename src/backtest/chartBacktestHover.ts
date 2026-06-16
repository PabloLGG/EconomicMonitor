import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, ScatterData, Shape } from 'plotly.js';
import { hoverLineShapes, hoverXValue } from '../charts/hoverShapes';

type ScatterTrace = Partial<ScatterData> & { x?: (string | number | Date)[]; y?: number[] };

type PlotlyRoot = HTMLElement & {
  on(event: 'plotly_hover', handler: (event: PlotMouseEvent) => void): void;
  on(event: 'plotly_unhover', handler: () => void): void;
  data: ScatterTrace[];
};

type PlotlyFx = typeof Plotly & {
  Fx: {
    hover: (gd: HTMLElement, opts: { points: PlotMouseEvent['points'] }) => void;
    unhover: (gd: HTMLElement) => void;
  };
};

const plotlyFx = Plotly as PlotlyFx;

export interface ChartBacktestHoverConfig {
  el: HTMLElement;
  xrefs: Array<NonNullable<Shape['xref']>>;
  yDomain: [number, number];
  getBaseShapes: () => Partial<Shape>[];
  defaultDate: Date;
  onDateChange: (date: Date) => void;
  onPanelDate?: (date: Date | null) => void;
}

function parseHoverDate(x: string | number | Date): Date | null {
  if (x instanceof Date) return x;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}

function xToMs(x: string | number | Date): number {
  if (x instanceof Date) return x.getTime();
  return new Date(String(x)).getTime();
}

function nearestPointIndex(xs: (string | number | Date)[], targetMs: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dist = Math.abs(xToMs(xs[i]) - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function buildHoverPointsAtX(
  gd: PlotlyRoot,
  targetX: string | number,
): PlotMouseEvent['points'] {
  const targetMs = xToMs(targetX);
  const points: PlotMouseEvent['points'] = [];

  for (let curveNumber = 0; curveNumber < gd.data.length; curveNumber++) {
    const trace = gd.data[curveNumber];
    const xs = trace.x as (string | number | Date)[] | undefined;
    const ys = trace.y as number[] | undefined;
    if (!xs?.length || !ys?.length) continue;

    const pointNumber = nearestPointIndex(xs, targetMs);
    points.push({
      curveNumber,
      pointNumber,
      x: xs[pointNumber],
      y: ys[pointNumber],
      data: trace,
      fullData: trace,
    } as unknown as PlotMouseEvent['points'][number]);
  }

  return points;
}

/** Per-chart hover: vertical cursor line, backtest update, and optional panel sync. */
export function attachChartBacktestHover(config: ChartBacktestHoverConfig): void {
  const root = config.el as PlotlyRoot;
  const isDualPanel = config.xrefs.length > 1;
  let hoverSyncing = false;
  let lastMonthKey = '';

  const updateHoverLine = (x: string | number | null): void => {
    const base = config.getBaseShapes();
    const shapes =
      x == null ? base : [...base, ...hoverLineShapes(x, config.xrefs, config.yDomain)];
    void Plotly.relayout(config.el, { shapes });
  };

  const applyDate = (date: Date, x: string | number | null, notifyPanel: boolean): void => {
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (key !== lastMonthKey) {
      lastMonthKey = key;
      config.onDateChange(date);
      if (notifyPanel) config.onPanelDate?.(date);
    }
    updateHoverLine(x);
  };

  root.on('plotly_hover', (event: PlotMouseEvent) => {
    if (hoverSyncing) return;
    const x = event.points[0]?.x;
    if (x == null) return;

    const date = parseHoverDate(x);
    if (!date) return;

    const hx = hoverXValue(x);

    if (isDualPanel) {
      const allPoints = buildHoverPointsAtX(root, hx);
      if (allPoints.length > event.points.length) {
        hoverSyncing = true;
        plotlyFx.Fx.hover(root, { points: allPoints });
        hoverSyncing = false;
      }
    }

    applyDate(date, hx, true);
  });

  root.on('plotly_unhover', () => {
    lastMonthKey = '';
    config.onDateChange(config.defaultDate);
    config.onPanelDate?.(null);
    updateHoverLine(null);
    plotlyFx.Fx.unhover(root);
  });

  config.onDateChange(config.defaultDate);
  updateHoverLine(null);
}
