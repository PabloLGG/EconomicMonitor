import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, ScatterData, Shape } from 'plotly.js';

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

const HOVER_LINE = {
  color: 'rgba(186, 198, 215, 0.9)',
  width: 1.5,
};

function hoverXValue(x: string | number | Date): string | number {
  if (x instanceof Date) {
    return x.toISOString().slice(0, 10);
  }
  return x;
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

function hoverLineShapes(
  x: string | number,
  xrefs: Array<NonNullable<Shape['xref']>>,
  yDomain: [number, number],
): Partial<Shape>[] {
  return xrefs.map((xref) => ({
    type: 'line' as const,
    xref,
    yref: 'paper' as const,
    x0: x,
    x1: x,
    y0: yDomain[0],
    y1: yDomain[1],
    line: HOVER_LINE,
    layer: 'above' as const,
  }));
}

/** Vertical hover line on a single date axis. */
export function attachHoverLine(
  el: HTMLElement,
  baseShapes: Partial<Shape>[],
): void {
  const xrefs: Array<NonNullable<Shape['xref']>> = ['x'];
  const yDomain: [number, number] = [0, 1];
  const root = el as PlotlyRoot;

  const updateHoverLine = (x: string | number | null): void => {
    const shapes =
      x == null ? baseShapes : [...baseShapes, ...hoverLineShapes(x, xrefs, yDomain)];
    void Plotly.relayout(el, { shapes });
  };

  root.on('plotly_hover', (event: PlotMouseEvent) => {
    const x = event.points[0]?.x;
    if (x == null) return;
    updateHoverLine(hoverXValue(x));
  });

  root.on('plotly_unhover', () => {
    updateHoverLine(null);
  });
}

/** Synced vertical lines and unified hover across left + right date panels. */
export function attachSyncedSubplotHover(
  el: HTMLElement,
  baseShapes: Partial<Shape>[],
  yDomain: [number, number],
): void {
  const xrefs: Array<NonNullable<Shape['xref']>> = ['x', 'x2'];
  const root = el as PlotlyRoot;
  let hoverSyncing = false;

  const updateHoverLine = (x: string | number | null): void => {
    const shapes =
      x == null ? baseShapes : [...baseShapes, ...hoverLineShapes(x, xrefs, yDomain)];
    void Plotly.relayout(el, { shapes });
  };

  root.on('plotly_hover', (event: PlotMouseEvent) => {
    if (hoverSyncing) return;
    const x = event.points[0]?.x;
    if (x == null) return;

    const hx = hoverXValue(x);
    updateHoverLine(hx);

    const allPoints = buildHoverPointsAtX(root, hx);
    if (allPoints.length > event.points.length) {
      hoverSyncing = true;
      plotlyFx.Fx.hover(root, { points: allPoints });
      hoverSyncing = false;
    }
  });

  root.on('plotly_unhover', () => {
    updateHoverLine(null);
    plotlyFx.Fx.unhover(root);
  });
}
