/** Subplot domains for dual-axis series + rolling correlation panels. */
export interface SubplotLayout {
  leftX: [number, number];
  rightX: [number, number];
  mainY: [number, number];
  corrY: [number, number];
  corrRange: [number, number];
}

export const SIDE_BY_SIDE_CORR: SubplotLayout = {
  leftX: [0.05, 0.58],
  rightX: [0.73, 0.94],
  mainY: [0.08, 0.92],
  corrY: [0.08, 0.92],
  corrRange: [-1, 1],
};

export const STACKED_CORR: SubplotLayout = {
  leftX: [0.08, 0.92],
  rightX: [0.08, 0.92],
  mainY: [0.56, 0.94],
  corrY: [0.08, 0.46],
  corrRange: [-1, 1],
};

const MOBILE_BREAKPOINT = 768;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function getSubplotLayout(): SubplotLayout {
  return isMobileViewport() ? STACKED_CORR : SIDE_BY_SIDE_CORR;
}

export function chartHeight(): number {
  return isMobileViewport() ? 560 : 420;
}

export function hoverYDomainForXref(
  xref: 'x' | 'x2',
  layout: SubplotLayout = getSubplotLayout(),
): [number, number] {
  return xref === 'x2' ? layout.corrY : layout.mainY;
}
