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

  it('уже предложенная связь держится, пока элемент не уйдёт далеко', () => {
    const near = ask({ id: 'g1', type: 'NOT', x: 130, y: 66 });
    expect(near.length).toBe(1);
    const keep = (x: number) =>
      suggestWires({
        gate: { id: 'g1', type: 'NOT', x, y: 66 },
        gates: [],
        wires: [],
        inputYMap,
        outputYMap,
        stepsMode: false,
        keep: near,
      }).length;
    // вход на расстоянии ~80 от тумблера: заново не предложили бы, но удерживаем
    expect(keep(172)).toBe(1);
    expect(ask({ id: 'g1', type: 'NOT', x: 172, y: 66 }).length).toBe(0);
    // ушли дальше удержания — пунктир исчезает
    expect(keep(260)).toBe(0);
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
    const item = el.querySelector('.palette-item') as Element; // НЕ
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
