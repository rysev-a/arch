import { Circuit, GateInstance, NativeInstance, NodeValue, Wire } from './circuit.model';
import { Exercise } from './exercises';
import { canConnect, sliceOf } from './interfaces';
import type { Section } from '../../sections/sections';

/**
 * Блоки: решённое упражнение становится блоком, у которого есть порты типов интерфейсов.
 * Блоки соединяются шинами; перед симуляцией схема из блоков разворачивается в плоскую схему
 * из вентилей — поэтому существующий симулятор работает без изменений.
 */

/* ============================================================
   Модель
   ============================================================ */

export interface BlockInstance {
  id: string;
  blockId: string;
  x: number;
  y: number;
}

/** Конец шины: `node` — id экземпляра блока либо TOP для портов самого упражнения */
export interface BusEnd {
  node: string;
  port: string;
  /** Путь к полю внутри типа порта: '' — весь порт, 'op', 'k.D1' */
  path: string;
}

export interface BusWire {
  id: string;
  from: BusEnd;
  to: BusEnd;
}

export const TOP = '$';

/** Решение из вентилей */
export interface GateSolution {
  gates: GateInstance[];
  wires: Wire[];
}

/** Решение из блоков */
export interface BlockSolution {
  instances: BlockInstance[];
  busWires: BusWire[];
}

/** Встроенная память: в схеме это «чёрный ящик» с адресом и данными, ячейки не из вентилей */
export interface NativeSolution {
  native: 'rom' | 'ram';
  /** какие узлы блока что значат: адрес, данные на запись, разрешение, такт, данные на чтение */
  addr: readonly string[];
  din?: readonly string[];
  we?: string;
  clk?: string;
  dout: readonly string[];
}

export type Solution = GateSolution | BlockSolution | NativeSolution;

export function isBlockSolution(s: Solution): s is BlockSolution {
  return 'instances' in s;
}

export function isNativeSolution(s: Solution): s is NativeSolution {
  return 'native' in s;
}

export function isGateSolution(s: Solution): s is GateSolution {
  return 'gates' in s;
}

export interface BlockPort {
  name: string;
  type: string;
  /** `in` — порт принимает сигнал, `out` — выдаёт */
  dir: 'in' | 'out';
  /** Узлы схемы по порядку бит типа: старший — первый */
  nodes: readonly string[];
}

/** Внешняя «розетка» схемы — те узлы, которыми она торчит наружу */
export interface BlockInterface {
  inputs: readonly string[];
  outputs: readonly string[];
  /** Подписи входов по порядку `inputs` */
  labels?: readonly string[];
  ports: readonly BlockPort[];
}

export interface BlockDef extends BlockInterface {
  id: string;
  title: string;
  /** Упражнение, чьё решение лежит внутри; у встроенных блоков — null */
  source: { sectionSlug: string; exerciseId: string } | null;
}

/** Интерфейс упражнения: его узлы, сгруппированные в порты */
export function interfaceOfExercise(ex: Exercise): BlockInterface {
  return {
    inputs: ex.inputs,
    outputs: ex.outputs,
    labels: ex.labels,
    ports: (ex.ports ?? []).map((p) => ({
      name: p.name,
      type: p.type,
      dir: p.nodes.every((n) => (ex.inputs as readonly string[]).includes(n)) ? 'in' : 'out',
      nodes: p.nodes,
    })),
  };
}

/* ============================================================
   Библиотека блоков
   ============================================================ */

export type BlockLookup = (blockId: string) => { def: BlockDef; solution: Solution } | undefined;

export interface BlockLibrary {
  defs: ReadonlyMap<string, BlockDef>;
  def(id: string): BlockDef | undefined;
  /** Схема внутри блока; у ещё не решённого блока — undefined */
  solution(id: string): Solution | undefined;
  available(id: string): boolean;
  /** Что нужно сделать, чтобы блок открылся */
  lockHint(id: string): string;
  lookup: BlockLookup;
}

export interface SolutionStore {
  load(progressKey: string, exerciseId: string): Solution | undefined;
  save(progressKey: string, exerciseId: string, solution: Solution): void;
}

const wire = (id: string, from: string, to: string): Wire => ({
  id,
  from: { node: from, pin: 'out' },
  to: { node: to, pin: 'in0' },
});

