import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CHAPTERS, Status, chapterProgress } from '../pages/chapters/chapters';
import { ROADMAP } from '../sections/sections';
import { progressVersion } from './progress';

interface Item {
  id: string;
  title: string;
  status: Status;
  open: boolean;
}

interface ChapterView {
  slug: string;
  title: string;
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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

  /** адрес вида /<глава>/<упражнение>?… */
  private readonly segments = computed(() =>
    this.url().split(/[?#]/)[0].split('/').filter(Boolean),
  );
  protected readonly activeSlug = computed(() => this.segments()[0] ?? '');
  private readonly openExercise = computed(() => this.segments()[1]);
  protected readonly onHome = computed(() => this.segments().length === 0);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Открытая глава всегда раскрыта */
  private readonly openActive = effect(() => {
    const slug = this.activeSlug();
    untracked(() => this.expanded.update((s) => new Set(s).add(slug)));
  });

  protected readonly chapters = computed<ChapterView[]>(() => {
    progressVersion();
    const active = this.activeSlug();
    const open = this.openExercise();
    return CHAPTERS.map((c) => {
      const isActive = c.slug === active;
      const p = chapterProgress(c, isActive ? open : undefined);
      // на странице главы (без упражнения) «текущее» не подсвечиваем
      const items =
        isActive && !open
          ? p.items.map((i) => ({
              ...i,
              status: i.status === 'current' ? ('todo' as Status) : i.status,
            }))
          : p.items;
      return { slug: c.slug, title: c.title, items, done: p.done, active: isActive };
    });
  });

  protected isOpen(slug: string): boolean {
    return this.expanded().has(slug);
  }

  /** Стрелка: раскрыть или свернуть список — всегда сразу, без перехода на другую страницу */
  protected toggleOpen(c: ChapterView, event?: Event): void {
    const opening = !this.expanded().has(c.slug);
    this.expanded.update((s) => {
      const next = new Set(s);
      if (!next.delete(c.slug)) next.add(c.slug);
      return next;
    });
    if (opening) {
      const chapter = (event?.target as HTMLElement | null)?.closest('.chapter');
      if (chapter) setTimeout(() => this.revealChapter(chapter), 240); // после раскрытия
    }
  }

  /** Если раскрытый список ушёл за нижний край панели — плавно докручиваем панель (а не страницу) */
  private revealChapter(chapter: Element): void {
    const panel = this.host.nativeElement.closest('.app-side') as HTMLElement | null;
    if (!panel) return;
    const c = chapter.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const hidden = c.bottom - (p.bottom - 12);
    if (hidden <= 0) return;
    // название главы должно остаться видимым
    const room = c.top - (p.top + 8);
    panel.scrollBy({ top: Math.min(hidden, Math.max(room, 0)), behavior: 'smooth' });
  }

  /** Название главы: открывается её страница, список при этом раскрыт */
  protected openChapter(c: ChapterView): void {
    this.expanded.update((s) => new Set(s).add(c.slug));
    this.navigated.emit();
  }

  protected statusLabel(s: Status): string {
    return s === 'solved' ? 'решено' : s === 'current' ? 'сейчас открыто' : 'не решено';
  }
}
