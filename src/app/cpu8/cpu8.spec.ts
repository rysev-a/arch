import {
  PortsOf,
  TOP,
  connectionError,
  endInfo,
  endNodes,
  expand,
  isBlockSolution,
} from '../exercises/logic-gates/blocks';
import { assemble } from '../asm/assembler';
import { Machine } from '../asm/machine';
import { TASKS } from '../asm/tasks';
import { CPU8_BLOCKS, cpu8Def, cpu8Lookup } from './blocks';
import { nodesOf } from './builders';
import { CompiledSim } from './sim';

/** Детерминированный «случайный» генератор для воспроизводимых тестов */
function rng(seed: number): () => number {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) >> 8) & 0xffff;
}

/** Собрать блок в быстрый симулятор: входы и выходы называются так же, как порты блока */
function build(id: string): CompiledSim {
  const b = CPU8_BLOCKS.get(id)!;
  return new CompiledSim(expand(b.solution, b.def, cpu8Lookup).circuit);
}

const BYTE = (name: string) => nodesOf(name, 'Byte');

/** Положить число в порт (старший бит первым) */
function put(sim: CompiledSim, name: string, type: string, value: number): void {
  const nodes = nodesOf(name, type);
  nodes.forEach((n, i) => sim.set(n, ((value >> (nodes.length - 1 - i)) & 1) as 0 | 1));
}
const get = (sim: CompiledSim, name: string, type: string): number | undefined =>
  sim.read(nodesOf(name, type));

describe('каталог блоков «Мини-8»', () => {
  it('у каждого блока описание согласовано: порты, узлы, ширина', () => {
    for (const [id, b] of CPU8_BLOCKS) {
      expect(b.def.id).toBe(id);
      expect(b.def.ports.length, id).toBeGreaterThan(0);
      for (const p of b.def.ports) expect(p.nodes.length, `${id}.${p.name}`).toBeGreaterThan(0);
      expect(new Set(b.def.inputs).size, `${id}: входы`).toBe(b.def.inputs.length);
      expect(new Set(b.def.outputs).size, `${id}: выходы`).toBe(b.def.outputs.length);
    }
  });

  it('в схемах из блоков нет отброшенных шин и неподключённых входов', () => {
    for (const [id, b] of CPU8_BLOCKS) {
      if (!isBlockSolution(b.solution)) continue;
      const sol = b.solution;
      const portsOf: PortsOf = (node) =>
        node === TOP
          ? b.def.ports
          : CPU8_BLOCKS.get(sol.instances.find((i) => i.id === node)!.blockId)!.def.ports;
      const driven = new Set<string>();
      for (const w of sol.busWires) {
        expect(
          connectionError(w.from, w.to, portsOf),
          `${id}: шина ${w.from.node}.${w.from.port} → ${w.to.node}.${w.to.port}`,
        ).toBeUndefined();
        for (const n of endNodes(endInfo(w.to, portsOf)!)) {
          expect(driven.has(`${w.to.node}|${n}`), `${id}: на ${w.to.node}.${n} две шины`).toBe(
            false,
          );
          driven.add(`${w.to.node}|${n}`);
        }
      }
      // каждый вход каждого блока и каждый выход самой схемы чем-то питается
      for (const inst of sol.instances) {
        for (const p of CPU8_BLOCKS.get(inst.blockId)!.def.ports.filter((x) => x.dir === 'in')) {
          for (const n of p.nodes)
            expect(driven.has(`${inst.id}|${n}`), `${id}: не подключён вход ${inst.id}.${n}`).toBe(
              true,
            );
        }
      }
      for (const p of b.def.ports.filter((x) => x.dir === 'out')) {
        for (const n of p.nodes)
          expect(driven.has(`${TOP}|${n}`), `${id}: не подключён выход ${n}`).toBe(true);
      }
    }
  });

  it('каждый блок разворачивается и компилируется без петель без триггера', () => {
    for (const id of CPU8_BLOCKS.keys()) expect(() => build(id), id).not.toThrow();
  });

  it('размер процессора: сколько вентилей и триггеров', () => {
    const sim = build('c8-cpu');
    expect(sim.gateCount).toBeGreaterThan(900);
    expect(sim.gateCount).toBeLessThan(2500);
    // 7 регистров по 8 бит + счётчик команд 8 + триггер остановки
    expect(sim.dffCount).toBe(7 * 8 + 8 + 1);
  });
});

