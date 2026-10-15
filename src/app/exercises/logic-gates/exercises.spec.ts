import {
  Circuit,
  COMPOSITE_GATES,
  GateInstance,
  GateType,
  Wire,
  inputsForRow,
  outputValue,
} from './circuit.model';
import { Exercise, EXERCISES } from './exercises';
import { ADDERS_EXERCISES } from './exercises-adders';
import { SECTIONS } from '../../sections/sections';

/**
 * Эталонные решения упражнений на таблицу истинности:
 * проверяем, что каждое действительно даёт целевые столбцы.
 */
function referenceSolution(id: string): Circuit {
  let n = 0;
  const G = (type: GateType): GateInstance => ({ id: `g${++n}`, type, x: 0, y: 0 });
  const W = (from: string, fromPin: string, to: string, toPin: string): Wire => ({
    id: `w${++n}`,
    from: { node: from, pin: fromPin as 'out' | 'in0' | 'in1' },
    to: { node: to, pin: toPin as 'out' | 'in0' | 'in1' },
  });

  switch (id) {
    /* ---------- раздел 1 ---------- */

    // 1. Провод: Y = A
    case 'wire':
      return { gates: [], wires: [W('A', 'out', 'Y', 'in0')] };

    // 2. Инвертор: Y = НЕ A
    case 'not': {
      const g = G('NOT');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 3. И: Y = A И B
    case 'and': {
      const g = G('AND');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W('B', 'out', g.id, 'in1'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 4. ИЛИ: Y = A ИЛИ B
    case 'or': {
      const g = G('OR');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W('B', 'out', g.id, 'in1'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 5. ИЛИ-НЕ: Y = НЕ(A ИЛИ B)
    case 'nor': {
      const g = G('NOR');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W('B', 'out', g.id, 'in1'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 6. И-НЕ: Y = НЕ(A И B)
    case 'nand': {
      const g1 = G('AND');
      const g2 = G('NOT');
      return {
        gates: [g1, g2],
        wires: [
          W('A', 'out', g1.id, 'in0'),
          W('B', 'out', g1.id, 'in1'),
          W(g1.id, 'out', g2.id, 'in0'),
          W(g2.id, 'out', 'Y', 'in0'),
        ],
      };
    }

    // 7. Разрешение: Y = D·E (A = D, B = E)
    case 'enable': {
      const g = G('AND');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W('B', 'out', g.id, 'in1'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 8. Блокировка: Y = A·НЕ-B
    case 'inhibit': {
      const gNot = G('NOT');
      const gAnd = G('AND');
      return {
        gates: [gNot, gAnd],
        wires: [
          W('B', 'out', gNot.id, 'in0'),
          W('A', 'out', gAnd.id, 'in0'),
          W(gNot.id, 'out', gAnd.id, 'in1'),
          W(gAnd.id, 'out', 'Y', 'in0'),
        ],
      };
    }

    // 9. Лишние входы: Y = НЕ A (B и C не подключены)
    case 'dont-care': {
      const g = G('NOT');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W(g.id, 'out', 'Y', 'in0')],
      };
    }

    // 8. XOR: (A ИЛИ B) И НЕ(A И B)
    case 'xor': {
      const gOr = G('OR');
      const gAnd = G('AND');
      const gNot = G('NOT');
      const gOut = G('AND');
      return {
        gates: [gOr, gAnd, gNot, gOut],
        wires: [
          W('A', 'out', gOr.id, 'in0'),
          W('B', 'out', gOr.id, 'in1'),
          W('A', 'out', gAnd.id, 'in0'),
          W('B', 'out', gAnd.id, 'in1'),
          W(gAnd.id, 'out', gNot.id, 'in0'),
          W(gOr.id, 'out', gOut.id, 'in0'),
          W(gNot.id, 'out', gOut.id, 'in1'),
          W(gOut.id, 'out', 'Y', 'in0'),
        ],
      };
    }

    // 11. Пара: Y = A·B и nY = НЕ(A·B)
    case 'pair': {
      const gAnd = G('AND');
      const gNot = G('NOT');
      return {
        gates: [gAnd, gNot],
        wires: [
          W('A', 'out', gAnd.id, 'in0'),
          W('B', 'out', gAnd.id, 'in1'),
          W(gAnd.id, 'out', 'Y', 'in0'),
          W(gAnd.id, 'out', gNot.id, 'in0'),
          W(gNot.id, 'out', 'nY', 'in0'),
        ],
      };
    }

    // 12. Равенство: Q = (A·B) ИЛИ (НЕ-A·НЕ-B) — XNOR из базовых
    case 'equals': {
      const gAnd1 = G('AND');
      const nA = G('NOT');
      const nB = G('NOT');
      const gAnd2 = G('AND');
      const gOr = G('OR');
      return {
        gates: [gAnd1, nA, nB, gAnd2, gOr],
        wires: [
          W('A', 'out', gAnd1.id, 'in0'),
          W('B', 'out', gAnd1.id, 'in1'),
          W('A', 'out', nA.id, 'in0'),
          W('B', 'out', nB.id, 'in0'),
          W(nA.id, 'out', gAnd2.id, 'in0'),
          W(nB.id, 'out', gAnd2.id, 'in1'),
          W(gAnd1.id, 'out', gOr.id, 'in0'),
          W(gAnd2.id, 'out', gOr.id, 'in1'),
          W(gOr.id, 'out', 'Q', 'in0'),
        ],
      };
    }

    // 13. Мажоритар: AB ИЛИ AC ИЛИ BC
    case 'majority': {
      const g1 = G('AND');
      const g2 = G('AND');
      const g3 = G('AND');
      const g4 = G('OR');
      const g5 = G('OR');
      return {
        gates: [g1, g2, g3, g4, g5],
        wires: [
          W('A', 'out', g1.id, 'in0'),
          W('B', 'out', g1.id, 'in1'),
          W('A', 'out', g2.id, 'in0'),
          W('C', 'out', g2.id, 'in1'),
          W('B', 'out', g3.id, 'in0'),
          W('C', 'out', g3.id, 'in1'),
          W(g1.id, 'out', g4.id, 'in0'),
          W(g2.id, 'out', g4.id, 'in1'),
          W(g4.id, 'out', g5.id, 'in0'),
          W(g3.id, 'out', g5.id, 'in1'),
          W(g5.id, 'out', 'Y', 'in0'),
        ],
      };
    }

    // 14. Мультиплексор: НЕ-A·B ИЛИ A·C
    case 'mux': {
      const gNot = G('NOT');
      const gAndB = G('AND');
      const gAndC = G('AND');
      const gOr = G('OR');
      return {
        gates: [gNot, gAndB, gAndC, gOr],
        wires: [
          W('A', 'out', gNot.id, 'in0'),
          W(gNot.id, 'out', gAndB.id, 'in0'),
          W('B', 'out', gAndB.id, 'in1'),
          W('A', 'out', gAndC.id, 'in0'),
          W('C', 'out', gAndC.id, 'in1'),
          W(gAndB.id, 'out', gOr.id, 'in0'),
          W(gAndC.id, 'out', gOr.id, 'in1'),
          W(gOr.id, 'out', 'Y', 'in0'),
        ],
      };
    }

    /* ---------- раздел 3: сумматоры ---------- */

    // Инкрементер: S = НЕ A, P = A
    case 'increment': {
      const g = G('NOT');
      return {
        gates: [g],
        wires: [W('A', 'out', g.id, 'in0'), W(g.id, 'out', 'S', 'in0'), W('A', 'out', 'P', 'in0')],
      };
    }

    // Полусумматор: S = A⊕B, P = A·B
    case 'half-adder': {
      const gOr = G('OR');
      const gAnd = G('AND');
      const gNot = G('NOT');
      const gX = G('AND');
      return {
        gates: [gOr, gAnd, gNot, gX],
        wires: [
          W('A', 'out', gOr.id, 'in0'),
          W('B', 'out', gOr.id, 'in1'),
          W('A', 'out', gAnd.id, 'in0'),
          W('B', 'out', gAnd.id, 'in1'),
          W(gAnd.id, 'out', gNot.id, 'in0'),
          W(gOr.id, 'out', gX.id, 'in0'),
          W(gNot.id, 'out', gX.id, 'in1'),
          W(gX.id, 'out', 'S', 'in0'),
          W(gAnd.id, 'out', 'P', 'in0'),
        ],
      };
    }

    // Бит суммы полного сумматора: S = (A⊕B)⊕C, каждый XOR — из И/ИЛИ/НЕ
    case 'full-adder-sum': {
      const o1 = G('OR');
      const a1 = G('AND');
      const n1 = G('NOT');
      const x1 = G('AND');
      const o2 = G('OR');
      const a2 = G('AND');
      const n2 = G('NOT');
      const x2 = G('AND');
      return {
        gates: [o1, a1, n1, x1, o2, a2, n2, x2],
        wires: [
          W('A', 'out', o1.id, 'in0'),
          W('B', 'out', o1.id, 'in1'),
          W('A', 'out', a1.id, 'in0'),
          W('B', 'out', a1.id, 'in1'),
          W(a1.id, 'out', n1.id, 'in0'),
          W(o1.id, 'out', x1.id, 'in0'),
          W(n1.id, 'out', x1.id, 'in1'),
          W(x1.id, 'out', o2.id, 'in0'),
          W('C', 'out', o2.id, 'in1'),
          W(x1.id, 'out', a2.id, 'in0'),
          W('C', 'out', a2.id, 'in1'),
          W(a2.id, 'out', n2.id, 'in0'),
          W(o2.id, 'out', x2.id, 'in0'),
          W(n2.id, 'out', x2.id, 'in1'),
          W(x2.id, 'out', 'S', 'in0'),
        ],
      };
    }

    // Полный сумматор: S = (A⊕B)⊕C и P = AB ИЛИ AC ИЛИ BC
    case 'full-adder': {
      const o1 = G('OR');
      const a1 = G('AND');
      const n1 = G('NOT');
      const x1 = G('AND');
      const o2 = G('OR');
      const a2 = G('AND');
      const n2 = G('NOT');
      const x2 = G('AND');
      const m1 = G('AND');
      const m2 = G('AND');
      const m3 = G('AND');
      const m4 = G('OR');
      const m5 = G('OR');
      return {
        gates: [o1, a1, n1, x1, o2, a2, n2, x2, m1, m2, m3, m4, m5],
        wires: [
          W('A', 'out', o1.id, 'in0'),
          W('B', 'out', o1.id, 'in1'),
          W('A', 'out', a1.id, 'in0'),
          W('B', 'out', a1.id, 'in1'),
          W(a1.id, 'out', n1.id, 'in0'),
          W(o1.id, 'out', x1.id, 'in0'),
          W(n1.id, 'out', x1.id, 'in1'),
          W(x1.id, 'out', o2.id, 'in0'),
          W('C', 'out', o2.id, 'in1'),
          W(x1.id, 'out', a2.id, 'in0'),
          W('C', 'out', a2.id, 'in1'),
          W(a2.id, 'out', n2.id, 'in0'),
          W(o2.id, 'out', x2.id, 'in0'),
          W(n2.id, 'out', x2.id, 'in1'),
          W(x2.id, 'out', 'S', 'in0'),
          W('A', 'out', m1.id, 'in0'),
          W('B', 'out', m1.id, 'in1'),
          W('A', 'out', m2.id, 'in0'),
          W('C', 'out', m2.id, 'in1'),
          W('B', 'out', m3.id, 'in0'),
          W('C', 'out', m3.id, 'in1'),
          W(m1.id, 'out', m4.id, 'in0'),
          W(m2.id, 'out', m4.id, 'in1'),
          W(m4.id, 'out', m5.id, 'in0'),
          W(m3.id, 'out', m5.id, 'in1'),
          W(m5.id, 'out', 'P', 'in0'),
        ],
      };
    }

    default:
      throw new Error(`Нет эталонного решения для упражнения «${id}»`);
  }
}

/** Проверка таблицы истинности: схема даёт целевые столбцы для всех строк */
function expectTableMatches(ex: Exercise, circuit: Circuit): void {
  for (let row = 0; row < ex.target.length; row++) {
    const inputs = inputsForRow(ex.inputs, row);
    const actuals = ex.outputs.map((o) => outputValue(circuit, inputs, o));
    expect(actuals, `строка ${row}`).toEqual([...ex.target[row]]);
  }
}

describe('EXERCISES — раздел «Простые схемы»', () => {
  it('упражнений 14, id уникальны, порядок от простого к сложному', () => {
    expect(EXERCISES.length).toBe(14);
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(EXERCISES.length);
    // составные элементы должны открываться ДО упражнений, где они разрешены
    const indexOf = (id: string) => ids.indexOf(id);
    expect(indexOf('nand')).toBeLessThan(
      Math.min(...EXERCISES.map((e, i) => (e.allowed.includes('NAND') ? i : ids.length))),
    );
    expect(indexOf('xor')).toBeLessThan(
      Math.min(
        ...EXERCISES.map((e, i) =>
          e.allowed.includes('XOR') || e.allowed.includes('XNOR') ? i : ids.length,
        ),
      ),
    );
  });

  it('каждая строка цели содержит по значению на выход, значения — биты', () => {
    for (const ex of EXERCISES) {
      expect(ex.target.length).toBe(2 ** ex.inputs.length);
      for (const targetRow of ex.target) {
        expect(targetRow.length).toBe(ex.outputs.length);
        for (const bit of targetRow) expect([0, 1]).toContain(bit);
      }
    }
  });

  it('каждое упражнение решается эталонной схемой из разрешённых элементов', () => {
    for (const ex of EXERCISES) {
      const circuit = referenceSolution(ex.id);

      // в эталонном решении используются только разрешённые элементы
      for (const gate of circuit.gates) {
        expect(ex.allowed, `упражнение «${ex.id}»`).toContain(gate.type);
      }

      expectTableMatches(ex, circuit);
    }
  });

  it('метаданные составных элементов указывают на существующие упражнения', () => {
    for (const [type, req] of Object.entries(COMPOSITE_GATES)) {
      const section = SECTIONS.find((s) => s.slug === req!.sectionSlug);
      expect(section, `раздел ${req!.sectionSlug} для ${type}`).toBeDefined();
      expect(
        section!.exercises.some((e) => e.id === req!.exerciseId),
        `упражнение ${req!.exerciseId} для ${type}`,
      ).toBe(true);
      // составной элемент не разрешён в упражнении, которое его открывает
      const opener = section!.exercises.find((e) => e.id === req!.exerciseId)!;
      expect(opener.allowed).not.toContain(type as GateType);
    }
  });
});

describe('ADDERS_EXERCISES — раздел «Сумматоры»', () => {
  it('id уникальны, первые четыре упражнения не сдвинуты (по номеру хранится прогресс)', () => {
    const ids = ADDERS_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ADDERS_EXERCISES.length);
    expect(ids.slice(0, 4)).toEqual(['increment', 'half-adder', 'full-adder-sum', 'full-adder']);
  });

  it('структура данных корректна: строки целей согласованы с выходами', () => {
    for (const ex of ADDERS_EXERCISES) {
      expect(ex.target.length).toBe(2 ** ex.inputs.length);
      for (const targetRow of ex.target) {
        expect(targetRow.length).toBe(ex.outputs.length);
        for (const bit of targetRow) expect([0, 1]).toContain(bit);
      }
    }
  });

  it('полусумматор: 1+1 = 10, остальные суммы без переноса', () => {
    const ex = ADDERS_EXERCISES.find((e) => e.id === 'half-adder')!;
    // сумма как двузначное число: A + B
    const values: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    values.forEach(([a, b], row) => {
      expect(ex.target[row]).toEqual([(a + b) % 2, a + b >= 2 ? 1 : 0]);
    });
  });

  it('полный сумматор: A + B + Cin с переносом, включая 1+1+1 = 11', () => {
    const ex = ADDERS_EXERCISES.find((e) => e.id === 'full-adder')!;
    for (let row = 0; row < 8; row++) {
      const sum = ((row >> 2) & 1) + ((row >> 1) & 1) + (row & 1); // A + B + Cin
      expect(ex.target[row]).toEqual([sum % 2, sum >= 2 ? 1 : 0]);
    }
  });

  it('первые четыре упражнения решаются эталонной схемой из разрешённых элементов', () => {
    // решения остальных — в exercises-netlist.spec.ts
    for (const ex of ADDERS_EXERCISES.slice(0, 4)) {
      const circuit = referenceSolution(ex.id);
      for (const gate of circuit.gates) {
        expect(ex.allowed, `упражнение «${ex.id}»`).toContain(gate.type);
      }
      expectTableMatches(ex, circuit);
    }
  });
});
