 "use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  VILLAGE_MAP_DIMENSIONS,
  VILLAGE_MAP_SEED,
  type Tile,
} from "@/domain";

const simulationControls = [
  { id: "pause", label: "Pause simulation" },
  { id: "play", label: "Play simulation" },
  { id: "faster", label: "Increase simulation speed" }
] as const;

const cameraControls = [
  { id: "up", label: "Pan camera up", delta: { x: 0, y: -1 } },
  { id: "down", label: "Pan camera down", delta: { x: 0, y: 1 } },
  { id: "left", label: "Pan camera left", delta: { x: -1, y: 0 } },
  { id: "right", label: "Pan camera right", delta: { x: 1, y: 0 } },
] as const;

const VIEWPORT_TILE_SIZE = 48;
const VIEWPORT_TILE_WIDTH = 8;
const VIEWPORT_TILE_HEIGHT = 6;
const TILE_LAYER_ORDER: readonly Tile["type"][] = [
  "water",
  "path",
  "farm",
  "plaza",
  "home",
  "shop",
  "tree",
];
const TILE_VISUAL_TOKENS: Record<Tile["type"], string> = {
  water: "~~",
  path: "·",
  farm: "ff",
  plaza: "pp",
  home: "hh",
  shop: "$$",
  tree: "tt",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toViewportCoordinate(tile: Tile, cameraX: number, cameraY: number) {
  return {
    x: tile.coordinate.x - cameraX,
    y: tile.coordinate.y - cameraY,
  };
}

export default function GamePage() {
  const maxCameraX = Math.max(0, VILLAGE_MAP_DIMENSIONS.width - VIEWPORT_TILE_WIDTH);
  const maxCameraY = Math.max(0, VILLAGE_MAP_DIMENSIONS.height - VIEWPORT_TILE_HEIGHT);
  const [camera, setCamera] = useState({ x: 0, y: 0 });

  const moveCamera = useCallback(
    (deltaX: number, deltaY: number) => {
      setCamera((current) => ({
        x: clamp(current.x + deltaX, 0, maxCameraX),
        y: clamp(current.y + deltaY, 0, maxCameraY),
      }));
    },
    [maxCameraX, maxCameraY],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCamera(0, -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCamera(0, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveCamera(-1, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveCamera(1, 0);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveCamera]);

  const visibleTiles = useMemo(() => {
    const layerPriority = new Map(TILE_LAYER_ORDER.map((type, index) => [type, index]));
    return VILLAGE_MAP_SEED
      .map((tile) => {
        const viewport = toViewportCoordinate(tile, camera.x, camera.y);
        return { tile, viewport };
      })
      .filter(
        ({ viewport }) =>
          viewport.x >= 0 &&
          viewport.x < VIEWPORT_TILE_WIDTH &&
          viewport.y >= 0 &&
          viewport.y < VIEWPORT_TILE_HEIGHT,
      )
      .sort((a, b) => {
        const layerDifference =
          (layerPriority.get(a.tile.type) ?? TILE_LAYER_ORDER.length) -
          (layerPriority.get(b.tile.type) ?? TILE_LAYER_ORDER.length);
        if (layerDifference !== 0) return layerDifference;
        if (a.tile.coordinate.y !== b.tile.coordinate.y) {
          return a.tile.coordinate.y - b.tile.coordinate.y;
        }
        return a.tile.coordinate.x - b.tile.coordinate.x;
      });
  }, [camera.x, camera.y]);

  return (
    <main className="game-shell">
      <section aria-label="Game viewport" className="game-viewport">
        <h1>Village Viewport</h1>
        <p>
          Camera ({camera.x}, {camera.y}) · Arrow keys or controls to pan.
        </p>
        <div
          className="viewport-grid"
          role="img"
          aria-label="Visible village tile window"
          style={{
            gridTemplateColumns: `repeat(${VIEWPORT_TILE_WIDTH}, ${VIEWPORT_TILE_SIZE}px)`,
            gridTemplateRows: `repeat(${VIEWPORT_TILE_HEIGHT}, ${VIEWPORT_TILE_SIZE}px)`,
          }}
        >
          {visibleTiles.map(({ tile, viewport }) => (
            <div
              key={tile.id}
              className={`viewport-tile viewport-tile--${tile.type}`}
              data-walkable={tile.walkable}
              data-viewport-coordinate={`${viewport.x},${viewport.y}`}
              aria-label={`${tile.type} tile at ${tile.coordinate.x},${tile.coordinate.y}`}
              style={{
                gridColumnStart: viewport.x + 1,
                gridRowStart: viewport.y + 1,
              }}
            >
              <span className="viewport-tile__token">{TILE_VISUAL_TOKENS[tile.type]}</span>
              <span className="viewport-tile__coordinate">
                {tile.coordinate.x},{tile.coordinate.y}
              </span>
            </div>
          ))}
        </div>
      </section>

      <aside aria-label="Simulation HUD" className="game-hud">
        <h2>HUD</h2>
        <div className="hud-controls" role="group" aria-label="Simulation controls">
          {simulationControls.map((control) => (
            <button key={control.id} type="button" aria-label={control.label}>
              {control.label}
            </button>
          ))}
        </div>
        <h3>Camera</h3>
        <div className="camera-controls" role="group" aria-label="Camera controls">
          {cameraControls.map((control) => (
            <button
              key={control.id}
              type="button"
              aria-label={control.label}
              onClick={() => moveCamera(control.delta.x, control.delta.y)}
            >
              {control.label}
            </button>
          ))}
        </div>
      </aside>

      <aside aria-label="Simulation debug panel" className="game-debug">
        <h2>Debug Panel</h2>
        <p>
          Tile window: {VIEWPORT_TILE_WIDTH}×{VIEWPORT_TILE_HEIGHT}
        </p>
        <p>
          Clamp: x 0-{maxCameraX}, y 0-{maxCameraY}
        </p>
      </aside>
    </main>
  );
}
