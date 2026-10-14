/**
 * Эталонные схемы упражнений в виде «нетлистов» — для тестов.
 * Файл не входит в приложение: его импортируют только спеки.
 */
import {
  Circuit,
  GateInstance,
  GateType,
  InputId,
  InputState,
  NodeValue,
  PinKind,
  Wire,
  inputsForRow,
  outputValue,
  settleCircuit,
  zeroInputs,
} from './circuit.model';
import { BlockSolution, BusEnd, BusWire, TOP } from './blocks';
import { Exercise } from './exercises';

export type Solutions = Record<string, { net: Net; outs: Record<string, string> }>;

/**
 * Эталонные схемы записываются «нетлистом»: имя элемента → [тип, источник входа 0, источник входа 1].
 * Источник — подпись входа упражнения (D0, S…) или имя другого элемента; обратная связь допустима.
 * Выходы: имя выхода упражнения → источник.
 */
export type Net = Record<string, readonly [GateType, string, string?]>;

export function build(ex: Exercise, net: Net, outs: Record<string, string>): Circuit {
  const labels = ex.labels ?? ex.inputs;
  const gateId = (name: string) => `g_${name}`;
  const resolve = (name: string): string => {
    const li = labels.indexOf(name);
    const isGate = name in net;
    if (li >= 0 && isGate) throw new Error(`«${name}» — и подпись входа, и имя элемента`);
    if (li >= 0) return ex.inputs[li];
    if (isGate) return gateId(name);
    throw new Error(`Нет источника «${name}» в упражнении «${ex.id}»`);
  };

  let w = 0;
  const wire = (from: string, to: string, pin: PinKind): Wire => ({
    id: `w${++w}`,
    from: { node: from, pin: 'out' },
    to: { node: to, pin },
  });

  const gates: GateInstance[] = [];
  const wires: Wire[] = [];
  for (const [name, [type, in0, in1]] of Object.entries(net)) {
    gates.push({ id: gateId(name), type, x: 0, y: 0 });
    wires.push(wire(resolve(in0), gateId(name), 'in0'));
    if (type !== 'NOT') {
      if (in1 === undefined) throw new Error(`У «${name}» не задан второй вход`);
      wires.push(wire(resolve(in1), gateId(name), 'in1'));
    }
  }
  for (const [out, src] of Object.entries(outs)) wires.push(wire(resolve(src), out, 'in0'));
  return { gates, wires };
}

/** Эталоны мультиплексорного раздела */
export const MUX_SOLUTIONS: Solutions = {
  'mux2-ns': {
    net: { a: ['AND', 'D0', 'nS'], b: ['AND', 'D1', 'S'], y: ['OR', 'a', 'b'] },
    outs: { Y: 'y' },
  },
  'mux2-inv': {
    net: {
      nS: ['NOT', 'S'],
      a: ['AND', 'D0', 'nS'],
      b: ['AND', 'D1', 'S'],
      y: ['NOR', 'a', 'b'],
    },
    outs: { Y: 'y' },
  },
  'mux2-enable': {
    net: {
      nS: ['NOT', 'S'],
      a: ['AND', 'D0', 'nS'],
      b: ['AND', 'D1', 'S'],
      m: ['OR', 'a', 'b'],
      y: ['AND', 'm', 'E'],
    },
    outs: { Y: 'y' },
  },
  'mux-bnotb': {
    net: {
      nS: ['NOT', 'S'],
      nB: ['NOT', 'B'],
      a: ['AND', 'nS', 'B'],
      b: ['AND', 'S', 'nB'],
      y: ['OR', 'a', 'b'],
    },
    outs: { Y: 'y' },
  },
  demux2: {
    net: { nS: ['NOT', 'S'], y0: ['AND', 'D', 'nS'], y1: ['AND', 'D', 'S'] },
    outs: { Y0: 'y0', Y1: 'y1' },
  },
  decoder2: {
    net: {
      n1: ['NOT', 'S1'],
      n0: ['NOT', 'S0'],
      y0: ['NOR', 'S1', 'S0'],
      y1: ['AND', 'n1', 'S0'],
      y2: ['AND', 'S1', 'n0'],
      y3: ['AND', 'S1', 'S0'],
    },
    outs: { Y0: 'y0', Y1: 'y1', Y2: 'y2', Y3: 'y3' },
  },
  demux4: {
    net: {
      n1: ['NOT', 'S1'],
      n0: ['NOT', 'S0'],
      t0: ['AND', 'D', 'n1'],
      t1: ['AND', 'D', 'S1'],
      y0: ['AND', 't0', 'n0'],
      y1: ['AND', 't0', 'S0'],
      y2: ['AND', 't1', 'n0'],
      y3: ['AND', 't1', 'S0'],
    },
    outs: { Y0: 'y0', Y1: 'y1', Y2: 'y2', Y3: 'y3' },
  },
  decoder3: {
    net: {
      n2: ['NOT', 'S2'],
      n1: ['NOT', 'S1'],
      n0: ['NOT', 'S0'],
      d0: ['AND', 'n1', 'n0'],
      d1: ['AND', 'n1', 'S0'],
      d2: ['AND', 'S1', 'n0'],
      d3: ['AND', 'S1', 'S0'],
      y0: ['AND', 'd0', 'n2'],
      y1: ['AND', 'd1', 'n2'],
      y2: ['AND', 'd2', 'n2'],
      y3: ['AND', 'd3', 'n2'],
      y4: ['AND', 'd0', 'S2'],
      y5: ['AND', 'd1', 'S2'],
      y6: ['AND', 'd2', 'S2'],
      y7: ['AND', 'd3', 'S2'],
    },
    outs: { Y0: 'y0', Y1: 'y1', Y2: 'y2', Y3: 'y3', Y4: 'y4', Y5: 'y5', Y6: 'y6', Y7: 'y7' },
  },
  encoder4: {
    net: {
      n2: ['NOT', 'I2'],
      k: ['AND', 'I1', 'n2'],
      y1: ['OR', 'I2', 'I3'],
      y0: ['OR', 'I3', 'k'],
      o: ['OR', 'I0', 'I1'],
      v: ['OR', 'o', 'y1'],
    },
    outs: { Y1: 'y1', Y0: 'y0', V: 'v' },
  },
  'mux2-bus': {
    net: {
      nS: ['NOT', 'S'],
      ha: ['AND', 'A1', 'nS'],
      hb: ['AND', 'B1', 'S'],
      hy: ['OR', 'ha', 'hb'],
      la: ['AND', 'A0', 'nS'],
      lb: ['AND', 'B0', 'S'],
      ly: ['OR', 'la', 'lb'],
    },
    outs: { Y1: 'hy', Y0: 'ly' },
  },
  mux4: {
    net: {
      n1: ['NOT', 'S1'],
      n0: ['NOT', 'S0'],
      p0: ['AND', 'D0', 'n0'],
      p1: ['AND', 'D1', 'S0'],
      lo: ['OR', 'p0', 'p1'],
      q0: ['AND', 'D2', 'n0'],
      q1: ['AND', 'D3', 'S0'],
      hi: ['OR', 'q0', 'q1'],
      c0: ['AND', 'lo', 'n1'],
      c1: ['AND', 'hi', 'S1'],
      y: ['OR', 'c0', 'c1'],
    },
    outs: { Y: 'y' },
  },
  'mux2-nor': {
    net: {
      nS: ['NOR', 'S', 'S'],
      nD0: ['NOR', 'D0', 'D0'],
      nD1: ['NOR', 'D1', 'D1'],
      x: ['NOR', 'nD0', 'S'],
      y: ['NOR', 'nD1', 'nS'],
      z: ['NOR', 'x', 'y'],
      out: ['NOR', 'z', 'z'],
    },
    outs: { Y: 'out' },
  },
};

