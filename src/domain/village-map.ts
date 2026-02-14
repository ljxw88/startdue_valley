import type { Tile } from "./tiles";

export const VILLAGE_MAP_DIMENSIONS = {
  width: 12,
  height: 10,
} as const;

export const VILLAGE_INTERACTION_ZONES = {
  townBoard: { x: 6, y: 3 },
  marketStall: { x: 8, y: 5 },
  farmToolShed: { x: 3, y: 7 },
} as const;

const HOME_TILES = new Set(["1,1", "2,1", "9,1", "10,1"]);
const PLAZA_TILES = new Set(["5,3", "6,3", "5,4", "6,4"]);
const FARM_TILES = new Set(["2,7", "3,7", "4,7", "2,8", "3,8", "4,8"]);
const SHOP_TILES = new Set(["8,5", "9,5"]);
const WATER_TILES = new Set(["0,8", "1,8", "0,9", "1,9"]);
const TREE_TILES = new Set(["11,0", "11,1", "11,2", "0,0", "0,1"]);
const PATH_TILES = new Set([
  "1,3",
  "2,3",
  "3,3",
  "4,3",
  "7,3",
  "8,3",
  "9,3",
  "10,3",
  "3,4",
  "4,4",
  "7,4",
  "8,4",
  "3,5",
  "4,5",
  "5,5",
  "6,5",
  "7,5",
  "2,6",
  "3,6",
  "4,6",
  "5,6",
  "6,6",
  "7,6",
  "3,9",
  "4,9",
  "5,9",
  "6,9",
  "7,9",
  "8,9",
]);

function getTileType(x: number, y: number): Tile["type"] {
  const key = `${x},${y}`;

  if (HOME_TILES.has(key)) return "home";
  if (PLAZA_TILES.has(key)) return "plaza";
  if (FARM_TILES.has(key)) return "farm";
  if (SHOP_TILES.has(key)) return "shop";
  if (WATER_TILES.has(key)) return "water";
  if (TREE_TILES.has(key)) return "tree";
  return PATH_TILES.has(key) ? "path" : "tree";
}

function isWalkable(type: Tile["type"]): boolean {
  return type !== "water" && type !== "tree";
}

export const VILLAGE_MAP_SEED: readonly Tile[] = Array.from(
  { length: VILLAGE_MAP_DIMENSIONS.height },
  (_, y) =>
    Array.from({ length: VILLAGE_MAP_DIMENSIONS.width }, (_, x) => {
      const type = getTileType(x, y);
      return {
        id: `tile_${x}_${y}` as Tile["id"],
        coordinate: { x, y },
        type,
        walkable: isWalkable(type),
      };
    }),
).flat();
