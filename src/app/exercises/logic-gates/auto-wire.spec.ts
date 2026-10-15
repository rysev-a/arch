import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { suggestWires } from './auto-wire';
import { CircuitLab } from './circuit-lab';
import { GateInstance, OUT_PIN_X, Wire, inputYs, outputYs } from './circuit.model';
import { SettingsService } from '../../settings/settings.service';
import { SECTIONS } from '../../sections/sections';

const inputYMap = inputYs(['A']); // A: (100, 80)
const outputYMap = outputYs(['Y']); // Y: (780, 200)

function ask(gate: GateInstance, gates: GateInstance[] = [], wires: Wire[] = [], steps = false) {
  return suggestWires({ gate, gates, wires, inputYMap, outputYMap, stepsMode: steps });
}

describe('автоподстановка связей: что предлагается', () => {
  it('вход элемента рядом с тумблером A — предлагается провод A → вход', () => {
    const got = ask({ id: 'g1', type: 'NOT', x: 130, y: 66 });
    expect(got.map((w) => [w.from, w.to])).toEqual([
      [
        { node: 'A', pin: 'out' },
        { node: 'g1', pin: 'in0' },
      ],
    ]);
  });

  it('выход элемента рядом с выходом схемы Y — предлагается провод выход → Y', () => {
    const got = ask({ id: 'g1', type: 'NOT', x: 760 - OUT_PIN_X.NOT, y: 176 });
    expect(got.map((w) => [w.from, w.to])).toEqual([
      [
        { node: 'g1', pin: 'out' },
        { node: 'Y', pin: 'in0' },
      ],
    ]);
  });

  it('элемент между двумя другими соединяется с обоими', () => {
    const left: GateInstance = { id: 'l', type: 'NOT', x: 200, y: 150 };
    const right: GateInstance = { id: 'r', type: 'NOT', x: 405, y: 150 };
    const mid: GateInstance = { id: 'm', type: 'NOT', x: 290, y: 150 };
    // выход левого (264, 174) рядом со входом среднего (282, 164), выход среднего (354, 174) — со входом правого (397, 164)
    const got = ask(mid, [left, right]);
    const pairs = got.map((w) => `${w.from.node}.${w.from.pin}>${w.to.node}.${w.to.pin}`);
    expect(pairs).toContain('l.out>m.in0');
    expect(pairs).toContain('m.out>r.in0');
  });

  it('появившаяся связь больше не исчезает, как бы далеко ни унесли элемент', () => {
    const near = ask({ id: 'g1', type: 'NOT', x: 130, y: 66 });
    expect(near.length).toBe(1);
    const keep = (x: number, y = 66) =>
      suggestWires({
        gate: { id: 'g1', type: 'NOT', x, y },
        gates: [],
        wires: [],
        inputYMap,
        outputYMap,
        stepsMode: false,
        keep: near,
      });
    expect(ask({ id: 'g1', type: 'NOT', x: 400, y: 300 }).length).toBe(0);
    const far = keep(400, 300);
    expect(far.length).toBe(1);
    expect(far[0].from).toEqual({ node: 'A', pin: 'out' });
    expect(far[0].to).toEqual({ node: 'g1', pin: 'in0' });
  });

  it('лок мягкий: более близкая пара контактов перехватывает вход', () => {
    const near = ask({ id: 'g1', type: 'NOT', x: 130, y: 66 }); // A → g1.in0
    // у входа g1 (392, 314) оказался выход другого элемента (364, 314) — он ближе, чем далёкий тумблер A
    const o: GateInstance = { id: 'o', type: 'NOT', x: 300, y: 290 };
    const got = suggestWires({
      gate: { id: 'g1', type: 'NOT', x: 400, y: 300 },
      gates: [o],
      wires: [],
      inputYMap,
      outputYMap,
      stepsMode: false,
      keep: near,
    });
    expect(got.map((w) => `${w.from.node}>${w.to.node}.${w.to.pin}`)).toEqual(['o>g1.in0']);
  });

  it('удерживаемая связь пропадает, если вход уже занят другим проводом', () => {
    const near = ask({ id: 'g1', type: 'NOT', x: 130, y: 66 });
    const wires: Wire[] = [
      { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
    ];
    const got = suggestWires({
      gate: { id: 'g1', type: 'NOT', x: 400, y: 300 },
      gates: [],
      wires,
      inputYMap,
      outputYMap,
      stepsMode: false,
      keep: near,
    });
    expect(got).toEqual([]);
  });

  it('оба входа рядом с одним элементом — пунктир только к ближнему входу', () => {
    // выход левого: (264, 174); входы элемента И: (x-8, y+14) и (x-8, y+34)
    const src: GateInstance = { id: 's', type: 'NOT', x: 200, y: 150 };
    const and: GateInstance = { id: 'a', type: 'AND', x: 290, y: 160 }; // in0 (282,174) ближе, in1 (282,194)
    const got = ask(and, [src]);
    const toSrc = got.filter((w) => w.from.node === 's');
    expect(toSrc.map((w) => w.to.pin)).toEqual(['in0']);
    // если ближе нижний вход — выбирается он
    const lower = ask({ ...and, y: 140 }, [src]).filter((w) => w.from.node === 's');
    expect(lower.map((w) => w.to.pin)).toEqual(['in1']);
  });

  it('второй вход, которому не досталось этого элемента, цепляется к другому соседу', () => {
    const src: GateInstance = { id: 's', type: 'NOT', x: 200, y: 150 };
    const and: GateInstance = { id: 'a', type: 'AND', x: 290, y: 160 };
    // тумблер A у (100, 80) далеко; добавим соседа-источника для in1
    const other: GateInstance = { id: 'o', type: 'NOT', x: 200, y: 190 }; // выход (264, 214)
    const got = ask(and, [src, other]);
    const pairs = got.map((w) => `${w.from.node}>${w.to.node}.${w.to.pin}`);
    expect(pairs).toContain('s>a.in0');
    expect(pairs).toContain('o>a.in1');
  });

  it('далёкие контакты не трогаем', () => {
    expect(ask({ id: 'g1', type: 'AND', x: 400, y: 300 })).toEqual([]);
  });

  it('занятый вход не перебивается', () => {
    const wires: Wire[] = [
      { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
    ];
    expect(ask({ id: 'g1', type: 'NOT', x: 130, y: 66 }, [], wires)).toEqual([]);
  });

  it('вход, уже занятый у соседа, не предлагается для выхода', () => {
    const near: GateInstance = { id: 'n', type: 'NOT', x: 500, y: 150 };
    const wires: Wire[] = [
      { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'n', pin: 'in0' } },
    ];
    const mine: GateInstance = { id: 'g1', type: 'NOT', x: 500 - 8 - OUT_PIN_X.NOT - 20, y: 150 };
    expect(ask(mine, [near], wires).filter((w) => w.to.node === 'n')).toEqual([]);
  });

  it('связь, замыкающая цикл, пропускается (кроме пошагового режима)', () => {
    const other: GateInstance = { id: 'o', type: 'NOT', x: 200, y: 150 };
    // other.out уже идёт в g1; g1.out рядом с other.in0 — это замкнуло бы цикл
    const wires: Wire[] = [
      { id: 'w1', from: { node: 'o', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
    ];
    const g1: GateInstance = { id: 'g1', type: 'NOT', x: 100, y: 150 };
    const cyclic = (steps: boolean) =>
      ask(g1, [other], wires, steps).some((w) => w.from.node === 'g1' && w.to.node === 'o');
    expect(cyclic(false)).toBe(false);
    expect(cyclic(true)).toBe(true);
  });
});

describe('автоподстановка связей на доске', () => {
  const ev = (type: string, init: MouseEventInit = {}): Event =>
    new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab(autoWire: boolean) {
    TestBed.inject(SettingsService).autoWire.set(autoWire);
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'not');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('.board-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    const item = el.querySelector('.pal-sq') as Element; // НЕ
    const move = (x: number, y: number) => {
      document.dispatchEvent(ev('pointermove', { clientX: x, clientY: y }));
      f.detectChanges();
    };
    const wires = () => el.querySelectorAll('.board-svg .wire').length;
    const dashed = () => el.querySelectorAll('.wire-auto').length;
    return { f, el, svg, item, move, wires, dashed };
  }

  // центр элемента на (cx, cy): вход слева — (cx - 32 - 8, cy - 10)
  const cxNearA = 100 + 8 + 32 + 10; // вход НЕ почти у тумблера A (100, 80)
  const cyNearA = 80 - 14 + 24;

  it('при включённой настройке при переносе из палитры рисуется пунктир, а при отпускании связь остаётся', () => {
    const { f, item, svg, move, wires, dashed } = lab(true);
    item.dispatchEvent(ev('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    move(300, 300);
    expect(dashed()).toBe(0);
    move(cxNearA, cyNearA);
    expect(dashed()).toBe(1);

    svg.dispatchEvent(ev('pointerup', { button: 0, clientX: cxNearA, clientY: cyNearA }));
    f.detectChanges();
    expect(dashed()).toBe(0);
    expect(wires()).toBe(1);
  });

  it('связь, показанная пунктиром, остаётся, даже если элемент отпустили не рядом с контактом', () => {
    const { f, item, svg, move, wires, dashed } = lab(true);
    item.dispatchEvent(ev('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    move(cxNearA, cyNearA);
    expect(dashed()).toBe(1);
    move(500, 300); // ушли далеко — пунктир держится
    expect(dashed()).toBe(1);
    svg.dispatchEvent(ev('pointerup', { button: 0, clientX: 500, clientY: 300 }));
    f.detectChanges();
    expect(wires()).toBe(1);
    expect(dashed()).toBe(0);
  });

  it('при выключенной настройке пунктира и проводов нет', () => {
    const { f, item, svg, move, wires, dashed } = lab(false);
    item.dispatchEvent(ev('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    move(cxNearA, cyNearA);
    expect(dashed()).toBe(0);
    svg.dispatchEvent(ev('pointerup', { button: 0, clientX: cxNearA, clientY: cyNearA }));
    f.detectChanges();
    expect(wires()).toBe(0);
  });

  it('элемент, перетащенный к тумблеру, тоже подсоединяется, а простой щелчок по нему — нет', () => {
    const { f, el, svg, move, wires, dashed, item } = lab(true);
    item.dispatchEvent(ev('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    svg.dispatchEvent(ev('pointerup', { button: 0, clientX: 400, clientY: 300 }));
    f.detectChanges();
    expect(wires()).toBe(0);

    const gate = el.querySelector('.board-svg .gate') as Element;
    gate.dispatchEvent(ev('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: 400, clientY: 300 }));
    f.detectChanges();
    expect(wires()).toBe(0); // щелчок без движения

    gate.dispatchEvent(ev('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
    move(400 - (400 - cxNearA), 300 - (300 - cyNearA));
    expect(dashed()).toBe(1);
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: cxNearA, clientY: cyNearA }));
    f.detectChanges();
    expect(dashed()).toBe(0);
    expect(wires()).toBe(1);
  });
});
