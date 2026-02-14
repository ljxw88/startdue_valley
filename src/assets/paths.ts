const ASSET_ROOT = "/assets";

export const ASSET_FOLDERS = {
  tiles: "tiles",
  npcs: "npcs",
  ui: "ui",
} as const;

export type AssetFolder = (typeof ASSET_FOLDERS)[keyof typeof ASSET_FOLDERS];

const normalizeAssetName = (name: string): string => {
  const trimmed = name.trim().replace(/^\/+/, "");

  if (!trimmed || trimmed.includes("..")) {
    throw new Error(`Invalid asset name: "${name}"`);
  }

  return trimmed;
};

export const resolveAssetPath = (folder: AssetFolder, fileName: string): string =>
  `${ASSET_ROOT}/${folder}/${normalizeAssetName(fileName)}`;

export const resolveTileSpritePath = (spriteName: string): string =>
  resolveAssetPath(ASSET_FOLDERS.tiles, `${spriteName}.png`);

export const resolveNpcSpritePath = (spriteName: string): string =>
  resolveAssetPath(ASSET_FOLDERS.npcs, `${spriteName}.png`);

