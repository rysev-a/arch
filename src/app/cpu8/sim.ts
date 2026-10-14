import {
  Circuit,
  GateType,
  NativeInstance,
  NodeValue,
} from '../exercises/logic-gates/circuit.model';

export type { NativeInstance };

/**
 * Быстрый симулятор схем без обратных связей, кроме триггеров.
 * Схема «компилируется» один раз: вентили упорядочиваются по зависимостям, и каждый расчёт — один
 * проход по массиву. Это в сотни раз быстрее общего симулятора и нужно для процессора на ~1000 вентилей,
 * который за программу делает тысячи тактов.
 *
 * Значения: 0, 1 и «неизвестно» (X = −1), как в общем симуляторе.
 */

export class CombinationalLoopError extends Error {
  constructor(readonly nodes: string[]) {
    super(`В схеме есть петля без триггера: ${nodes.slice(0, 5).join(', ')}…`);
  }
}

const X = -1;

interface Cell {
  type: GateType;
  out: number;
  a: number; // индекс источника входа 0 (−1 — не подключён)
  b: number;
}

interface Dff {
  out: number;
  d: number;
  clk: number;
  prev: number;
}

interface Native {
  inst: NativeInstance;
  kind: 'rom' | 'ram';
  addr: number[];
  din: number[];
  dout: number[];
  we: number;
  clk: number;
  prev: number;
  /** содержимое: слова (rom: 16 бит) или байты (ram) */
  data: Uint16Array;
}

type Element = { kind: 'gate'; cell: Cell } | { kind: 'rom' | 'ram'; native: Native };

export class CompiledSim {
  /** значения всех узлов; индекс — по таблице index */
  private readonly v: Int8Array;
  private readonly index = new Map<string, number>();
  private readonly order: Element[] = [];
  private readonly dffs: Dff[] = [];
  private readonly natives = new Map<string, Native>();
  private readonly aliases: { out: number; src: number }[] = [];

  /** сколько вентилей в схеме (без триггеров) и триггеров */
  readonly gateCount: number;
  readonly dffCount: number;

  constructor(circuit: Circuit) {
    const idx = (name: string): number => {
      let i = this.index.get(name);
      if (i === undefined) {
        i = this.index.size;
        this.index.set(name, i);
      }
      return i;
    };

    const gateIds = new Set(circuit.gates.map((g) => g.id));
    const natives = circuit.natives ?? [];
    const nativeOuts = new Set(natives.flatMap((n) => n.dout));

    // источник входа: wire.to → wire.from
    const source = new Map<string, string>();
    for (const w of circuit.wires) source.set(`${w.to.node}:${w.to.pin}`, w.from.node);

    for (const g of circuit.gates) idx(g.id);
    for (const n of natives) n.dout.forEach(idx);

    // выходные узлы упражнения (не вентиль и не вход) — просто повторяют источник
    for (const w of circuit.wires) {
      if (!gateIds.has(w.to.node) && !nativeOuts.has(w.to.node)) {
        this.aliases.push({ out: idx(w.to.node), src: idx(w.from.node) });
      }
    }

    const ref = (node: string | undefined): number => (node === undefined ? X : idx(node));

    const cells: Cell[] = [];
    for (const g of circuit.gates) {
      const a = source.get(`${g.id}:in0`);
      const b = g.type === 'NOT' ? undefined : source.get(`${g.id}:in1`);
      if (g.type === 'DFF') {
        this.dffs.push({ out: idx(g.id), d: ref(a), clk: ref(b), prev: X });
      } else {
        cells.push({ type: g.type, out: idx(g.id), a: ref(a), b: ref(b) });
      }
    }

    const nativeList: Native[] = natives.map((inst) => ({
      inst,
      kind: inst.kind,
      addr: inst.addr.map(ref),
      din: (inst.din ?? []).map(ref),
      dout: inst.dout.map(idx),
      we: ref(inst.we),
      clk: ref(inst.clk),
      prev: X,
      data: new Uint16Array(1 << inst.addr.length),
    }));
    for (const n of nativeList) this.natives.set(n.inst.id, n);

    // все узлы, на которые что-то ссылается, должны существовать до создания массива значений
    const size = this.index.size + 1;
    this.v = new Int8Array(size).fill(X);
    this.sourceNodes(circuit, gateIds, nativeOuts);
    for (const d of this.dffs) this.v[d.out] = 0; // при включении триггеры в нуле

    this.order = this.sort(cells, nativeList);
    this.gateCount = cells.length;
    this.dffCount = this.dffs.length;
    this.settle();
  }

