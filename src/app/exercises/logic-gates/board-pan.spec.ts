import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { WORLD, clampWorld, dragPan, startPan } from './board-pan';
import { SECTIONS } from '../../sections/sections';

const ev = (type: string, init: MouseEventInit): Event =>
  new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

describe('доска без границ: арифметика сдвига', () => {
  it('доска едет за рукой: потянули вправо и вниз — вид сдвинулся влево и вверх', () => {
    const start = startPan(ev('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent, 1, {
      x: 0,
      y: 0,
    });
    expect(
      dragPan(start, ev('pointermove', { clientX: 160, clientY: 130 }) as PointerEvent),
    ).toEqual({
      x: -60,
      y: -30,
    });
  });

  it('при масштабе 2 пикселя экрана — это половина единицы доски', () => {
    const start = startPan(ev('pointerdown', { clientX: 0, clientY: 0 }) as PointerEvent, 2, {
      x: 10,
      y: 10,
    });
    expect(
      dragPan(start, ev('pointermove', { clientX: -100, clientY: 0 }) as PointerEvent),
    ).toEqual({
      x: 60,
      y: 10,
    });
  });

  it('элементы нельзя унести за пределы «мира»', () => {
    const p = clampWorld({ x: 1e9, y: -1e9 }, 64, 48);
    expect(p).toEqual({ x: WORLD.maxX - 64, y: WORLD.minY });
    expect(clampWorld({ x: 120, y: 80 })).toEqual({ x: 120, y: 80 });
  });
});

describe('доска без границ: в упражнении', () => {
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
    // у доски в тестовом окружении нет размеров: пусть будет один пиксель на единицу
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    return { f, el, svg };
  }

  it('колесо мыши двигает доску, «Вернуть вид» возвращает', () => {
    const { f, el, svg } = lab();
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent!.includes('Вернуть вид')),
    ).toBe(false);

    svg.dispatchEvent(ev('pointerdown', { button: 1, clientX: 400, clientY: 200 }));
    document.dispatchEvent(ev('pointermove', { clientX: 340, clientY: 170 }));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('60 30 880 440');
    expect(svg.classList.contains('panning')).toBe(true);
    document.dispatchEvent(ev('pointerup', { button: 1 }));
    f.detectChanges();
    expect(svg.classList.contains('panning')).toBe(false);

    const back = [...el.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Вернуть вид'),
    )!;
    back.click();
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');
  });

  it('левая кнопка двигает доску только за пустое место, а колесо не мешает элементам', () => {
    const { f, el, svg } = lab();
    // нажатие на сам проводник/тумблер доску не двигает
    const input = el.querySelector('.input-node .node-click') as Element;
    input.dispatchEvent(ev('pointerdown', { button: 0, clientX: 100, clientY: 80 }));
    document.dispatchEvent(ev('pointermove', { clientX: 50, clientY: 50 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');

    // за пустое место — двигает
    const bg = el.querySelector('.board-bg') as Element;
    bg.dispatchEvent(ev('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    document.dispatchEvent(ev('pointermove', { clientX: 280, clientY: 300 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('20 0 880 440');
  });

  it('при смене упражнения вид возвращается', () => {
    const { f, svg } = lab();
    svg.dispatchEvent(ev('pointerdown', { button: 1, clientX: 400, clientY: 200 }));
    document.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 200 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('100 0 880 440');
    f.componentRef.setInput('startExercise', 'or');
    f.detectChanges();
    f.detectChanges();
    const svg2 = (f.nativeElement as HTMLElement).querySelector('.board-svg')!;
    expect(svg2.getAttribute('viewBox')).toBe('0 0 880 440');
  });
});
