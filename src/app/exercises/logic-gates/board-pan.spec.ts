import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BlockBoard } from './block-board';
import { CircuitView } from './circuit-view';
import { BlockDef, BlockLibrary } from './blocks';
import { CircuitLab } from './circuit-lab';
import { WORLD, ZOOM, clampWorld, dragPan, startPan, viewBoxOf, zoomAround } from './board-pan';
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

describe('масштаб: арифметика', () => {
  it('точка под курсором остаётся на месте при любом масштабе', () => {
    const base = 1;
    const anchor = { x: 300, y: 120 };
    const state = { pan: { x: 40, y: 10 }, zoom: 1 };
    const worldBefore = { x: anchor.x / (base * 1) + 40, y: anchor.y / (base * 1) + 10 };
    for (const factor of [1.25, 2, 0.5]) {
      const next = zoomAround(state, factor, anchor, base);
      const worldAfter = {
        x: anchor.x / (base * next.zoom) + next.pan.x,
        y: anchor.y / (base * next.zoom) + next.pan.y,
      };
      expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(1);
      expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(1);
    }
  });

  it('масштаб ограничен, а при упоре в предел ничего не двигается', () => {
    const top = zoomAround({ pan: { x: 5, y: 5 }, zoom: ZOOM.max }, 2, { x: 10, y: 10 }, 1);
    expect(top).toEqual({ pan: { x: 5, y: 5 }, zoom: ZOOM.max });
    const low = zoomAround({ pan: { x: 0, y: 0 }, zoom: 1 }, 0.001, { x: 0, y: 0 }, 1);
    expect(low.zoom).toBe(ZOOM.min);
  });

  it('окно доски: чем больше масштаб, тем меньше видимый кусок', () => {
    expect(viewBoxOf({ x: 10, y: 20 }, 1, 880, 440)).toBe('10 20 880 440');
    expect(viewBoxOf({ x: 0, y: 0 }, 2, 880, 440)).toBe('0 0 440 220');
    expect(viewBoxOf({ x: 0, y: 0 }, 0.5, 880, 440)).toBe('0 0 1760 880');
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
    const backBtn = () =>
      el.querySelector(
        'app-view-controls button[aria-label="Вернуть вид"]',
      ) as HTMLButtonElement | null;
    expect(backBtn()).toBeNull();

    svg.dispatchEvent(ev('pointerdown', { button: 1, clientX: 400, clientY: 200 }));
    document.dispatchEvent(ev('pointermove', { clientX: 340, clientY: 170 }));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('60 30 880 440');
    expect(svg.classList.contains('panning')).toBe(true);
    document.dispatchEvent(ev('pointerup', { button: 1 }));
    f.detectChanges();
    expect(svg.classList.contains('panning')).toBe(false);

    expect(backBtn()).not.toBeNull();
    backBtn()!.click();
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

  it('Ctrl + колесо и кнопки меняют масштаб; обычное колесо не трогает доску', () => {
    const { f, el, svg } = lab();
    // обычное колесо — это прокрутка страницы: масштаб не меняется
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');

    const wheel = new WheelEvent('wheel', {
      deltaY: -300,
      ctrlKey: true,
      clientX: 440,
      clientY: 220,
      bubbles: true,
      cancelable: true,
    });
    svg.dispatchEvent(wheel);
    f.detectChanges();
    expect(wheel.defaultPrevented).toBe(true);
    const zoomed = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(zoomed[2]).toBeLessThan(880); // приблизили — виден меньший кусок
    expect(el.querySelector('app-view-controls')!.textContent).toMatch(/\d+%/);

    const btn = (label: string) =>
      el.querySelector(`app-view-controls button[aria-label="${label}"]`) as HTMLButtonElement;
    for (let i = 0; i < 6; i++) btn('Уменьшить масштаб').click();
    f.detectChanges();
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeGreaterThan(880);

    btn('Вернуть вид').click();
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');
  });
});

describe('просмотр схемы: блоки раздвинуты и их можно переставлять', () => {
  const def = { id: 'b', title: 'Блок', ports: [], hint: '' } as unknown as BlockDef;
  const library = {
    defs: new Map([['b', def]]),
    def: () => def,
    solution: () => undefined,
    available: () => true,
    lockHint: () => '',
    lookup: () => undefined,
  } as unknown as BlockLibrary;

  function board(spread: number) {
    const f = TestBed.createComponent(BlockBoard);
    f.componentRef.setInput('iface', { inputs: [], outputs: [], ports: [] });
    f.componentRef.setInput('library', library);
    f.componentRef.setInput('readonly', true);
    f.componentRef.setInput('spread', spread);
    f.componentRef.setInput('instances', [
      { id: 'a', blockId: 'b', x: 150, y: 20 },
      { id: 'c', blockId: 'b', x: 346, y: 220 },
    ]);
    f.componentRef.setInput('busWires', []);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const pos = (id: string) => {
      const boxes = [...el.querySelectorAll('.bbox:not(.top)')];
      return boxes[id === 'a' ? 0 : 1].getAttribute('transform');
    };
    return { f, el, pos, svg: el.querySelector('svg.bb') as SVGSVGElement };
  }

  it('без раздвигания всё как в решении', () => {
    const { pos, svg } = board(1);
    expect(pos('a')).toBe('translate(150 20)');
    expect(pos('c')).toBe('translate(346 220)');
    expect(svg.getAttribute('viewBox')!.split(' ').slice(2, 3)).toEqual(['880']);
  });

  it('раздвигание растягивает расстояния между блоками и расширяет доску', () => {
    const { pos, svg } = board(2);
    expect(pos('a')).toBe('translate(150 20)'); // первый блок остаётся на месте
    expect(pos('c')).toBe('translate(542 420)'); // расстояния удвоились
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeGreaterThan(880);
  });

  it('блок можно перетащить (временно), «Вернуть вид» возвращает раскладку', () => {
    const { f, el, pos, svg } = board(1);
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 560, right: 880, bottom: 560 }) as DOMRect;
    const head = el.querySelectorAll('.bbox:not(.top) .bbox-head')[0] as Element;
    head.dispatchEvent(ev('pointerdown', { button: 0, clientX: 200, clientY: 30 }));
    document.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 130 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(pos('a')).toBe('translate(250 120)');
    const back = el.querySelector(
      'app-view-controls button[aria-label="Вернуть вид"]',
    ) as HTMLButtonElement;
    expect(back).not.toBeNull();
    back.click();
    f.detectChanges();
    expect(pos('a')).toBe('translate(150 20)');
  });
});