/** Переходник между типами: схема из одних проводов (D1 → A1, D0 → A0) */
function adapter(
  id: string,
  title: string,
  inType: string,
  outType: string,
  inNodes: readonly string[],
  outNodes: readonly string[],
): { def: BlockDef; solution: Solution } {
  return {
    def: {
      id,
      title,
      source: null,
      inputs: inNodes,
      outputs: outNodes,
      ports: [
        { name: 'in', type: inType, dir: 'in', nodes: inNodes },
        { name: 'out', type: outType, dir: 'out', nodes: outNodes },
      ],
    },
    solution: {
      gates: [],
      wires: inNodes.map((n, i) => wire(`w${i}`, n, outNodes[i])),
    },
  };
}

/** Встроенные блоки — доступны сразу, внутри них только провода */
const BUILTIN = [
  adapter('adapter-w2a', 'Слово → адрес', 'Word2', 'Addr2', ['A', 'B'], ['Y1', 'Y0']),
  adapter('adapter-a2w', 'Адрес → слово', 'Addr2', 'Word2', ['A', 'B'], ['Y1', 'Y0']),
];

function isSolution(v: unknown): v is Solution {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (Array.isArray(o['gates']) && Array.isArray(o['wires'])) ||
    (Array.isArray(o['instances']) && Array.isArray(o['busWires']))
  );
}

const storageKey = (progressKey: string, exerciseId: string) =>
  `processor-solution-v1-${progressKey}-${exerciseId}`;

