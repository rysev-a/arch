import { GateInstance, GateType, Wire } from '../exercises/logic-gates/circuit.model';
import {
  BlockDef,
  BlockInstance,
  BlockPort,
  BusEnd,
  BusWire,
  BlockSolution,
  GateSolution,
  NativeSolution,
  Solution,
  TOP,
} from '../exercises/logic-gates/blocks';
import { leafPaths } from '../exercises/logic-gates/interfaces';

/** Типы, у которых узлы называются по номерам бит: Byte → a7…a0 */
const NUMBERED = new Set(['Byte', 'Reg3', 'Op4', 'Imm6', 'Instr16', 'Word2', 'Addr2', 'Op2']);

/** Имена узлов порта по порядку бит (старший первым) */
export function nodesOf(name: string, type: string): string[] {
  const leaves = leafPaths(type);
  if (leaves.length === 1) return [name];
  if (NUMBERED.has(type)) return leaves.map((_, i) => `${name}${leaves.length - 1 - i}`);
  return leaves.map((p) => `${name}_${p.replace(/\./g, '_')}`);
}

/** Узел бита с номером i (0 — младший) числового порта */
export const bit = (name: string, i: number): string => `${name}${i}`;
/** Узел поля нечислового порта (Ctrl, Oh8): ctl('c', 'isBeq') */
export const field = (name: string, f: string): string => `${name}_${f}`;

export type PortSpec = readonly [name: string, type: string, dir: 'in' | 'out'];

export function makeDef(id: string, title: string, specs: readonly PortSpec[]): BlockDef {
  const ports: BlockPort[] = specs.map(([name, type, dir]) => ({
    name,
    type,
    dir,
    nodes: nodesOf(name, type),
  }));
  return {
    id,
    title,
    source: null,
    ports,
    inputs: ports.filter((p) => p.dir === 'in').flatMap((p) => p.nodes),
    outputs: ports.filter((p) => p.dir === 'out').flatMap((p) => p.nodes),
  };
}

export interface GeneratedBlock {
  def: BlockDef;
  solution: Solution;
}

const wire = (id: string, from: string, to: string, pin: 'in0' | 'in1' = 'in0'): Wire => ({
  id,
  from: { node: from, pin: 'out' },
  to: { node: to, pin },
});

/** Конструктор схемы из вентилей: каждый метод создаёт вентиль и возвращает его имя как источник */
export class GateBuilder {
  readonly gates: GateInstance[] = [];
  readonly wires: Wire[] = [];
  private n = 0;
  private depth = new Map<string, number>();

  private add(type: GateType, a: string, b?: string, named?: string): string {
    const id = named ?? `${type.toLowerCase()}${++this.n}`;
    this.gates.push({ id, type, x: 0, y: 0 });
    this.wires.push(wire(`${id}a`, a, id, 'in0'));
    if (b !== undefined) this.wires.push(wire(`${id}b`, b, id, 'in1'));
    this.depth.set(
      id,
      1 + Math.max(this.depth.get(a) ?? 0, b === undefined ? 0 : (this.depth.get(b) ?? 0)),
    );
    return id;
  }

  not = (a: string) => this.add('NOT', a);
  and = (a: string, b: string) => this.add('AND', a, b);
  or = (a: string, b: string) => this.add('OR', a, b);
  xor = (a: string, b: string) => this.add('XOR', a, b);
  xnor = (a: string, b: string) => this.add('XNOR', a, b);
  /** триггер по фронту: d — данные, clk — такт */
  dff = (d: string, clk: string) => this.add('DFF', d, clk);
  /** Триггер с заранее заданным именем — чтобы схема могла сослаться на его выход раньше, чем он создан */
  dffAt = (id: string, d: string, clk: string) => this.add('DFF', d, clk, id);

  /** И / ИЛИ нескольких сигналов — деревом из двухвходовых вентилей */
  andAll = (xs: readonly string[]) => this.tree(xs, this.and);
  orAll = (xs: readonly string[]) => this.tree(xs, this.or);

