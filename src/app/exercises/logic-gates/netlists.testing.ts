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
import { Exercise } from './exercises';
import { Net } from './solutions';
export * from './solutions';

export type { Net, Solutions } from './solutions';

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