export const localSolutionStore: SolutionStore = {
  load(progressKey, exerciseId) {
    try {
      const raw = localStorage.getItem(storageKey(progressKey, exerciseId));
      if (!raw) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return isSolution(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  },
  save(progressKey, exerciseId, solution) {
    try {
      localStorage.setItem(storageKey(progressKey, exerciseId), JSON.stringify(solution));
    } catch {
      // localStorage недоступен — блок просто не откроется
    }
  },
};

export function createLibrary(
  sections: readonly Section[],
  store: SolutionStore = localSolutionStore,
): BlockLibrary {
  const defs = new Map<string, BlockDef>();
  const origin = new Map<string, { section: Section; exercise: Exercise }>();
  const builtin = new Map<string, { def: BlockDef; solution: Solution }>();

  for (const b of BUILTIN) {
    defs.set(b.def.id, b.def);
    builtin.set(b.def.id, b);
  }
  for (const section of sections) {
    for (const exercise of section.exercises) {
      if (!exercise.block) continue;
      const iface = interfaceOfExercise(exercise);
      defs.set(exercise.block.id, {
        ...iface,
        id: exercise.block.id,
        title: exercise.block.title,
        source: { sectionSlug: section.slug, exerciseId: exercise.id },
      });
      origin.set(exercise.block.id, { section, exercise });
    }
  }

  // решения читаются из хранилища один раз на библиотеку: при каждом изменении схемы
  // она разворачивается заново, а JSON разбирать каждый раз незачем
  const cache = new Map<string, Solution | undefined>();
  const solution = (id: string): Solution | undefined => {
    const b = builtin.get(id);
    if (b) return b.solution;
    if (!cache.has(id)) {
      const o = origin.get(id);
      cache.set(id, o ? store.load(o.section.progressKey, o.exercise.id) : undefined);
    }
    return cache.get(id);
  };

  return {
    defs,
    def: (id) => defs.get(id),
    solution,
    available: (id) => solution(id) !== undefined,
    lockHint(id) {
      const o = origin.get(id);
      return o ? `Решите «${o.exercise.title}» в разделе «${o.section.title}»` : '';
    },
    lookup(id) {
      const def = defs.get(id);
      const sol = solution(id);
      return def && sol ? { def, solution: sol } : undefined;
    },
  };
}

/* ============================================================
   Концы шин: порты и срезы
   ============================================================ */

export interface EndInfo {
  port: BlockPort;
  /** Тип выбранного поля и его положение внутри порта */
  type: string;
  offset: number;
  length: number;
}

/** Порты узла схемы: у TOP — порты самого упражнения, у экземпляра — порты его блока */
export type PortsOf = (node: string) => readonly BlockPort[] | undefined;

export function endInfo(end: BusEnd, portsOf: PortsOf): EndInfo | undefined {
  const port = portsOf(end.node)?.find((p) => p.name === end.port);
  if (!port) return undefined;
  const slice = sliceOf(port.type, end.path);
  if (!slice) return undefined;
  return { port, ...slice };
}

/** Узлы схемы, соответствующие выбранному полю порта */
export function endNodes(info: EndInfo): readonly string[] {
  return info.port.nodes.slice(info.offset, info.offset + info.length);
}

/** Откуда идёт сигнал: у TOP — вход упражнения (`in`), у блока — его выход (`out`) */
export function isSourceEnd(end: BusEnd, info: EndInfo): boolean {
  return end.node === TOP ? info.port.dir === 'in' : info.port.dir === 'out';
}

/** Можно ли соединить: возвращает причину отказа или undefined */
export function connectionError(from: BusEnd, to: BusEnd, portsOf: PortsOf): string | undefined {
  const a = endInfo(from, portsOf);
  const b = endInfo(to, portsOf);
  if (!a || !b) return 'Такого порта нет';
  if (!isSourceEnd(from, a)) return 'Провод должен начинаться с выхода';
  if (isSourceEnd(to, b)) return 'Провод должен заканчиваться на входе';
  if (from.node === to.node && from.node !== TOP) return 'Нельзя замыкать блок на самого себя';
  if (!canConnect(a.type, b.type)) {
    return `Тип ${a.type} не подходит к ${b.type} — нужен переходник`;
  }
  return undefined;
}

/** Добавляет шину; старые шины, занимающие те же биты входа, заменяются */
export function addBusWire(wires: readonly BusWire[], next: BusWire, portsOf: PortsOf): BusWire[] {
  const target = endInfo(next.to, portsOf);
  if (!target) return [...wires];
  const mine = new Set(endNodes(target));
  const kept = wires.filter((w) => {
    if (w.to.node !== next.to.node || w.to.port !== next.to.port) return true;
    const info = endInfo(w.to, portsOf);
    return !info || !endNodes(info).some((n) => mine.has(n));
  });
  return [...kept, next];
}

/* ============================================================
   Разворачивание в плоскую схему
   ============================================================ */

/** Значение узла плоской схемы по его имени */
export type ValueScope = (node: string) => NodeValue;

export interface SubExpansion {
  def: BlockDef;
  solution: Solution;
  expansion: Expansion;
}

export interface Expansion {
  /** Плоская схема: вентили (у вложенных блоков — с префиксами `экземпляр__`) и провода */
  circuit: Circuit;
  /** Узел плоской схемы, чьё значение выходит на выходной узел экземпляра блока */
  outSource(instId: string, outNode: string): string | undefined;
  /** Узел плоской схемы, который подаёт сигнал на входной узел экземпляра блока */
  inSource(instId: string, inNode: string): string | undefined;
  subs: ReadonlyMap<string, SubExpansion>;
}

const EMPTY_SUBS: ReadonlyMap<string, SubExpansion> = new Map();

/**
 * Разворачивает решение в плоскую схему с теми же внешними узлами (входы A–F, имена выходов).
 * Решение из вентилей возвращается как есть.
 */
export function expand(solution: Solution, iface: BlockInterface, lookup: BlockLookup): Expansion {
  if (isNativeSolution(solution)) {
    // выходные узлы блока — выходы памяти; внутри блока одна «микросхема»
    const id = 'mem';
    const dout = solution.dout.map((n) => `${id}.${n}`);
    return {
      circuit: {
        gates: [],
        wires: solution.dout.map((n, i) => wire(`w${i}`, dout[i], n)),
        natives: [
          {
            id,
            kind: solution.native,
            addr: solution.addr,
            din: solution.din,
            we: solution.we,
            clk: solution.clk,
            dout,
          },
        ],
      },
      outSource: () => undefined,
      inSource: () => undefined,
      subs: EMPTY_SUBS,
    };
  }

  if (!isBlockSolution(solution)) {
    return {
      circuit: { gates: solution.gates, wires: solution.wires },
      outSource: () => undefined,
      inSource: () => undefined,
      subs: EMPTY_SUBS,
    };
  }

  const subs = new Map<string, SubExpansion>();
  for (const inst of solution.instances) {
    const info = lookup(inst.blockId);
    if (info) {
      subs.set(inst.id, {
        def: info.def,
        solution: info.solution,
        expansion: expand(info.solution, info.def, lookup),
      });
    }
  }

  const portsOf: PortsOf = (node) => (node === TOP ? iface.ports : subs.get(node)?.def.ports);

  /** кто подаёт сигнал на лист `экземпляр|узел` */
  const driver = new Map<string, { node: string; leaf: string }>();
  for (const w of solution.busWires) {
    if (connectionError(w.from, w.to, portsOf)) continue;
    const src = endNodes(endInfo(w.from, portsOf)!);
    const dst = endNodes(endInfo(w.to, portsOf)!);
    if (src.length !== dst.length) continue;
    dst.forEach((d, i) => driver.set(`${w.to.node}|${d}`, { node: w.from.node, leaf: src[i] }));
  }

  /** «внутренние источники» блока: его вентили и выходы встроенной памяти (а не входные узлы) */
  const isGateOf = new Map<string, Set<string>>();
  for (const [id, sub] of subs) {
    const c = sub.expansion.circuit;
    isGateOf.set(
      id,
      new Set([...c.gates.map((g) => g.id), ...(c.natives ?? []).flatMap((n) => n.dout)]),
    );
  }

  const resolveOut = (inst: string, outNode: string, seen: Set<string>): string | undefined => {
    if (inst === TOP) return outNode; // вход самого упражнения
    const sub = subs.get(inst);
    if (!sub) return undefined;
    const w = sub.expansion.circuit.wires.find((x) => x.to.node === outNode);
    if (!w) return undefined;
    if (isGateOf.get(inst)!.has(w.from.node)) return `${inst}__${w.from.node}`;
    return resolveIn(inst, w.from.node, seen); // выход прямо повторяет вход
  };

  const resolveIn = (inst: string, inNode: string, seen: Set<string>): string | undefined => {
    const key = `${inst}|${inNode}`;
    if (seen.has(key)) return undefined; // комбинационная петля из одних проводов
    seen.add(key);
    const d = driver.get(key);
    return d ? resolveOut(d.node, d.leaf, seen) : undefined;
  };

  const gates: GateInstance[] = [];
  const wires: Wire[] = [];
  const natives: NativeInstance[] = [];

  for (const [inst, sub] of subs) {
    const outs = new Set(sub.def.outputs);
    /** узел внутри блока → узел плоской схемы (свой источник — с префиксом, вход блока — его драйвер) */
    const map = (node: string | undefined): string | undefined =>
      node === undefined
        ? undefined
        : isGateOf.get(inst)!.has(node)
          ? `${inst}__${node}`
          : resolveIn(inst, node, new Set());
    for (const n of sub.expansion.circuit.natives ?? []) {
      natives.push({
        id: `${inst}__${n.id}`,
        kind: n.kind,
        addr: n.addr.map(map),
        din: n.din?.map(map),
        we: map(n.we),
        clk: map(n.clk),
        dout: n.dout.map((d) => `${inst}__${d}`),
      });
    }
    for (const g of sub.expansion.circuit.gates) gates.push({ ...g, id: `${inst}__${g.id}` });
    for (const w of sub.expansion.circuit.wires) {
      if (outs.has(w.to.node)) continue; // питание выходных узлов — это внутренность блока
      const from = isGateOf.get(inst)!.has(w.from.node)
        ? `${inst}__${w.from.node}`
        : resolveIn(inst, w.from.node, new Set());
      if (from === undefined) continue; // вход блока ни к чему не подключён
      wires.push({
        id: `${inst}__${w.id}`,
        from: { node: from, pin: 'out' },
        to: { node: `${inst}__${w.to.node}`, pin: w.to.pin },
      });
    }
  }

  for (const o of iface.outputs) {
    const d = driver.get(`${TOP}|${o}`);
    const src = d ? resolveOut(d.node, d.leaf, new Set()) : undefined;
    if (src !== undefined) wires.push(wire(`${TOP}out_${o}`, src, o));
  }

  return {
    circuit: natives.length > 0 ? { gates, wires, natives } : { gates, wires },
    outSource: (inst, outNode) => resolveOut(inst, outNode, new Set()),
    inSource: (inst, inNode) => resolveIn(inst, inNode, new Set()),
    subs,
  };
}

/** Значения внутри экземпляра блока по значениям родительской схемы */
export function childScope(
  scope: ValueScope,
  parent: Expansion,
  instId: string,
  def: BlockInterface,
): ValueScope {
  return (node) => {
    const source = (def.inputs as readonly string[]).includes(node)
      ? parent.inSource(instId, node)
      : (def.outputs as readonly string[]).includes(node)
        ? parent.outSource(instId, node)
        : `${instId}__${node}`;
    return source === undefined ? undefined : scope(source);
  };
}

/** Значения порта (или его поля) по порядку бит */
export function portValues(
  scope: ValueScope,
  expansion: Expansion,
  end: BusEnd,
  portsOf: PortsOf,
): NodeValue[] {
  const info = endInfo(end, portsOf);
  if (!info) return [];
  return endNodes(info).map((node) => {
    if (end.node === TOP) return scope(node);
    const source =
      info.port.dir === 'out'
        ? expansion.outSource(end.node, node)
        : expansion.inSource(end.node, node);
    return source === undefined ? undefined : scope(source);
  });
}
