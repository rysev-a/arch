import { defineConfig, devices } from '@playwright/test';

/**
 * Сквозные тесты в настоящем браузере: перетаскивание, провода, полный экран, раскладка.
 * Запуск: `npm run e2e` (сервер разработки поднимается сам; уже запущенный на порту 4300 используется повторно).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
    // анимации в тестах не нужны, но и «уменьшить движение» у нас не должно ломать работу
    reducedMotion: 'no-preference',
    locale: 'ru-RU',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