describe('биты', () => {
  it('мультиплексор: s = 0 даёт d0, s = 1 даёт d1', () => {
    const sim = build('c8-mux2');
    for (let v = 0; v < 8; v++) {
      const [s, d0, d1] = [(v >> 2) & 1, (v >> 1) & 1, v & 1] as const;
      sim.set('s', s);
      sim.set('d0', d0);
      sim.set('d1', d1);
      sim.settle();
      expect(sim.get('y')).toBe(s ? d1 : d0);
    }
  });

  it('полусумматор и полный сумматор: все входы', () => {
    const ha = build('c8-ha');
    const fa = build('c8-fa');
    for (let v = 0; v < 8; v++) {
      const [a, b, c] = [(v >> 2) & 1, (v >> 1) & 1, v & 1] as const;
      ha.set('a', a);
      ha.set('b', b);
      ha.settle();
      expect([ha.get('sum'), ha.get('cout')]).toEqual([a ^ b, a & b]);
      fa.set('a', a);
      fa.set('b', b);
      fa.set('cin', c);
      fa.settle();
      expect([fa.get('sum'), fa.get('cout')]).toEqual([(a + b + c) & 1, (a + b + c) >> 1]);
    }
  });

  it('бит регистра: хранит при load = 0, записывает при load = 1', () => {
    const sim = build('c8-reg1');
    expect(sim.get('q')).toBe(0);
    sim.set('d', 1);
    sim.set('load', 0);
    sim.pulse('clk');
    expect(sim.get('q')).toBe(0);
    sim.set('load', 1);
    sim.pulse('clk');
    expect(sim.get('q')).toBe(1);
    sim.set('d', 0);
    sim.set('load', 0);
    sim.pulse('clk');
    expect(sim.get('q')).toBe(1); // хранит
  });

  it('разряд АЛУ: сумма с переносом, вычитание, И, ИЛИ, XOR и «пропустить B»', () => {
    const sim = build('c8-alu1');
    const sels = ['sAdd', 'sAnd', 'sOr', 'sXor', 'sB'] as const;
    for (let v = 0; v < 8; v++) {
      const [a, b, cin] = [(v >> 2) & 1, (v >> 1) & 1, v & 1] as const;
      for (const sel of sels) {
        for (const sub of [0, 1] as const) {
          for (const s of sels) sim.set(s, s === sel ? 1 : 0);
          sim.set('sub', sub);
          sim.set('a', a);
          sim.set('b', b);
          sim.set('cin', cin);
          sim.settle();
          const bx = b ^ sub;
          const expected = {
            sAdd: (a + bx + cin) & 1,
            sAnd: a & b,
            sOr: a | b,
            sXor: a ^ b,
            sB: b,
          }[sel];
          expect(sim.get('res'), `${sel} a=${a} b=${b} cin=${cin} sub=${sub}`).toBe(expected);
          expect(sim.get('cout')).toBe((a + bx + cin) >> 1);
        }
      }
    }
  });

  it('сигналы управления не выбраны — результат ноль', () => {
    const sim = build('c8-alu1');
    for (const s of ['sAdd', 'sAnd', 'sOr', 'sXor', 'sB']) sim.set(s, 0);
    sim.set('a', 1);
    sim.set('b', 1);
    sim.settle();
    expect(sim.get('res')).toBe(0);
  });
});

