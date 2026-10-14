/**
 * Модель логической схемы: элементы, провода, вычисление значений.
 * Все координаты — в системе координат SVG-доски (viewBox).
 */

export type Bit = 0 | 1;

/** Значение узла: 0, 1 или undefined (не подключён) */
export type NodeValue = Bit | undefined;

/** DFF — D-триггер по фронту: вход 0 — данные D, вход 1 — такт CLK, выход — Q */
export type GateType = 'AND' | 'OR' | 'NOR' | 'NOT' | 'NAND' | 'XOR' | 'XNOR' | 'DFF';
export const GATE_TYPES: readonly GateType[] = [
  'AND',
  'OR',
  'NOR',
  'NOT',
  'NAND',
  'XOR',
  'XNOR',
  'DFF',
] as const;

/**
 * Составные элементы: каждый собирается из базовых вентилей.
 * Собрав его вручную в указанном упражнении, ученик открывает готовый блок в палитре.
 */
export const COMPOSITE_GATES: Partial<
  Record<GateType, { sectionSlug: string; exerciseId: string }>
> = {
  NAND: { sectionSlug: 'simple-circuits', exerciseId: 'nand' },
  XOR: { sectionSlug: 'simple-circuits', exerciseId: 'xor' },
  // XNOR — «НЕ от XOR»: открывается вместе с ним
  XNOR: { sectionSlug: 'simple-circuits', exerciseId: 'xor' },
  // триггер по фронту ученик сначала собирает сам — из ведущей и ведомой защёлок
  DFF: { sectionSlug: 'registers', exerciseId: 'dff' },
};

export const INPUT_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type InputId = (typeof INPUT_IDS)[number];
export type InputState = Record<InputId, Bit>;

export interface GateInstance {
  id: string;
  type: GateType;
  x: number;
  y: number;
}

export type PinKind = 'out' | 'in0' | 'in1';

export interface PinRef {
  /** id узла: 'A' | 'B' | 'C' | id гейта | имя выхода упражнения ('Y', 'Q', 'Y0'…) */
  node: string;
  pin: PinKind;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
}

/** Встроенная память — «микросхема» с адресом и данными; содержимое грузится снаружи */
export interface NativeInstance {
  id: string;
  kind: 'rom' | 'ram';
  /** узлы-источники адреса, старший бит первым; undefined — не подключён */
  addr: readonly (string | undefined)[];
  /** узлы данных на запись (только ram), старший бит первым */
  din?: readonly (string | undefined)[];
  /** разрешение записи и такт (только ram) */
  we?: string;
  clk?: string;
  /** имена узлов-выходов, старший бит первым */
  dout: readonly string[];
}

export interface Circuit {
  gates: GateInstance[];
  wires: Wire[];
  /** Встроенная память; общий симулятор её не умеет — только быстрый (cpu8/sim) */
  natives?: NativeInstance[];
}

export interface TableRow {
  targets: readonly Bit[];
  actuals: NodeValue[];
  ok: boolean;
}

/* ============================================================
   Геометрия доски
   ============================================================ */

export const BOARD_W = 880;
export const BOARD_H = 440;

export const GATE_W = 64;
export const GATE_H = 48;

/** Позиции уже размещённых узлов */
export const INPUT_X = 100; // выходной пин входов-тумблеров
export const OUT_X = 780; // входные пины выходов (Y, Q, ...)

const LEGACY_INPUT_Y: Record<string, number> = { A: 80, B: 200, C: 320 };

/**
 * Y-координаты входов на левом краю доски: до трёх — как раньше (80/200/320),
 * больше — равномерно по всей высоте (блок входа занимает 44, шаг не меньше ~50).
 */
export function inputYs(ids: readonly InputId[]): Record<string, number> {
  if (ids.length <= 3) {
    const res: Record<string, number> = {};
    ids.forEach((id, i) => (res[id] = Object.values(LEGACY_INPUT_Y)[i]));
    return res;
  }
  return spread(ids, 50, 390);
}

/** Y-координаты выходов на правом краю доски: 1 выход — по центру, до 4 — как раньше, больше — по всей высоте */
export function outputYs(outputs: readonly string[]): Record<string, number> {
  if (outputs.length === 1) return { [outputs[0]]: 200 };
  return outputs.length <= 4 ? spread(outputs, 80, 320) : spread(outputs, 40, 400);
}

