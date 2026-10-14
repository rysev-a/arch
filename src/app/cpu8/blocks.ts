import {
  BlockDef,
  BlockLibrary,
  BlockLookup,
  NativeSolution,
} from '../exercises/logic-gates/blocks';
import {
  bit,
  field,
  gateBlock,
  GeneratedBlock,
  hierBlock,
  nativeBlock,
  nodesOf,
  wireBlock,
} from './builders';

/**
 * Каталог блоков процессора «Мини-8».
 * Всё построено из вентилей И, ИЛИ, НЕ, XOR и триггера DFF — тех самых, что ученик собирал на доске.
 * Мелкие блоки (мультиплексор, полный сумматор, бит регистра) повторяются в более крупных:
 * байтовый регистр — восемь битовых, регистровый файл — семь байтовых регистров и два мультиплексора.
 */

/** Номера команд (опкоды) — как в isa.ts */
const OP = {
  hlt: 0,
  li: 1,
  add: 2,
  sub: 3,
  and: 4,
  or: 5,
  xor: 6,
  addi: 7,
  lb: 8,
  sb: 9,
  beq: 10,
  bne: 11,
  bltu: 12,
  bgeu: 13,
  jmp: 14,
} as const;

const blocks: GeneratedBlock[] = [];
const add = (b: GeneratedBlock): void => void blocks.push(b);
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const BITS = range(8);

/* ===================== Биты ===================== */

add(
  gateBlock(
    'c8-mux2',
    'Мультиплексор 2→1 (бит)',
    [
      ['s', 'Bit', 'in'],
      ['d0', 'Bit', 'in'],
      ['d1', 'Bit', 'in'],
      ['y', 'Bit', 'out'],
    ],
    (g) => {
      const ns = g.not('s');
      g.out('y', g.or(g.and('d0', ns), g.and('d1', 's')));
    },
  ),
);

add(
  gateBlock(
    'c8-ha',
    'Полусумматор',
    [
      ['a', 'Bit', 'in'],
      ['b', 'Bit', 'in'],
      ['sum', 'Bit', 'out'],
      ['cout', 'Bit', 'out'],
    ],
    (g) => {
      g.out('sum', g.xor('a', 'b'));
      g.out('cout', g.and('a', 'b'));
    },
  ),
);

add(
  gateBlock(
    'c8-fa',
    'Полный сумматор',
    [
      ['a', 'Bit', 'in'],
      ['b', 'Bit', 'in'],
      ['cin', 'Bit', 'in'],
      ['sum', 'Bit', 'out'],
      ['cout', 'Bit', 'out'],
    ],
    (g) => {
      const p = g.xor('a', 'b');
      g.out('sum', g.xor(p, 'cin'));
      g.out('cout', g.or(g.and('a', 'b'), g.and(p, 'cin')));
    },
  ),
);

add(
  gateBlock(
    'c8-reg1',
    'Бит регистра с записью',
    [
      ['d', 'Bit', 'in'],
      ['load', 'Bit', 'in'],
      ['clk', 'Clk', 'in'],
      ['q', 'Bit', 'out'],
    ],
    (g) => {
      // «себя или новое»: при load = 0 триггер получает собственный выход
      const nl = g.not('load');
      const keep = g.and('q_ff', nl);
      const take = g.and('d', 'load');
      g.dffAt('q_ff', g.or(keep, take), 'clk');
      g.out('q', 'q_ff');
    },
  ),
);

add(
  gateBlock(
    'c8-alu1',
    'Разряд АЛУ',
    [
      ['a', 'Bit', 'in'],
      ['b', 'Bit', 'in'],
      ['cin', 'Bit', 'in'],
      ['sub', 'Bit', 'in'],
      ['sAdd', 'Bit', 'in'],
      ['sAnd', 'Bit', 'in'],
      ['sOr', 'Bit', 'in'],
      ['sXor', 'Bit', 'in'],
      ['sB', 'Bit', 'in'],
      ['res', 'Bit', 'out'],
      ['cout', 'Bit', 'out'],
    ],
    (g) => {
      // арифметика: при вычитании B инвертируется, а перенос на входе младшего разряда равен 1
      const bx = g.xor('b', 'sub');
      const p = g.xor('a', bx);
      const sum = g.xor(p, 'cin');
      g.out('cout', g.or(g.and('a', bx), g.and(p, 'cin')));
      // логика: все результаты считаются сразу, а нужный выбирают сигналы управления
      const tAdd = g.and(sum, 'sAdd');
      const tAnd = g.and(g.and('a', 'b'), 'sAnd');
      const tOr = g.and(g.or('a', 'b'), 'sOr');
      const tXor = g.and(g.xor('a', 'b'), 'sXor');
      const tB = g.and('b', 'sB');
      g.out('res', g.orAll([tAdd, tAnd, tOr, tXor, tB]));
    },
  ),
);