describe('байтовые блоки', () => {
  const rand = rng(7);
  const bytes = () => Array.from({ length: 40 }, () => [rand() & 255, rand() & 255]);
  const edge = [
    [0, 0],
    [255, 255],
    [0, 255],
    [255, 0],
    [1, 255],
    [128, 127],
    [127, 128],
  ];

  it('сумматор на 8 бит: случайные и граничные пары', () => {
    const sim = build('c8-add8');
    for (const [a, b] of [...edge, ...bytes()]) {
      put(sim, 'a', 'Byte', a);
      put(sim, 'b', 'Byte', b);
      sim.settle();
      expect(get(sim, 's', 'Byte'), `${a}+${b}`).toBe((a + b) & 255);
    }
  });

  it('АЛУ на 8 бит: все операции', () => {
    const sim = build('c8-alu8');
    const ops: Record<string, (a: number, b: number) => number> = {
      sAdd: (a, b) => (a + b) & 255,
      sub: (a, b) => (a - b) & 255,
      sAnd: (a, b) => a & b,
      sOr: (a, b) => a | b,
      sXor: (a, b) => a ^ b,
      sB: (_, b) => b,
    };
    for (const [name, fn] of Object.entries(ops)) {
      for (const [a, b] of [...edge, ...bytes()]) {
        for (const s of ['sub', 'sAdd', 'sAnd', 'sOr', 'sXor', 'sB']) sim.set(s, 0);
        sim.set(name === 'sub' ? 'sub' : name, 1);
        if (name === 'sub') sim.set('sAdd', 1); // вычитание — тот же сумматор с инвертированным B
        put(sim, 'a', 'Byte', a);
        put(sim, 'b', 'Byte', b);
        sim.settle();
        expect(get(sim, 'res', 'Byte'), `${name} ${a},${b}`).toBe(fn(a, b));
      }
    }
  });

  it('сравнение байтов: равно и меньше (без знака)', () => {
    const sim = build('c8-cmp8');
    for (const [x, y] of [...edge, ...bytes(), [5, 5], [200, 3], [3, 200]]) {
      put(sim, 'x', 'Byte', x);
      put(sim, 'y', 'Byte', y);
      sim.settle();
      expect([sim.get('eq'), sim.get('lt')], `${x} ? ${y}`).toEqual([
        x === y ? 1 : 0,
        x < y ? 1 : 0,
      ]);
    }
  });

  it('мультиплексоры 2→1 и 8→1 (байт)', () => {
    const m2 = build('c8-mux2x8');
    for (const [a, b] of bytes()) {
      put(m2, 'd0', 'Byte', a);
      put(m2, 'd1', 'Byte', b);
      for (const s of [0, 1] as const) {
        m2.set('s', s);
        m2.settle();
        expect(get(m2, 'y', 'Byte')).toBe(s ? b : a);
      }
    }
    const m8 = build('c8-mux8x8');
    const data = [11, 22, 33, 44, 55, 66, 77, 88];
    data.forEach((v, i) => put(m8, `d${i}`, 'Byte', v));
    for (let s = 0; s < 8; s++) {
      put(m8, 's', 'Reg3', s);
      m8.settle();
      expect(get(m8, 'y', 'Byte'), `выбор ${s}`).toBe(data[s]);
    }
  });

  it('регистр на 8 бит: записывает по load и хранит между тактами', () => {
    const sim = build('c8-reg8');
    put(sim, 'd', 'Byte', 0xa5);
    sim.set('load', 1);
    sim.pulse('clk');
    expect(get(sim, 'q', 'Byte')).toBe(0xa5);
    put(sim, 'd', 'Byte', 0x3c);
    sim.set('load', 0);
    sim.pulse('clk');
    expect(get(sim, 'q', 'Byte')).toBe(0xa5);
    sim.set('load', 1);
    sim.pulse('clk');
    expect(get(sim, 'q', 'Byte')).toBe(0x3c);
  });

  it('нулевой байт и число 1', () => {
    const z = build('c8-zero8');
    const o = build('c8-one8');
    for (const a of [0, 1] as const) {
      z.set('a', a);
      o.set('a', a);
      z.settle();
      o.settle();
      expect(get(z, 'y', 'Byte')).toBe(0);
      expect(get(o, 'y', 'Byte')).toBe(1);
    }
  });
});

