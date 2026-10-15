import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, ResolveFn, Router, Routes } from '@angular/router';
import { CHAPTERS, Chapter, chapterBySlug } from './pages/chapters/chapters';

const TITLE = 'Как работает процессор';

/** Адрес вида /глава/упражнение открывается только для существующего упражнения */
const exerciseExists: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const chapter = chapterBySlug(route.data['slug']);
  const id = route.paramMap.get('exercise');
  if (chapter?.exercises.some((e) => e.id === id)) return true;
  return inject(Router).createUrlTree(['/', chapter?.slug ?? '']);
};

const exerciseTitle: ResolveFn<string> = (route) => {
  const chapter = chapterBySlug(route.data['slug']);
  const ex = chapter?.exercises.find((e) => e.id === route.paramMap.get('exercise'));
  return `${ex?.title ?? ''} — ${chapter?.title ?? ''} — ${TITLE}`;
};

/** Страница, которая показывает упражнения главы этого типа */
const exercisePage = (c: Chapter) => {
  switch (c.kind) {
    case 'circuit':
      return () =>
        import('./pages/exercise/circuit-exercise.page').then((m) => m.CircuitExercisePage);
    case 'asm':
      return () => import('./asm/asm-lab').then((m) => m.AsmLab);
    default:
      return () => import('./riscv/rv-lab').then((m) => m.RvLab);
  }
};

const chapterRoutes: Routes = CHAPTERS.map((c) => ({
  path: c.slug,
  children: [
    {
      path: '',
      pathMatch: 'full',
      loadComponent: () => import('./pages/chapter/chapter.page').then((m) => m.ChapterPage),
      data: { slug: c.slug },
      title: `${c.title} — ${TITLE}`,
    },
    {
      path: ':exercise',
      loadComponent: exercisePage(c),
      canActivate: [exerciseExists],
      // слаг главы лежит в данных маршрута: путь главы статический, параметра у него нет
      data: { slug: c.slug, mode: c.kind === 'real' ? 'real' : undefined },
      title: exerciseTitle,
    },
  ],
}));

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/chapters/chapters.page').then((m) => m.ChaptersPage),
    title: TITLE,
  },
  ...chapterRoutes,
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
    title: `Настройки — ${TITLE}`,
  },
  // раздел «Мультиплексоры и защёлки» разделился на два
  { path: 'mux-latches', redirectTo: 'mux' },
  { path: '**', redirectTo: '' },
];