add(
  gateBlock(
    'c8-cmp0',
    'Сравнение: младший разряд',
    [
      ['x', 'Bit', 'in'],
      ['y', 'Bit', 'in'],
      ['lt', 'Bit', 'out'],
      ['eq', 'Bit', 'out'],
    ],
    (g) => {
      g.out('lt', g.and(g.not('x'), 'y'));
      g.out('eq', g.xnor('x', 'y'));
    },
  ),
);

add(
  gateBlock(
    'c8-cmp1',
    'Сравнение: разряд',
    [
      ['x', 'Bit', 'in'],
      ['y', 'Bit', 'in'],
      ['ltIn', 'Bit', 'in'],
      ['lt', 'Bit', 'out'],
      ['eq', 'Bit', 'out'],
    ],
    (g) => {
      // x < y, если в этом разряде x = 0, а y = 1, или разряды равны и младшие уже дали «меньше»
      const eq = g.xnor('x', 'y');
      g.out('lt', g.or(g.and(g.not('x'), 'y'), g.and(eq, 'ltIn')));
      g.out('eq', eq);
    },
  ),
);

add(
  gateBlock(
    'c8-and8',
    'И из восьми',
    [
      ['x', 'Byte', 'in'],
      ['y', 'Bit', 'out'],
    ],
    (g) => {
      g.out('y', g.andAll(BITS.map((i) => bit('x', i))));
    },
  ),
);

add(
  gateBlock(
    'c8-zero8',
    'Нулевой байт',
    [
      ['a', 'Clk', 'in'],
      ['y', 'Byte', 'out'],
    ],
    (g) => {
      // сигнал И его инверсия — всегда 0
      const z = g.and('a', g.not('a'));
      for (const i of BITS) g.out(bit('y', i), z);
    },
  ),
);

add(
  gateBlock(
    'c8-one8',
    'Число 1 (байт)',
    [
      ['a', 'Clk', 'in'],
      ['y', 'Byte', 'out'],
    ],
    (g) => {
      const z = g.and('a', g.not('a'));
      g.out(bit('y', 0), g.not(z));
      for (const i of BITS.slice(1)) g.out(bit('y', i), z);
    },
  ),
);

add(
  gateBlock(
    'c8-wdec',
    'Дешифратор записи',
    [
      ['s', 'Reg3', 'in'],
      ['we', 'Bit', 'in'],
      ['en', 'Oh8', 'out'],
    ],
    (g) => {
      const [s2, s1, s0] = [bit('s', 2), bit('s', 1), bit('s', 0)];
      const [n2, n1, n0] = [g.not(s2), g.not(s1), g.not(s0)];
      const pair = [g.and(n1, n0), g.and(n1, s0), g.and(s1, n0), g.and(s1, s0)];
      for (let k = 0; k < 8; k++) {
        const hi = k >> 2 ? s2 : n2;
        g.out(field('en', `H${k}`), g.and(g.and(hi, pair[k & 3]), 'we'));
      }
    },
  ),
);

/* ===================== Управление ===================== */