/** D-защёлка: общий кусок для нескольких эталонов */
export const dLatch = (d: string, e: string, p: string): Net => ({
  [`${p}nd`]: ['NOT', d],
  [`${p}s`]: ['AND', d, e],
  [`${p}r`]: ['AND', `${p}nd`, e],
  [`${p}q`]: ['NOR', `${p}r`, `${p}nq`],
  [`${p}nq`]: ['NOR', `${p}s`, `${p}q`],
});

/** Эталоны раздела защёлок */
export const LATCH_SOLUTIONS: Solutions = {
  'sr-nor': {
    net: { q: ['NOR', 'R', 'nq'], nq: ['NOR', 'S', 'q'] },
    outs: { Q: 'q', nQ: 'nq' },
  },
  'sr-nand': {
    net: { q: ['NAND', 'nS', 'nq'], nq: ['NAND', 'nR', 'q'] },
    outs: { Q: 'q', nQ: 'nq' },
  },
  'sr-set-first': {
    net: { nr: ['NOT', 'R'], h: ['AND', 'nr', 'q'], q: ['OR', 'S', 'h'] },
    outs: { Q: 'q' },
  },
  'sr-reset-first': {
    net: { nr: ['NOT', 'R'], o: ['OR', 'S', 'q'], q: ['AND', 'nr', 'o'] },
    outs: { Q: 'q' },
  },
  'sr-gated': {
    net: {
      s: ['AND', 'S', 'E'],
      r: ['AND', 'R', 'E'],
      q: ['NOR', 'r', 'nq'],
      nq: ['NOR', 's', 'q'],
    },
    outs: { Q: 'q', nQ: 'nq' },
  },
  alarm: {
    net: { s: ['AND', 'Sen', 'Arm'], q: ['NOR', 'Rst', 'nq'], nq: ['NOR', 's', 'q'] },
    outs: { Q: 'q' },
  },
  'd-latch': { net: dLatch('D', 'E', ''), outs: { Q: 'q', nQ: 'nq' } },
  'd-latch-nand': {
    net: {
      nd: ['NOT', 'D'],
      s: ['NAND', 'D', 'E'],
      r: ['NAND', 'nd', 'E'],
      q: ['NAND', 's', 'nq'],
      nq: ['NAND', 'r', 'q'],
    },
    outs: { Q: 'q', nQ: 'nq' },
  },
  'd-clear': {
    net: {
      nd: ['NOT', 'D'],
      nc: ['NOT', 'CLR'],
      de: ['AND', 'D', 'E'],
      s: ['AND', 'de', 'nc'],
      nde: ['AND', 'nd', 'E'],
      r: ['OR', 'nde', 'CLR'],
      q: ['NOR', 'r', 'nq'],
      nq: ['NOR', 's', 'q'],
    },
    outs: { Q: 'q', nQ: 'nq' },
  },
  'd-latch-2bit': {
    net: { ...dLatch('D1', 'E', 'h'), ...dLatch('D0', 'E', 'l') },
    outs: { Q1: 'hq', Q0: 'lq' },
  },
  'd-latch-src': {
    net: {
      ns: ['NOT', 'S'],
      m0: ['AND', 'D0', 'ns'],
      m1: ['AND', 'D1', 'S'],
      d: ['OR', 'm0', 'm1'],
      ...dLatch('d', 'E', 'x'),
    },
    outs: { Q: 'xq' },
  },
  'mem-cell': {
    net: { ...dLatch('D', 'W', 'x'), out: ['AND', 'xq', 'R'] },
    outs: { Q: 'xq', Out: 'out' },
  },
};

