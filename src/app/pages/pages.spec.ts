import { vi } from 'vitest';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { ConfirmService } from '../ui/confirm.service';
import { CHAPTERS, chapterBySlug, chapterProgress } from './chapters/chapters';
import { ChaptersPage } from './chapters/chapters.page';
import { ChapterPage } from './chapter/chapter.page';

async function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  return { router, location };
}

describe('маршруты: ссылки на главы и упражнения', () => {
  beforeEach(() => localStorage.clear());

  it('в каждой главе есть упражнения, id уникальны', () => {
    for (const c of CHAPTERS) {
      expect(c.exercises.length, c.slug).toBeGreaterThan(0);
      expect(new Set(c.exercises.map((e) => e.id)).size, c.slug).toBe(c.exercises.length);
    }
    expect(new Set(CHAPTERS.map((c) => c.slug)).size).toBe(CHAPTERS.length);
  });

  it('главная, глава и упражнение открываются по своим адресам', async () => {
    const { router, location } = await setup();
    for (const url of ['/', '/mux', '/mux/' + chapterBySlug('mux')!.exercises[2].id]) {
      expect(await router.navigateByUrl(url), url).toBe(true);
      expect(location.path() || '/', url).toBe(url);
    }
    for (const slug of ['asm', 'riscv', 'real']) {
      const id = chapterBySlug(slug)!.exercises[1].id;
      expect(await router.navigateByUrl(`/${slug}/${id}`), slug).toBe(true);
      expect(location.path()).toBe(`/${slug}/${id}`);
    }
  });

  it('несуществующее упражнение уводит на страницу главы, а несуществующая глава — на главную', async () => {
    const { router, location } = await setup();
    await router.navigateByUrl('/mux/нет-такого');
    expect(location.path()).toBe('/mux');
    await router.navigateByUrl('/нет-такой-главы');
    expect(location.path()).toBe('');
  });

  it('старая ссылка раздела «Мультиплексоры и защёлки» ведёт на /mux', async () => {
    const { router, location } = await setup();
    await router.navigateByUrl('/mux-latches');
    expect(location.path()).toBe('/mux');
  });
});

describe('страницы глав', () => {
  beforeEach(() => localStorage.clear());

  it('главная показывает все главы со ссылками', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const f = TestBed.createComponent(ChaptersPage);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.chapter-card').length).toBe(CHAPTERS.length);
    const hrefs = [...el.querySelectorAll('a.chapter-link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(CHAPTERS.map((c) => `/${c.slug}`));
  });

  it('страница главы: упражнения со статусами и ссылками', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const mux = chapterBySlug('mux')!;
    localStorage.setItem(mux.storageKey, JSON.stringify({ solved: [0, 1], current: 2 }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/mux', ChapterPage);
    const el = harness.routeNativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.ex-row')];
    expect(rows.length).toBe(mux.exercises.length);
    expect(rows[0].getAttribute('href')).toBe(`/mux/${mux.exercises[0].id}`);
    expect(rows[0].querySelector('.badge')!.classList.contains('st-solved')).toBe(true);
    expect(rows[2].querySelector('.badge')!.classList.contains('st-current')).toBe(true);
    expect(rows[3].querySelector('.badge')!.classList.contains('st-todo')).toBe(true);
    expect(el.textContent).toContain(`2 из ${mux.exercises.length} решено`);
  });

  it('прогресс главы: «продолжить» ведёт на первое нерешённое', () => {
    const mux = chapterBySlug('mux')!;
    localStorage.setItem(mux.storageKey, JSON.stringify({ solved: [0, 1, 2], current: 2 }));
    expect(chapterProgress(mux).resume).toBe(3);
    localStorage.setItem(mux.storageKey, JSON.stringify({ solved: [0], current: 4 }));
    expect(chapterProgress(mux).resume).toBe(4);
  });

  it('страница главы: «Отметить решённым» засчитывает всю главу сразу, без вопросов', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const asm = chapterBySlug('asm')!;
    localStorage.setItem(
      asm.storageKey,
      JSON.stringify({ codes: { upper: 'мой код' }, solved: ['upper'], current: 3 }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/asm', ChapterPage);
    const el = harness.routeNativeElement as HTMLElement;
    const btn = () =>
      [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Отметить решённым'));
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    expect(btn()!.title).toContain('потерял прогресс');
    btn()!.click();
    harness.detectChanges();
    expect(ask).not.toHaveBeenCalled();
    expect(el.textContent).toContain(`${asm.exercises.length} из ${asm.exercises.length} решено`);
    expect(btn()).toBeUndefined();
    // свой код и текущее задание на месте
    const saved = JSON.parse(localStorage.getItem(asm.storageKey)!);
    expect(saved.codes).toEqual({ upper: 'мой код' });
    expect(saved.current).toBe(3);
    expect(saved.solved.length).toBe(asm.exercises.length);
  });

  it('на главной у каждой главы есть «Отметить решённым» — без модального окна', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', ChaptersPage);
    const el = harness.routeNativeElement as HTMLElement;
    const buttons = () =>
      [...el.querySelectorAll('.chapter-card button')].filter((b) =>
        b.textContent!.includes('Отметить решённым'),
      ) as HTMLButtonElement[];
    expect(buttons().length).toBe(CHAPTERS.length);
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    const simple = chapterBySlug('simple-circuits')!;
    const idx = CHAPTERS.findIndex((c) => c.slug === 'simple-circuits');
    buttons()[idx].click();
    harness.detectChanges();
    expect(ask).not.toHaveBeenCalled();
    const card = el.querySelectorAll('.chapter-card')[idx] as HTMLElement;
    expect(card.textContent).toContain(
      `${simple.exercises.length} из ${simple.exercises.length} решено`,
    );
    expect(buttons().length).toBe(CHAPTERS.length - 1);
  });
});