  /** узлы-входы (источники без вентиля) стартуют с нуля, а не с «неизвестно» */
  private sourceNodes(circuit: Circuit, gateIds: Set<string>, nativeOuts: Set<string>): void {
    for (const w of circuit.wires) {
      const n = w.from.node;
      if (!gateIds.has(n) && !nativeOuts.has(n)) this.v[this.index.get(n)!] = 0;
    }
  }

  /** Упорядочивание по зависимостям; петля без триггера — ошибка */
  private sort(cells: Cell[], natives: Native[]): Element[] {
    const elements: Element[] = [
      ...cells.map((cell) => ({ kind: 'gate', cell }) as Element),
      ...natives.map((native) => ({ kind: native.kind, native }) as Element),
    ];
    const producer = new Map<number, number>(); // узел → индекс элемента
    elements.forEach((e, i) => {
      if (e.kind === 'gate') producer.set(e.cell.out, i);
      else for (const o of e.native.dout) producer.set(o, i);
    });
    const deps = (e: Element): number[] =>
      (e.kind === 'gate' ? [e.cell.a, e.cell.b] : e.native.addr).filter((x) => x >= 0);

    const state = new Array<number>(elements.length).fill(0); // 0 — не видели, 1 — внутри, 2 — готово
    const result: Element[] = [];
    const names = [...this.index.entries()].reduce<string[]>(
      (acc, [k, i]) => ((acc[i] = k), acc),
      [],
    );

    // обход в глубину без рекурсии: схема может быть глубиной в сотни уровней
    for (let start = 0; start < elements.length; start++) {
      if (state[start] !== 0) continue;
      const stack: { i: number; next: number; d: number[] }[] = [
        { i: start, next: 0, d: deps(elements[start]) },
      ];
      state[start] = 1;
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.next < top.d.length) {
          const p = producer.get(top.d[top.next++]);
          if (p === undefined || state[p] === 2) continue;
          if (state[p] === 1) {
            const loop = stack.map((s) => {
              const e = elements[s.i];
              return names[e.kind === 'gate' ? e.cell.out : e.native.dout[0]];
            });
            throw new CombinationalLoopError(loop);
          }
          state[p] = 1;
          stack.push({ i: p, next: 0, d: deps(elements[p]) });
        } else {
          state[top.i] = 2;
          result.push(elements[top.i]);
          stack.pop();
        }
      }
    }
    return result;
  }

  /* ---------- значения ---------- */

  has(node: string): boolean {
    return this.index.has(node);
  }

  get(node: string): NodeValue {
    const i = this.index.get(node);
    if (i === undefined) return undefined;
    const x = this.v[i];
    return x === X ? undefined : (x as 0 | 1);
  }

  /** Задать значение входа: любое ненулевое число — единица */
  set(node: string, value: number): void {
    const i = this.index.get(node);
    if (i !== undefined) this.v[i] = value ? 1 : 0;
  }

  /** Расчёт всей комбинационной части: один проход */
  settle(): void {
    const v = this.v;
    for (const e of this.order) {
      if (e.kind === 'gate') {
        const { type, out, a, b } = e.cell;
        const x = a < 0 ? X : v[a];
        const y = b < 0 ? X : v[b];
        v[out] = evalGate(type, x, y);
      } else {
        const n = e.native;
        const addr = readBits(v, n.addr);
        const word = addr < 0 ? -1 : n.data[addr];
        const w = n.dout.length;
        for (let k = 0; k < w; k++) v[n.dout[k]] = word < 0 ? X : (word >> (w - 1 - k)) & 1;
      }
    }
    for (const al of this.aliases) v[al.out] = v[al.src];
  }

  /**
   * Один период такта: CLK = 0, затем фронт 0 → 1 и снова 0.
   * Триггеры и запись в память берут значения, посчитанные ДО фронта.
   */
  pulse(clkNode: string): void {
    const v = this.v;
    const c = this.index.get(clkNode);
    if (c === undefined) throw new Error(`Нет узла такта «${clkNode}»`);
    v[c] = 0;
    this.settle();
    for (const d of this.dffs) d.prev = d.clk < 0 ? X : v[d.clk];
    for (const n of this.natives.values()) n.prev = n.clk < 0 ? X : v[n.clk];

    v[c] = 1;
    this.settle(); // такт поднялся: вентили на пути такта (если есть) пересчитались

    // что нужно «защёлкнуть» — выбираем, пока ничего не изменилось
    const latched: { d: Dff; value: number }[] = [];
    for (const d of this.dffs) {
      if (d.prev === 0 && d.clk >= 0 && v[d.clk] === 1)
        latched.push({ d, value: d.d < 0 ? X : v[d.d] });
    }
    const writes: { n: Native; addr: number; value: number }[] = [];
    for (const n of this.natives.values()) {
      if (n.kind !== 'ram' || !(n.prev === 0 && n.clk >= 0 && v[n.clk] === 1) || v[n.we] !== 1)
        continue;
      const addr = readBits(v, n.addr);
      const value = readBits(v, n.din);
      if (addr >= 0 && value >= 0) writes.push({ n, addr, value });
    }
    for (const l of latched) v[l.d.out] = l.value;
    for (const w of writes) w.n.data[w.addr] = w.value;

    this.settle();
    v[c] = 0;
    this.settle();
  }

  /* ---------- память ---------- */

  loadRom(id: string, words: ArrayLike<number>): void {
    this.native(id, 'rom').data.fill(0);
    for (let i = 0; i < words.length; i++) this.native(id, 'rom').data[i] = words[i];
    this.settle();
  }

  loadRam(id: string, bytes: ArrayLike<number>): void {
    const n = this.native(id, 'ram');
    n.data.fill(0);
    for (let i = 0; i < bytes.length; i++) n.data[i] = bytes[i] & 0xff;
    this.settle();
  }

  /** Копия содержимого памяти */
  memory(id: string): Uint16Array {
    const n = this.natives.get(id);
    if (!n) throw new Error(`Нет памяти «${id}»`);
    return n.data.slice();
  }

  hasNative(id: string): boolean {
    return this.natives.has(id);
  }

  private native(id: string, kind: 'rom' | 'ram'): Native {
    const n = this.natives.get(id);
    if (!n || n.kind !== kind) throw new Error(`Нет памяти «${id}» вида ${kind}`);
    return n;
  }

  /** Число из значений узлов (старший первым); undefined, если где-то «неизвестно» */
  read(nodes: readonly string[]): number | undefined {
    let r = 0;
    for (const n of nodes) {
      const x = this.get(n);
      if (x === undefined) return undefined;
      r = (r << 1) | x;
    }
    return r;
  }
}

function readBits(v: Int8Array, idxs: readonly number[]): number {
  let r = 0;
  for (const i of idxs) {
    const x = i < 0 ? X : v[i];
    if (x < 0) return -1;
    r = (r << 1) | x;
  }
  return r;
}

function evalGate(type: GateType, a: number, b: number): number {
  switch (type) {
    case 'NOT':
      return a < 0 ? X : 1 - a;
    case 'AND':
      return a === 0 || b === 0 ? 0 : a < 0 || b < 0 ? X : 1;
    case 'NAND':
      return a === 0 || b === 0 ? 1 : a < 0 || b < 0 ? X : 0;
    case 'OR':
      return a === 1 || b === 1 ? 1 : a < 0 || b < 0 ? X : 0;
    case 'NOR':
      return a === 1 || b === 1 ? 0 : a < 0 || b < 0 ? X : 1;
    case 'XOR':
      return a < 0 || b < 0 ? X : a ^ b;
    case 'XNOR':
      return a < 0 || b < 0 ? X : 1 - (a ^ b);
    default:
      return X;
  }
}