/** Эталоны раздела «Регистры и такт»; в упражнениях после `dff` используется готовый элемент DFF */
export const REGISTER_SOLUTIONS: Solutions = {
  'clocked-latch': { net: dLatch('D', 'CLK', ''), outs: { Q: 'q' } },
  'latch-low': { net: { nclk: ['NOT', 'CLK'], ...dLatch('D', 'nclk', '') }, outs: { Q: 'q' } },
  dff: {
    net: { nclk: ['NOT', 'CLK'], ...dLatch('D', 'nclk', 'm'), ...dLatch('mq', 'CLK', 's') },
    outs: { Q: 'sq', nQ: 'snq' },
  },
  toggle: {
    net: { n: ['NOT', 'ff'], ff: ['DFF', 'n', 'CLK'] },
    outs: { Q: 'ff' },
  },
  'reg1-load': {
    net: {
      nl: ['NOT', 'LD'],
      a: ['AND', 'D', 'LD'],
      b: ['AND', 'ff', 'nl'],
      m: ['OR', 'a', 'b'],
      ff: ['DFF', 'm', 'CLK'],
    },
    outs: { Q: 'ff' },
  },
  'reg-clear': {
    net: { nc: ['NOT', 'CLR'], d: ['AND', 'D', 'nc'], ff: ['DFF', 'd', 'CLK'] },
    outs: { Q: 'ff' },
  },
  register4: {
    net: {
      f3: ['DFF', 'D3', 'CLK'],
      f2: ['DFF', 'D2', 'CLK'],
      f1: ['DFF', 'D1', 'CLK'],
      f0: ['DFF', 'D0', 'CLK'],
    },
    outs: { Q3: 'f3', Q2: 'f2', Q1: 'f1', Q0: 'f0' },
  },
  shift4: {
    net: {
      f0: ['DFF', 'Din', 'CLK'],
      f1: ['DFF', 'f0', 'CLK'],
      f2: ['DFF', 'f1', 'CLK'],
      f3: ['DFF', 'f2', 'CLK'],
    },
    outs: { Q3: 'f3', Q2: 'f2', Q1: 'f1', Q0: 'f0' },
  },
  counter2: {
    net: {
      n0: ['NOT', 'f0'],
      x: ['XOR', 'f1', 'f0'],
      f0: ['DFF', 'n0', 'CLK'],
      f1: ['DFF', 'x', 'CLK'],
    },
    outs: { Q1: 'f1', Q0: 'f0' },
  },
  'counter-en': {
    net: {
      d0: ['XOR', 'f0', 'EN'],
      a: ['AND', 'f0', 'EN'],
      d1: ['XOR', 'f1', 'a'],
      f0: ['DFF', 'd0', 'CLK'],
      f1: ['DFF', 'd1', 'CLK'],
    },
    outs: { Q1: 'f1', Q0: 'f0' },
  },
  johnson2: {
    net: { n: ['NOT', 'f1'], f0: ['DFF', 'n', 'CLK'], f1: ['DFF', 'f0', 'CLK'] },
    outs: { Q1: 'f1', Q0: 'f0' },
  },
  accumulator: {
    net: {
      s0: ['XOR', 'f0', 'IN0'],
      c: ['AND', 'f0', 'IN0'],
      x: ['XOR', 'f1', 'IN1'],
      s1: ['XOR', 'x', 'c'],
      f0: ['DFF', 's0', 'CLK'],
      f1: ['DFF', 's1', 'CLK'],
    },
    outs: { Q1: 'f1', Q0: 'f0' },
  },
};

/** Мультиплексор 2→1: p — имя выхода, s — выбор, ns — его инверсия (уже есть в схеме) */
export const mux = (p: string, s: string, d0: string, d1: string, ns: string): Net => ({
  [`${p}a`]: ['AND', d0, ns],
  [`${p}b`]: ['AND', d1, s],
  [p]: ['OR', `${p}a`, `${p}b`],
});