describe('регистровый файл', () => {
  it('запись в r1…r7, чтение двумя портами; r0 всегда ноль и не пишется', () => {
    const sim = build('c8-regfile');
    const write = (r: number, v: number, we = 1) => {
      put(sim, 'wsel', 'Reg3', r);
      put(sim, 'wdata', 'Byte', v);
      sim.set('we', we as 0 | 1);
      sim.pulse('clk');
    };
    for (let r = 0; r < 8; r++) write(r, 0x10 + r * 7);
    for (let r = 1; r < 8; r++) expect(get(sim, `r${r}`, 'Byte'), `r${r}`).toBe(0x10 + r * 7);

    for (let a = 0; a < 8; a++) {
      for (let b = 0; b < 8; b++) {
        put(sim, 'rsel1', 'Reg3', a);
        put(sim, 'rsel2', 'Reg3', b);
        sim.settle();
        expect(get(sim, 'rd1', 'Byte'), `rd1 r${a}`).toBe(a === 0 ? 0 : 0x10 + a * 7);
        expect(get(sim, 'rd2', 'Byte'), `rd2 r${b}`).toBe(b === 0 ? 0 : 0x10 + b * 7);
      }
    }

    // без разрешения записи ничего не меняется
    write(3, 0xee, 0);
    expect(get(sim, 'r3', 'Byte')).toBe(0x10 + 21);
  });
});

describe('управление', () => {
  it('декодер: сигналы всех пятнадцати команд', () => {
    const sim = build('c8-decode');
    const sets: Record<number, string[]> = {
      0: ['isHlt'],
      1: ['regWrite', 'selB', 'useImm8'],
      2: ['regWrite', 'selAdd', 'isR'],
      3: ['regWrite', 'selAdd', 'sub', 'isR'],
      4: ['regWrite', 'selAnd', 'isR'],
      5: ['regWrite', 'selOr', 'isR'],
      6: ['regWrite', 'selXor', 'isR'],
      7: ['regWrite', 'selAdd', 'useImm6'],
      8: ['regWrite', 'selAdd', 'useImm6', 'load'],
      9: ['selAdd', 'useImm6', 'store'],
      10: ['isBeq'],
      11: ['isBne'],
      12: ['isBltu'],
      13: ['isBgeu'],
      14: ['isJmp'],
      15: [],
    };
    const all = nodesOf('ctl', 'Ctrl');
    for (let op = 0; op < 16; op++) {
      put(sim, 'op', 'Op4', op);
      sim.settle();
      const active = all.filter((n) => sim.get(n) === 1).map((n) => n.replace('ctl_', ''));
      expect(active.sort(), `опкод ${op}`).toEqual([...sets[op]].sort());
    }
  });

  it('решение о переходе: четыре условия', () => {
    const sim = build('c8-branch');
    const flags = ['isBeq', 'isBne', 'isBltu', 'isBgeu'];
    for (const f of nodesOf('ctl', 'Ctrl')) sim.set(f, 0);
    const cases: [string, number, number, number][] = [
      ['isBeq', 1, 0, 1],
      ['isBeq', 0, 0, 0],
      ['isBne', 0, 0, 1],
      ['isBne', 1, 0, 0],
      ['isBltu', 0, 1, 1],
      ['isBltu', 0, 0, 0],
      ['isBgeu', 0, 0, 1],
      ['isBgeu', 0, 1, 0],
    ];
    for (const [flag, eq, lt, take] of cases) {
      for (const f of flags) sim.set(`ctl_${f}`, f === flag ? 1 : 0);
      sim.set('eq', eq as 0 | 1);
      sim.set('lt', lt as 0 | 1);
      sim.settle();
      expect(sim.get('take'), `${flag} eq=${eq} lt=${lt}`).toBe(take);
    }
  });

  it('числа из команды: расширение знака шестибитного числа и восемь младших бит', () => {
    const sim = build('c8-immgen');
    for (const w of [0x0000, 0x7fff & 0xffff, 0x1c05, 0x1c3f, 0x1c20, 0x12ab]) {
      put(sim, 'instr', 'Instr16', w);
      sim.settle();
      const imm6 = w & 0x3f;
      expect(get(sim, 'imm6', 'Byte')).toBe(imm6 & 0x20 ? imm6 | 0xc0 : imm6);
      expect(get(sim, 'imm8', 'Byte')).toBe(w & 0xff);
    }
  });

  it('остановка: после hlt триггер держит единицу, run = 0', () => {
    const sim = build('c8-halt');
    sim.set('isHlt', 0);
    sim.pulse('clk');
    expect([sim.get('halted'), sim.get('run')]).toEqual([0, 1]);
    sim.set('isHlt', 1);
    sim.pulse('clk');
    expect([sim.get('halted'), sim.get('run')]).toEqual([1, 0]);
    sim.set('isHlt', 0);
    sim.pulse('clk');
    expect(sim.get('halted')).toBe(1); // насовсем
  });

  it('счётчик команд: +1, переход назад и вперёд, jmp, остановка', () => {
    const sim = build('c8-pc');
    const set = (take: number, isJmp: number, imm6: number, imm8: number, run = 1) => {
      sim.set('take', take as 0 | 1);
      sim.set('isJmp', isJmp as 0 | 1);
      put(sim, 'imm6', 'Byte', imm6);
      put(sim, 'imm8', 'Byte', imm8);
      sim.set('run', run as 0 | 1);
      sim.pulse('clk');
      return get(sim, 'pc', 'Byte');
    };
    expect(set(0, 0, 0, 0)).toBe(1);
    expect(set(0, 0, 0, 0)).toBe(2);
    expect(set(1, 0, 5, 0)).toBe(7); // переход вперёд на 5
    expect(set(1, 0, 0xfd, 0)).toBe(4); // назад на 3 (−3 как байт)
    expect(set(0, 1, 0, 10)).toBe(14); // jmp +10
    expect(set(0, 0, 0, 0, 0)).toBe(14); // run = 0 — стоим
    expect(set(0, 1, 0, 0xf6)).toBe(4); // jmp −10
  });
});

