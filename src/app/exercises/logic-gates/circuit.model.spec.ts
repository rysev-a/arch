import {
  Circuit,
  GateInstance,
  InputState,
  NodeValue,
  Wire,
  createsCycle,
  evaluateCircuit,
  gateValue,
  gateValueX,
  inputsForRow,
  inputYs,
  outputValue,
  outputYs,
  pinPos,
  settleCircuit,
  wirePath,
  zeroInputs,
} from './circuit.model';

/** Целевая таблица первого «взрослого» упражнения: Y = НЕ A (B, C — не важные) */
const TARGET_NOT_A = [1, 1, 1, 1, 0, 0, 0, 0];

function circuitOf(gates: GateInstance[], wires: Wire[]): Circuit {
  return { gates, wires };
}

describe('circuit.model', () => {
  describe('inputsForRow', () => {
    it('разбирает номер строки в биты активных входов', () => {
      const abc: InputState = inputsForRow(['A', 'B', 'C'], 5);
      expect(abc).toEqual({ A: 1, B: 0, C: 1, D: 0, E: 0, F: 0 });

      expect(inputsForRow(['A', 'B', 'C'], 0)).toEqual(zeroInputs());
      expect(inputsForRow(['A', 'B', 'C'], 3)).toEqual({ ...zeroInputs(), B: 1, C: 1 });
      expect(inputsForRow(['A', 'B', 'C'], 7)).toEqual({ ...zeroInputs(), A: 1, B: 1, C: 1 });

      // шесть входов: первый — старший бит
      expect(inputsForRow(['A', 'B', 'C', 'D', 'E', 'F'], 0b100001)).toEqual({
        ...zeroInputs(),
        A: 1,
        F: 1,
      });

      // один вход: две строки
      expect(inputsForRow(['A'], 0).A).toBe(0);
      expect(inputsForRow(['A'], 1).A).toBe(1);

      // два входа: четыре строки
      expect(inputsForRow(['A', 'B'], 2)).toEqual({ ...zeroInputs(), A: 1, B: 0 });
    });
  });

  describe('gateValue', () => {
    it('считает AND, OR, NOR и NOT', () => {
      expect(gateValue('AND', 0, 1)).toBe(0);
      expect(gateValue('AND', 1, 1)).toBe(1);
      expect(gateValue('OR', 0, 1)).toBe(1);
      expect(gateValue('OR', 0, 0)).toBe(0);
      expect(gateValue('NOR', 0, 0)).toBe(1);
      expect(gateValue('NOR', 1, 0)).toBe(0);
      expect(gateValue('NOT', 0, undefined)).toBe(1);
      expect(gateValue('NOT', 1, undefined)).toBe(0);
    });

    it('составные: NAND, XOR и XNOR', () => {
      expect(gateValue('NAND', 0, 0)).toBe(1);
      expect(gateValue('NAND', 1, 1)).toBe(0);
      expect(gateValue('XOR', 0, 1)).toBe(1);
      expect(gateValue('XOR', 1, 1)).toBe(0);
      expect(gateValue('XNOR', 0, 0)).toBe(1);
      expect(gateValue('XNOR', 1, 0)).toBe(0);
      // без второго входа значение не определено
      expect(gateValue('XOR', 1, undefined)).toBeUndefined();
      expect(gateValue('XNOR', 0, undefined)).toBeUndefined();
      expect(gateValue('NAND', 1, undefined)).toBeUndefined();
    });

    it('неподключённый вход «протекает» до выхода', () => {
      expect(gateValue('AND', undefined, 1)).toBeUndefined();
      expect(gateValue('AND', 1, undefined)).toBeUndefined();
      expect(gateValue('NOR', 1, undefined)).toBeUndefined();
      expect(gateValue('NOT', undefined, undefined)).toBeUndefined();
    });
  });

  describe('инвертор: NOR или NOT с входом A даёт Y = НЕ A', () => {
    it('NOT решает таблицу для всех 8 строк', () => {
      const gates: GateInstance[] = [{ id: 'g1', type: 'NOT', x: 300, y: 176 }];
      const wires: Wire[] = [
        { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
        { id: 'w2', from: { node: 'g1', pin: 'out' }, to: { node: 'OUT', pin: 'in0' } },
      ];
      const circuit = circuitOf(gates, wires);

      for (let row = 0; row < 8; row++) {
        expect(outputValue(circuit, inputsForRow(['A', 'B', 'C'], row), 'OUT')).toBe(
          TARGET_NOT_A[row],
        );
      }
    });

    it('NOR с объединёнными входами A тоже решает таблицу', () => {
      const gates: GateInstance[] = [{ id: 'g1', type: 'NOR', x: 300, y: 176 }];
      const wires: Wire[] = [
        { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
        { id: 'w2', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in1' } },
        { id: 'w3', from: { node: 'g1', pin: 'out' }, to: { node: 'OUT', pin: 'in0' } },
      ];
      const circuit = circuitOf(gates, wires);

      for (let row = 0; row < 8; row++) {
        expect(outputValue(circuit, inputsForRow(['A', 'B', 'C'], row), 'OUT')).toBe(
          TARGET_NOT_A[row],
        );
      }
    });

    it('NOR на входе C даёт НЕ C и не совпадает с целью', () => {
      const gates: GateInstance[] = [{ id: 'g1', type: 'NOR', x: 300, y: 176 }];
      const wires: Wire[] = [
        { id: 'w1', from: { node: 'C', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
        { id: 'w2', from: { node: 'C', pin: 'out' }, to: { node: 'g1', pin: 'in1' } },
        { id: 'w3', from: { node: 'g1', pin: 'out' }, to: { node: 'OUT', pin: 'in0' } },
      ];
      const circuit = circuitOf(gates, wires);

      // НЕ C: строка 1 (A=0, B=0, C=1) → 0, а в цели 1
      expect(outputValue(circuit, inputsForRow(['A', 'B', 'C'], 1), 'OUT')).toBe(0);
      expect(outputValue(circuit, inputsForRow(['A', 'B', 'C'], 1), 'OUT')).not.toBe(
        TARGET_NOT_A[1],
      );
    });

    it('без провода на выходе значение undefined', () => {
      expect(outputValue(circuitOf([], []), inputsForRow(['A'], 0), 'OUT')).toBeUndefined();
    });
  });

  describe('evaluateCircuit', () => {
    it('гейт без провода на входе даёт undefined', () => {
      const gates: GateInstance[] = [
        { id: 'g1', type: 'AND', x: 0, y: 0 },
        { id: 'g2', type: 'NOT', x: 100, y: 0 },
      ];
      const values = evaluateCircuit(circuitOf(gates, []), inputsForRow(['A'], 0));
      expect(values.get('g1')).toBeUndefined();
      expect(values.get('g2')).toBeUndefined();
      expect(values.get('A')).toBe(0);
    });
  });

  describe('createsCycle', () => {
    it('разрешает обычное соединение вход → гейт → выход', () => {
      const gates: GateInstance[] = [{ id: 'g1', type: 'NOR', x: 0, y: 0 }];
      const wires: Wire[] = [
        { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
      ];
      const circuit = circuitOf(gates, wires);
      expect(createsCycle(circuit, { node: 'g1', pin: 'out' }, { node: 'OUT', pin: 'in0' })).toBe(
        false,
      );
    });

    it('запрещает провод, замыкающий выход гейта на его же вход', () => {
      const gates: GateInstance[] = [
        { id: 'g1', type: 'NOR', x: 0, y: 0 },
        { id: 'g2', type: 'NOR', x: 100, y: 0 },
      ];
      const wires: Wire[] = [
        { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'g1', pin: 'in0' } },
        { id: 'w2', from: { node: 'g1', pin: 'out' }, to: { node: 'g2', pin: 'in0' } },
      ];
      const circuit = circuitOf(gates, wires);
      // g1 → g2 уже есть; замкнуть g2 обратно на вход g1 — цикл
      expect(createsCycle(circuit, { node: 'g2', pin: 'out' }, { node: 'g1', pin: 'in1' })).toBe(
        true,
      );
    });

    it('запрещает соединение элемента с самим собой', () => {
      expect(
        createsCycle(circuitOf([], []), { node: 'g1', pin: 'out' }, { node: 'g1', pin: 'in0' }),
      ).toBe(true);
    });
  });

  describe('wirePath', () => {
    it('строит кривую Безье между точками', () => {
      const d = wirePath({ x: 0, y: 0 }, { x: 100, y: 50 });
      expect(d).toContain('M 0 0');
      expect(d).toContain('100 50');
    });
  });

  describe('раскладка доски', () => {
    const MIN_STEP = 50; // блок входа/выхода занимает 44 по высоте

    const steps = (ys: Record<string, number>) => {
      const sorted = Object.values(ys).sort((a, b) => a - b);
      return sorted.slice(1).map((y, i) => y - sorted[i]);
    };

    it('до трёх входов — прежние позиции, больше — равномерно и без наложений', () => {
      expect(inputYs(['A'])).toEqual({ A: 80 });
      expect(inputYs(['A', 'B'])).toEqual({ A: 80, B: 200 });
      expect(inputYs(['A', 'B', 'C'])).toEqual({ A: 80, B: 200, C: 320 });

      const six = inputYs(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(Object.keys(six)).toHaveLength(6);
      for (const step of steps(six)) expect(step).toBeGreaterThanOrEqual(MIN_STEP);
      for (const y of Object.values(six)) expect(y - 22 >= 0 && y + 22 <= 440).toBe(true);
    });

    it('выходы: 1 — по центру, до 4 — как раньше, больше — без наложений блоков', () => {
      expect(outputYs(['Y'])).toEqual({ Y: 200 });
      expect(outputYs(['Y', 'nY'])).toEqual({ Y: 80, nY: 320 });

      const eight = outputYs(Array.from({ length: 8 }, (_, i) => `Y${i}`));
      for (const step of steps(eight)) expect(step).toBeGreaterThanOrEqual(MIN_STEP);
      for (const y of Object.values(eight)) expect(y - 22 >= 0 && y + 22 <= 440).toBe(true);
    });

    it('пин входа берёт позицию из карты раскладки', () => {
      const ys = inputYs(['A', 'B', 'C', 'D']);
      expect(pinPos({ node: 'D', pin: 'out' }, [], {}, ys).y).toBe(ys['D']);
      // без карты — прежняя раскладка A/B/C
      expect(pinPos({ node: 'B', pin: 'out' }, []).y).toBe(200);
    });
  });

  describe('gateValueX — трёхзначная логика', () => {
    it('неопределённость не мешает, если ответ ясен', () => {
      expect(gateValueX('AND', 0, undefined)).toBe(0);
      expect(gateValueX('NAND', undefined, 0)).toBe(1);
      expect(gateValueX('OR', undefined, 1)).toBe(1);
      expect(gateValueX('NOR', 1, undefined)).toBe(0);
    });

    it('иначе неопределённость доходит до выхода', () => {
      expect(gateValueX('AND', 1, undefined)).toBeUndefined();
      expect(gateValueX('OR', 0, undefined)).toBeUndefined();
      expect(gateValueX('XOR', 1, undefined)).toBeUndefined();
      expect(gateValueX('NOT', undefined, undefined)).toBeUndefined();
    });

    it('на определённых значениях совпадает с gateValue', () => {
      for (const t of ['AND', 'OR', 'NOR', 'NAND', 'XOR', 'XNOR'] as const) {
        for (const a of [0, 1] as const) {
          for (const b of [0, 1] as const)
            expect(gateValueX(t, a, b), `${t}(${a},${b})`).toBe(gateValue(t, a, b));
        }
      }
      expect(gateValueX('NOT', 1, undefined)).toBe(0);
    });
  });

  describe('триггер DFF', () => {
    const dff: GateInstance = { id: 'ff', type: 'DFF', x: 0, y: 0 };
    // A = D, B = CLK
    const circuit = circuitOf(
      [dff],
      [
        { id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'ff', pin: 'in0' } },
        { id: 'w2', from: { node: 'B', pin: 'out' }, to: { node: 'ff', pin: 'in1' } },
        { id: 'w3', from: { node: 'ff', pin: 'out' }, to: { node: 'Q', pin: 'in0' } },
      ],
    );
    const at = (d: 0 | 1, clk: 0 | 1): InputState => ({ ...zeroInputs(), A: d, B: clk });
    const run = (steps: Array<[0 | 1, 0 | 1]>): NodeValue[] => {
      let prev = new Map<string, NodeValue>();
      return steps.map(([d, clk]) => {
        const r = settleCircuit(circuit, at(d, clk), prev);
        prev = r.values;
        return r.values.get('Q');
      });
    };

    it('при включении стоит в нуле', () => {
      expect(run([[1, 0]])).toEqual([0]);
    });

    it('запоминает D только по фронту 0 → 1 и держит до следующего', () => {
      expect(
        run([
          [1, 0], // данные готовы, такта нет
          [1, 1], // фронт: Q = 1
          [0, 1], // D меняется при высоком CLK — Q держит
          [0, 0], // спад — ничего не происходит
          [0, 1], // фронт при D = 0: Q = 0
          [1, 1], // D меняется — Q держит
        ]),
      ).toEqual([0, 1, 1, 1, 0, 0]);
    });

    it('если CLK уже был 1 при подключении, фронта нет', () => {
      expect(
        run([
          [1, 1],
          [1, 1],
        ]),
      ).toEqual([0, 0]);
    });

    it('неизвестный D на фронте даёт «?»', () => {
      const noData = circuitOf(
        [dff],
        [
          { id: 'w2', from: { node: 'B', pin: 'out' }, to: { node: 'ff', pin: 'in1' } },
          { id: 'w3', from: { node: 'ff', pin: 'out' }, to: { node: 'Q', pin: 'in0' } },
        ],
      );
      const r0 = settleCircuit(noData, at(0, 0), new Map());
      const r1 = settleCircuit(noData, at(0, 1), r0.values);
      expect(r1.values.get('Q')).toBeUndefined();
    });
  });
});