/** Эталоны раздела «АЛУ» */
export const ALU_SOLUTIONS: Solutions = {
  'logic-select': {
    net: {
      nOp: ['NOT', 'Op'],
      x: ['AND', 'A', 'B'],
      y: ['OR', 'A', 'B'],
      ...mux('r', 'Op', 'x', 'y', 'nOp'),
    },
    outs: { Y: 'r' },
  },
  logic4: {
    net: {
      nOp0: ['NOT', 'Op0'],
      nOp1: ['NOT', 'Op1'],
      x: ['AND', 'A', 'B'],
      y: ['OR', 'A', 'B'],
      z: ['XOR', 'A', 'B'],
      na: ['NOT', 'A'],
      ...mux('l0', 'Op0', 'x', 'y', 'nOp0'),
      ...mux('l1', 'Op0', 'z', 'na', 'nOp0'),
      ...mux('r', 'Op1', 'l0', 'l1', 'nOp1'),
    },
    outs: { Y: 'r' },
  },
  flags2: {
    net: { z: ['NOR', 'R1', 'R0'], pe: ['XNOR', 'R1', 'R0'] },
    outs: { Z: 'z', N: 'R1', Pe: 'pe' },
  },
  incdec2: {
    net: { r0: ['NOT', 'A0'], x: ['XOR', 'A1', 'A0'], r1: ['XOR', 'x', 'Dec'] },
    outs: { R1: 'r1', R0: 'r0' },
  },
  overflow2: {
    net: {
      c: ['AND', 'A0', 'B0'],
      x: ['XOR', 'A1', 'B1'],
      s1: ['XOR', 'x', 'c'],
      e: ['XNOR', 'A1', 'B1'],
      d: ['XOR', 'A1', 's1'],
      v: ['AND', 'e', 'd'],
    },
    outs: { V: 'v' },
  },
  shifter2: {
    net: {
      nD: ['NOT', 'Dir'],
      r1: ['AND', 'A0', 'nD'],
      r0: ['AND', 'A1', 'Dir'],
      a: ['AND', 'A1', 'nD'],
      b: ['AND', 'A0', 'Dir'],
      co: ['OR', 'a', 'b'],
    },
    outs: { R1: 'r1', R0: 'r0', Co: 'co' },
  },
  'alu-slice': {
    net: {
      nOp0: ['NOT', 'Op0'],
      nOp1: ['NOT', 'Op1'],
      and: ['AND', 'A', 'B'],
      or: ['OR', 'A', 'B'],
      ...mux('l', 'Op0', 'and', 'or', 'nOp0'),
      bx: ['XOR', 'B', 'Op0'],
      x: ['XOR', 'A', 'bx'],
      s: ['XOR', 'x', 'Cin'],
      g: ['AND', 'A', 'bx'],
      h: ['AND', 'x', 'Cin'],
      c: ['OR', 'g', 'h'],
      ...mux('r', 'Op1', 's', 'l', 'nOp1'),
      co: ['AND', 'c', 'nOp1'],
    },
    outs: { R: 'r', Co: 'co' },
  },
  'alu2-arith': {
    net: {
      bm0: ['XOR', 'B0', 'M'],
      bm1: ['XOR', 'B1', 'M'],
      x0: ['XOR', 'A0', 'bm0'],
      r0: ['XOR', 'x0', 'M'],
      g0: ['AND', 'A0', 'bm0'],
      h0: ['AND', 'x0', 'M'],
      c0: ['OR', 'g0', 'h0'],
      x1: ['XOR', 'A1', 'bm1'],
      r1: ['XOR', 'x1', 'c0'],
      g1: ['AND', 'A1', 'bm1'],
      h1: ['AND', 'x1', 'c0'],
      co: ['OR', 'g1', 'h1'],
    },
    outs: { R1: 'r1', R0: 'r0', Co: 'co' },
  },
  'alu2-bitwise': {
    net: {
      nOp: ['NOT', 'Op'],
      hx: ['AND', 'A1', 'B1'],
      hy: ['OR', 'A1', 'B1'],
      lx: ['AND', 'A0', 'B0'],
      ly: ['OR', 'A0', 'B0'],
      ...mux('r1', 'Op', 'hx', 'hy', 'nOp'),
      ...mux('r0', 'Op', 'lx', 'ly', 'nOp'),
    },
    outs: { R1: 'r1', R0: 'r0' },
  },
  alu2: {
    net: {
      // арифметика (M = Op0)
      bm0: ['XOR', 'B0', 'Op0'],
      bm1: ['XOR', 'B1', 'Op0'],
      x0: ['XOR', 'A0', 'bm0'],
      ar0: ['XOR', 'x0', 'Op0'],
      g0: ['AND', 'A0', 'bm0'],
      h0: ['AND', 'x0', 'Op0'],
      c0: ['OR', 'g0', 'h0'],
      x1: ['XOR', 'A1', 'bm1'],
      ar1: ['XOR', 'x1', 'c0'],
      // логика (Op = Op0)
      nOp0: ['NOT', 'Op0'],
      hx: ['AND', 'A1', 'B1'],
      hy: ['OR', 'A1', 'B1'],
      lx: ['AND', 'A0', 'B0'],
      ly: ['OR', 'A0', 'B0'],
      ...mux('lg1', 'Op0', 'hx', 'hy', 'nOp0'),
      ...mux('lg0', 'Op0', 'lx', 'ly', 'nOp0'),
      // выбор блока по Op1
      nOp1: ['NOT', 'Op1'],
      ...mux('r1', 'Op1', 'ar1', 'lg1', 'nOp1'),
      ...mux('r0', 'Op1', 'ar0', 'lg0', 'nOp1'),
    },
    outs: { R1: 'r1', R0: 'r0' },
  },
  'compare-sub': {
    net: {
      nb1: ['NOT', 'B1'],
      nb0: ['NOT', 'B0'],
      r0: ['XNOR', 'A0', 'nb0'], // A0 ⊕ НЕ-B0 ⊕ 1
      c0: ['OR', 'A0', 'nb0'], // перенос при Cin = 1
      x1: ['XOR', 'A1', 'nb1'],
      r1: ['XOR', 'x1', 'c0'],
      g1: ['AND', 'A1', 'nb1'],
      h1: ['AND', 'x1', 'c0'],
      co: ['OR', 'g1', 'h1'],
      eq: ['NOR', 'r1', 'r0'],
      lt: ['NOT', 'co'],
      ne: ['NOT', 'eq'],
      gt: ['AND', 'co', 'ne'],
    },
    outs: { Lt: 'lt', Eq: 'eq', Gt: 'gt' },
  },
  'branch-cond': {
    net: {
      nz: ['NOT', 'Z'],
      lt: ['XOR', 'N', 'V'],
      le: ['OR', 'Z', 'lt'],
      nC1: ['NOT', 'C1'],
      nC0: ['NOT', 'C0'],
      ...mux('m0', 'C0', 'Z', 'nz', 'nC0'),
      ...mux('m1', 'C0', 'lt', 'le', 'nC0'),
      ...mux('t', 'C1', 'm0', 'm1', 'nC1'),
    },
    outs: { T: 't' },
  },
};

