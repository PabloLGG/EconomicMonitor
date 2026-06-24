import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, ScatterData, Shape } from 'plotly.js';
import { hoverLineShapes, hoverXValue } from '../charts/hoverShapes';
import { getSubplotLayout, hoverYDomainForXref } from '../charts/subplotLayout';

type ScatterTrace = Partial<ScatterData> & { x?: (string | number | Date)[]; y?: number[] };

type PlotlyAxis = {
  p2d: (p: number) => number | string;
  _offset: number;
  _length: number;
};

type PlotlyRoot = HTMLElement & {
  on(event: 'plotly_hover', handler: (event: PlotMouseEvent) => void): void;
  on(event: 'plotly_unhover', handler: () => void): void;
  data: ScatterTrace[];
  _fullLayout?: Record<string, PlotlyAxis> & {
    margin: { l: number; r: number; t: number; b: number };
    _size: { w: number; h: number };
  };
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

function axisKeyForXref(xref: NonNullable<Shape['xref']>): 'xaxis' | 'xaxis2' {
  return xref === 'x2' ? 'xaxis2' : 'xaxis';
}

function clientXToHoverX(
  root: PlotlyRoot,
  clientX: number,
  xref: NonNullable<Shape['xref']>,
): string | number | null {
  const fullLayout = root._fullLayout;
  if (!fullLayout) return null;

  const xa = fullLayout[axisKeyForXref(xref)];
  if (!xa?._length) return null;

  const rect = root.getBoundingClientRect();
  const relativeX = clientX - rect.left - xa._offset;
  if (relativeX < 0 || relativeX > xa._length) return null;

  return xa.p2d(relativeX);
}

function paperYFromClientY(root: PlotlyRoot, clientY: number): number | null {
  const fullLayout = root._fullLayout;
  if (!fullLayout?._size) return null;

  const rect = root.getBoundingClientRect();
  const plotTop = rect.top + fullLayout.margin.t;
  const plotHeight = fullLayout._size.h;
  if (plotHeight <= 0) return null;

  const relativeY = clientY - plotTop;
  return 1 - relativeY / plotHeight;
}

function paperXFromClientX(root: PlotlyRoot, clientX: number): number | null {
  const fullLayout = root._fullLayout;
  if (!fullLayout?._size) return null;

  const rect = root.getBoundingClientRect();
  const plotLeft = rect.left + fullLayout.margin.l;
  const plotWidth = fullLayout._size.w;
  if (plotWidth <= 0) return null;

  return (clientX - plotLeft) / plotWidth;
}

function xrefForPointer(
  root: PlotlyRoot,
  clientX: number,
  clientY: number,
  xrefs: Array<NonNullable<Shape['xref']>>,
): NonNullable<Shape['xref']> | null {
  if (xrefs.length === 1) return xrefs[0];

  const layout = getSubplotLayout();
  const paperY = paperYFromClientY(root, clientY);
  const paperX = paperXFromClientX(root, clientX);
  if (paperY == null || paperX == null) return xrefs[0];

  const inMainY = paperY >= layout.mainY[0] && paperY <= layout.mainY[1];
  const inCorrY = paperY >= layout.corrY[0] && paperY <= layout.corrY[1];

  if (inCorrY) return 'x2';
  if (inMainY) {
    if (paperX >= layout.rightX[0] && paperX <= layout.rightX[1]) return 'x2';
    if (paperX >= layout.leftX[0] && paperX <= layout.leftX[1]) return 'x';
    return 'x';
  }

  return null;
}

/** Per-chart hover: vertical cursor line, backtest update, and optional panel sync. */
export function attachChartBacktestHover(
  config: ChartBacktestHoverConfig,
): { reset: () => void } {
  const root = config.el as PlotlyRoot;
  const isDualPanel = config.xrefs.length > 1;
  let hoverSyncing = false;
  let lastMonthKey = '';
  let touchScrubbing = false;

  const yDomainForXref = (xref: NonNullable<Shape['xref']>): [number, number] => {
    if (config.xrefs.length === 1) return [0.06, 0.94];
    return hoverYDomainForXref(xref === 'x2' ? 'x2' : 'x');
  };

  const updateHoverLine = (x: string | number | null): void => {
    const base = config.getBaseShapes();
    const shapes =
      x == null
        ? base
        : [
            ...base,
            ...hoverLineShapes(x, config.xrefs, yDomainForXref),
          ];
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

  const handleHoverX = (
    x: string | number | Date,
    notifyPanel: boolean,
  ): void => {
    const date = parseHoverDate(x);
    if (!date) return;

    const hx = hoverXValue(x);

    if (isDualPanel) {
      const allPoints = buildHoverPointsAtX(root, hx);
      if (allPoints.length > 0) {
        hoverSyncing = true;
        plotlyFx.Fx.hover(root, { points: allPoints });
        hoverSyncing = false;
      }
    }

    applyDate(date, hx, notifyPanel);
  };

  const reset = (): void => {
    lastMonthKey = '';
    config.onDateChange(config.defaultDate);
    config.onPanelDate?.(null);
    updateHoverLine(null);
    plotlyFx.Fx.unhover(root);
  };

  const handlePointer = (
    clientX: number,
    clientY: number,
    notifyPanel: boolean,
  ): void => {
    const xref = xrefForPointer(root, clientX, clientY, config.xrefs);
    if (!xref) return;

    const x = clientXToHoverX(root, clientX, xref);
    if (x == null) return;

    handleHoverX(x, notifyPanel);
  };

  root.on('plotly_hover', (event: PlotMouseEvent) => {
    if (hoverSyncing || touchScrubbing) return;
    const x = event.points[0]?.x;
    if (x == null) return;
    handleHoverX(x, true);
  });

  root.on('plotly_unhover', () => {
    if (touchScrubbing) return;
    reset();
  });

  root.addEventListener(
    'touchstart',
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      touchScrubbing = true;
      event.preventDefault();
      const touch = event.touches[0];
      handlePointer(touch.clientX, touch.clientY, true);
    },
    { passive: false },
  );

  root.addEventListener(
    'touchmove',
    (event: TouchEvent) => {
      if (!touchScrubbing || event.touches.length !== 1) return;
      event.preventDefault();
      const touch = event.touches[0];
      handlePointer(touch.clientX, touch.clientY, true);
    },
    { passive: false },
  );

  const endTouchScrub = (): void => {
    if (!touchScrubbing) return;
    touchScrubbing = false;
    reset();
  };

  root.addEventListener('touchend', endTouchScrub);
  root.addEventListener('touchcancel', endTouchScrub);

  config.onDateChange(config.defaultDate);
  updateHoverLine(null);

  return { reset };
}
