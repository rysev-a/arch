import {
  Circuit,
  GateInstance,
  GateType,
  INPUT_IDS,
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
import { Exercise } from './exercises';
import { ADDERS_EXERCISES } from './exercises-adders';
import { ALU_EXERCISES } from './exercises-alu';
import { MEMORY_EXERCISES } from './exercises-memory';
import { DECODER_EXERCISES } from './exercises-decoder';
import { MUX_EXERCISES } from './exercises-mux';
import { LATCHES_EXERCISES } from './exercises-latches';
import { REGISTERS_EXERCISES } from './exercises-registers';
import {
  MUX_SOLUTIONS,
  LATCH_SOLUTIONS,
  REGISTER_SOLUTIONS,
  ADDER_SOLUTIONS,
  ALU_SOLUTIONS,
  MEMORY_SOLUTIONS,
  DECODER_SOLUTIONS,
  Solutions,
  build,
  expectStepsMatch,
  expectTableMatches,
} from './netlists.testing';

function expectStructure(list: readonly Exercise[]): void {
  const ids = list.map((e) => e.id);
  expect(new Set(ids).size, 'id уникальны').toBe(list.length);

  for (const ex of list) {
    // имена выходов не должны совпадать с идентификаторами тумблеров
    for (const o of ex.outputs) {
      expect(INPUT_IDS as readonly string[], `«${ex.id}»: выход ${o}`).not.toContain(o);
    }
    expect(ex.labels === undefined || ex.labels.length === ex.inputs.length, ex.id).toBe(true);
    expect(new Set(ex.inputs).size).toBe(ex.inputs.length);

    if (ex.mode === 'steps') {
      expect(ex.target.length).toBe(0);
      expect(ex.steps!.length).toBeGreaterThan(0);
      for (const step of ex.steps!) {
        for (const id of ex.inputs) expect([0, 1], `${ex.id}: ${id}`).toContain(step.inputs[id]);
        for (const id of Object.keys(step.inputs)) {
          expect(ex.inputs as readonly string[], `${ex.id}: лишний вход ${id}`).toContain(id);
        }
        for (const [o, bit] of Object.entries(step.expect)) {
          expect(ex.outputs, `${ex.id}: лишний выход ${o}`).toContain(o);
          expect([0, 1], `${ex.id}: ${o}`).toContain(bit);
        }
      }
      // каждый выход хоть на каком-то шаге проверяется
      for (const o of ex.outputs) {
        expect(
          ex.steps!.some((st) => st.expect[o] !== undefined),
          `${ex.id}: выход ${o} нигде не проверяется`,
        ).toBe(true);
      }
    } else {
      expect(ex.target.length, ex.id).toBe(2 ** ex.inputs.length);
      for (const row of ex.target) {
        expect(row.length, ex.id).toBe(ex.outputs.length);
        for (const bit of row) expect([0, 1]).toContain(bit);
      }
    }
  }
}

describe('MUX_EXERCISES — раздел «Мультиплексоры»', () => {
  it('12 упражнений, структура данных корректна', () => {
    expect(MUX_EXERCISES.length).toBe(12);
    expectStructure(MUX_EXERCISES);
  });

  it('все упражнения — на таблицу истинности', () => {
    for (const ex of MUX_EXERCISES) expect(ex.mode ?? 'table').toBe('table');
  });

  it('для каждого упражнения есть эталон, и наоборот', () => {
    expect(Object.keys(MUX_SOLUTIONS).sort()).toEqual(MUX_EXERCISES.map((e) => e.id).sort());
  });

  it('эталонные схемы дают целевые таблицы и используют только разрешённые элементы', () => {
    for (const ex of MUX_EXERCISES) {
      const { net, outs } = MUX_SOLUTIONS[ex.id];
      const circuit = build(ex, net, outs);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
      }
      expectTableMatches(ex, circuit);
    }
  });

  it('каждый выход эталона подключён (а в целевой таблице есть и нули, и единицы)', () => {
    for (const ex of MUX_EXERCISES) {
      const { outs } = MUX_SOLUTIONS[ex.id];
      expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
      ex.outputs.forEach((o, col) => {
        const values = new Set(ex.target.map((row) => row[col]));
        expect(values.size, `«${ex.id}»: столбец ${o} не должен быть константой`).toBe(2);
      });
    }
  });
});

