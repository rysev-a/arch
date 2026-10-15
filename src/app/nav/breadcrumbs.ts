import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { chapterBySlug } from '../pages/chapters/chapters';

/** «Все главы › Глава › Упражнение»: путь до открытой страницы, каждая часть — ссылка */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  template: `
    @if (crumbs(); as c) {
      <nav class="crumbs" aria-label="Путь">
        <a routerLink="/">Все главы</a>
        <span class="sep" aria-hidden="true">›</span>
        @if (c.exercise) {
          <a [routerLink]="['/', c.chapter.slug]">{{ c.chapter.title }}</a>
          <span class="sep" aria-hidden="true">›</span>
          <span class="here" aria-current="page">{{ c.exercise }}</span>
        } @else {
          <span class="here" aria-current="page">{{ c.chapter.title }}</span>
        }
      </nav>
    }
  `,
  styles: `
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.375rem;
      margin-bottom: 1rem;
      font-size: 0.8125rem;
      color: hsl(var(--muted-foreground));
    }
    .crumbs a {
      color: inherit;
      text-decoration: none;
    }
    .crumbs a:hover {
      color: hsl(var(--foreground));
      text-decoration: underline;
    }
    .here {
      color: hsl(var(--foreground));
      font-weight: 600;
    }
    .sep {
      opacity: 0.5;
    }
  `,
})
export class Breadcrumbs {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { requireSync: true },
  );

  protected readonly crumbs = computed(() => {
    const [slug, id] = this.url().split(/[?#]/)[0].split('/').filter(Boolean);
    const chapter = slug ? chapterBySlug(slug) : undefined;
    if (!chapter) return null;
    const exercise = id ? chapter.exercises.find((e) => e.id === id)?.title : undefined;
    return { chapter, exercise };
  });
}