/** Эталоны сумматоров (с пятого упражнения; первые четыре проверяет exercises.spec.ts) */
export const ADDER_SOLUTIONS: Solutions = {
  'half-subtractor': {
    net: { x: ['XOR', 'A', 'B'], nA: ['NOT', 'A'], w: ['AND', 'nA', 'B'] },
    outs: { R: 'x', Bo: 'w' },
  },
  'full-subtractor': {
    net: {
      x: ['XOR', 'A', 'B'],
      r: ['XOR', 'x', 'Bin'],
      nA: ['NOT', 'A'],
      w1: ['AND', 'nA', 'B'],
      nx: ['NOT', 'x'],
      w2: ['AND', 'nx', 'Bin'],
      bo: ['OR', 'w1', 'w2'],
    },
    outs: { R: 'r', Bo: 'bo' },
  },
  increment2: {
    net: { s0: ['NOT', 'A0'], s1: ['XOR', 'A1', 'A0'], p: ['AND', 'A1', 'A0'] },
    outs: { P: 'p', S1: 's1', S0: 's0' },
  },
  comparator1: {
    net: {
      nA: ['NOT', 'A'],
      nB: ['NOT', 'B'],
      lt: ['AND', 'nA', 'B'],
      eq: ['XNOR', 'A', 'B'],
      gt: ['AND', 'A', 'nB'],
    },
    outs: { Lt: 'lt', Eq: 'eq', Gt: 'gt' },
  },
  adder2: {
    net: {
      s0: ['XOR', 'A0', 'B0'],
      c0: ['AND', 'A0', 'B0'],
      x: ['XOR', 'A1', 'B1'],
      s1: ['XOR', 'x', 'c0'],
      g: ['AND', 'A1', 'B1'],
      h: ['AND', 'x', 'c0'],
      p: ['OR', 'g', 'h'],
    },
    outs: { P: 'p', S1: 's1', S0: 's0' },
  },
  'add-sub': {
    net: {
      bm: ['XOR', 'B', 'M'],
      x: ['XOR', 'A', 'bm'],
      s: ['XOR', 'x', 'M'],
      g: ['AND', 'A', 'bm'],
      h: ['AND', 'x', 'M'],
      p: ['OR', 'g', 'h'],
    },
    outs: { S: 's', P: 'p' },
  },
  comparator2: {
    net: {
      nA1: ['NOT', 'A1'],
      nB1: ['NOT', 'B1'],
      nA0: ['NOT', 'A0'],
      nB0: ['NOT', 'B0'],
      e1: ['XNOR', 'A1', 'B1'],
      e0: ['XNOR', 'A0', 'B0'],
      eq: ['AND', 'e1', 'e0'],
      g1: ['AND', 'A1', 'nB1'],
      g0: ['AND', 'A0', 'nB0'],
      g0e: ['AND', 'e1', 'g0'],
      gt: ['OR', 'g1', 'g0e'],
      l1: ['AND', 'nA1', 'B1'],
      l0: ['AND', 'nA0', 'B0'],
      l0e: ['AND', 'e1', 'l0'],
      lt: ['OR', 'l1', 'l0e'],
    },
    outs: { Lt: 'lt', Eq: 'eq', Gt: 'gt' },
  },
  adder3: {
    net: {
      s0: ['XOR', 'A0', 'B0'],
      c0: ['AND', 'A0', 'B0'],
      x1: ['XOR', 'A1', 'B1'],
      s1: ['XOR', 'x1', 'c0'],
      g1: ['AND', 'A1', 'B1'],
      h1: ['AND', 'x1', 'c0'],
      c1: ['OR', 'g1', 'h1'],
      x2: ['XOR', 'A2', 'B2'],
      s2: ['XOR', 'x2', 'c1'],
      g2: ['AND', 'A2', 'B2'],
      h2: ['AND', 'x2', 'c1'],
      p: ['OR', 'g2', 'h2'],
    },
    outs: { P: 'p', S2: 's2', S1: 's1', S0: 's0' },
  },
};

/** Ячейка памяти из D-защёлки; d — данные и nd — их инверсия, e — разрешение записи, p — префикс имён */
export const cell = (d: string, nd: string, e: string, p: string): Net => ({
  [`${p}s`]: ['AND', d, e],
  [`${p}r`]: ['AND', nd, e],
  [`${p}q`]: ['NOR', `${p}r`, `${p}nq`],
  [`${p}nq`]: ['NOR', `${p}s`, `${p}q`],
});