describe('память внутри процессора', () => {
  it('ПЗУ отдаёт слово по адресу, диск пишет по такту и читает обратно', () => {
    const rom = build('c8-rom');
    rom.loadRom('mem', [0x1234, 0xabcd, 0x0f0f]);
    for (const [a, w] of [
      [0, 0x1234],
      [1, 0xabcd],
      [2, 0x0f0f],
      [9, 0],
    ]) {
      put(rom, 'addr', 'Byte', a);
      rom.settle();
      expect(get(rom, 'word', 'Instr16')).toBe(w);
    }

    const ram = build('c8-ram');
    ram.loadRam('mem', [1, 2, 3]);
    put(ram, 'addr', 'Byte', 1);
    ram.settle();
    expect(get(ram, 'dout', 'Byte')).toBe(2);
    put(ram, 'din', 'Byte', 0x99);
    ram.set('we', 0);
    ram.pulse('clk');
    expect(get(ram, 'dout', 'Byte')).toBe(2); // без разрешения не пишется
    ram.set('we', 1);
    ram.pulse('clk');
    expect(get(ram, 'dout', 'Byte')).toBe(0x99);
    expect([...ram.memory('mem').slice(0, 3)]).toEqual([1, 0x99, 3]);
  });
});

/* ============================================================
   Процессор целиком: команда за командой против эмулятора
   ============================================================ */

const CPU = CPU8_BLOCKS.get('c8-cpu')!;

function makeCpu(program: readonly number[], disk: ArrayLike<number>) {
  const sim = new CompiledSim(expand(CPU.solution, CPU.def, cpuLookup).circuit);
  sim.loadRom('rom__mem', program);
  sim.loadRam('ram__mem', disk);
  return sim;
}
const cpuLookup = cpu8Lookup;

