import {
  Circuit,
  GateInstance,
  GateType,
  Wire,
  settleCircuit,
  zeroInputs,
} from '../exercises/logic-gates/circuit.model';
import { CombinationalLoopError, CompiledSim, NativeInstance } from './sim';

const gate = (id: string, type: GateType): GateInstance => ({ id, type, x: 0, y: 0 });
const w = (from: string, to: string, pin: 'in0' | 'in1' = 'in0'): Wire => ({
  id: `${from}>${to}${pin}`,
  from: { node: from, pin: 'out' },
  to: { node: to, pin },
});

describe('CompiledSim', () => {
  it('комбинационная схема: полусумматор по всем входам', () => {
    const c: Circuit = {
      gates: [gate('x', 'XOR'), gate('a', 'AND')],
      wires: [
        w('A', 'x'),
        w('B', 'x', 'in1'),
        w('A', 'a'),
        w('B', 'a', 'in1'),
        w('x', 'S'),
        w('a', 'P'),
      ],
    };
    const sim = new CompiledSim(c);
    for (const [A, B] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      sim.set('A', A);
      sim.set('B', B);
      sim.settle();
      expect([sim.get('S'), sim.get('P')]).toEqual([A ^ B, A & B]);
    }
  });

  it('неизвестное значение ведёт себя как в общем симуляторе (И с нулём — ноль)', () => {
    const c: Circuit = {
      gates: [gate('a', 'AND'), gate('o', 'OR')],
      wires: [
        w('A', 'a'),
        w('N', 'a', 'in1'),
        w('A', 'o'),
        w('N', 'o', 'in1'),
        w('a', 'YA'),
        w('o', 'YO'),
      ],
    };
    const sim = new CompiledSim(c);
    // N — вход, который никто не задал, но он есть в схеме; сделаем его неизвестным через несуществующий источник
    const lone: Circuit = {
      gates: [gate('a', 'AND')],
      wires: [w('A', 'a'), w('Y', 'Z')],
    };
    const s2 = new CompiledSim(lone);
    s2.set('A', 0);
    s2.settle();
    expect(s2.get('a')).toBe(0); // второй вход не подключён: И с нулём всё равно 0
    s2.set('A', 1);
    s2.settle();
    expect(s2.get('a')).toBeUndefined(); // И с единицей и неизвестным — неизвестно
    expect(sim.gateCount).toBe(2);
  });

  it('триггер: запоминает по фронту, счётчик из двух триггеров и инвертора', () => {
    // делитель на два: D = НЕ Q
    const c: Circuit = {
      gates: [gate('n', 'NOT'), gate('f', 'DFF')],
      wires: [w('f', 'n'), w('n', 'f'), w('CLK', 'f', 'in1'), w('f', 'Q')],
    };
    const sim = new CompiledSim(c);
    expect(sim.get('Q')).toBe(0);
    const seen: (0 | 1 | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      sim.pulse('CLK');
      seen.push(sim.get('Q'));
    }
    expect(seen).toEqual([1, 0, 1, 0]);
  });

  it('сдвиговый регистр: данные проходят ровно один шаг за такт (оба триггера берут значения до фронта)', () => {
    const c: Circuit = {
      gates: [gate('f0', 'DFF'), gate('f1', 'DFF'), gate('f2', 'DFF')],
      wires: [
        w('D', 'f0'),
        w('f0', 'f1'),
        w('f1', 'f2'),
        w('CLK', 'f0', 'in1'),
        w('CLK', 'f1', 'in1'),
        w('CLK', 'f2', 'in1'),
      ],
    };
    const sim = new CompiledSim(c);
    sim.set('D', 1);
    sim.pulse('CLK');
    expect([sim.get('f0'), sim.get('f1'), sim.get('f2')]).toEqual([1, 0, 0]);
    sim.pulse('CLK');
    expect([sim.get('f0'), sim.get('f1'), sim.get('f2')]).toEqual([1, 1, 0]);
  });

  it('совпадает с общим симулятором на схеме с триггерами и вентилями (счётчик по модулю 4)', () => {
    const c: Circuit = {
      gates: [gate('n0', 'NOT'), gate('x', 'XOR'), gate('f0', 'DFF'), gate('f1', 'DFF')],
      wires: [
        w('f0', 'n0'),
        w('f1', 'x'),
        w('f0', 'x', 'in1'),
        w('n0', 'f0'),
        w('x', 'f1'),
        w('A', 'f0', 'in1'),
        w('A', 'f1', 'in1'),
        w('f1', 'Q1'),
        w('f0', 'Q0'),
      ],
    };
    const fast = new CompiledSim(c);
    let prev = new Map<string, 0 | 1 | undefined>();
    const slow = (clk: 0 | 1) => {
      const r = settleCircuit(c, { ...zeroInputs(), A: clk }, prev);
      prev = r.values;
      return r.values;
    };
    slow(0);
    for (let i = 0; i < 9; i++) {
      fast.pulse('A');
      slow(1);
      const v = slow(0);
      expect([fast.get('Q1'), fast.get('Q0')], `такт ${i + 1}`).toEqual([v.get('Q1'), v.get('Q0')]);
    }
  });

  it('петля без триггера (защёлка) — понятная ошибка', () => {
    const c: Circuit = {
      gates: [gate('q', 'NOR'), gate('nq', 'NOR')],
      wires: [w('R', 'q'), w('nq', 'q', 'in1'), w('S', 'nq'), w('q', 'nq', 'in1')],
    };
    expect(() => new CompiledSim(c)).toThrow(CombinationalLoopError);
  });

  it('ПЗУ и ОЗУ: чтение по адресу, запись по фронту при разрешении', () => {
    const natives: NativeInstance[] = [
      { id: 'rom', kind: 'rom', addr: ['a1', 'a0'], dout: ['r3', 'r2', 'r1', 'r0'] },
      {
        id: 'ram',
        kind: 'ram',
        addr: ['a1', 'a0'],
        din: ['d3', 'd2', 'd1', 'd0'],
        we: 'we',
        clk: 'CLK',
        dout: ['m3', 'm2', 'm1', 'm0'],
      },
    ];
    const wires: Wire[] = [
      ...['a1', 'a0', 'd3', 'd2', 'd1', 'd0', 'we'].map((n) => w(n, `sink_${n}`)),
    ];
    const sim = new CompiledSim({ gates: [], wires, natives } as Circuit);
    sim.loadRom('rom', [0b0001, 0b0110, 0b1011, 0b1100]);
    const addr = (a: number) => {
      sim.set('a1', (a >> 1) as 0 | 1);
      sim.set('a0', (a & 1) as 0 | 1);
      sim.settle();
    };
    addr(2);
    expect(sim.read(['r3', 'r2', 'r1', 'r0'])).toBe(0b1011);
    addr(1);
    expect(sim.read(['r3', 'r2', 'r1', 'r0'])).toBe(0b0110);

    // запись: без we ничего не пишется
    for (const [n, v] of [
      ['d3', 1],
      ['d2', 0],
      ['d1', 1],
      ['d0', 1],
    ] as const)
      sim.set(n, v);
    sim.pulse('CLK');
    expect(sim.read(['m3', 'm2', 'm1', 'm0'])).toBe(0);
    sim.set('we', 1);
    sim.pulse('CLK');
    expect(sim.read(['m3', 'm2', 'm1', 'm0'])).toBe(0b1011); // чтение показывает записанное
    addr(3);
    expect(sim.read(['m3', 'm2', 'm1', 'm0'])).toBe(0);
    expect([...sim.memory('ram')]).toEqual([0, 0b1011, 0, 0]);
  });

  it('быстро: схема на тысячу вентилей, десять тысяч тактов', () => {
    // цепочка из 1000 вентилей НЕ на входе триггера: глубина большая, один проход
    const gates: GateInstance[] = [gate('f', 'DFF')];
    const wires: Wire[] = [w('CLK', 'f', 'in1'), w('f', 'Q')];
    let prev = 'f';
    for (let i = 0; i < 1001; i++) {
      gates.push(gate(`n${i}`, 'NOT'));
      wires.push(w(prev, `n${i}`));
      prev = `n${i}`;
    }
    wires.push(w(prev, 'f'));
    const sim = new CompiledSim({ gates, wires });
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) sim.pulse('CLK');
    const ms = performance.now() - t0;
    expect(sim.get('Q')).toBe(0); // чётное число тактов: нечётная цепочка НЕ переворачивает каждый такт
    expect(ms).toBeLessThan(5000);
  });
});