add(
  gateBlock(
    'c8-decode',
    'Декодер команд',
    [
      ['op', 'Op4', 'in'],
      ['ctl', 'Ctrl', 'out'],
    ],
    (g) => {
      const o = [0, 1, 2, 3].map((i) => bit('op', i));
      const neg = o.map((x) => g.not(x));
      const lit = (i: number, v: number) => (v ? o[i] : neg[i]);
      // «старшая» и «младшая» пары бит кода операции — четыре варианта каждая
      const hi = [0, 1, 2, 3].map((k) => g.and(lit(3, k >> 1), lit(2, k & 1)));
      const lo = [0, 1, 2, 3].map((k) => g.and(lit(1, k >> 1), lit(0, k & 1)));
      const m: Record<number, string> = {};
      for (const code of Object.values(OP)) m[code] = g.and(hi[code >> 2], lo[code & 3]);
      const any = (...codes: number[]) => g.orAll(codes.map((c) => m[c]));
      const o_ = OP;
      const set = (name: string, src: string) => g.out(field('ctl', name), src);
      set('regWrite', any(o_.li, o_.add, o_.sub, o_.and, o_.or, o_.xor, o_.addi, o_.lb));
      set('selAdd', any(o_.add, o_.sub, o_.addi, o_.lb, o_.sb));
      set('selAnd', m[o_.and]);
      set('selOr', m[o_.or]);
      set('selXor', m[o_.xor]);
      set('selB', m[o_.li]);
      set('sub', m[o_.sub]);
      set('useImm6', any(o_.addi, o_.lb, o_.sb));
      set('useImm8', m[o_.li]);
      set('load', m[o_.lb]);
      set('store', m[o_.sb]);
      set('isBeq', m[o_.beq]);
      set('isBne', m[o_.bne]);
      set('isBltu', m[o_.bltu]);
      set('isBgeu', m[o_.bgeu]);
      set('isJmp', m[o_.jmp]);
      set('isHlt', m[o_.hlt]);
      set('isR', any(o_.add, o_.sub, o_.and, o_.or, o_.xor));
    },
  ),
);

add(
  gateBlock(
    'c8-branch',
    'Решение о переходе',
    [
      ['ctl', 'Ctrl', 'in'],
      ['eq', 'Bit', 'in'],
      ['lt', 'Bit', 'in'],
      ['take', 'Bit', 'out'],
    ],
    (g) => {
      const c = (f: string) => field('ctl', f);
      g.out(
        'take',
        g.orAll([
          g.and(c('isBeq'), 'eq'),
          g.and(c('isBne'), g.not('eq')),
          g.and(c('isBltu'), 'lt'),
          g.and(c('isBgeu'), g.not('lt')),
        ]),
      );
    },
  ),
);

add(
  gateBlock(
    'c8-halt',
    'Остановка',
    [
      ['clk', 'Clk', 'in'],
      ['isHlt', 'Bit', 'in'],
      ['halted', 'Bit', 'out'],
      ['run', 'Bit', 'out'],
    ],
    (g) => {
      // однажды встретив hlt, триггер держит единицу до конца работы
      g.dffAt('h_ff', g.or('h_ff', 'isHlt'), 'clk');
      g.out('halted', 'h_ff');
      g.out('run', g.not('h_ff'));
    },
  ),
);

add(
  gateBlock(
    'c8-gate-en',
    'Разрешения записи',
    [
      ['ctl', 'Ctrl', 'in'],
      ['run', 'Bit', 'in'],
      ['pcEn', 'Bit', 'out'],
      ['regWe', 'Bit', 'out'],
      ['ramWe', 'Bit', 'out'],
    ],
    (g) => {
      // пока процессор не остановлен: счётчик команд шагает (кроме hlt), регистр и диск пишут по команде
      g.out('pcEn', g.and('run', g.not(field('ctl', 'isHlt'))));
      g.out('regWe', g.and('run', field('ctl', 'regWrite')));
      g.out('ramWe', g.and('run', field('ctl', 'store')));
    },
  ),
);

add(
  wireBlock(
    'c8-immgen',
    'Числа из команды',
    [
      ['instr', 'Instr16', 'in'],
      ['imm6', 'Byte', 'out'],
      ['imm8', 'Byte', 'out'],
    ],
    [
      // шесть бит с расширением знака до байта
      ...range(6).map((i) => [bit('instr', i), bit('imm6', i)] as const),
      [bit('instr', 5), bit('imm6', 6)],
      [bit('instr', 5), bit('imm6', 7)],
      // восемь младших бит команды — число для li и смещение для jmp
      ...BITS.map((i) => [bit('instr', i), bit('imm8', i)] as const),
    ],
  ),
);

