import { expect, test } from '@playwright/test';

test.describe('шапка, справка и настройки', () => {
  test('левое меню прячется кнопкой и возвращается; выбор запоминается', async ({ page }) => {
    await page.goto('/');
    const side = page.locator('.app-side');
    await expect(side).toBeVisible();
    await page.getByRole('button', { name: 'Скрыть левое меню' }).click();
    await expect(side).toBeHidden();
    await page.reload();
    await expect(side).toBeHidden();
    await page.getByRole('button', { name: 'Показать левое меню' }).click();
    await expect(side).toBeVisible();
  });

  test('справка: две вкладки, слайды один под другим', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Как работать с проектом' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.locator('.stage')).toHaveCount(8);
    await page.getByRole('tab', { name: /С ассемблером и процессорами/ }).click();
    await expect(page.locator('.stage')).toHaveCount(7);
    await expect(page.getByRole('heading', { name: 'Машинный код' })).toBeVisible();
  });

  test('настройки: автоподстановка с ползунком радиуса, сохраняются после перезагрузки', async ({
    page,
  }) => {
    await page.goto('/settings');
    const sw = page.getByRole('switch', { name: 'Автоподстановка связей' });
    await expect(page.locator('input[type=range]')).toHaveCount(0);
    await sw.click();
    await expect(page.locator('input[type=range]')).toHaveCount(1);
    await page.locator('input[type=range]').fill('80');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Автоподстановка связей' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('input[type=range]')).toHaveValue('80');
  });

  test('настройки: переключатель «Всегда показывать анимации» включает класс на странице', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByRole('switch', { name: 'Всегда показывать анимации' }).click();
    await expect(page.locator('html')).toHaveClass(/force-motion/);
  });

  test('тема переключается и запоминается', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const was = (await html.getAttribute('class'))?.includes('dark');
    await page.getByRole('button', { name: /Включить (светлую|тёмную) тему/ }).click();
    await expect(html).toHaveClass(was ? /light/ : /dark/);
    await page.reload();
    await expect(html).toHaveClass(was ? /light/ : /dark/);
  });
});

test.describe('ассемблер', () => {
  test('решение задания «Поменять один байт» засчитывается', async ({ page }) => {
    await page.goto('/asm/patch-byte');
    const editor = page.getByLabel('Текст программы на ассемблере');
    await editor.fill("li r1, 'J'\nli r2, 0x10\nsb r1, 0(r2)\nhlt\n");
    await page.getByRole('button', { name: 'Выполнить' }).click();
    await expect(page.getByText('Задание выполнено!', { exact: true })).toBeVisible();
    await expect(page.locator('app-dash-progress .dash').first()).toHaveClass(/solved/);
  });

  test('неверная программа не засчитывается', async ({ page }) => {
    await page.goto('/asm/patch-byte');
    await page.getByLabel('Текст программы на ассемблере').fill('hlt\n');
    await page.getByRole('button', { name: 'Выполнить' }).click();
    await expect(page.getByText('Пока не то')).toBeVisible();
  });
});
