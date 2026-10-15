import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    // на странице главы (упражнение не открыто) «текущего» нет
    expect(items[1].querySelector('.status')!.classList.contains('todo')).toBe(true);
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
    (el.querySelectorAll('.chapter-btn')[0] as HTMLButtonElement).click();
    await f.whenStable();
    f.detectChanges();
    const first = el.querySelector('.ex') as HTMLAnchorElement;
    expect(first.getAttribute('href')).toBe(`/${SECTIONS[0].slug}/${SECTIONS[0].exercises[0].id}`);
  });
});
