# Processor

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Structure of the circuit exercises

`src/app/exercises/logic-gates/circuit-lab.*` is the page of one exercise: it owns the circuit state, simulation, progress and the blocks workspace. Everything else lives in `lab/`:

| File                                                                               | What it is                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `gate-board`                                                                       | the board with gates: dragging, wiring, auto-wire, pan/zoom, height |
| `gate-palette`, `board-tools`                                                      | element palette and the clear / fullscreen icons                    |
| `exercise-card`, `check-panel`, `success-alert`, `wave-diagram`, `fullscreen-task` | cards around the board                                              |
| `gate-guide`                                                                       | the "auto mode" walkthrough controller                              |
| `clock-controller`                                                                 | the CLK pulse button and generator                                  |
| `exercise-progress`                                                                | progress in `localStorage` and which gates are unlocked             |

Exercise data is checked by `exercise-texts.spec.ts` (signal names in texts must match the labels on the board).

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

End-to-end tests run in a real browser with [Playwright](https://playwright.dev/) (`e2e/`). Install the browser once, then run the tests (the dev server on port 4300 starts by itself):

```bash
npx playwright install chromium
npm run e2e        # headless
npm run e2e:ui     # interactive UI mode
```

Unit tests: use `npm run test:fresh` (it runs on a clean copy and avoids stale-cache failures of plain `ng test`).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Публикация на GitHub Pages

Сайт собирается и выкладывается автоматически (`.github/workflows/deploy.yml`) при каждом пуше в `main`:
тесты → `ng build --base-href /<репозиторий>/` → копия `index.html` в `404.html` (чтобы работали
прямые ссылки вида `/mux/mux4`) → выкладка.

Один раз нужно включить Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Адрес сайта: `https://<пользователь>.github.io/<репозиторий>/`. Для бесплатного аккаунта репозиторий
должен быть публичным.

Прогресс учеников хранится только в `localStorage` их браузера — сервера и учётных записей нет.
