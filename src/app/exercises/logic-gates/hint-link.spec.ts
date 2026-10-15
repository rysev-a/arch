import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';

describe('подсказка со ссылкой на упражнение, где открывается закрытый элемент', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab(exercise: string) {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', exercise);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  const openHint = (f: ReturnType<typeof lab>['f'], el: HTMLElement) => {
    (el.querySelector('app-hint-popover > button') as HTMLButtonElement).click();
    f.detectChanges();
  };

  it('в «Равенстве» закрыт XNOR — подсказка ведёт к упражнению «Исключающее ИЛИ»', () => {
    const { f, el } = lab('equals');
    openHint(f, el);
    const link = el.querySelector('.pop a.link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/simple-circuits/xor');
    expect(link.textContent).toContain('Исключающее ИЛИ');
    expect(el.querySelector('.pop')!.textContent).toContain('XNOR');
  });

  it('щелчок по закрытому элементу сам открывает подсказку со ссылкой', () => {
    const { f, el } = lab('equals');
    const locked = el.querySelector('.pal-sq.locked') as HTMLElement;
    expect(locked).not.toBeNull();
    locked.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    f.detectChanges();
    expect(el.querySelector('.pop a.link')).not.toBeNull();
  });

  it('когда всё открыто, ссылок нет', () => {
    localStorage.setItem(
      'processor-progress-v2-simple',
      JSON.stringify({
        solved: SECTIONS.find((s) => s.slug === 'simple-circuits')!.exercises.map((_, i) => i),
        current: 0,
      }),
    );
    const { f, el } = lab('equals');
    openHint(f, el);
    expect(el.querySelector('.pop a.link')).toBeNull();
  });
});
