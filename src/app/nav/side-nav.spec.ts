import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { SideNav } from './side-nav';
import { CHAPTERS } from '../pages/chapters/chapters';
import { SECTIONS } from '../sections/sections';
import { touchProgress } from './progress';

function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  const fixture = TestBed.createComponent(SideNav);
  fixture.detectChanges();
  return fixture;
}

describe('боковая панель', () => {
  beforeEach(() => localStorage.clear());

  it('показывает все главы и страницы со счётом решённого', () => {
    const el = render().nativeElement as HTMLElement;
    const buttons = el.querySelectorAll('.chapter-btn');
    expect(buttons.length).toBe(CHAPTERS.length);
    expect(el.querySelector('.count')!.textContent!.trim()).toBe(
      `0/${SECTIONS[0].exercises.length}`,
    );
  });

  it('клик по главе раскрывает упражнения с названиями и статусом', async () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.ex-wrap.open .ex').length).toBe(0);
    // сохранённый прогресс: решено первое упражнение раздела «Мультиплексоры»
    localStorage.setItem(
      `processor-progress-v2-${SECTIONS[1].progressKey}`,
      JSON.stringify({ solved: [0], current: 1 }),
    );
    touchProgress();
    f.detectChanges();
    (el.querySelectorAll('.chevron-btn')[1] as HTMLButtonElement).click();
    await f.whenStable();
    f.detectChanges();
    const items = [...el.querySelectorAll('.ex-wrap.open .ex')];
    expect(items.length).toBe(SECTIONS[1].exercises.length);
    expect(items[0].textContent).toContain(SECTIONS[1].exercises[0].title);
    expect(items[0].querySelector('.status')!.classList.contains('solved')).toBe(true);
    // глава не открыта на экране: второе упражнение помечено как «текущее» по сохранению
    expect(items[1].querySelector('.status')!.classList.contains('current')).toBe(true);
    expect(items[2].querySelector('.status')!.classList.contains('todo')).toBe(true);
    expect(el.querySelectorAll('.count')[1].textContent!.trim()).toBe(
      `1/${SECTIONS[1].exercises.length}`,
    );
  });

  it('прогресс заданий ассемблера читается по id', () => {
    const f = render();
    const idx = CHAPTERS.findIndex((c) => c.slug === 'asm');
    const a = CHAPTERS[idx];
    localStorage.setItem(a.storageKey, JSON.stringify({ solved: [a.exercises[0].id], current: 0 }));
    touchProgress();
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelectorAll('.count')[idx].textContent!.trim(),
    ).toBe(`1/${a.exercises.length}`);
  });

  it('у каждого упражнения своя ссылка: /<глава>/<упражнение>', async () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    (el.querySelectorAll('.chevron-btn')[0] as HTMLButtonElement).click();
    await f.whenStable();
    f.detectChanges();
    const first = el.querySelector('.ex-wrap.open .ex') as HTMLAnchorElement;
    expect(first.getAttribute('href')).toBe(`/${SECTIONS[0].slug}/${SECTIONS[0].exercises[0].id}`);
  });

  it('стрелка раскрывает и сворачивает сразу, ничего не открывая; название — открывает страницу главы', async () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const arrow = el.querySelectorAll('.chevron-btn')[3] as HTMLButtonElement;
    const wrap = () => el.querySelectorAll('.ex-wrap')[3];

    arrow.click();
    f.detectChanges();
    expect(wrap().classList.contains('open')).toBe(true);
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    arrow.click();
    f.detectChanges();
    expect(wrap().classList.contains('open')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    // название главы — обычная ссылка на её страницу, и список при этом раскрыт
    const title = el.querySelectorAll('.chapter-title')[3] as HTMLAnchorElement;
    expect(title.getAttribute('href')).toBe(`/${CHAPTERS[3].slug}`);
    title.click();
    f.detectChanges();
    expect(wrap().classList.contains('open')).toBe(true);
  });
});
