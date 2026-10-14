import {
  Circuit,
  INPUT_IDS,
  InputState,
  NodeValue,
  settleCircuit,
  zeroInputs,
} from './circuit.model';
import {
  BlockLibrary,
  BlockSolution,
  BusEnd,
  Solution,
  SolutionStore,
  TOP,
  addBusWire,
  childScope,
  connectionError,
  createLibrary,
  endInfo,
  expand,
  interfaceOfExercise,
  isBlockSolution,
  portValues,
} from './blocks';
import { Exercise } from './exercises';
import { SECTIONS } from '../../sections/sections';
import { typeWidth } from './interfaces';
import {
  ADDER_SOLUTIONS,
  ALU_SOLUTIONS,
  BLOCK_SOLUTIONS,
  CPU_SOLUTIONS,
  DECODER_SOLUTIONS,
  LATCH_SOLUTIONS,
  MEMORY_SOLUTIONS,
  MUX_SOLUTIONS,
  REGISTER_SOLUTIONS,
  build,
  expectStepsMatch,
  expectTableMatches,
} from './netlists.testing';

const GATE_SOLUTIONS = {
  ...MUX_SOLUTIONS,
  ...LATCH_SOLUTIONS,
  ...REGISTER_SOLUTIONS,
  ...ADDER_SOLUTIONS,
  ...ALU_SOLUTIONS,
  ...MEMORY_SOLUTIONS,
  ...DECODER_SOLUTIONS,
  ...CPU_SOLUTIONS,
};

/** Хранилище, в котором «решены» все упражнения эталонными схемами */
function referenceStore(): SolutionStore {
  const exercises = new Map<string, { key: string; ex: Exercise }>();
  for (const s of SECTIONS)
    for (const ex of s.exercises)
      exercises.set(`${s.progressKey}/${ex.id}`, { key: s.progressKey, ex });
  return {
    load(progressKey, exerciseId) {
      const entry = exercises.get(`${progressKey}/${exerciseId}`);
      if (!entry) return undefined;
      const blockSol = BLOCK_SOLUTIONS[exerciseId];
      if (blockSol) return blockSol;
      const sol = GATE_SOLUTIONS[exerciseId as keyof typeof GATE_SOLUTIONS];
      if (!sol) return undefined;
      const c = build(entry.ex, sol.net, sol.outs);
      return { gates: c.gates, wires: c.wires };
    },
    save() {
      // тестам сохранять нечего
    },
  };
}

const library = (store = referenceStore()): BlockLibrary => createLibrary(SECTIONS, store);

const exerciseById = (id: string): Exercise =>
  SECTIONS.flatMap((s) => [...s.exercises]).find((e) => e.id === id)!;

const blockExercises = SECTIONS.flatMap((s) => [...s.exercises]).filter((e) => e.kind === 'blocks');

