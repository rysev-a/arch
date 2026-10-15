import { Locator, Page, expect } from '@playwright/test';

/** Центр элемента на экране */
export async function center(loc: Locator): Promise<{ x: number; y: number }> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('у элемента нет размеров');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Перетащить мышью от одного элемента к точке или другому элементу, с остановками по пути */
export async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  const a = await center(from);
  const b = 'x' in to ? to : await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

/** Доска без прокрутки и масштаба: координаты «мира» (880 × 440) → пиксели экрана */
export async function worldPoint(page: Page, x: number, y: number) {
  const svg = page.locator('.board-svg');
  const b = await svg.boundingBox();
  if (!b) throw new Error('доски нет на странице');
  const scale = b.width / 880;
  return { x: b.x + x * scale, y: b.y + y * scale };
}

/** Заполнить localStorage до загрузки приложения (только если ключ ещё не задан — перезагрузка его не затирает) */
export async function seed(page: Page, data: Record<string, unknown>) {
  await page.addInitScript((entries: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(entries)) {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(v));
    }
  }, data);
}

export async function openExercise(page: Page, slug: string, id: string) {
  await page.goto(`/${slug}/${id}`);
  await expect(page.locator('.board-svg')).toBeVisible();
}

export const gates = (page: Page) => page.locator('.board-svg .gate');
export const wires = (page: Page) => page.locator('.board-svg .wire');
