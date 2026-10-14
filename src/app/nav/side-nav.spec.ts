import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SideNav } from './side-nav';
import { EXTRA_PAGES, SECTIONS } from '../sections/sections';
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
    expect(buttons.length).toBe(SECTIONS.length + EXTRA_PAGES.length);
    expect(el.querySelector('.count')!.textContent!.trim()).toBe(
      `0/${SECTIONS[0].exercises.length}`,
    );
  });

  it('клик по главе раскрывает упражнения с названиями и статусом', async () => {
    const f = render();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.ex').length).toBe(0);
    // сохранённый прогресс: решено первое упражнение раздела «Мультиплексоры»
    localStorage.setItem(
      `processor-progress-v2-${SECTIONS[1].progressKey}`,
      JSON.stringify({ solved: [0], current: 1 }),
    );
    touchProgress();
    f.detectChanges();
    (el.querySelectorAll('.chapter-btn')[1] as HTMLButtonElement).click();
    await f.whenStable();
    f.detectChanges();
    const items = [...el.querySelectorAll('.ex')];
    expect(items.length).toBe(SECTIONS[1].exercises.length);
    expect(items[0].textContent).toContain(SECTIONS[1].exercises[0].title);
    expect(items[0].querySelector('.status')!.classList.contains('solved')).toBe(true);
    // после перехода глава активна, и второе упражнение — «сейчас открытое»
    expect(items[1].querySelector('.status')!.classList.contains('current')).toBe(true);
    expect(items[2].querySelector('.status')!.classList.contains('todo')).toBe(true);
    expect(el.querySelectorAll('.count')[1].textContent!.trim()).toBe(
      `1/${SECTIONS[1].exercises.length}`,
    );
  });

  it('прогресс заданий ассемблера читается по id', () => {
    const f = render();
    const a = EXTRA_PAGES[0];
    localStorage.setItem(a.storageKey, JSON.stringify({ solved: [a.tasks[0].id], current: 0 }));
    touchProgress();
    f.detectChanges();
    const idx = SECTIONS.length;
    expect(
      (f.nativeElement as HTMLElement).querySelectorAll('.count')[idx].textContent!.trim(),
    ).toBe(`1/${a.tasks.length}`);
  });
});