function spread(names: readonly string[], top: number, bottom: number): Record<string, number> {
  const res: Record<string, number> = {};
  names.forEach((n, i) => {
    res[n] = top + (i * (bottom - top)) / (names.length - 1);
  });
  return res;
}

/** X выходного пина гейта (у вентилей с инверсией правее — там пузырёк) */
export const OUT_PIN_X: Record<GateType, number> = {
  AND: GATE_W + 8,
  OR: GATE_W + 8,
  NOR: GATE_W + 16,
  NOT: 64,
  NAND: GATE_W + 16,
  XOR: GATE_W + 8,
  XNOR: GATE_W + 16,
  DFF: GATE_W + 8,
};

/** Границы для перетаскивания гейтов */
export const GATE_MIN_X = 140;
export const GATE_MAX_X = 690;
export const GATE_MIN_Y = 12;
export const GATE_MAX_Y = BOARD_H - GATE_H - 12;

export interface Point {
  x: number;
  y: number;
}

/* ============================================================
   Логика
   ============================================================ */

/** Все тумблеры в нуле */
export function zeroInputs(): InputState {
  return Object.fromEntries(INPUT_IDS.map((id) => [id, 0])) as InputState;
}

/** Значения входов для строки таблицы истинности (row = биты активных входов, старший — первый) */
export function inputsForRow(ids: readonly InputId[], row: number): InputState {
  const state = zeroInputs();
  const n = ids.length;
  ids.forEach((id, i) => {
    state[id] = ((row >> (n - 1 - i)) & 1) as Bit;
  });
  return state;
}

export function samePin(a: PinRef, b: PinRef): boolean {
  return a.node === b.node && a.pin === b.pin;
}

export function gateValue(type: GateType, a: NodeValue, b: NodeValue): NodeValue {
  if (a === undefined) return undefined;
  switch (type) {
    case 'AND':
      return b === undefined ? undefined : ((a & b) as Bit);
    case 'NAND':
      return b === undefined ? undefined : (((a & b) ^ 1) as Bit);
    case 'OR':
      return b === undefined ? undefined : ((a | b) as Bit);
    case 'NOR':
      return b === undefined ? undefined : (((a | b) ^ 1) as Bit);
    case 'XOR':
      return b === undefined ? undefined : ((a ^ b) as Bit);
    case 'XNOR':
      return b === undefined ? undefined : ((a ^ b ^ 1) as Bit);
    case 'NOT':
      return (a ^ 1) as Bit;
    case 'DFF':
      return undefined; // имеет память — считается только в settleCircuit
  }
}

/**
 * Трёхзначная логика (0, 1, «?»): неопределённость не заражает выход, если ответ
 * и так ясен — И с нулём всегда 0, ИЛИ с единицей всегда 1. Нужна для схем с памятью:
 * закрытая защёлка с неизвестным содержимым остаётся «?», а открытая — определяется.
 */
export function gateValueX(type: GateType, a: NodeValue, b: NodeValue): NodeValue {
  const not = (v: NodeValue): NodeValue => (v === undefined ? undefined : ((v ^ 1) as Bit));
  const and = (): NodeValue => {
    if (a === 0 || b === 0) return 0;
    return a === undefined || b === undefined ? undefined : 1;
  };
  const or = (): NodeValue => {
    if (a === 1 || b === 1) return 1;
    return a === undefined || b === undefined ? undefined : 0;
  };
  const xor = (): NodeValue => (a === undefined || b === undefined ? undefined : ((a ^ b) as Bit));
  switch (type) {
    case 'AND':
      return and();
    case 'NAND':
      return not(and());
    case 'OR':
      return or();
    case 'NOR':
      return not(or());
    case 'XOR':
      return xor();
    case 'XNOR':
      return not(xor());
    case 'NOT':
      return not(a);
    case 'DFF':
      return undefined;
  }
}

/** Скрытое состояние триггера: предыдущий уровень тактового входа (для поиска фронта) */
export function clkKey(gateId: string): string {
  return `${gateId}#clk`;
}

/**
 * Вычисляет значения всех узлов схемы для заданного состояния входов.
 * Вход гейта без провода даёт undefined, и он «протекает» до выхода.
 */