describe('ADDERS_EXERCISES — упражнения после полного сумматора', () => {
  const added = ADDERS_EXERCISES.slice(4);

  it('в разделе 12 упражнений, структура данных корректна', () => {
    expect(ADDERS_EXERCISES.length).toBe(12);
    expectStructure(ADDERS_EXERCISES);
  });

  it('для каждого нового упражнения есть эталон, и наоборот', () => {
    expect(Object.keys(ADDER_SOLUTIONS).sort()).toEqual(added.map((e) => e.id).sort());
  });

  it('эталонные схемы дают целевые таблицы и используют только разрешённые элементы', () => {
    for (const ex of added) {
      const { net, outs } = ADDER_SOLUTIONS[ex.id];
      const circuit = build(ex, net, outs);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
      }
      expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
      expectTableMatches(ex, circuit);
    }
  });

  it('ни один столбец цели не константа', () => {
    for (const ex of added) {
      ex.outputs.forEach((o, col) => {
        expect(new Set(ex.target.map((r) => r[col])).size, `«${ex.id}»: ${o}`).toBe(2);
      });
    }
  });

  it('арифметика целей: сумма двух и трёх разрядов, вычитание через дополнение', () => {
    const bits = (row: number, n: number) =>
      Array.from({ length: n }, (_, i) => (row >> (n - 1 - i)) & 1);
    const num = (b: number[]) => b.reduce((acc, x) => acc * 2 + x, 0);

    const a3 = ADDERS_EXERCISES.find((e) => e.id === 'adder3')!;
    a3.target.forEach((t, row) => {
      const b = bits(row, 6);
      expect(num([...t]), `adder3, строка ${row}`).toBe(num(b.slice(0, 3)) + num(b.slice(3)));
    });

    // при M = 1: A + НЕ-B + 1; перенос P = 1 ⇔ A ≥ B (заёма нет)
    const as = ADDERS_EXERCISES.find((e) => e.id === 'add-sub')!;
    as.target.forEach((t, row) => {
      const [a, b, m] = bits(row, 3);
      if (m === 1) expect(t[1], `add-sub, строка ${row}`).toBe(a >= b ? 1 : 0);
      else expect(num([t[1], t[0]]), `add-sub, строка ${row}`).toBe(a + b); // столбцы: S, P
    });
  });
});

describe('ALU_EXERCISES — раздел «АЛУ»', () => {
  it('12 упражнений, структура данных корректна, все — на таблицу истинности', () => {
    expect(ALU_EXERCISES.length).toBe(12);
    expectStructure(ALU_EXERCISES);
    for (const ex of ALU_EXERCISES) expect(ex.mode ?? 'table', ex.id).toBe('table');
  });

  it('для каждого упражнения есть эталон, и наоборот', () => {
    expect(Object.keys(ALU_SOLUTIONS).sort()).toEqual(ALU_EXERCISES.map((e) => e.id).sort());
  });

  it('эталонные схемы дают целевые таблицы и используют только разрешённые элементы', () => {
    for (const ex of ALU_EXERCISES) {
      const { net, outs } = ALU_SOLUTIONS[ex.id];
      const circuit = build(ex, net, outs);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
      }
      expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
      expectTableMatches(ex, circuit);
    }
  });

  it('ни один столбец цели не константа', () => {
    for (const ex of ALU_EXERCISES) {
      ex.outputs.forEach((o, col) => {
        expect(new Set(ex.target.map((r) => r[col])).size, `«${ex.id}»: ${o}`).toBe(2);
      });
    }
  });

  it('схемы укладываются в разумный размер (финал — не больше тридцати элементов)', () => {
    for (const ex of ALU_EXERCISES) {
      const { net, outs } = ALU_SOLUTIONS[ex.id];
      expect(build(ex, net, outs).gates.length, ex.id).toBeLessThanOrEqual(30);
    }
  });

  it('АЛУ: четыре операции над всеми 16 парами чисел', () => {
    const ex = ALU_EXERCISES.find((e) => e.id === 'alu2')!;
    const expected = [
      (a: number, b: number) => (a + b) & 3,
      (a: number, b: number) => (a - b) & 3,
      (a: number, b: number) => a & b,
      (a: number, b: number) => a | b,
    ];
    ex.target.forEach((t, row) => {
      const a = (row >> 4) & 3;
      const b = (row >> 2) & 3;
      const op = row & 3;
      expect(t[0] * 2 + t[1], `alu2: ${a} op${op} ${b}`).toBe(expected[op](a, b));
    });
  });

  it('разряд АЛУ: перенос только у арифметики', () => {
    const ex = ALU_EXERCISES.find((e) => e.id === 'alu-slice')!;
    ex.target.forEach((t, row) => {
      const op1 = (row >> 1) & 1;
      if (op1 === 1) expect(t[1], `alu-slice, строка ${row}`).toBe(0);
    });
  });
});

