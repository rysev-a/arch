import { expect, test } from '@playwright/test';
import { center, drag, gates, openExercise, seed, wires, worldPoint } from './helpers';

test.describe('доска со схемами', () => {
  test('элемент из панели перетаскивается на доску', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await expect(gates(page)).toHaveCount(0);
    const target = await worldPoint(page, 440, 220);
    await drag(page, page.locator('.pal-sq').first(), target);
    await expect(gates(page)).toHaveCount(1);
    await expect(page.locator('.ghost')).toHaveCount(0);
  });

  test('провод от входа к выходу решает «Первый сигнал»', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'wire');
    // щелчок по контакту — провод тянется за мышью, второй щелчок — конец провода
    await page.locator('.input-node .pin-hit').click();
    await page.mouse.move(500, 300, { steps: 4 });
    await expect(page.locator('.wire-preview')).toBeVisible();
    await page.locator('.out-node .pin-hit').click();
    await expect(wires(page)).toHaveCount(1);
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('app-dash-progress .dash').nth(0)).toHaveClass(/solved/);
  });

  test('инвертор собирается перетаскиванием элемента и проводов', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await drag(page, page.locator('.pal-sq').first(), await worldPoint(page, 440, 220));
    const gate = gates(page).first();
    const inPin = gate.locator('.pin .pin-hit').first();
    const outPin = gate.locator('.pin .pin-hit').last();
    await drag(page, page.locator('.input-node .pin-hit'), inPin);
    await drag(page, outPin, page.locator('.out-node .pin-hit'));
    await expect(wires(page)).toHaveCount(2);
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('.alert-success')).toContainText('Формула');
  });

  test('клик по проводу удаляет его, крестик на элементе — элемент', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await drag(page, page.locator('.pal-sq').first(), await worldPoint(page, 440, 220));
    const gate = gates(page).first();
    await drag(page, page.locator('.input-node .pin-hit'), gate.locator('.pin .pin-hit').first());
    await expect(wires(page)).toHaveCount(1);
    await wires(page).first().click({ force: true });
    await expect(wires(page)).toHaveCount(0);
    await gate.hover();
    await gate.locator('.gate-del').click();
    await expect(gates(page)).toHaveCount(0);
  });

  test('закрытый элемент помечен замком; щелчок по нему открывает подсказку со ссылкой', async ({
    page,
  }) => {
    await openExercise(page, 'simple-circuits', 'equals');
    const locked = page.locator('.pal-sq.locked');
    await expect(locked).toHaveCount(1);
    await locked.dispatchEvent('pointerdown', { button: 0 });
    const link = page.locator('.pop a.link');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/simple-circuits\/xor$/);
  });

  test('автоподстановка: пунктир при поднесении и провод после отпускания', async ({ page }) => {
    await seed(page, { 'processor-settings-v1': { autoWire: true } });
    await openExercise(page, 'simple-circuits', 'not');
    const item = page.locator('.pal-sq').first();
    const from = await center(item);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 200, { steps: 5 });
    await expect(page.locator('.wire-auto')).toHaveCount(0);
    // вход элемента рядом с тумблером A
    const near = await worldPoint(page, 148, 90);
    await page.mouse.move(near.x, near.y, { steps: 8 });
    await expect(page.locator('.wire-auto')).toHaveCount(1);
    await page.mouse.up();
    await expect(wires(page)).toHaveCount(1);
    await expect(page.locator('.wire-auto')).toHaveCount(0);
  });

  test('без включённой настройки автоподстановки провода не появляются', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await drag(page, page.locator('.pal-sq').first(), await worldPoint(page, 148, 90));
    await expect(gates(page)).toHaveCount(1);
    await expect(wires(page)).toHaveCount(0);
  });
});

test.describe('полный экран', () => {
  test('иконка разворачивает доску; справа внизу окошко с заданием и таблицей', async ({
    page,
  }) => {
    await openExercise(page, 'adders', 'half-adder');
    await page.locator('.fs-toggle').click();
    await expect(page.locator('.board-card.fullscreen')).toBeVisible();
    await expect(page.locator('.fs-task')).toBeVisible();
    await expect(page.locator('.fs-task app-truth-table')).toBeVisible();
    const box = (await page.locator('.fs-task').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
    expect(box.y + box.height).toBeGreaterThan(vp.height - 40);
    await page.keyboard.press('Escape');
    await expect(page.locator('.board-card.fullscreen')).toHaveCount(0);
  });

  test('перетаскиваемый элемент виден поверх доски на весь экран', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await page.locator('.fs-toggle').click();
    const from = await center(page.locator('.pal-sq').first());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(600, 400, { steps: 5 });
    const ghost = page.locator('.ghost');
    await expect(ghost).toBeVisible();
    const z = await page.evaluate(() => {
      const g = document.querySelector('.ghost') as HTMLElement;
      const c = document.querySelector('.board-card.fullscreen') as HTMLElement;
      return [+getComputedStyle(g).zIndex, +getComputedStyle(c).zIndex];
    });
    expect(z[0]).toBeGreaterThan(z[1]);
    await page.mouse.up();
  });
});

test.describe('раскладка и высота доски', () => {
  test('таблица справа от доски по умолчанию и снизу по переключателю', async ({ page }) => {
    await openExercise(page, 'adders', 'half-adder');
    const board = page.locator('.board-card');
    const table = page.locator('.work > .card:not(.board-card)');
    let b = (await board.boundingBox())!;
    let t = (await table.boundingBox())!;
    expect(t.x).toBeGreaterThan(b.x + b.width - 1); // справа
    await page.getByRole('button', { name: 'Таблица истинности под доской' }).click();
    b = (await board.boundingBox())!;
    t = (await table.boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(b.y + b.height - 1); // снизу
    // выбор запоминается
    await page.reload();
    await expect(page.locator('.work')).not.toHaveClass(/table-right/);
    await page.getByRole('button', { name: 'Таблица истинности справа от доски' }).click();
    await expect(page.locator('.work')).toHaveClass(/table-right/);
  });

  test('высота доски меняется ручкой, а масштаб и положение элементов — нет', async ({ page }) => {
    await openExercise(page, 'adders', 'half-adder');
    const tumbler = page.locator('.input-node').first();
    const svg = page.locator('.board-svg');
    const before = { tumbler: (await tumbler.boundingBox())!, svg: (await svg.boundingBox())! };
    await drag(page, page.locator('.resize-grip'), {
      x: (await center(page.locator('.resize-grip'))).x,
      y: (await center(page.locator('.resize-grip'))).y + 160,
    });
    const after = { tumbler: (await tumbler.boundingBox())!, svg: (await svg.boundingBox())! };
    expect(after.svg.height).toBeGreaterThan(before.svg.height + 100);
    expect(after.tumbler.width).toBeCloseTo(before.tumbler.width, 0);
    expect(after.tumbler.x).toBeCloseTo(before.tumbler.x, 0);
    // положение относительно верха доски — с точностью до пикселя (дробные размеры)
    expect(
      Math.abs(after.tumbler.y - after.svg.y - (before.tumbler.y - before.svg.y)),
    ).toBeLessThan(2);
    // двойной щелчок возвращает исходную высоту
    await page.locator('.resize-grip').dblclick();
    const reset = (await svg.boundingBox())!;
    expect(reset.height).toBeCloseTo(before.svg.height, 0);
  });
});