/** Эталоны раздела «Память» */
export const MEMORY_SOLUTIONS: Solutions = {
  rom4x2: {
    net: { d1: ['NOT', 'A0'], d0: ['XOR', 'A1', 'A0'] },
    outs: { D1: 'd1', D0: 'd0' },
  },
  rom4x4: {
    net: {
      n1: ['NOT', 'A1'],
      n0: ['NOT', 'A0'],
      y0: ['AND', 'n1', 'n0'],
      y1: ['AND', 'n1', 'A0'],
      y2: ['AND', 'A1', 'n0'],
      y3: ['AND', 'A1', 'A0'],
      w3: ['OR', 'y2', 'y3'],
      w2: ['OR', 'y1', 'y3'],
      w0: ['OR', 'y1', 'y2'],
    },
    outs: { W3: 'w3', W2: 'w2', W1: 'y0', W0: 'w0' },
  },
  'memory-map': {
    net: {
      rom: ['NOT', 'A2'],
      h: ['AND', 'A1', 'A0'],
      io: ['AND', 'A2', 'h'],
      nh: ['NOT', 'h'],
      ram: ['AND', 'A2', 'nh'],
    },
    outs: { Rom: 'rom', Ram: 'ram', Io: 'io' },
  },
  'bus-control': {
    net: {
      we: ['AND', 'CS', 'Wr'],
      nWr: ['NOT', 'Wr'],
      t: ['AND', 'CS', 'Rd'],
      oe: ['AND', 't', 'nWr'],
    },
    outs: { We: 'we', Oe: 'oe' },
  },
  'protected-cell': {
    net: {
      nwp: ['NOT', 'WP'],
      we: ['AND', 'W', 'nwp'],
      nd: ['NOT', 'D'],
      ...cell('D', 'nd', 'we', 'c'),
      out: ['AND', 'cq', 'RD'],
    },
    outs: { Q: 'cq', Out: 'out' },
  },
  'cell-select': {
    net: {
      nA: ['NOT', 'A'],
      w0: ['AND', 'W', 'nA'],
      w1: ['AND', 'W', 'A'],
      nd: ['NOT', 'D'],
      ...cell('D', 'nd', 'w0', 'a'),
      ...cell('D', 'nd', 'w1', 'b'),
      ...mux('q', 'A', 'aq', 'bq', 'nA'),
    },
    outs: { Q: 'q' },
  },
  ram2x2: {
    net: {
      nA: ['NOT', 'A'],
      w0: ['AND', 'W', 'nA'],
      w1: ['AND', 'W', 'A'],
      nh: ['NOT', 'D1'],
      nl: ['NOT', 'D0'],
      ...cell('D1', 'nh', 'w0', 'h0'),
      ...cell('D1', 'nh', 'w1', 'h1'),
      ...cell('D0', 'nl', 'w0', 'l0'),
      ...cell('D0', 'nl', 'w1', 'l1'),
      ...mux('q1', 'A', 'h0q', 'h1q', 'nA'),
      ...mux('q0', 'A', 'l0q', 'l1q', 'nA'),
    },
    outs: { Q1: 'q1', Q0: 'q0' },
  },
  'sync-cell': {
    net: {
      nA: ['NOT', 'A'],
      w0: ['AND', 'W', 'nA'],
      w1: ['AND', 'W', 'A'],
      nw0: ['NOT', 'w0'],
      nw1: ['NOT', 'w1'],
      k0: ['AND', 'f0', 'nw0'],
      l0: ['AND', 'D', 'w0'],
      m0: ['OR', 'k0', 'l0'],
      f0: ['DFF', 'm0', 'CLK'],
      k1: ['AND', 'f1', 'nw1'],
      l1: ['AND', 'D', 'w1'],
      m1: ['OR', 'k1', 'l1'],
      f1: ['DFF', 'm1', 'CLK'],
      ...mux('q', 'A', 'f0', 'f1', 'nA'),
    },
    outs: { Q: 'q' },
  },
};

/** Эталоны раздела «Декодер команд» */
export const DECODER_SOLUTIONS: Solutions = {
  'control-word': {
    net: {
      nI3: ['NOT', 'I3'],
      nI2: ['NOT', 'I2'],
      add: ['AND', 'nI3', 'I2'],
      jmp: ['AND', 'I3', 'nI2'],
      hlt: ['AND', 'I3', 'I2'],
    },
    outs: { Ld: 'nI3', Add: 'add', Jmp: 'jmp', Hlt: 'hlt' },
  },
  'jnz-take': {
    net: {
      nI3: ['NOT', 'I3'],
      nI2: ['NOT', 'I2'],
      nZ: ['NOT', 'Z'],
      add: ['AND', 'nI3', 'I2'],
      jmp: ['AND', 'I3', 'nI2'],
      take: ['AND', 'jmp', 'nZ'],
      hlt: ['AND', 'I3', 'I2'],
    },
    outs: { Ld: 'nI3', Add: 'add', Take: 'take', Hlt: 'hlt' },
  },
  'acc-operand': {
    net: {
      g1: ['AND', 'A1', 'Add'],
      g0: ['AND', 'A0', 'Add'],
      r0: ['XOR', 'K0', 'g0'],
      c: ['AND', 'K0', 'g0'],
      x: ['XOR', 'K1', 'g1'],
      r1: ['XOR', 'x', 'c'],
    },
    outs: { R1: 'r1', R0: 'r0' },
  },
  'next-pc': {
    net: {
      nT: ['NOT', 'Take'],
      i0: ['NOT', 'P0'],
      i1: ['XOR', 'P1', 'P0'],
      ...mux('n1', 'Take', 'i1', 'K1', 'nT'),
      ...mux('n0', 'Take', 'i0', 'K0', 'nT'),
    },
    outs: { N1: 'n1', N0: 'n0' },
  },
  'phase-seq': {
    net: {
      n1: ['NOT', 'f1'],
      n0: ['NOT', 'f0'],
      f0: ['DFF', 'n1', 'CLK'],
      f1: ['DFF', 'f0', 'CLK'],
      fe: ['NOR', 'f1', 'f0'],
      de: ['AND', 'n1', 'f0'],
      ex: ['AND', 'f1', 'f0'],
      wb: ['AND', 'f1', 'n0'],
    },
    outs: { Fe: 'fe', De: 'de', Ex: 'ex', Wb: 'wb' },
  },
  'phase-gate': {
    net: {
      nI3: ['NOT', 'I3'],
      acc: ['AND', 'Wb', 'nI3'],
      h: ['AND', 'I3', 'I2'],
      nh: ['NOT', 'h'],
      pc: ['AND', 'Wb', 'nh'],
    },
    outs: { IrLoad: 'Fe', AccLoad: 'acc', PcLoad: 'pc' },
  },
  'hlt-latch': {
    net: { q: ['NOR', 'Rst', 'nq'], nq: ['NOR', 'Hlt', 'q'] },
    outs: { Run: 'nq' },
  },
  'decode-all': {
    net: {
      nI3: ['NOT', 'I3'],
      nI2: ['NOT', 'I2'],
      nZ: ['NOT', 'Z'],
      stop: ['AND', 'I3', 'I2'],
      nstop: ['NOT', 'stop'],
      acc: ['AND', 'Wb', 'nI3'],
      add: ['AND', 'nI3', 'I2'],
      jmp: ['AND', 'I3', 'nI2'],
      take: ['AND', 'jmp', 'nZ'],
      pc: ['AND', 'Wb', 'nstop'],
    },
    outs: { AccLoad: 'acc', UseAdd: 'add', Take: 'take', PcLoad: 'pc', Stop: 'stop' },
  },
};

