import { Routes } from '@angular/router';
import { SECTIONS } from './sections/sections';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: SECTIONS[0].slug },
  ...SECTIONS.map((s) => ({
    path: s.slug,
    loadComponent: () => import('./sections/section.page').then((m) => m.SectionPage),
    data: { slug: s.slug },
    title: `${s.title} — Как работает процессор`,
  })),
  {
    path: 'asm',
    loadComponent: () => import('./asm/asm-lab').then((m) => m.AsmLab),
    title: 'Ассемблер — Как работает процессор',
  },
  // раздел «Мультиплексоры и защёлки» разделился на два
  { path: 'mux-latches', redirectTo: 'mux' },
  { path: '**', redirectTo: SECTIONS[0].slug },
];