describe('LATCHES_EXERCISES — раздел «Защёлки»', () => {
  it('12 упражнений, структура данных корректна', () => {
    expect(LATCHES_EXERCISES.length).toBe(12);
    expectStructure(LATCHES_EXERCISES);
  });

  it('все упражнения — пошаговые', () => {
    for (const ex of LATCHES_EXERCISES) expect(ex.mode, ex.id).toBe('steps');
  });

  it('для каждого упражнения есть эталон, и наоборот', () => {
    expect(Object.keys(LATCH_SOLUTIONS).sort()).toEqual(LATCHES_EXERCISES.map((e) => e.id).sort());
  });

  it('первый шаг не выполнен «сам собой» при выключенных тумблерах', () => {
    for (const ex of LATCHES_EXERCISES) {
      const first = ex.steps![0].inputs;
      expect(
        ex.inputs.every((id) => first[id] === 0),
        ex.id,
      ).toBe(false);
    }
  });

  it('соседние шаги отличаются входами или ожидаемыми выходами (иначе шаг засчитается сам)', () => {
    for (const ex of [...LATCHES_EXERCISES, ...REGISTERS_EXERCISES]) {
      ex.steps!.forEach((step, i) => {
        if (i === 0) return;
        const prev = ex.steps![i - 1];
        const inputsDiffer = ex.inputs.some((id) => prev.inputs[id] !== step.inputs[id]);
        const outputsDiffer = ex.outputs.some((o) => prev.expect[o] !== step.expect[o]);
        expect(inputsDiffer || outputsDiffer, `«${ex.id}», шаг ${i + 1}`).toBe(true);
      });
    }
  });

  for (const ex of LATCHES_EXERCISES) {
    it(`«${ex.title}» проходит весь сценарий при любом порядке щелчков`, () => {
      const { net, outs } = LATCH_SOLUTIONS[ex.id];
      const circuit = build(ex, net, outs);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
      }
      expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
      expectStepsMatch(ex, circuit);
    });
  }
});

describe('REGISTERS_EXERCISES — раздел «Регистры и такт»', () => {
  it('12 упражнений, структура данных корректна', () => {
    expect(REGISTERS_EXERCISES.length).toBe(12);
    expectStructure(REGISTERS_EXERCISES);
  });

  it('все упражнения тактируются, а такт — подписанный вход упражнения', () => {
    for (const ex of REGISTERS_EXERCISES) {
      expect(ex.mode, ex.id).toBe('steps');
      expect(ex.clock, ex.id).toBeDefined();
      expect(ex.inputs, ex.id).toContain(ex.clock);
      expect((ex.labels ?? ex.inputs)[ex.inputs.indexOf(ex.clock!)], ex.id).toBe('CLK');
    }
  });

  it('готовый DFF разрешён только после упражнения, которое его открывает', () => {
    const ids = REGISTERS_EXERCISES.map((e) => e.id);
    const opener = ids.indexOf('dff');
    expect(opener).toBeGreaterThanOrEqual(0);
    REGISTERS_EXERCISES.forEach((ex, i) => {
      if (ex.allowed.includes('DFF')) expect(i, ex.id).toBeGreaterThan(opener);
    });
    // и в других разделах он не нужен
    for (const other of [...MUX_EXERCISES, ...LATCHES_EXERCISES, ...ADDERS_EXERCISES]) {
      expect(other.allowed, other.id).not.toContain('DFF');
    }
  });

  it('упражнения на импульсах такта помечены ticks и разрешают DFF', () => {
    for (const ex of REGISTERS_EXERCISES) {
      if (ex.ticks) expect(ex.allowed, ex.id).toContain('DFF');
    }
  });

  it('для каждого упражнения есть эталон, и наоборот', () => {
    expect(Object.keys(REGISTER_SOLUTIONS).sort()).toEqual(
      REGISTERS_EXERCISES.map((e) => e.id).sort(),
    );
  });

  for (const ex of REGISTERS_EXERCISES) {
    it(`«${ex.title}» проходит весь сценарий при любом порядке щелчков`, () => {
      const { net, outs } = REGISTER_SOLUTIONS[ex.id];
      const circuit = build(ex, net, outs);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
      }
      expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
      expectStepsMatch(ex, circuit);
    });
  }
});

