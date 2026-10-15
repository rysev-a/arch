import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';
import { SettingsService } from '../../settings/settings.service';

describe('положение таблицы истинности и высота доски', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab() {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'and');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('.board-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    return { f, el, svg };
  }

  it('по умолчанию таблица справа от доски; кнопки раскладки переключают и запоминают', () => {
    const { f, el } = lab();
    const work = el.querySelector('.work') as HTMLElement;
    const [bottom, right] = [...el.querySelectorAll('.lay-btn')] as HTMLButtonElement[];
    expect(work.classList.contains('table-right')).toBe(true);
    expect(right.getAttribute('aria-pressed')).toBe('true');

    bottom.click();
    f.detectChanges();
    TestBed.tick();
    expect(work.classList.contains('table-right')).toBe(false);
    expect(bottom.getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem('processor-settings-v1')!).tableLayout).toBe('bottom');

    right.click();
    f.detectChanges();
    expect(work.classList.contains('table-right')).toBe(true);
  });

  it('в обеих раскладках таблица стоит в одном контейнере с доской', () => {
    const { el } = lab();
    const work = el.querySelector('.work')!;
    expect(work.querySelector('.board-card')).not.toBeNull();
    expect(work.querySelector('app-truth-table')).not.toBeNull();
  });

  it('высоту доски можно тянуть за ручку под ней; двойной щелчок возвращает как было', () => {
    const { f, el, svg } = lab();
    const grip = el.querySelector('.resize-grip') as HTMLElement;
    expect(grip).not.toBeNull();
    expect(svg.style.height).toBe('');

    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 500 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientY: 600 }));
    f.detectChanges();
    expect(svg.style.height).toBe('540px'); // 440 + 100
    document.dispatchEvent(new PointerEvent('pointerup'));

    // после отпускания доска за мышью не едет
    document.dispatchEvent(new PointerEvent('pointermove', { clientY: 900 }));
    f.detectChanges();
    expect(svg.style.height).toBe('540px');
    expect(TestBed.inject(SettingsService).boardHeight()).toBe(540);

    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();
    expect(svg.style.height).toBe('');
  });

  it('высота ограничена, а стрелки на ручке тоже меняют её', () => {
    const { f, el, svg } = lab();
    const grip = el.querySelector('.resize-grip') as HTMLElement;
    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 500 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientY: -5000 }));
    f.detectChanges();
    expect(svg.style.height).toBe('220px');
    document.dispatchEvent(new PointerEvent('pointerup'));

    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 220, right: 880, bottom: 220 }) as DOMRect;
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    f.detectChanges();
    expect(svg.style.height).toBe('244px');
  });

  it('во весь экран ручки нет, а размер доски определяет экран', () => {
    const { f, el, svg } = lab();
    (el.querySelector('.resize-grip') as HTMLElement).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientY: 500 }),
    );
    document.dispatchEvent(new PointerEvent('pointermove', { clientY: 600 }));
    document.dispatchEvent(new PointerEvent('pointerup'));
    f.detectChanges();
    expect(svg.style.height).toBe('540px');
    (el.querySelector('.fs-toggle') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelector('.resize-grip')).toBeNull();
    expect((el.querySelector('.board-svg') as SVGSVGElement).style.height).toBe('');
  });

  it('высота «как есть»: масштаб не меняется, доска лишь открывает больше или меньше поля', () => {
    // заглушка ResizeObserver: сообщает ширину сразу после подключения
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private cb: () => void) {}
      observe() {
        this.cb();
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const f = TestBed.createComponent(CircuitLab);
      f.componentRef.setInput(
        'section',
        SECTIONS.find((s) => s.slug === 'simple-circuits'),
      );
      f.componentRef.setInput('startExercise', 'and');
      const el = f.nativeElement as HTMLElement;
      // до первой отрисовки подменяем размеры доски: 880 по ширине
      const proto = SVGElement.prototype as unknown as { getBoundingClientRect: () => DOMRect };
      const realRect = proto.getBoundingClientRect;
      proto.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
      try {
        f.detectChanges();
        TestBed.tick();
        f.detectChanges();
        const svg = el.querySelector('.board-svg') as SVGSVGElement;
        expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');

        const grip = el.querySelector('.resize-grip') as HTMLElement;
        grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 500 }));
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: 700 })); // +200
        document.dispatchEvent(new PointerEvent('pointerup'));
        f.detectChanges();
        // ширина та же (880 px = 880 единиц), а видимой «земли» стало больше: 640 вместо 440
        expect(svg.getAttribute('viewBox')).toBe('0 0 880 640');

        grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 500 }));
        document.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 })); // −200 от 640
        document.dispatchEvent(new PointerEvent('pointerup'));
        f.detectChanges();
        expect(svg.getAttribute('viewBox')).toBe('0 0 880 240');
      } finally {
        proto.getBoundingClientRect = realRect;
      }
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
