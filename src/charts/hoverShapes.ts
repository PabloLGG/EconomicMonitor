import type { Shape } from 'plotly.js';

export const HOVER_LINE = {
  color: 'rgba(186, 198, 215, 0.9)',
  width: 1.5,
};

export function hoverXValue(x: string | number | Date): string {
  if (x instanceof Date) {
    return x.toISOString().slice(0, 10);
  }
  return String(x);
}

export function hoverLineShapes(
  x: string | number,
  xrefs: Array<NonNullable<Shape['xref']>>,
  yDomainForXref: (xref: NonNullable<Shape['xref']>) => [number, number],
): Partial<Shape>[] {
  return xrefs.map((xref) => {
    const yDomain = yDomainForXref(xref);
    return {
      type: 'line' as const,
      xref,
      yref: 'paper' as const,
      x0: x,
      x1: x,
      y0: yDomain[0],
      y1: yDomain[1],
      line: HOVER_LINE,
      layer: 'above' as const,
    };
  });
}
