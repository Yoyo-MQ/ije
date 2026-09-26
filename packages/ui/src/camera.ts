/** How far the host's own panels cover each edge of the map, in pixels. */
export interface IjeCoveredEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The camera offset that puts a centred point in the middle of the map's uncovered part rather
 * than the middle of the whole map. An offset, unlike MapLibre's padding, does not stay on the
 * map and skew later fits.
 */
export function uncoveredCentreOffset(covered: IjeCoveredEdges): [number, number] {
  return [(covered.left - covered.right) / 2, (covered.top - covered.bottom) / 2];
}