/** Эталоны раздела «Процессор из блоков» — только упражнение на вентилях */
export const CPU_SOLUTIONS: Solutions = {
  'reg2-load': {
    net: {
      nl: ['NOT', 'LD'],
      kh: ['AND', 'fh', 'nl'],
      lh: ['AND', 'D1', 'LD'],
      mh: ['OR', 'kh', 'lh'],
      fh: ['DFF', 'mh', 'CLK'],
      kl: ['AND', 'fl', 'nl'],
      ll: ['AND', 'D0', 'LD'],
      ml: ['OR', 'kl', 'll'],
      fl: ['DFF', 'ml', 'CLK'],
    },
    outs: { Q1: 'fh', Q0: 'fl' },
  },
};

/** Конец шины: e('rom', 'instr', 'op') — поле op порта instr блока rom; e(TOP, 'addr') — порт упражнения */
const e = (node: string, port: string, path = ''): BusEnd => ({ node, port, path });

let busId = 0;
const bw = (from: BusEnd, to: BusEnd): BusWire => ({ id: `b${++busId}`, from, to });

/** Эталонные решения упражнений «из блоков» (положения экземпляров — для красивой доски) */
export const BLOCK_SOLUTIONS: Record<string, BlockSolution> = {
  'decode-bus': {
    instances: [
      { id: 'r', blockId: 'rom', x: 170, y: 40 },
      { id: 'd', blockId: 'decoder', x: 380, y: 40 },
    ],
    busWires: [
      bw(e(TOP, 'addr'), e('r', 'addr')),
      bw(e('r', 'instr', 'op'), e('d', 'op')),
      bw(e(TOP, 'z'), e('d', 'z')),
      bw(e(TOP, 'wb'), e('d', 'wb')),
      bw(e('d', 'ctl'), e(TOP, 'ctl')),
    ],
  },
  fetch: {
    instances: [
      { id: 'pc', blockId: 'reg2', x: 170, y: 20 },
      { id: 'a1', blockId: 'adapter-w2a', x: 380, y: 20 },
      { id: 'rom', blockId: 'rom', x: 380, y: 120 },
      { id: 'nx', blockId: 'next-pc', x: 170, y: 160 },
      { id: 'a2', blockId: 'adapter-a2w', x: 170, y: 310 },
    ],
    busWires: [
      bw(e(TOP, 'clk'), e('pc', 'clk')),
      bw(e(TOP, 'load'), e('pc', 'load')),
      bw(e('pc', 'q'), e('a1', 'in')),
      bw(e('a1', 'out'), e('rom', 'addr')),
      bw(e('a1', 'out'), e('nx', 'pc')),
      bw(e('a1', 'out'), e(TOP, 'pc')),
      bw(e(TOP, 'take'), e('nx', 'take')),
      bw(e(TOP, 'k'), e('nx', 'k')),
      bw(e('nx', 'next'), e('a2', 'in')),
      bw(e('a2', 'out'), e('pc', 'd')),
      bw(e('rom', 'instr'), e(TOP, 'instr')),
    ],
  },
  exec: {
    instances: [
      { id: 'op', blockId: 'operand', x: 170, y: 20 },
      { id: 'acc', blockId: 'reg2', x: 380, y: 20 },
      { id: 'fl', blockId: 'flags', x: 380, y: 170 },
    ],
    busWires: [
      bw(e(TOP, 'k'), e('op', 'k')),
      bw(e(TOP, 'use_add'), e('op', 'add')),
      bw(e('acc', 'q'), e('op', 'acc')),
      bw(e('op', 'r'), e('acc', 'd')),
      bw(e(TOP, 'acc_load'), e('acc', 'load')),
      bw(e(TOP, 'clk'), e('acc', 'clk')),
      bw(e('acc', 'q'), e('fl', 'r')),
      bw(e('acc', 'q'), e(TOP, 'acc')),
      bw(e('fl', 'flags'), e(TOP, 'flags')),
    ],
  },
  cpu: {
    instances: [
      { id: 'seq', blockId: 'sequencer', x: 170, y: 20 },
      { id: 'fe', blockId: 'fetch', x: 170, y: 120 },
      { id: 'ad', blockId: 'adapter-w2a', x: 170, y: 310 },
      { id: 'dec', blockId: 'decoder', x: 380, y: 20 },
      { id: 'ex', blockId: 'exec', x: 380, y: 170 },
    ],
    busWires: [
      bw(e(TOP, 'clk'), e('seq', 'clk')),
      bw(e(TOP, 'clk'), e('fe', 'clk')),
      bw(e(TOP, 'clk'), e('ex', 'clk')),
      bw(e('seq', 'ph', 'Wb'), e('dec', 'wb')),
      bw(e('fe', 'instr', 'op'), e('dec', 'op')),
      bw(e('fe', 'instr', 'k'), e('ex', 'k')),
      bw(e('fe', 'instr', 'k'), e('ad', 'in')),
      bw(e('ad', 'out'), e('fe', 'k')),
      bw(e('ex', 'flags', 'Z'), e('dec', 'z')),
      bw(e('dec', 'ctl', 'UseAdd'), e('ex', 'use_add')),
      bw(e('dec', 'ctl', 'AccLoad'), e('ex', 'acc_load')),
      bw(e('dec', 'ctl', 'Take'), e('fe', 'take')),
      bw(e('dec', 'ctl', 'PcLoad'), e('fe', 'load')),
      bw(e('ex', 'acc'), e(TOP, 'acc')),
      bw(e('fe', 'pc'), e(TOP, 'pc')),
      bw(e('seq', 'ph'), e(TOP, 'ph')),
    ],
  },
};