/* ===================== Байтовые блоки ===================== */

add(
  hierBlock(
    'c8-mux2x8',
    'Мультиплексор 2→1 (байт)',
    [
      ['s', 'Bit', 'in'],
      ['d0', 'Byte', 'in'],
      ['d1', 'Byte', 'in'],
      ['y', 'Byte', 'out'],
    ],
    (h) => {
      for (const i of BITS) {
        h.inst(`m${i}`, 'c8-mux2');
        h.link('$.s', `m${i}.s`)
          .link(`$.d0.B${i}`, `m${i}.d0`)
          .link(`$.d1.B${i}`, `m${i}.d1`)
          .link(`m${i}.y`, `$.y.B${i}`);
      }
    },
  ),
);

add(
  hierBlock(
    'c8-mux2x3',
    'Мультиплексор 2→1 (номер регистра)',
    [
      ['s', 'Bit', 'in'],
      ['d0', 'Reg3', 'in'],
      ['d1', 'Reg3', 'in'],
      ['y', 'Reg3', 'out'],
    ],
    (h) => {
      for (const i of [0, 1, 2]) {
        h.inst(`m${i}`, 'c8-mux2');
        h.link('$.s', `m${i}.s`)
          .link(`$.d0.R${i}`, `m${i}.d0`)
          .link(`$.d1.R${i}`, `m${i}.d1`)
          .link(`m${i}.y`, `$.y.R${i}`);
      }
    },
  ),
);

add(
  hierBlock(
    'c8-reg8',
    'Регистр на 8 бит',
    [
      ['d', 'Byte', 'in'],
      ['load', 'Bit', 'in'],
      ['clk', 'Clk', 'in'],
      ['q', 'Byte', 'out'],
    ],
    (h) => {
      for (const i of BITS) {
        h.inst(`b${i}`, 'c8-reg1');
        h.link(`$.d.B${i}`, `b${i}.d`)
          .link('$.load', `b${i}.load`)
          .link('$.clk', `b${i}.clk`)
          .link(`b${i}.q`, `$.q.B${i}`);
      }
    },
  ),
);

add(
  hierBlock(
    'c8-add8',
    'Сумматор на 8 бит',
    [
      ['a', 'Byte', 'in'],
      ['b', 'Byte', 'in'],
      ['s', 'Byte', 'out'],
    ],
    (h) => {
      for (const i of BITS) {
        h.inst(`s${i}`, i === 0 ? 'c8-ha' : 'c8-fa');
        h.link(`$.a.B${i}`, `s${i}.a`).link(`$.b.B${i}`, `s${i}.b`).link(`s${i}.sum`, `$.s.B${i}`);
        if (i > 0) h.link(`s${i - 1}.cout`, `s${i}.cin`);
      }
    },
  ),
);

add(
  hierBlock(
    'c8-alu8',
    'АЛУ на 8 бит',
    [
      ['a', 'Byte', 'in'],
      ['b', 'Byte', 'in'],
      ['sub', 'Bit', 'in'],
      ['sAdd', 'Bit', 'in'],
      ['sAnd', 'Bit', 'in'],
      ['sOr', 'Bit', 'in'],
      ['sXor', 'Bit', 'in'],
      ['sB', 'Bit', 'in'],
      ['res', 'Byte', 'out'],
    ],
    (h) => {
      for (const i of BITS) {
        h.inst(`s${i}`, 'c8-alu1');
        h.link(`$.a.B${i}`, `s${i}.a`)
          .link(`$.b.B${i}`, `s${i}.b`)
          .link(`s${i}.res`, `$.res.B${i}`);
        for (const sig of ['sub', 'sAdd', 'sAnd', 'sOr', 'sXor', 'sB'])
          h.link(`$.${sig}`, `s${i}.${sig}`);
        // перенос бежит от младшего разряда к старшему; вычитание — прибавление НЕ-B и единицы
        h.link(i === 0 ? '$.sub' : `s${i - 1}.cout`, `s${i}.cin`);
      }
    },
  ),
);

