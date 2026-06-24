/** Subplot domains for dual-axis series + rolling correlation panels. */
export interface SubplotLayout {
  leftX: [number, number];
  rightX: [number, number];
  mainY: [number, number];
  corrY: [number, number];
  corrRange: [number, number];
  stacked: boolean;
}

/** Side-by-side with a clear gutter so inner y-axes never overlap. */
export const SIDE_BY_SIDE_CORR: SubplotLayout = {
  leftX: [0.03, 0.50],
  rightX: [0.58, 0.97],
  mainY: [0.10, 0.94],
  corrY: [0.10, 0.94],
  corrRange: [-1, 1],
  stacked: false,
};

/** Stacked: top = main series, bottom = correlation, 10% gap for x-axes. */
export const STACKED_CORR: SubplotLayout = {
  leftX: [0.10, 0.94],
  rightX: [0.10, 0.94],
  mainY: [0.56, 0.96],
  corrY: [0.06, 0.46],
  corrRange: [-1, 1],
  stacked: true,
};

const NARROW_PHONE_BREAKPOINT = 480;

export const STACKED_CORR_NARROW: SubplotLayout = {
  leftX: [0.11, 0.94],
  rightX: [0.11, 0.94],
  mainY: [0.57, 0.96],
  corrY: [0.06, 0.45],
  corrRange: [-1, 1],
  stacked: true,
};

const MOBILE_BREAKPOINT = 768;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function isNarrowPhoneViewport(): boolean {
  return window.matchMedia(`(max-width: ${NARROW_PHONE_BREAKPOINT}px)`).matches;
}

export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function getSubplotLayout(): SubplotLayout {
  if (!isMobileViewport()) return SIDE_BY_SIDE_CORR;
  return isNarrowPhoneViewport() ? STACKED_CORR_NARROW : STACKED_CORR;
}

export function chartHeight(): number {
  const layout = getSubplotLayout();
  if (layout.stacked) {
    return isNarrowPhoneViewport() ? 480 : 500;
  }
  return 500;
}

export function chartExpandedHeight(): number {
  if (typeof window === 'undefined') return 560;
  const panelOffset =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--trailing-panel-offset'),
    ) || 80;
  const chrome = 96;
  return Math.max(460, Math.round(window.innerHeight - panelOffset - chrome));
}

export function chartMargins(dualPanel = false): { t: number; r: number; b: number; l: number } {
  if (!dualPanel) {
    if (isNarrowPhoneViewport()) return { t: 28, r: 14, b: 38, l: 44 };
    if (isMobileViewport()) return { t: 28, r: 16, b: 38, l: 44 };
    return { t: 28, r: 28, b: 38, l: 50 };
  }

  const stacked = getSubplotLayout().stacked;
  if (stacked) {
    if (isNarrowPhoneViewport()) return { t: 36, r: 18, b: 48, l: 50 };
    return { t: 38, r: 22, b: 50, l: 52 };
  }
  return { t: 42, r: 48, b: 40, l: 52 };
}

export function chartFontSize(): number {
  return isMobileViewport() ? 10 : 11;
}

export function hoverYDomainForXref(
  xref: 'x' | 'x2',
  layout: SubplotLayout = getSubplotLayout(),
): [number, number] {
  return xref === 'x2' ? layout.corrY : layout.mainY;
}
