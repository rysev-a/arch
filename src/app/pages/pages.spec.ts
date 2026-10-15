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

  it('страница главы: у каждого нерешённого упражнения своя кнопка, отмечает только его и без вопросов', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const asm = chapterBySlug('asm')!;
    localStorage.setItem(
      asm.storageKey,
      JSON.stringify({ codes: { upper: 'мой код' }, solved: ['upper'], current: 3 }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/asm', ChapterPage);
    const el = harness.routeNativeElement as HTMLElement;
    const marks = () =>
      [...el.querySelectorAll('.ex-item button')].filter((b) =>
        b.textContent!.includes('Отметить решённым'),
      ) as HTMLButtonElement[];
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    // на всю главу кнопки нет, на решённое упражнение — тоже
    expect(el.querySelector('.head-buttons button')).toBeNull();
    expect(marks().length).toBe(asm.exercises.length - 1);
    expect(marks()[0].title).toContain('потерял прогресс');

    marks()[1].click(); // отметить одно, не первое из нерешённых
    harness.detectChanges();
    expect(ask).not.toHaveBeenCalled();
    expect(el.textContent).toContain(`2 из ${asm.exercises.length} решено`);
    expect(marks().length).toBe(asm.exercises.length - 2);
    // свой код и текущее задание на месте
    const saved = JSON.parse(localStorage.getItem(asm.storageKey)!);
    expect(saved.codes).toEqual({ upper: 'мой код' });
    expect(saved.current).toBe(3);
    expect(saved.solved.length).toBe(2);
  });

  it('схемы: отметка одного упражнения открывает нужный блок и ничего лишнего', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const simple = chapterBySlug('simple-circuits')!;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/simple-circuits', ChapterPage);
    const el = harness.routeNativeElement as HTMLElement;
    const xorIdx = simple.exercises.findIndex((e) => e.id === 'xor');
    const row = () => el.querySelectorAll('.ex-item')[xorIdx] as HTMLElement;
    (row().querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(row().querySelector('button')).toBeNull();
    expect(row().textContent).toContain('решено');
    const saved = JSON.parse(localStorage.getItem(simple.storageKey)!);
    expect(saved.solved).toEqual([xorIdx]);
  });

  it('на главной кнопок «Отметить решённым» нет', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', ChaptersPage);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Отметить решённым');
  });
});
