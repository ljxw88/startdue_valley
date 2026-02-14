import type { TileId } from "./identifiers";

export const TILE_TYPES = ["path", "home", "plaza", "farm", "shop", "water", "tree"] as const;

export type TileType = (typeof TILE_TYPES)[number];

export interface TileCoordinate {
  x: number;
  y: number;
}

export interface Tile {
  id: TileId;
  coordinate: TileCoordinate;
  type: TileType;
  walkable: boolean;
}

export function isTileType(value: string): value is TileType {
  return TILE_TYPES.includes(value as TileType);
}