describe('блоки: объявления в упражнениях', () => {
  const lib = library();
  const withPorts = SECTIONS.flatMap((s) => [...s.exercises]).filter((e) => e.ports);

  it('порты покрывают входы и выходы упражнения по одному разу, ширина совпадает с типом', () => {
    for (const ex of withPorts) {
      const used: string[] = [];
      for (const p of ex.ports!) {
        expect(p.nodes.length, `${ex.id}.${p.name}`).toBe(typeWidth(p.type));
        used.push(...p.nodes);
      }
      expect(new Set(used).size, `${ex.id}: узел в двух портах`).toBe(used.length);
      expect([...used].sort(), ex.id).toEqual([...ex.inputs, ...ex.outputs].sort());
    }
  });

  it('направление порта определяется узлами: все входы или все выходы', () => {
    for (const ex of withPorts) {
      for (const p of interfaceOfExercise(ex).ports) {
        const ins = p.nodes.filter((n) => (ex.inputs as readonly string[]).includes(n)).length;
        expect(ins === 0 || ins === p.nodes.length, `${ex.id}.${p.name}`).toBe(true);
        expect(p.dir).toBe(ins === 0 ? 'out' : 'in');
      }
    }
  });

  it('id блоков уникальны, есть и встроенные переходники', () => {
    const ids = [...lib.defs.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'rom',
      'decoder',
      'operand',
      'next-pc',
      'sequencer',
      'flags',
      'reg2',
      'fetch',
      'exec',
    ]) {
      expect(lib.def(id), id).toBeDefined();
    }
    expect(lib.def('adapter-w2a')!.source).toBeNull();
  });

  it('палитра упражнений на блоках ссылается на существующие блоки', () => {
    for (const ex of blockExercises) {
      expect(ex.ports, ex.id).toBeDefined();
      for (const id of ex.blocks ?? []) expect(lib.def(id), `${ex.id}: ${id}`).toBeDefined();
    }
  });

  it('упражнения на блоках не требуют вентилей, а их решения лежат в BLOCK_SOLUTIONS', () => {
    expect(blockExercises.map((e) => e.id).sort()).toEqual(Object.keys(BLOCK_SOLUTIONS).sort());
    for (const ex of blockExercises) expect(ex.allowed, ex.id).toEqual([]);
  });

  it('блок открывается только после того, как решение сохранено', () => {
    const empty: SolutionStore = { load: () => undefined, save: () => undefined };
    const locked = createLibrary(SECTIONS, empty);
    expect(locked.available('rom')).toBe(false);
    expect(locked.lockHint('rom')).toContain('ПЗУ');
    expect(locked.available('adapter-w2a')).toBe(true);
    expect(lib.available('rom')).toBe(true);
  });
});

describe('блоки: соединение шин', () => {
  const lib = library();
  const insts = [
    { id: 'r', blockId: 'rom', x: 0, y: 0 },
    { id: 'd', blockId: 'decoder', x: 0, y: 0 },
    { id: 'a', blockId: 'adapter-w2a', x: 0, y: 0 },
  ];
  const ex = exerciseById('decode-bus');
  const iface = interfaceOfExercise(ex);
  const portsOf = (node: string) =>
    node === TOP ? iface.ports : lib.def(insts.find((i) => i.id === node)!.blockId)!.ports;
  const end = (node: string, port: string, path = ''): BusEnd => ({ node, port, path });

  it('одинаковые типы соединяются, поле достаётся по пути', () => {
    expect(connectionError(end(TOP, 'addr'), end('r', 'addr'), portsOf)).toBeUndefined();
    expect(connectionError(end('r', 'instr', 'op'), end('d', 'op'), portsOf)).toBeUndefined();
    expect(connectionError(end('d', 'ctl'), end(TOP, 'ctl'), portsOf)).toBeUndefined();
  });

  it('разные имена типов не соединяются, даже при одинаковой ширине', () => {
    // Instr целиком не подходит к Op2 — нужно поле
    expect(connectionError(end('r', 'instr'), end('d', 'op'), portsOf)).toContain('переходник');
    // Word2 и Addr2 оба из двух бит
    expect(connectionError(end('r', 'instr', 'k'), end('a', 'in'), portsOf)).toBeUndefined();
    expect(connectionError(end('r', 'instr', 'k'), end('r', 'addr'), portsOf)).toBeDefined();
  });

  it('направление: от выхода ко входу, вход упражнения — источник', () => {
    expect(connectionError(end('r', 'addr'), end(TOP, 'addr'), portsOf)).toBeDefined();
    expect(connectionError(end(TOP, 'ctl'), end('d', 'ctl'), portsOf)).toBeDefined();
    expect(connectionError(end('d', 'ctl'), end('r', 'addr'), portsOf)).toBeDefined();
  });

  it('нельзя замкнуть блок на самого себя и обратиться к несуществующему', () => {
    expect(connectionError(end('a', 'out'), end('a', 'in'), portsOf)).toContain('самого себя');
    expect(connectionError(end('r', 'nope'), end('d', 'op'), portsOf)).toBeDefined();
    expect(connectionError(end('r', 'instr', 'zzz'), end('d', 'op'), portsOf)).toBeDefined();
  });

  it('новая шина на занятые биты входа заменяет старую; соседние поля не трогает', () => {
    const w1 = { id: 'w1', from: end(TOP, 'z'), to: end('d', 'z') };
    const w2 = { id: 'w2', from: end('r', 'instr', 'op'), to: end('d', 'op') };
    const again = { id: 'w3', from: end(TOP, 'wb'), to: end('d', 'z') };
    const res = addBusWire([w1, w2], again, portsOf);
    expect(res.map((w) => w.id).sort()).toEqual(['w2', 'w3']);

    // два поля одного порта — разные биты, оба остаются
    const f1 = { id: 'f1', from: end('r', 'instr', 'op'), to: end('a', 'in', 'D1') };
    const info = endInfo(f1.to, portsOf);
    expect(info?.length).toBe(1);
  });
});