add(
  hierBlock(
    'c8-cmp8',
    'Сравнение байтов',
    [
      ['x', 'Byte', 'in'],
      ['y', 'Byte', 'in'],
      ['eq', 'Bit', 'out'],
      ['lt', 'Bit', 'out'],
    ],
    (h) => {
      for (const i of BITS) {
        h.inst(`c${i}`, i === 0 ? 'c8-cmp0' : 'c8-cmp1');
        h.link(`$.x.B${i}`, `c${i}.x`).link(`$.y.B${i}`, `c${i}.y`);
        if (i > 0) h.link(`c${i - 1}.lt`, `c${i}.ltIn`);
      }
      h.inst('all', 'c8-and8');
      for (const i of BITS) h.link(`c${i}.eq`, `all.x.B${i}`);
      h.link('all.y', '$.eq').link('c7.lt', '$.lt');
    },
  ),
);

/* ===================== Регистры и счётчик команд ===================== */

add(
  hierBlock(
    'c8-mux4x8',
    'Мультиплексор 4→1 (байт)',
    [
      ['s', 'Word2', 'in'],
      ['d0', 'Byte', 'in'],
      ['d1', 'Byte', 'in'],
      ['d2', 'Byte', 'in'],
      ['d3', 'Byte', 'in'],
      ['y', 'Byte', 'out'],
    ],
    (h) => {
      h.inst('lo', 'c8-mux2x8').inst('hi', 'c8-mux2x8').inst('top', 'c8-mux2x8');
      h.link('$.s.D0', 'lo.s').link('$.d0', 'lo.d0').link('$.d1', 'lo.d1');
      h.link('$.s.D0', 'hi.s').link('$.d2', 'hi.d0').link('$.d3', 'hi.d1');
      h.link('$.s.D1', 'top.s').link('lo.y', 'top.d0').link('hi.y', 'top.d1').link('top.y', '$.y');
    },
  ),
);

add(
  hierBlock(
    'c8-mux8x8',
    'Мультиплексор 8→1 (байт)',
    [
      ['s', 'Reg3', 'in'],
      ...BITS.map((i) => [`d${i}`, 'Byte', 'in'] as const),
      ['y', 'Byte', 'out'],
    ],
    (h) => {
      h.inst('lo', 'c8-mux4x8').inst('hi', 'c8-mux4x8').inst('top', 'c8-mux2x8');
      for (const [m, base] of [
        ['lo', 0],
        ['hi', 4],
      ] as const) {
        h.link('$.s.R1', `${m}.s.D1`).link('$.s.R0', `${m}.s.D0`);
        for (const k of [0, 1, 2, 3]) h.link(`$.d${base + k}`, `${m}.d${k}`);
      }
      h.link('$.s.R2', 'top.s').link('lo.y', 'top.d0').link('hi.y', 'top.d1').link('top.y', '$.y');
    },
  ),
);

add(
  hierBlock(
    'c8-regfile',
    'Регистровый файл',
    [
      ['clk', 'Clk', 'in'],
      ['we', 'Bit', 'in'],
      ['wsel', 'Reg3', 'in'],
      ['wdata', 'Byte', 'in'],
      ['rsel1', 'Reg3', 'in'],
      ['rsel2', 'Reg3', 'in'],
      ['rd1', 'Byte', 'out'],
      ['rd2', 'Byte', 'out'],
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => [`r${k}`, 'Byte', 'out'] as const),
    ],
    (h) => {
      h.inst('wdec', 'c8-wdec')
        .inst('z', 'c8-zero8')
        .inst('m1', 'c8-mux8x8')
        .inst('m2', 'c8-mux8x8');
      h.link('$.wsel', 'wdec.s').link('$.we', 'wdec.we');
      h.link('$.clk', 'z.a').link('z.y', 'm1.d0').link('z.y', 'm2.d0'); // r0 — всегда ноль
      for (const k of [1, 2, 3, 4, 5, 6, 7]) {
        h.inst(`r${k}`, 'c8-reg8');
        h.link('$.clk', `r${k}.clk`)
          .link('$.wdata', `r${k}.d`)
          .link(`wdec.en.H${k}`, `r${k}.load`)
          .link(`r${k}.q`, `m1.d${k}`)
          .link(`r${k}.q`, `m2.d${k}`)
          .link(`r${k}.q`, `$.r${k}`);
      }
      h.link('$.rsel1', 'm1.s').link('$.rsel2', 'm2.s').link('m1.y', '$.rd1').link('m2.y', '$.rd2');
    },
  ),
);