/** Таблица истинности: схема даёт целевые столбцы на всех строках */
export function expectTableMatches(ex: Exercise, circuit: Circuit): void {
  for (let row = 0; row < ex.target.length; row++) {
    const inputs = inputsForRow(ex.inputs, row);
    const actuals = ex.outputs.map((o) => outputValue(circuit, inputs, o));
    expect(actuals, `«${ex.id}», строка ${row}`).toEqual([...ex.target[row]]);
  }
}

/** Как приложение хранит состояние между щелчками тумблеров */
export function settleStep(circuit: Circuit, inputs: InputState, prev: Map<string, NodeValue>) {
  const res = settleCircuit(circuit, inputs, prev);
  return { res, next: res.stable ? res.values : new Map<string, NodeValue>() };
}

export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

export interface Sim {
  inputs: InputState;
  prev: Map<string, NodeValue>;
}

/** Переключает тумблеры по одному в заданном порядке; возвращает итоговое состояние и значения узлов */
export function applyToggles(
  circuit: Circuit,
  sim: Sim,
  to: InputState,
  order: readonly InputId[],
) {
  const inputs = { ...sim.inputs };
  let prev = sim.prev;
  let values = settleStep(circuit, inputs, prev).res.values;
  for (const id of order) {
    inputs[id] = to[id];
    const r = settleStep(circuit, inputs, prev);
    prev = r.next;
    values = r.res.values;
  }
  return { sim: { inputs, prev } as Sim, values };
}

/** Как applyToggles, но после первого фронта подаёт ещё pulses − 1 полных импульсов такта */
export function applyWithPulses(
  circuit: Circuit,
  sim: Sim,
  to: InputState,
  order: readonly InputId[],
  pulses: number,
  clock: InputId | undefined,
) {
  let res = applyToggles(circuit, sim, to, order);
  for (let i = 1; i < pulses && clock; i++) {
    res = applyToggles(circuit, res.sim, { ...res.sim.inputs, [clock]: 0 }, [clock]);
    res = applyToggles(circuit, res.sim, { ...res.sim.inputs, [clock]: 1 }, [clock]);
  }
  return res;
}

/**
 * Как ученик может перейти к шагу: состояние после спада такта и все допустимые порядки щелчков.
 * В упражнениях с импульсами такта (`ticks`) данные выставляются при CLK = 0, а такт подаётся последним.
 * В остальных упражнениях порядок любой.
 */
export function planStep(ex: Exercise, circuit: Circuit, sim: Sim, to: InputState) {
  const clk = ex.clock;
  let from = sim;
  if (ex.ticks && clk && from.inputs[clk] === 1) {
    from = applyToggles(circuit, from, { ...from.inputs, [clk]: 0 }, [clk]).sim;
  }
  const diff = ex.inputs.filter((id) => from.inputs[id] !== to[id]);
  if (!(ex.ticks && clk)) return { from, orders: permutations(diff) };
  const data = diff.filter((id) => id !== clk);
  const tail = diff.includes(clk) ? [clk] : [];
  return { from, orders: permutations(data).map((order) => [...order, ...tail]) };
}

/**
 * Прогон сценария. Каждый переход между шагами проверяется во ВСЕХ допустимых порядках
 * щелчков: ученик не должен застревать из-за порядка.
 */
export function expectStepsMatch(ex: Exercise, circuit: Circuit): void {
  const zero = zeroInputs();
  let sim: Sim = { inputs: zero, prev: settleStep(circuit, zero, new Map()).next };

  ex.steps!.forEach((step, i) => {
    const to: InputState = { ...zeroInputs(), ...step.inputs };
    const { from, orders } = planStep(ex, circuit, sim, to);
    if (!ex.ticks) {
      expect(
        orders[0].length,
        `«${ex.id}», шаг ${i + 1}: тумблеры должны меняться`,
      ).toBeGreaterThan(0);
    }

    for (const order of orders) {
      const { values } = applyWithPulses(circuit, from, to, order, step.pulses ?? 1, ex.clock);
      for (const [out, expected] of Object.entries(step.expect)) {
        expect(
          values.get(out),
          `«${ex.id}», шаг ${i + 1} («${step.text}»), порядок ${order.join('→') || '—'}: выход ${out}`,
        ).toBe(expected);
      }
    }
    sim = applyWithPulses(circuit, from, to, orders[0], step.pulses ?? 1, ex.clock).sim;
  });
}