/** Прогон упражнения «из блоков» эталонным решением */
function expandFor(ex: Exercise, lib: BlockLibrary): Circuit {
  return expand(BLOCK_SOLUTIONS[ex.id], interfaceOfExercise(ex), lib.lookup).circuit;
}

describe('блоки: упражнения решаются эталонными шинами', () => {
  const lib = library();

  it('«Шина: прочитать и декодировать» — таблица совпадает', () => {
    const ex = exerciseById('decode-bus');
    expectTableMatches(ex, expandFor(ex, lib));
  });

  for (const id of ['fetch', 'exec', 'cpu']) {
    it(`«${exerciseById(id).title}» проходит весь сценарий`, () => {
      const ex = exerciseById(id);
      expectStepsMatch(ex, expandFor(ex, lib));
    });
  }

  it('блок «Выборка» и «Исполнение» не пересекаются по именам вентилей', () => {
    const ex = exerciseById('cpu');
    const gates = expandFor(ex, lib).gates.map((g) => g.id);
    expect(new Set(gates).size).toBe(gates.length);
    expect(gates.length).toBeGreaterThan(50);
    expect(gates.some((id) => id.split('__').length > 2)).toBe(true); // вложенность: блок в блоке
  });

  it('решение с неоткрытым блоком не падает, а даёт неопределённые выходы', () => {
    const ex = exerciseById('decode-bus');
    const missing: BlockLibrary = {
      ...lib,
      lookup: (id) => (id === 'rom' ? undefined : lib.lookup(id)),
    };
    const c = expand(
      BLOCK_SOLUTIONS['decode-bus'],
      interfaceOfExercise(ex),
      missing.lookup,
    ).circuit;
    const r = settleCircuit(c, { ...zeroInputs(), D: 1 }, new Map());
    expect(r.values.get('AccLoad')).toBeUndefined();
  });

  it('переходники — просто провода: значение проходит насквозь', () => {
    const ex = exerciseById('fetch');
    const iface = interfaceOfExercise(ex);
    const top = (port: string): BusEnd => ({ node: TOP, port, path: '' });
    const at = (node: string, port: string): BusEnd => ({ node, port, path: '' });
    const sol: BlockSolution = {
      instances: [
        { id: 'a', blockId: 'adapter-a2w', x: 0, y: 0 },
        { id: 'b', blockId: 'adapter-w2a', x: 0, y: 0 },
      ],
      busWires: [
        { id: '1', from: top('k'), to: at('a', 'in') },
        { id: '2', from: at('a', 'out'), to: at('b', 'in') },
        { id: '3', from: at('b', 'out'), to: top('pc') },
      ],
    };
    const c = expand(sol, iface, lib.lookup).circuit;
    expect(c.gates).toEqual([]);
    const r = settleCircuit(c, { ...zeroInputs(), C: 1, D: 0 }, new Map());
    expect([r.values.get('P1'), r.values.get('P0')]).toEqual([1, 0]);
  });
});