add(
  hierBlock(
    'c8-pc',
    'Счётчик команд',
    [
      ['clk', 'Clk', 'in'],
      ['run', 'Bit', 'in'],
      ['take', 'Bit', 'in'],
      ['isJmp', 'Bit', 'in'],
      ['imm6', 'Byte', 'in'],
      ['imm8', 'Byte', 'in'],
      ['pc', 'Byte', 'out'],
    ],
    (h) => {
      h.inst('reg', 'c8-reg8').inst('add', 'c8-add8').inst('one', 'c8-one8');
      h.inst('stepJ', 'c8-mux2x8').inst('step', 'c8-mux2x8');
      // шаг: по умолчанию +1; для jmp — смещение из команды; при условном переходе — короткое смещение
      h.link('$.clk', 'one.a')
        .link('$.isJmp', 'stepJ.s')
        .link('one.y', 'stepJ.d0')
        .link('$.imm8', 'stepJ.d1');
      h.link('$.take', 'step.s').link('stepJ.y', 'step.d0').link('$.imm6', 'step.d1');
      h.link('reg.q', 'add.a').link('step.y', 'add.b').link('add.s', 'reg.d');
      h.link('$.clk', 'reg.clk').link('$.run', 'reg.load').link('reg.q', '$.pc');
    },
  ),
);

/* ===================== Память ===================== */

add(
  nativeBlock(
    'c8-rom',
    'ПЗУ: программа',
    [
      ['addr', 'Byte', 'in'],
      ['word', 'Instr16', 'out'],
    ],
    (def): NativeSolution => ({
      native: 'rom',
      addr: nodesOf('addr', 'Byte'),
      dout: def.ports[1].nodes,
    }),
  ),
);

add(
  nativeBlock(
    'c8-ram',
    'Диск (память данных)',
    [
      ['addr', 'Byte', 'in'],
      ['din', 'Byte', 'in'],
      ['we', 'Bit', 'in'],
      ['clk', 'Clk', 'in'],
      ['dout', 'Byte', 'out'],
    ],
    (def): NativeSolution => ({
      native: 'ram',
      addr: nodesOf('addr', 'Byte'),
      din: nodesOf('din', 'Byte'),
      we: 'we',
      clk: 'clk',
      dout: def.ports[4].nodes,
    }),
  ),
);

/* ===================== Процессор ===================== */

