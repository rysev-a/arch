import { expect, test } from '@playwright/test';
import { gates, openExercise, wires } from './helpers';

test.describe('режим авто и такт', () => {
  test('режим авто собирает решение по шагам и ведёт к следующему упражнению', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await page.getByRole('button', { name: /Режим авто/ }).click();
    const player = page.locator('app-guide-player');
    await expect(player).toBeVisible();
    // в начале доска чистая
    await expect(gates(page)).toHaveCount(0);

    // «Вперёд» до конца разбора: на доске появляется схема, упражнение решено
    const forward = player.locator('button.nav-btn').last();
    for (let i = 0; i < 12; i++) {
      if ((await forward.textContent())?.includes('Следующее упражнение')) break;
      await forward.click();
    }
    await expect(gates(page).first()).toBeVisible();
    await expect(wires(page).first()).toBeVisible();
    await expect(page.locator('app-success-alert')).toBeVisible();

    // на последнем шаге — переход к следующему упражнению, тоже в режиме авто
    await forward.click();
    await expect(page).not.toHaveURL(/\/not$/);
    await expect(page.locator('app-guide-player')).toBeVisible();
  });

  test('«Выйти» выключает режим авто; схема остаётся на доске', async ({ page }) => {
    await openExercise(page, 'simple-circuits', 'not');
    await page.getByRole('button', { name: /Режим авто/ }).click();
    const player = page.locator('app-guide-player');
    await player.getByRole('button', { name: /Вперёд/ }).click();
    await player.getByRole('button', { name: /Вперёд/ }).click();
    const placed = await gates(page).count();
    await player
      .getByRole('button', { name: /Выйти|Закрыть/ })
      .first()
      .click();
    await expect(player).toBeHidden();
    await expect(gates(page)).toHaveCount(placed);
  });

  test('такт: кнопка «Такт» даёт фронт и увеличивает счётчик', async ({ page }) => {
    await openExercise(page, 'registers', 'dff');
    await expect(page.getByText('тактов: 0')).toBeVisible();
    await page.getByRole('button', { name: /Такт/ }).first().click();
    await expect(page.getByText('тактов: 1')).toBeVisible();
    // пока идёт импульс, кнопка заблокирована; потом снова доступна
    await expect(page.getByRole('button', { name: /Такт/ }).first()).toBeEnabled({
      timeout: 3000,
    });
  });

  test('сценарий проверки: шаги отмечаются по мере выполнения', async ({ page }) => {
    await openExercise(page, 'latches', 'sr-nor');
    const steps = page.locator('app-check-panel .step-item');
    await expect(steps.first()).toHaveClass(/active/);
    expect(await steps.count()).toBeGreaterThan(2);
  });
});
