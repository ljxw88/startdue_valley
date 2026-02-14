import { test, expect } from "@playwright/test";

test.describe("Game page smoke checks", () => {
  test("loads /game and renders the viewport", async ({ page }) => {
    await page.goto("/game");
    const viewport = page.locator('section[aria-label="Game viewport"]');
    await expect(viewport).toBeVisible({ timeout: 15_000 });
  });

  test("renders the simulation HUD with controls", async ({ page }) => {
    await page.goto("/game");
    const hud = page.locator('aside[aria-label="Simulation HUD"]');
    await expect(hud).toBeVisible({ timeout: 15_000 });

    const simControls = page.locator(
      'div[aria-label="Simulation controls"] button'
    );
    await expect(simControls).not.toHaveCount(0);

    // Verify pause and play buttons exist
    await expect(
      page.locator('button[aria-label="Pause simulation"]')
    ).toBeVisible();
    await expect(
      page.locator('button[aria-label="Play simulation"]')
    ).toBeVisible();
  });

  test("renders camera controls", async ({ page }) => {
    await page.goto("/game");
    const cameraControls = page.locator(
      'div[aria-label="Camera controls"] button'
    );
    await expect(cameraControls).not.toHaveCount(0);

    await expect(
      page.locator('button[aria-label="Pan camera up"]')
    ).toBeVisible();
    await expect(
      page.locator('button[aria-label="Pan camera down"]')
    ).toBeVisible();
    await expect(
      page.locator('button[aria-label="Pan camera left"]')
    ).toBeVisible();
    await expect(
      page.locator('button[aria-label="Pan camera right"]')
    ).toBeVisible();
  });

  test("renders the tile map", async ({ page }) => {
    await page.goto("/game");
    const tileMap = page.locator(
      'div[aria-label="Visible village tile window"]'
    );
    await expect(tileMap).toBeVisible({ timeout: 15_000 });
  });

  test("renders NPC observer panel with villager list", async ({ page }) => {
    await page.goto("/game");
    const observerPanel = page.locator(
      'section[aria-label="NPC observer panel"]'
    );
    await expect(observerPanel).toBeVisible({ timeout: 15_000 });

    const villagerList = page.locator(
      'div[aria-label="Villager selector"] button'
    );
    await expect(villagerList).not.toHaveCount(0);
  });

  test("camera pan button updates the viewport", async ({ page }) => {
    await page.goto("/game");
    const tileMap = page.locator(
      'div[aria-label="Visible village tile window"]'
    );
    await expect(tileMap).toBeVisible({ timeout: 15_000 });

    const styleBefore = await tileMap.getAttribute("style");
    await page.locator('button[aria-label="Pan camera right"]').click();
    // Allow a brief moment for state update
    await page.waitForTimeout(200);
    const styleAfter = await tileMap.getAttribute("style");

    // The transform/translate should change after panning
    expect(styleBefore).not.toEqual(styleAfter);
  });
});
