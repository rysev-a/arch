import { expect, test } from '@playwright/test';
import { openExercise, seed, wires } from './helpers';

const solved = (n: number) => ({ solved: [...Array(n).keys()], current: 0 });

test.describe('прогресс и переходы', () => {
  test('раздел пройден: стрелка «вправо» мигает и ведёт в следующий раздел', async ({ page }) => {
    await seed(page, { 'processor-progress-v2-mux': solved(12) });
    await page.goto('/mux');
    await page.locator('.ex-row').last().click();
    const arrow = page.locator('.exercise-nav > button').last();
    await expect(arrow).toHaveClass(/nudge/);
    await expect(arrow).toBeEnabled();
    await arrow.click();
    await expect(page).toHaveURL(/\/latches\//);
  });

  test('пока раздел не пройден, на последнем упражнении стрелка неактивна', async ({ page }) => {
    await seed(page, { 'processor-progress-v2-mux': solved(11) });
    await page.goto('/mux');
    await page.locator('.ex-row').last().click();
    const arrow = page.locator('.exercise-nav > button').last();
    await expect(arrow).toBeDisabled();
    await expect(arrow).not.toHaveClass(/nudge/);
  });

  test('«Отметить решённым» на странице главы отмечает только выбранное упражнение', async ({
    page,
  }) => {
    await page.goto('/mux');
    await expect(page.getByText('0 из 12 решено')).toBeVisible();
    await page
      .locator('.ex-item')
      .nth(2)
      .getByRole('button', { name: 'Отметить решённым' })
      .click();
    await expect(page.getByText('1 из 12 решено')).toBeVisible();
    await expect(page.locator('.ex-item').nth(2).locator('.badge')).toContainText('решено');
    await expect(page.locator('.ex-item').nth(2).getByRole('button')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('1 из 12 решено')).toBeVisible();
  });

  test('отметка XOR на странице раздела открывает XOR в упражнении «Равенство»', async ({
    page,
  }) => {
    await page.goto('/simple-circuits');
    const xorRow = page.locator('.ex-item', { hasText: 'Исключающее ИЛИ' });
    await xorRow.getByRole('button', { name: 'Отметить решённым' }).click();
    await openExercise(page, 'simple-circuits', 'equals');
    await expect(page.locator('.pal-sq.locked')).toHaveCount(0);
  });

  test('решённое упражнение возвращается с сохранённой схемой', async ({ page }) => {
    await seed(page, {
      'processor-progress-v2-simple': { solved: [0], current: 0 },
      'processor-solution-v1-simple-wire': {
        gates: [],
        wires: [{ id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'Y', pin: 'in0' } }],
      },
    });
    await openExercise(page, 'simple-circuits', 'wire');
    await expect(wires(page)).toHaveCount(1);
    await expect(page.locator('.alert-success')).toBeVisible();
  });

  test('решённая схема сохраняется и возвращается после перезагрузки', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'wire');
    await page.locator('.input-node .pin-hit').click();
    await page.locator('.out-node .pin-hit').click();
    await expect(page.locator('.alert-success')).toBeVisible();
    await page.reload();
    await expect(wires(page)).toHaveCount(1);
    await expect(page.locator('.alert-success')).toBeVisible();
  });

  test('на главной нет кнопок «Отметить решённым»', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /От вентиля к процессору/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отметить решённым' })).toHaveCount(0);
  });
});

test.describe('подсказка', () => {
  test('кнопка «Подсказка» открывает окно рядом; закрывается крестиком, Esc и щелчком мимо', async ({
    page,
  }) => {
    await openExercise(page, 'simple-circuits', 'not');
    const open = page.getByRole('button', { name: 'Подсказка', exact: true });
    const pop = page.getByRole('dialog', { name: 'Подсказка' });
    await open.click();
    await expect(pop).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть подсказку' }).click();
    await expect(pop).toBeHidden();
    await open.click();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await open.click();
    await page.locator('.exercise-head-text').click();
    await expect(pop).toBeHidden();
  });
});