add(
  hierBlock(
    'c8-cpu',
    'Процессор «Мини-8»',
    [
      ['clk', 'Clk', 'in'],
      ['pc', 'Byte', 'out'],
      ['halted', 'Bit', 'out'],
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => [`r${k}`, 'Byte', 'out'] as const),
    ],
    (h) => {
      // слева направо: выборка и декодирование → регистры и операнды → АЛУ, сравнение и диск
      const col = (n: number, y: number) => ({ x: 150 + n * 196, y });
      h.inst('pc', 'c8-pc', col(0, 20)).inst('rom', 'c8-rom', col(0, 230));
      h.inst('imm', 'c8-immgen', col(0, 330)).inst('dec', 'c8-decode', col(0, 440));
      h.inst('halt', 'c8-halt', col(0, 540)).inst('en', 'c8-gate-en', col(0, 650));
      h.inst('rf', 'c8-regfile', col(1, 20)).inst('p2s', 'c8-mux2x3', col(1, 310));
      h.inst('opm1', 'c8-mux2x8', col(1, 440)).inst('opm2', 'c8-mux2x8', col(1, 570));
      h.inst('wb', 'c8-mux2x8', col(1, 700));
      h.inst('alu', 'c8-alu8', col(2, 20)).inst('cmp', 'c8-cmp8', col(2, 300));
      h.inst('br', 'c8-branch', col(2, 410)).inst('ram', 'c8-ram', col(2, 550));

      // выборка: счётчик команд → ПЗУ → команда, разобранная на части
      h.link('pc.pc', 'rom.addr').link('rom.word', 'imm.instr').link('rom.word.op', 'dec.op');
      h.link('imm.imm6', 'pc.imm6').link('imm.imm8', 'pc.imm8');

      // регистры: куда писать (поле A), что читать (B) и второй операнд (C или A)
      h.link('rom.word.a', 'rf.wsel').link('rom.word.b', 'rf.rsel1');
      h.link('rom.word.a', 'p2s.d0');
      for (const i of [2, 1, 0]) h.link(`rom.word.c.I${i}`, `p2s.d1.R${i}`);
      h.link('dec.ctl.isR', 'p2s.s').link('p2s.y', 'rf.rsel2');

      // АЛУ: первый операнд — регистр B, второй — регистр или число из команды
      h.link('dec.ctl.useImm6', 'opm1.s').link('rf.rd2', 'opm1.d0').link('imm.imm6', 'opm1.d1');
      h.link('dec.ctl.useImm8', 'opm2.s').link('opm1.y', 'opm2.d0').link('imm.imm8', 'opm2.d1');
      h.link('rf.rd1', 'alu.a').link('opm2.y', 'alu.b');
      h.link('dec.ctl.sub', 'alu.sub')
        .link('dec.ctl.selAdd', 'alu.sAdd')
        .link('dec.ctl.selAnd', 'alu.sAnd');
      h.link('dec.ctl.selOr', 'alu.sOr')
        .link('dec.ctl.selXor', 'alu.sXor')
        .link('dec.ctl.selB', 'alu.sB');

      // переходы: сравнение двух регистров и решение
      h.link('rf.rd2', 'cmp.x').link('rf.rd1', 'cmp.y');
      h.link('dec.ctl', 'br.ctl').link('cmp.eq', 'br.eq').link('cmp.lt', 'br.lt');
      h.link('br.take', 'pc.take').link('dec.ctl.isJmp', 'pc.isJmp');

      // диск: адрес считает АЛУ, на запись идёт регистр A
      h.link('alu.res', 'ram.addr').link('rf.rd2', 'ram.din');
      h.link('dec.ctl.load', 'wb.s')
        .link('alu.res', 'wb.d0')
        .link('ram.dout', 'wb.d1')
        .link('wb.y', 'rf.wdata');

      // разрешения и остановка
      h.link('dec.ctl.isHlt', 'halt.isHlt').link('halt.run', 'en.run').link('dec.ctl', 'en.ctl');
      h.link('en.pcEn', 'pc.run').link('en.regWe', 'rf.we').link('en.ramWe', 'ram.we');
      h.link('$.clk', 'pc.clk')
        .link('$.clk', 'rf.clk')
        .link('$.clk', 'ram.clk')
        .link('$.clk', 'halt.clk');

      // что видно снаружи
      h.link('pc.pc', '$.pc').link('halt.halted', '$.halted');
      for (const k of [1, 2, 3, 4, 5, 6, 7]) h.link(`rf.r${k}`, `$.r${k}`);
    },
  ),
);

/** Все блоки процессора по id */
export const CPU8_BLOCKS: ReadonlyMap<string, GeneratedBlock> = new Map(
  blocks.map((b) => [b.def.id, b]),
);

export const cpu8Lookup: BlockLookup = (id) => CPU8_BLOCKS.get(id);

export const cpu8Def = (id: string): BlockDef => {
  const b = CPU8_BLOCKS.get(id);
  if (!b) throw new Error(`Нет блока «${id}»`);
  return b.def;
};

/** Библиотека блоков процессора — в том виде, в каком её ждёт доска блоков (только просмотр) */
export const cpu8Library: BlockLibrary = {
  defs: new Map([...CPU8_BLOCKS].map(([id, b]) => [id, b.def])),
  def: (id) => CPU8_BLOCKS.get(id)?.def,
  solution: (id) => CPU8_BLOCKS.get(id)?.solution,
  available: (id) => CPU8_BLOCKS.has(id),
  lockHint: () => '',
  lookup: cpu8Lookup,
};