/** Состояние процессора на вентилях в тех же терминах, что у эмулятора */
function snapshot(sim: CompiledSim) {
  const regs = [0, 1, 2, 3, 4, 5, 6, 7].map((r) => (r === 0 ? 0 : get(sim, `r${r}`, 'Byte')));
  return {
    pc: get(sim, 'pc', 'Byte'),
    regs,
    halted: sim.get('halted') === 1,
    mem: [...sim.memory('ram__mem')],
  };
}

/** Прогон двух процессоров бок о бок; возвращает число выполненных команд */
function lockstep(source: string, disk: ArrayLike<number>, limit = 20000): number {
  const asm = assemble(source);
  expect(asm.errors, JSON.stringify(asm.errors)).toEqual([]);
  const ref = new Machine(asm.words, disk);
  const sim = makeCpu(asm.words, disk);
  let n = 0;
  while (ref.running && n < limit) {
    ref.step();
    sim.pulse('clk');
    n++;
    const s = snapshot(sim);
    const where = `после команды ${n} (адрес ${ref.pc})`;
    expect(s.regs, `регистры ${where}`).toEqual(ref.regs);
    expect(s.pc, `счётчик команд ${where}`).toBe(ref.pc);
    expect(s.halted, `остановка ${where}`).toBe(ref.halted);
    expect(s.mem, `диск ${where}`).toEqual([...ref.mem]);
  }
  expect(ref.error).toBeNull();
  expect(ref.halted).toBe(true);
  return n;
}

describe('процессор «Мини-8» на вентилях', () => {
  it('программа со всеми командами совпадает с эмулятором на каждом шаге', () => {
    const src = `
      li   r1, 200
      li   r2, 100
      add  r3, r1, r2        ; переполнение: 300 → 44
      sub  r4, r2, r1        ; 100 − 200 → 156
      and  r5, r1, r2
      or   r6, r1, r2
      xor  r7, r1, r2
      addi r1, r1, -7
      addi r2, r2, 31
      li   r7, 0x40
      sb   r3, 0(r7)
      sb   r4, 1(r7)
      sb   r5, -1(r7)
      lb   r2, 0(r7)
      lb   r3, 1(r7)
      lb   r4, -1(r7)
      beq  r2, r2, a
      li   r5, 99
a:    bne  r2, r3, b
      li   r5, 98
b:    bltu r2, r3, c
      li   r6, 97
c:    bgeu r3, r2, d
      li   r6, 96
d:    bltu r3, r2, e         ; не берётся
      bne  r0, r0, e         ; не берётся
      beq  r0, r0, f         ; берётся
e:    li   r1, 1
f:    jmp  g
      li   r1, 2
g:    li   r0, 55            ; запись в r0 игнорируется
      addi r0, r0, 5
      mv   r7, r0
      hlt`;
    const disk = new Uint8Array(256).map((_, i) => (i * 37 + 11) & 255);
    expect(lockstep(src, disk)).toBeGreaterThan(25);
  });

  it('счётчик команд идёт и по переходам назад (цикл), и на hlt стоит', () => {
    const n = lockstep('li r1, 5\nцикл: dec r1\n bnez r1, цикл\n hlt', new Uint8Array(256));
    expect(n).toBe(1 + 5 * 2 + 1);
  });

  for (const task of TASKS) {
    it(`задание «${task.title}»: решение на вентилях совпадает с эмулятором и выполняет задание`, () => {
      const steps = lockstep(task.solution, task.disk);
      expect(steps).toBeGreaterThan(3);
      // и итог — тот, что требует задание
      const asm = assemble(task.solution);
      const sim = makeCpu(asm.words, task.disk);
      for (let i = 0; i < steps; i++) sim.pulse('clk');
      const mem = new Uint8Array(sim.memory('ram__mem'));
      expect(task.check(mem).ok, task.check(mem).message).toBe(true);
    });
  }
});
