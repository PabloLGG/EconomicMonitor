import Plotly from 'plotly.js-dist-min';
import type { ScatterData, Shape } from 'plotly.js';
import { hoverLineShapes, hoverXValue } from '../charts/hoverShapes';
import { getSubplotLayout, hoverYDomainForXref } from '../charts/subplotLayout';

type ScatterTrace = Partial<ScatterData> & { x?: (string | number | Date)[]; y?: number[] };

type PlotlyAxis = {
  p2d: (p: number) => number | string;
  _offset: number;
  _length: number;
};

type PlotlyRoot = HTMLElement & {
  data: ScatterTrace[];
  _fullLayout?: Record<string, PlotlyAxis> & {
    margin: { l: number; r: number; t: number; b: number };
    _size: { w: number; h: number };
  };
};

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
): { reset: () => void; resetBacktest: () => void; bind: () => void } {
  let lastMonthKey = '';
  let lastHoverXKey = '';
  let touchScrubbing = false;
  let pointerAbort: AbortController | null = null;

  const root = (): PlotlyRoot => config.el as PlotlyRoot;

  const yDomainForXref = (xref: NonNullable<Shape['xref']>): [number, number] => {
    if (config.xrefs.length === 1) return [0.06, 0.94];
    return hoverYDomainForXref(xref === 'x2' ? 'x2' : 'x');
  };

  const updateHoverLine = (x: string | number | null): void => {
    const xKey = x == null ? '' : hoverXValue(x);
    if (xKey === lastHoverXKey) return;
    lastHoverXKey = xKey;

    const base = config.getBaseShapes();
    const shapes =
      x == null
        ? base
        : [...base, ...hoverLineShapes(x, config.xrefs, yDomainForXref)];
    void Plotly.relayout(config.el, { shapes });
  };

  const applyDate = (date: Date, x: string | number | null, notifyPanel: boolean): void => {
    const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (monthKey !== lastMonthKey) {
      lastMonthKey = monthKey;
      config.onDateChange(date);
      if (notifyPanel) config.onPanelDate?.(date);
    }
    updateHoverLine(x);
  };

  const handlePointer = (
    clientX: number,
    clientY: number,
    notifyPanel: boolean,
  ): void => {
    const gd = root();
    const xref = xrefForPointer(gd, clientX, clientY, config.xrefs);
    if (!xref) return;

    const x = clientXToHoverX(gd, clientX, xref);
    if (x == null) return;

    const date = parseHoverDate(x);
    if (!date) return;

    applyDate(date, hoverXValue(x), notifyPanel);
  };

  const resetBacktest = (): void => {
    lastMonthKey = '';
    lastHoverXKey = '';
    config.onDateChange(config.defaultDate);
    config.onPanelDate?.(null);
  };

  const reset = (): void => {
    resetBacktest();
    updateHoverLine(null);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (touchScrubbing) return;
    handlePointer(event.clientX, event.clientY, true);
  };

  const onMouseLeave = (): void => {
    if (touchScrubbing) return;
    reset();
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) return;
    touchScrubbing = true;
    event.preventDefault();
    const touch = event.touches[0];
    handlePointer(touch.clientX, touch.clientY, true);
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (!touchScrubbing || event.touches.length !== 1) return;
    event.preventDefault();
    const touch = event.touches[0];
    handlePointer(touch.clientX, touch.clientY, true);
  };

  const endTouchScrub = (): void => {
    if (!touchScrubbing) return;
    touchScrubbing = false;
    reset();
  };

  function bind(): void {
    pointerAbort?.abort();
    pointerAbort = new AbortController();
    const { signal } = pointerAbort;
    const gd = root();

    gd.addEventListener('mousemove', onMouseMove, { signal });
    gd.addEventListener('mouseleave', onMouseLeave, { signal });
    gd.addEventListener('touchstart', onTouchStart, { passive: false, signal });
    gd.addEventListener('touchmove', onTouchMove, { passive: false, signal });
    gd.addEventListener('touchend', endTouchScrub, { signal });
    gd.addEventListener('touchcancel', endTouchScrub, { signal });
  }

  bind();
  config.onDateChange(config.defaultDate);
  updateHoverLine(null);

  return { reset, resetBacktest, bind };
}