export function evaluateCircuit(circuit: Circuit, inputs: InputState): Map<string, NodeValue> {
  const values = new Map<string, NodeValue>();
  for (const id of INPUT_IDS) values.set(id, inputs[id]);

  // карта «входной пин → откуда приходит сигнал»
  const sources = new Map<string, PinRef>();
  for (const w of circuit.wires) sources.set(`${w.to.node}:${w.to.pin}`, w.from);

  const inProgress = new Set<string>();
  const calc = (nodeId: string): NodeValue => {
    if (values.has(nodeId)) return values.get(nodeId);
    if (inProgress.has(nodeId)) return undefined; // защита от цикла
    inProgress.add(nodeId);
    const gate = circuit.gates.find((g) => g.id === nodeId);
    let v: NodeValue = undefined;
    if (gate) {
      const s0 = sources.get(`${nodeId}:in0`);
      const a = s0 ? calc(s0.node) : undefined;
      let b: NodeValue = undefined;
      if (gate.type !== 'NOT') {
        const s1 = sources.get(`${nodeId}:in1`);
        b = s1 ? calc(s1.node) : undefined;
      }
      v = gateValue(gate.type, a, b);
    }
    inProgress.delete(nodeId);
    values.set(nodeId, v);
    return v;
  };

  for (const g of circuit.gates) calc(g.id);
  return withOutputNodes(values, circuit);
}

/** Значение одного выхода (по имени узла выхода, например 'Y' или 'Q') */
export function outputValue(circuit: Circuit, inputs: InputState, output: string): NodeValue {
  const wire = circuit.wires.find((w) => w.to.node === output);
  if (!wire) return undefined;
  return evaluateCircuit(circuit, inputs).get(wire.from.node);
}

export interface SettleResult {
  values: Map<string, NodeValue>;
  stable: boolean;
}

/** true, если узел — физический вход (A/B/C) или элемент схемы */
function isSourceNode(node: string, gates: GateInstance[]): boolean {
  return (INPUT_IDS as readonly string[]).includes(node) || gates.some((g) => g.id === node);
}

/**
 * Дописывает в карту значения выходных узлов (Y, Q, nQ…):
 * каждый выход — зеркало подключённого к нему источника.
 */
function withOutputNodes(values: Map<string, NodeValue>, circuit: Circuit): Map<string, NodeValue> {
  const res = new Map(values);
  for (const w of circuit.wires) {
    if (!isSourceNode(w.to.node, circuit.gates)) res.set(w.to.node, res.get(w.from.node));
  }
  return res;
}

/**
 * Пошаговая симуляция схемы с обратными связями (защёлки) и триггерами.
 * На каждом шаге все элементы пересчитываются одновременно из предыдущего состояния;
 * если состояние перестало меняться — схема устоялась (stable).
 * Всё, что неизвестно (память, до которой не дошла команда записи), — «?»: см. gateValueX.
 * Триггер DFF запоминает вход D в момент перехода такта 0 → 1; при включении он в нуле.
 * Если из предыдущего состояния схема не устоявается, пробуем «свежий запуск» с неизвестных значений.
 * Если и это не помогает (генерация) — возвращаем неопределённые значения.
 */
