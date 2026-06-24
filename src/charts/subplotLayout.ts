/** Subplot domains for dual-axis series + rolling correlation panels. */
export interface SubplotLayout {
  leftX: [number, number];
  rightX: [number, number];
  mainY: [number, number];
  corrY: [number, number];
  corrRange: [number, number];
}

/** Side-by-side: left panel wider; gutter between panels for the left plot's right y-axis. */
export const SIDE_BY_SIDE_CORR: SubplotLayout = {
  leftX: [0.02, 0.53],
  rightX: [0.60, 0.98],
  mainY: [0.04, 0.96],
  corrY: [0.04, 0.96],
  corrRange: [-1, 1],
};

export const STACKED_CORR: SubplotLayout = {
  leftX: [0.05, 0.97],
  rightX: [0.05, 0.97],
  mainY: [0.52, 0.97],
  corrY: [0.04, 0.48],
  corrRange: [-1, 1],
};

const NARROW_PHONE_BREAKPOINT = 480;

export const STACKED_CORR_NARROW: SubplotLayout = {
  leftX: [0.06, 0.97],
  rightX: [0.06, 0.97],
  mainY: [0.53, 0.97],
  corrY: [0.04, 0.48],
  corrRange: [-1, 1],
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
  if (isNarrowPhoneViewport()) return 520;
  return isMobileViewport() ? 560 : 460;
}

export function chartMargins(dualPanel = false): { t: number; r: number; b: number; l: number } {
  if (isNarrowPhoneViewport()) return { t: 26, r: 12, b: 36, l: 40 };
  if (isMobileViewport()) return { t: 28, r: dualPanel ? 36 : 16, b: 38, l: 44 };
  if (dualPanel) return { t: 26, r: 44, b: 36, l: 50 };
  return { t: 26, r: 28, b: 36, l: 50 };
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
