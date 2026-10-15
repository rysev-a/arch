import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // новая страница открывается сверху (плавно), а переход между страницами — мягкое перекрытие
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // первая страница показывается сразу, без перехода: он только задерживал бы загрузку
      withViewTransitions({
        skipInitialTransition: true,
        // если страница не отрисовывается (фоновая вкладка и т. п.), переход не должен задерживать
        // навигацию: через полсекунды его пропускаем, а страница открывается сразу
        onViewTransitionCreated: ({ transition }) => {
          const timer = setTimeout(() => transition.skipTransition(), 500);
          void transition.finished.finally(() => clearTimeout(timer)).catch(() => undefined);
        },
      }),
    ),
  ],
};