  private tree(xs: readonly string[], op: (a: string, b: string) => string): string {
    if (xs.length === 0) throw new Error('Пустое дерево вентилей');
    let layer = [...xs];
    while (layer.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? op(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
    }
    return layer[0];
  }

  /** Вывести источник на выходной узел блока */
  out(node: string, src: string): void {
    this.wires.push(wire(`out_${node}`, src, node));
  }

  /** Раскладка по слоям: чем дальше от входа, тем правее */
  build(): GateSolution {
    const columns = new Map<number, GateInstance[]>();
    for (const g of this.gates) {
      const d = this.depth.get(g.id) ?? 1;
      (columns.get(d) ?? columns.set(d, []).get(d)!).push(g);
    }
    const maxDepth = Math.max(1, ...columns.keys());
    const xStep = Math.min(110, 540 / Math.max(1, maxDepth));
    for (const [d, list] of columns) {
      list.forEach((g, i) => {
        g.x = 150 + (d - 1) * xStep;
        g.y = 20 + i * 62;
      });
    }
    return { gates: this.gates, wires: this.wires };
  }
}

/** Блок из вентилей: описание портов и функция сборки */
export function gateBlock(
  id: string,
  title: string,
  specs: readonly PortSpec[],
  make: (g: GateBuilder, def: BlockDef) => void,
): GeneratedBlock {
  const def = makeDef(id, title, specs);
  const g = new GateBuilder();
  make(g, def);
  return { def, solution: g.build() };
}

/** Блок из одних проводов (переименование, раскладка полей, расширение знака) */
export function wireBlock(
  id: string,
  title: string,
  specs: readonly PortSpec[],
  links: readonly (readonly [from: string, to: string])[],
): GeneratedBlock {
  const def = makeDef(id, title, specs);
  return {
    def,
    solution: { gates: [], wires: links.map(([f, t], i) => wire(`w${i}`, f, t)) },
  };
}

/** Встроенная память */
export function nativeBlock(
  id: string,
  title: string,
  specs: readonly PortSpec[],
  make: (def: BlockDef) => NativeSolution,
): GeneratedBlock {
  const def = makeDef(id, title, specs);
  return { def, solution: make(def) };
}

/** Конструктор схемы из блоков: ставим экземпляры и тянем шины */
export class HierBuilder {
  readonly instances: BlockInstance[] = [];
  readonly busWires: BusWire[] = [];
  private n = 0;

  /** Поставить блок; без координат — по сетке в три колонки сверху вниз */
  inst(id: string, blockId: string, at?: { x: number; y: number }): this {
    const i = this.instances.length;
    this.instances.push({
      id,
      blockId,
      x: at?.x ?? 150 + (i % 3) * 196,
      y: at?.y ?? 20 + Math.floor(i / 3) * 190,
    });
    return this;
  }

  /** Провод: `link('alu.res', 'wb.d0')`, `link('$.clk', 'pc.clk')`, с полем: `link('rom.word.op', 'dec.op')` */
  link(from: string, to: string): this {
    this.busWires.push({ id: `b${++this.n}`, from: end(from), to: end(to) });
    return this;
  }

  build(): BlockSolution {
    return { instances: this.instances, busWires: this.busWires };
  }
}

function end(ref: string): BusEnd {
  const [node, port, ...path] = ref.split('.');
  if (port === undefined) throw new Error(`Конец шины «${ref}» должен быть вида узел.порт[.поле]`);
  return { node: node === '$' ? TOP : node, port, path: path.join('.') };
}

export function hierBlock(
  id: string,
  title: string,
  specs: readonly PortSpec[],
  make: (h: HierBuilder) => void,
): GeneratedBlock {
  const def = makeDef(id, title, specs);
  const h = new HierBuilder();
  make(h);
  return { def, solution: h.build() };
}