export function settleCircuit(
  circuit: Circuit,
  inputs: InputState,
  prev: Map<string, NodeValue>,
): SettleResult {
  const sources = new Map<string, PinRef>();
  for (const w of circuit.wires) sources.set(`${w.to.node}:${w.to.pin}`, w.from);

  const dffs = circuit.gates.filter((g) => g.type === 'DFF');

  const computeNext = (cur: Map<string, NodeValue>): Map<string, NodeValue> => {
    const next = new Map<string, NodeValue>(cur);
    for (const g of circuit.gates) {
      const s0 = sources.get(`${g.id}:in0`);
      const a = s0 ? cur.get(s0.node) : undefined;
      let b: NodeValue = undefined;
      if (g.type !== 'NOT') {
        const s1 = sources.get(`${g.id}:in1`);
        b = s1 ? cur.get(s1.node) : undefined;
      }
      if (g.type === 'DFF') {
        const edge = cur.get(clkKey(g.id)) === 0 && b === 1;
        if (edge) next.set(g.id, a);
        next.set(clkKey(g.id), b);
      } else {
        next.set(g.id, gateValueX(g.type, a, b));
      }
    }
    return next;
  };

  /** ключи, по которым схема «устоялась»: элементы и скрытые состояния триггеров */
  const stateKeys = [...circuit.gates.map((g) => g.id), ...dffs.map((g) => clkKey(g.id))];
  const serialize = (state: Map<string, NodeValue>): string =>
    stateKeys.map((k) => `${k}=${state.get(k)}`).join('|');

  const attempt = (from: Map<string, NodeValue>): SettleResult => {
    let cur = new Map<string, NodeValue>();
    for (const id of INPUT_IDS) cur.set(id, inputs[id]);
    for (const g of circuit.gates) {
      if (from.has(g.id)) cur.set(g.id, from.get(g.id));
      else cur.set(g.id, g.type === 'DFF' ? 0 : undefined);
    }
    for (const g of dffs) cur.set(clkKey(g.id), from.get(clkKey(g.id)));

    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const key = serialize(cur);
      if (seen.has(key)) return { values: cur, stable: false }; // генерация
      seen.add(key);
      const next = computeNext(cur);
      const same = stateKeys.every((k) => next.get(k) === cur.get(k));
      if (same) return { values: withOutputNodes(next, circuit), stable: true };
      cur = next;
    }
    return { values: cur, stable: false };
  };

  // сначала продолжаем из предыдущего состояния, затем — «свежий запуск» с неизвестных значений
  const r0 = attempt(prev);
  if (r0.stable) return r0;
  const r1 = attempt(new Map());
  if (r1.stable) return r1;

  const unknown = new Map<string, NodeValue>();
  for (const id of INPUT_IDS) unknown.set(id, inputs[id]);
  for (const g of circuit.gates) unknown.set(g.id, undefined);
  return { values: withOutputNodes(unknown, circuit), stable: false };
}

/**
 * Проверяет, создаст ли новое соединение from → to цикл.
 * Цикл есть, если из целевого узла (to) можно «дойти» до узла-источника (from).
 */
export function createsCycle(circuit: Circuit, from: PinRef, to: PinRef): boolean {
  if (to.node === from.node) return true;
  const adjacency = new Map<string, string[]>();
  for (const w of circuit.wires) {
    const list = adjacency.get(w.from.node) ?? [];
    list.push(w.to.node);
    adjacency.set(w.from.node, list);
  }
  const seen = new Set<string>([to.node]);
  const stack: string[] = [to.node];
  while (stack.length > 0) {
    const n = stack.pop() as string;
    if (n === from.node) return true;
    for (const next of adjacency.get(n) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

/* ============================================================
   Геометрия пинов и проводов
   ============================================================ */

/** Координаты пина в системе координат доски */
export function pinPos(
  ref: PinRef,
  gates: GateInstance[],
  outputYMap: Record<string, number> = {},
  inputYMap: Record<string, number> = LEGACY_INPUT_Y,
): Point {
  if (ref.pin !== 'out') {
    const oy = outputYMap[ref.node];
    if (oy !== undefined) return { x: OUT_X, y: oy };
  }

  const inputY = inputYMap[ref.node];
  if (inputY !== undefined && ref.pin === 'out') return { x: INPUT_X, y: inputY };

  const gate = gates.find((g) => g.id === ref.node);
  if (!gate) return { x: 0, y: 0 };
  if (ref.pin === 'out') return { x: gate.x + OUT_PIN_X[gate.type], y: gate.y + 24 };
  return { x: gate.x - 8, y: gate.y + (ref.pin === 'in0' ? 14 : 34) };
}

/** Путь провода — кубическая кривая Безье */
export function wirePath(a: Point, b: Point): string {
  const dx = Math.min(110, Math.max(36, Math.abs(b.x - a.x) / 2));
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

let seq = 0;

/** После загрузки сохранённой схемы: новые id не должны совпасть с уже занятыми (g3, w7…) */
export function reserveUids(ids: readonly string[]): void {
  for (const id of ids) {
    const n = Number(/(\d+)$/.exec(id)?.[1]);
    if (Number.isFinite(n)) seq = Math.max(seq, n);
  }
}

export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}
