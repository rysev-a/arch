import { Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { EXTRA_PAGES, ROADMAP, SECTIONS } from '../sections/sections';
import { progressVersion, readProgress } from './progress';

type Status = 'solved' | 'current' | 'todo';

interface Item {
  id: string;
  title: string;
  status: Status;
}

interface Chapter {
  slug: string;
  title: string;
  /** какой query-параметр понимает страница, чтобы открыть упражнение */
  param: 'ex' | 'task';
  items: Item[];
  done: number;
  active: boolean;
}

/** Боковая панель: главы, а по клику на главу — упражнения с названиями и статусом */
@Component({
  selector: 'app-side-nav',
  imports: [RouterLink],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.css',
})
export class SideNav {
  private readonly router = inject(Router);
  protected readonly roadmap = ROADMAP;
  /** выбрано упражнение или страница — панель можно закрыть (на узком экране) */
  readonly navigated = output<void>();

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { requireSync: true },
  );

  protected readonly activeSlug = computed(() => this.url().split(/[/?#]/)[1] ?? '');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Открытая страница всегда раскрыта */
  private readonly openActive = effect(() => {
    const slug = this.activeSlug();
    untracked(() => this.expanded.update((s) => new Set(s).add(slug)));
  });

  protected readonly chapters = computed<Chapter[]>(() => {
    progressVersion();
    const active = this.activeSlug();
    const status = (solved: boolean, current: boolean, isActive: boolean): Status =>
      solved ? 'solved' : current && isActive ? 'current' : 'todo';

    const sections = SECTIONS.map((s): Chapter => {
      const p = readProgress(`processor-progress-v2-${s.progressKey}`);
      const isActive = s.slug === active;
      const items = s.exercises.map((e, i) => ({
        id: e.id,
        title: e.title,
        status: status(p.solved.has(i), p.current === i, isActive),
      }));
      return {
        slug: s.slug,
        title: s.title,
        param: 'ex',
        items,
        done: items.filter((x) => x.status === 'solved').length,
        active: isActive,
      };
    });
    const extras = EXTRA_PAGES.map((x): Chapter => {
      const p = readProgress(x.storageKey);
      const isActive = x.slug === active;
      const items = x.tasks.map((t, i) => ({
        id: t.id,
        title: t.title,
        status: status(p.solved.has(t.id), p.current === i, isActive),
      }));
      return {
        slug: x.slug,
        title: x.title,
        param: 'task',
        items,
        done: items.filter((i) => i.status === 'solved').length,
        active: isActive,
      };
    });
    return [...sections, ...extras];
  });

  protected isOpen(slug: string): boolean {
    return this.expanded().has(slug);
  }

  /** Клик по главе: раскрыть/свернуть; если открыта другая страница — перейти на неё */
  protected toggle(c: Chapter): void {
    if (!c.active) {
      this.expanded.update((s) => new Set(s).add(c.slug));
      void this.router.navigate(['/', c.slug]);
      this.navigated.emit();
      return;
    }
    this.expanded.update((s) => {
      const next = new Set(s);
      if (!next.delete(c.slug)) next.add(c.slug);
      return next;
    });
  }

  protected query(c: Chapter, id: string): Record<string, string> {
    return { [c.param]: id };
  }

  protected statusLabel(s: Status): string {
    return s === 'solved' ? 'решено' : s === 'current' ? 'сейчас открыто' : 'не решено';
  }
}