/** Общий набор проверок раздела: структура, эталоны, размер схем, сценарии */
function sectionSuite(
  title: string,
  list: readonly Exercise[],
  solutions: Solutions,
  count: number,
  maxGates: number,
): void {
  describe(title, () => {
    it(`${count} упражнений, структура данных корректна`, () => {
      expect(list.length).toBe(count);
      expectStructure(list);
    });

    it('для каждого упражнения есть эталон, и наоборот', () => {
      expect(Object.keys(solutions).sort()).toEqual(list.map((e) => e.id).sort());
    });

    it('эталоны используют только разрешённые элементы и укладываются в размер доски', () => {
      for (const ex of list) {
        const { net, outs } = solutions[ex.id];
        const circuit = build(ex, net, outs);
        for (const gate of circuit.gates) {
          expect(ex.allowed, `«${ex.id}»: элемент ${gate.type}`).toContain(gate.type);
        }
        expect(Object.keys(outs).sort(), ex.id).toEqual([...ex.outputs].sort());
        expect(circuit.gates.length, `«${ex.id}»: элементов`).toBeLessThanOrEqual(maxGates);
      }
    });

    it('столбцы целей — не константы', () => {
      for (const ex of list.filter((e) => e.mode !== 'steps')) {
        ex.outputs.forEach((o, col) => {
          expect(new Set(ex.target.map((r) => r[col])).size, `«${ex.id}»: ${o}`).toBe(2);
        });
      }
    });

    for (const ex of list) {
      it(`«${ex.title}» решается эталоном${ex.mode === 'steps' ? ' при любом порядке щелчков' : ''}`, () => {
        const { net, outs } = solutions[ex.id];
        const circuit = build(ex, net, outs);
        if (ex.mode === 'steps') expectStepsMatch(ex, circuit);
        else expectTableMatches(ex, circuit);
      });
    }
  });
}

sectionSuite('MEMORY_EXERCISES — раздел «Память»', MEMORY_EXERCISES, MEMORY_SOLUTIONS, 8, 30);
sectionSuite(
  'DECODER_EXERCISES — раздел «Декодер команд»',
  DECODER_EXERCISES,
  DECODER_SOLUTIONS,
  8,
  30,
);

describe('ISA: данные раздела «Память» и «Декодер команд» согласованы', () => {
  const rom = MEMORY_EXERCISES.find((e) => e.id === 'rom4x4')!;
  const control = DECODER_EXERCISES.find((e) => e.id === 'control-word')!;

  it('в ПЗУ лежит программа LDI 2, ADD 1, JNZ 1, HLT', () => {
    const word = (addr: number) => rom.target[addr].reduce<number>((acc, b) => acc * 2 + b, 0);
    expect([0, 1, 2, 3].map(word)).toEqual([0b0010, 0b0101, 0b1001, 0b1100]);
  });

  it('декодер по коду операции этой программы выдаёт нужные сигналы', () => {
    const ctl = (op: number) => [...control.target[op]]; // [Ld, Add, Jmp, Hlt]
    expect(ctl(0b00)).toEqual([1, 0, 0, 0]); // LDI
    expect(ctl(0b01)).toEqual([1, 1, 0, 0]); // ADD
    expect(ctl(0b10)).toEqual([0, 0, 1, 0]); // JNZ
    expect(ctl(0b11)).toEqual([0, 0, 0, 1]); // HLT
  });
});

describe('ширина доски', () => {
  it('число входов в упражнениях укладывается в доступные тумблеры', () => {
    for (const ex of [
      ...MUX_EXERCISES,
      ...LATCHES_EXERCISES,
      ...ADDERS_EXERCISES,
      ...REGISTERS_EXERCISES,
    ]) {
      expect(ex.inputs.length).toBeLessThanOrEqual(INPUT_IDS.length);
      ex.inputs.forEach((id, i) => expect(id as InputId).toBe(INPUT_IDS[i]));
    }
  });
});
