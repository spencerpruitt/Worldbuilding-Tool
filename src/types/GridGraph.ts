import type { GridFeature } from "@/generators/features";
import type { Cells, Point, Vertices } from "@/generators/voronoi";
import type { TypedArray } from "./PackedGraph";

/**
 * The pre-repack world graph: a jittered square grid turned into a Voronoi
 * diagram. Sibling to {@link PackedGraph} (the repacked primary store), `grid`
 * holds the coarse graph that heightmap, features, and climate generation run
 * on before cells are repacked into `pack`.
 *
 * Mirrors `PackedGraph`'s conventions: per-cell parallel data lives in
 * `TypedArray`s, index/neighbor lists are plain arrays, and the `cells` /
 * `vertices` sub-shapes reuse the Voronoi `Cells` / `Vertices` types.
 *
 * The `cells` typed arrays (`h`/`t`/`f`/`prec`/`temp`) are populated by the
 * generators that run after `generateGrid` builds the bare Voronoi graph, so
 * those construction sites assert the completed shape the same way `pack` does
 * with `{} as PackedGraph`.
 */
export interface GridGraph {
  spacing: number; // distance between grid points before jittering
  cellsDesired: number; // requested cell count driving the spacing
  boundary: Point[]; // pseudo-points clipping the Voronoi to the map edge
  points: Point[]; // jittered grid points, one per cell
  cellsX: number; // number of grid columns
  cellsY: number; // number of grid rows
  seed: string | number; // PRNG seed the grid was generated from
  cells: Cells & {
    h: TypedArray; // cell heights
    t: TypedArray; // distance field to coast (terrain type)
    f: TypedArray; // feature id occupying the cell
    prec: TypedArray; // cell precipitation
    temp: TypedArray; // cell temperature
  };
  vertices: Vertices;
  features: GridFeature[]; // grid features (index 0 is a reserved placeholder)
}