describe('колесо мыши над доской: когда оно масштабирует', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  const wheel = (init: WheelEventInit = {}): WheelEvent =>
    new WheelEvent('wheel', {
      deltaY: -200,
      clientX: 440,
      clientY: 220,
      bubbles: true,
      cancelable: true,
      ...init,
    });

  function lab() {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'and');
    f.detectChanges();
    const svg = (f.nativeElement as HTMLElement).querySelector('.board-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    return { f, svg };
  }

  it('пока на доску не нажали, колесо прокручивает страницу; после нажатия — масштабирует', () => {
    const { f, svg } = lab();
    const idle = wheel();
    svg.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');

    svg.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }));
    f.detectChanges();
    expect(svg.classList.contains('zoom-ready')).toBe(true);
    const active = wheel();
    svg.dispatchEvent(active);
    f.detectChanges();
    expect(active.defaultPrevented).toBe(true);
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeLessThan(880);

    // курсор ушёл с доски — снова обычная прокрутка
    svg.dispatchEvent(new MouseEvent('pointerleave'));
    f.detectChanges();
    expect(svg.classList.contains('zoom-ready')).toBe(false);
    const after = wheel();
    svg.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe('просмотр схемы из вентилей: раздвинуто, масштабируется, вентили переставляются', () => {
  const gates = [
    { id: 'a', type: 'AND' as const, x: 150, y: 20 },
    { id: 'b', type: 'NOT' as const, x: 500, y: 82 },
  ];
  const wires = [
    { id: 'w1', from: { node: 'A', pin: 'out' as const }, to: { node: 'a', pin: 'in0' as const } },
    { id: 'w2', from: { node: 'a', pin: 'out' as const }, to: { node: 'b', pin: 'in0' as const } },
    { id: 'w3', from: { node: 'b', pin: 'out' as const }, to: { node: 'Y', pin: 'in0' as const } },
  ];

  function view(spread: number) {
    const f = TestBed.createComponent(CircuitView);
    f.componentRef.setInput('gates', gates);
    f.componentRef.setInput('wires', wires);
    f.componentRef.setInput('iface', { inputs: ['A'], outputs: ['Y'], ports: [] });
    f.componentRef.setInput('spread', spread);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('svg.cv') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    const at = (id: string) =>
      el.querySelector(`.gate[data-id="${id}"]`)!.getAttribute('transform');
    return { f, el, svg, at };
  }

  it('без раздвигания всё как есть', () => {
    const { at, svg } = view(1);
    expect(at('a')).toBe('translate(150 20)');
    expect(at('b')).toBe('translate(500 82)');
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');
  });

  it('раздвигание растягивает расстояния, доска шире, колонка выходов уезжает вправо', () => {
    const { at, svg, el } = view(2);
    expect(at('a')).toBe('translate(150 20)');
    expect(at('b')).toBe('translate(850 144)');
    const w = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    expect(w).toBeGreaterThan(880);
    const out = el.querySelector('.node-box.out')!.parentElement!;
    expect(out.getAttribute('transform')).toBe(`translate(${w - 880} 0)`);
  });

  it('вентиль можно перетащить, «⌖» возвращает всё на место', () => {
    const { f, at, svg, el } = view(1);
    const g = el.querySelector('.gate[data-id="a"] .gate-body') as Element;
    g.dispatchEvent(ev('pointerdown', { button: 0, clientX: 160, clientY: 40 }));
    document.dispatchEvent(ev('pointermove', { clientX: 260, clientY: 90 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(at('a')).toBe('translate(250 70)');
    const back = el.querySelector(
      'app-view-controls button[aria-label="Вернуть вид"]',
    ) as HTMLButtonElement;
    expect(back).not.toBeNull();
    back.click();
    f.detectChanges();
    expect(at('a')).toBe('translate(150 20)');
    expect(svg.getAttribute('viewBox')).toBe('0 0 880 440');
  });

  it('колесо мыши двигает доску, Ctrl + колесо масштабирует', () => {
    const { f, svg } = view(1);
    svg.dispatchEvent(ev('pointerdown', { button: 1, clientX: 400, clientY: 200 }));
    document.dispatchEvent(ev('pointermove', { clientX: 350, clientY: 200 }));
    document.dispatchEvent(ev('pointerup', {}));
    f.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('50 0 880 440');
    const zoom = new WheelEvent('wheel', {
      deltaY: -300,
      ctrlKey: true,
      clientX: 300,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });
    svg.dispatchEvent(zoom);
    f.detectChanges();
    expect(zoom.defaultPrevented).toBe(true);
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeLessThan(880);
  });
});