describe('блоки: значения внутри и «заглянуть внутрь»', () => {
  const lib = library();
  const ex = exerciseById('cpu');
  const iface = interfaceOfExercise(ex);
  const expansion = expand(BLOCK_SOLUTIONS['cpu'], iface, lib.lookup);

  /** Состояние процессора после n тактов */
  function runTicks(n: number): Map<string, NodeValue> {
    const clk = (v: 0 | 1): InputState => ({ ...zeroInputs(), A: v });
    // как в приложении: сначала схема включается при CLK = 0, и только потом идут фронты
    const start = settleCircuit(expansion.circuit, clk(0), new Map());
    let prev = start.stable ? start.values : new Map<string, NodeValue>();
    let values = start.values;
    for (let i = 0; i < n; i++) {
      for (const v of [1, 0] as const) {
        const r = settleCircuit(expansion.circuit, clk(v), prev);
        prev = r.stable ? r.values : new Map();
        values = r.values;
      }
    }
    return values;
  }

  it('значения портов на верхнем уровне: после четырёх тактов LDI 2 выполнена', () => {
    const values = runTicks(4);
    const scope = (n: string) => values.get(n);
    const portsOf = (node: string) =>
      node === TOP
        ? iface.ports
        : lib.def(BLOCK_SOLUTIONS['cpu'].instances.find((i) => i.id === node)!.blockId)!.ports;
    expect(portValues(scope, expansion, { node: TOP, port: 'acc', path: '' }, portsOf)).toEqual([
      1, 0,
    ]);
    expect(portValues(scope, expansion, { node: TOP, port: 'pc', path: '' }, portsOf)).toEqual([
      0, 1,
    ]);
    // выход блока «Выборка» (поле op команды) — адрес 1 содержит ADD (01)
    expect(
      portValues(scope, expansion, { node: 'fe', port: 'instr', path: 'op' }, portsOf),
    ).toEqual([0, 1]);
    // вход блока «Декодер» — то, что ему подали
    expect(portValues(scope, expansion, { node: 'dec', port: 'op', path: '' }, portsOf)).toEqual([
      0, 1,
    ]);
  });

  it('вложенный блок видит свои узлы: аккумулятор внутри «Исполнения» равен выходу acc', () => {
    const values = runTicks(8); // две команды: LDI 2, ADD 1 → ACC = 3
    const top = (n: string) => values.get(n);
    const exec = expansion.subs.get('ex')!;
    const inExec = childScope(top, expansion, 'ex', exec.def);
    expect([inExec('Acc1'), inExec('Acc0')]).toEqual([1, 1]);
    // ещё глубже: у регистра внутри «Исполнения»
    const reg = exec.expansion.subs.get('acc')!;
    const inReg = childScope(inExec, exec.expansion, 'acc', reg.def);
    expect([inReg('Q1'), inReg('Q0')]).toEqual([1, 1]);
    // вход регистра внутри — то, что подала шина (Word2 от операнда)
    expect(inReg('C')).toBe(0); // load снят в фазе Fe
  });
});

describe('блоки: хранение решений', () => {
  it('решения проходят туда и обратно, лишнее и сломанное игнорируется', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    });
    const store = createLibrary(SECTIONS).solution('rom');
    expect(store).toBeUndefined(); // ещё не сохранено

    const sol: Solution = BLOCK_SOLUTIONS['decode-bus'];
    memory.set('processor-solution-v1-cpu-decode-bus', JSON.stringify(sol));
    memory.set('processor-solution-v1-memory-rom4x4', '{"oops":1}');
    memory.set('processor-solution-v1-decoder-decode-all', '{не json');
    const lib = createLibrary(SECTIONS);
    expect(lib.available('rom')).toBe(false);
    expect(lib.available('decoder')).toBe(false);
    expect(isBlockSolution(sol)).toBe(true);
    vi.unstubAllGlobals();
  });
});
