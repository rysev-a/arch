/**
 * RISC-V RV32IM: настоящие 32-битные команды.
 * Кодирование — по спецификации «RISC-V Unprivileged ISA» (форматы R, I, S, B, U, J).
 */

export const ABI_NAMES = [
  'zero',
  'ra',
  'sp',
  'gp',
  'tp',
  't0',
  't1',
  't2',
  's0',
  's1',
  'a0',
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
  'a7',
  's2',
  's3',
  's4',
  's5',
  's6',
  's7',
  's8',
  's9',
  's10',
  's11',
  't3',
  't4',
  't5',
  't6',
] as const;

/** Номер регистра по имени: x5, t0, fp… */
export function regNum(name: string): number | undefined {
  const n = name.trim().toLowerCase();
  const x = /^x([0-9]|[12][0-9]|3[01])$/.exec(n);
  if (x) return Number(x[1]);
  if (n === 'fp') return 8;
  const i = ABI_NAMES.indexOf(n as (typeof ABI_NAMES)[number]);
  return i >= 0 ? i : undefined;
}

export const regName = (n: number): string => ABI_NAMES[n];

export type Fmt = 'R' | 'I' | 'SH' | 'L' | 'S' | 'B' | 'U' | 'J' | 'JR' | 'SYS';

export interface RvOp {
  mnemonic: string;
  fmt: Fmt;
  opcode: number;
  f3?: number;
  f7?: number;
  /** расширение: I — базовый набор, M — умножение и деление */
  ext: 'I' | 'M';
  meaning: string;
  example: string;
}

const op = (
  mnemonic: string,
  fmt: Fmt,
  opcode: number,
  f3: number | undefined,
  f7: number | undefined,
  meaning: string,
  example: string,
  ext: 'I' | 'M' = 'I',
): RvOp => ({ mnemonic, fmt, opcode, f3, f7, ext, meaning, example });

export const OPS: readonly RvOp[] = [
  // --- арифметика и логика между регистрами (opcode 0110011) ---
  op('add', 'R', 0x33, 0, 0x00, 'rd = rs1 + rs2', 'add a0, a1, a2'),
  op('sub', 'R', 0x33, 0, 0x20, 'rd = rs1 − rs2', 'sub a0, a1, a2'),
  op('sll', 'R', 0x33, 1, 0x00, 'rd = rs1 << rs2[4:0]', 'sll a0, a1, a2'),
  op('slt', 'R', 0x33, 2, 0x00, 'rd = (rs1 < rs2) со знаком', 'slt a0, a1, a2'),
  op('sltu', 'R', 0x33, 3, 0x00, 'rd = (rs1 < rs2) без знака', 'sltu a0, a1, a2'),
  op('xor', 'R', 0x33, 4, 0x00, 'rd = rs1 XOR rs2', 'xor a0, a1, a2'),
  op('srl', 'R', 0x33, 5, 0x00, 'rd = rs1 >> rs2[4:0] (логически)', 'srl a0, a1, a2'),
  op('sra', 'R', 0x33, 5, 0x20, 'rd = rs1 >> rs2[4:0] (с сохранением знака)', 'sra a0, a1, a2'),
  op('or', 'R', 0x33, 6, 0x00, 'rd = rs1 ИЛИ rs2', 'or a0, a1, a2'),
  op('and', 'R', 0x33, 7, 0x00, 'rd = rs1 И rs2', 'and a0, a1, a2'),
  // --- умножение и деление (расширение M) ---
  op('mul', 'R', 0x33, 0, 0x01, 'rd = младшие 32 бита rs1 · rs2', 'mul a0, a1, a2', 'M'),
  op(
    'mulh',
    'R',
    0x33,
    1,
    0x01,
    'rd = старшие 32 бита rs1 · rs2 (оба со знаком)',
    'mulh a0, a1, a2',
    'M',
  ),
  op(
    'mulhsu',
    'R',
    0x33,
    2,
    0x01,
    'rd = старшие 32 бита (rs1 со знаком, rs2 без)',
    'mulhsu a0, a1, a2',
    'M',
  ),
  op(
    'mulhu',
    'R',
    0x33,
    3,
    0x01,
    'rd = старшие 32 бита rs1 · rs2 (без знака)',
    'mulhu a0, a1, a2',
    'M',
  ),
  op('div', 'R', 0x33, 4, 0x01, 'rd = rs1 / rs2 (со знаком)', 'div a0, a1, a2', 'M'),
  op('divu', 'R', 0x33, 5, 0x01, 'rd = rs1 / rs2 (без знака)', 'divu a0, a1, a2', 'M'),
  op('rem', 'R', 0x33, 6, 0x01, 'rd = остаток rs1 / rs2 (со знаком)', 'rem a0, a1, a2', 'M'),
  op('remu', 'R', 0x33, 7, 0x01, 'rd = остаток rs1 / rs2 (без знака)', 'remu a0, a1, a2', 'M'),
  // --- с числом из команды (0010011) ---
  op('addi', 'I', 0x13, 0, undefined, 'rd = rs1 + число (−2048…2047)', 'addi a0, a0, -1'),
  op('slti', 'I', 0x13, 2, undefined, 'rd = (rs1 < число) со знаком', 'slti a0, a1, 10'),
  op('sltiu', 'I', 0x13, 3, undefined, 'rd = (rs1 < число) без знака', 'sltiu a0, a1, 10'),
  op('xori', 'I', 0x13, 4, undefined, 'rd = rs1 XOR число', 'xori a0, a1, -1'),
  op('ori', 'I', 0x13, 6, undefined, 'rd = rs1 ИЛИ число', 'ori a0, a1, 0x0f'),
  op('andi', 'I', 0x13, 7, undefined, 'rd = rs1 И число', 'andi a0, a1, 0xff'),
  op('slli', 'SH', 0x13, 1, 0x00, 'rd = rs1 << число (0…31)', 'slli a0, a1, 2'),
  op('srli', 'SH', 0x13, 5, 0x00, 'rd = rs1 >> число (логически)', 'srli a0, a1, 2'),
  op('srai', 'SH', 0x13, 5, 0x20, 'rd = rs1 >> число (со знаком)', 'srai a0, a1, 2'),
  // --- память (0000011 / 0100011) ---
  op('lb', 'L', 0x03, 0, undefined, 'rd = байт [rs1+смещение] со знаком', 'lb a0, 0(a1)'),
  op('lh', 'L', 0x03, 1, undefined, 'rd = полуслово [rs1+смещение] со знаком', 'lh a0, 0(a1)'),
  op('lw', 'L', 0x03, 2, undefined, 'rd = слово [rs1+смещение]', 'lw a0, 4(a1)'),
  op('lbu', 'L', 0x03, 4, undefined, 'rd = байт [rs1+смещение] без знака', 'lbu a0, 0(a1)'),
  op('lhu', 'L', 0x03, 5, undefined, 'rd = полуслово [rs1+смещение] без знака', 'lhu a0, 0(a1)'),
  op('sb', 'S', 0x23, 0, undefined, 'байт [rs1+смещение] = rs2', 'sb a0, 0(a1)'),
  op('sh', 'S', 0x23, 1, undefined, 'полуслово [rs1+смещение] = rs2', 'sh a0, 0(a1)'),
  op('sw', 'S', 0x23, 2, undefined, 'слово [rs1+смещение] = rs2', 'sw a0, 4(a1)'),
  // --- переходы (1100011) ---
  op('beq', 'B', 0x63, 0, undefined, 'если rs1 = rs2 — перейти', 'beq a0, a1, метка'),
  op('bne', 'B', 0x63, 1, undefined, 'если rs1 ≠ rs2 — перейти', 'bne a0, a1, метка'),
  op('blt', 'B', 0x63, 4, undefined, 'если rs1 < rs2 (со знаком) — перейти', 'blt a0, a1, метка'),
  op('bge', 'B', 0x63, 5, undefined, 'если rs1 ≥ rs2 (со знаком) — перейти', 'bge a0, a1, метка'),
  op('bltu', 'B', 0x63, 6, undefined, 'если rs1 < rs2 (без знака) — перейти', 'bltu a0, a1, метка'),
  op('bgeu', 'B', 0x63, 7, undefined, 'если rs1 ≥ rs2 (без знака) — перейти', 'bgeu a0, a1, метка'),
  op('jal', 'J', 0x6f, undefined, undefined, 'rd = pc + 4; перейти на метку', 'jal ra, функция'),
  op('jalr', 'JR', 0x67, 0, undefined, 'rd = pc + 4; перейти на rs1 + смещение', 'jalr ra, 0(t0)'),
  // --- длинные числа и адреса ---
  op('lui', 'U', 0x37, undefined, undefined, 'rd = число << 12', 'lui a0, 0x12345'),
  op('auipc', 'U', 0x17, undefined, undefined, 'rd = pc + (число << 12)', 'auipc a0, 1'),
  // --- система ---
  op('ecall', 'SYS', 0x73, undefined, undefined, 'вызов системы (номер в a7)', 'ecall'),
  op('ebreak', 'SYS', 0x73, undefined, undefined, 'остановка (точка останова)', 'ebreak'),
];

const BY_MNEMONIC = new Map(OPS.map((o) => [o.mnemonic, o]));
export const opByMnemonic = (m: string): RvOp | undefined => BY_MNEMONIC.get(m);

/** Псевдокоманды — сокращения, которые разворачивает ассемблер */
export const PSEUDO: readonly { example: string; becomes: string }[] = [
  { example: 'nop', becomes: 'addi zero, zero, 0' },
  { example: 'li a0, 1000', becomes: 'addi a0, zero, 1000  (длинное число — lui + addi)' },
  { example: 'la a0, метка', becomes: 'auipc a0, … ; addi a0, a0, …  (адрес метки)' },
  { example: 'mv a0, a1', becomes: 'addi a0, a1, 0' },
  { example: 'not a0, a1', becomes: 'xori a0, a1, -1' },
  { example: 'neg a0, a1', becomes: 'sub a0, zero, a1' },
  { example: 'seqz a0, a1', becomes: 'sltiu a0, a1, 1' },
  { example: 'snez a0, a1', becomes: 'sltu a0, zero, a1' },
  { example: 'j метка', becomes: 'jal zero, метка' },
  { example: 'jal метка', becomes: 'jal ra, метка' },
  { example: 'jr a0', becomes: 'jalr zero, 0(a0)' },
  { example: 'ret', becomes: 'jalr zero, 0(ra)' },
  { example: 'call функция', becomes: 'auipc ra, … ; jalr ra, …(ra)' },
  { example: 'beqz a0, метка', becomes: 'beq a0, zero, метка' },
  { example: 'bnez a0, метка', becomes: 'bne a0, zero, метка' },
  { example: 'blez a0, метка', becomes: 'bge zero, a0, метка' },
  { example: 'bgez a0, метка', becomes: 'bge a0, zero, метка' },
  { example: 'bltz a0, метка', becomes: 'blt a0, zero, метка' },
  { example: 'bgtz a0, метка', becomes: 'blt zero, a0, метка' },
  { example: 'bgt a0, a1, метка', becomes: 'blt a1, a0, метка' },
  { example: 'ble a0, a1, метка', becomes: 'bge a1, a0, метка' },
  { example: 'bgtu a0, a1, метка', becomes: 'bltu a1, a0, метка' },
  { example: 'bleu a0, a1, метка', becomes: 'bgeu a1, a0, метка' },
];

/* ============================================================
   Кодирование
   ============================================================ */

const u32 = (n: number): number => n >>> 0;

export const encR = (o: RvOp, rd: number, rs1: number, rs2: number): number =>
  u32((o.f7! << 25) | (rs2 << 20) | (rs1 << 15) | (o.f3! << 12) | (rd << 7) | o.opcode);

export const encI = (o: RvOp, rd: number, rs1: number, imm: number): number =>
  u32(((imm & 0xfff) << 20) | (rs1 << 15) | (o.f3! << 12) | (rd << 7) | o.opcode);

/** Сдвиги: в старших семи битах — f7, в пяти младших полях числа — величина сдвига */
export const encSH = (o: RvOp, rd: number, rs1: number, shamt: number): number =>
  u32((o.f7! << 25) | ((shamt & 31) << 20) | (rs1 << 15) | (o.f3! << 12) | (rd << 7) | o.opcode);

export const encS = (o: RvOp, rs2: number, rs1: number, imm: number): number =>
  u32(
    (((imm >> 5) & 0x7f) << 25) |
      (rs2 << 20) |
      (rs1 << 15) |
      (o.f3! << 12) |
      ((imm & 0x1f) << 7) |
      o.opcode,
  );

export const encB = (o: RvOp, rs1: number, rs2: number, off: number): number =>
  u32(
    (((off >> 12) & 1) << 31) |
      (((off >> 5) & 0x3f) << 25) |
      (rs2 << 20) |
      (rs1 << 15) |
      (o.f3! << 12) |
      (((off >> 1) & 0xf) << 8) |
      (((off >> 11) & 1) << 7) |
      o.opcode,
  );

export const encU = (o: RvOp, rd: number, imm20: number): number =>
  u32(((imm20 & 0xfffff) << 12) | (rd << 7) | o.opcode);

export const encJ = (o: RvOp, rd: number, off: number): number =>
  u32(
    (((off >> 20) & 1) << 31) |
      (((off >> 1) & 0x3ff) << 21) |
      (((off >> 11) & 1) << 20) |
      (((off >> 12) & 0xff) << 12) |
      (rd << 7) |
      o.opcode,
  );

export const ECALL = 0x00000073;
export const EBREAK = 0x00100073;

/* ============================================================
   Декодирование
   ============================================================ */

export interface Decoded {
  word: number;
  op: RvOp | undefined;
  rd: number;
  rs1: number;
  rs2: number;
  /** число из команды со знаком (для U — 20 бит как есть, без знака) */
  imm: number;
}

/** Таблица для быстрого поиска: «код|f3|f7» → операция */
const DECODE = new Map<string, RvOp>();
for (const o of OPS) {
  if (o.fmt === 'SYS') continue;
  const f7 = o.fmt === 'R' || o.fmt === 'SH' ? o.f7 : -1;
  DECODE.set(`${o.opcode}|${o.f3 ?? -1}|${f7}`, o);
}

export function decode(word: number): Decoded {
  const w = word | 0;
  const opcode = w & 0x7f;
  const f3 = (w >> 12) & 7;
  const f7 = (w >> 25) & 0x7f;
  const rd = (w >> 7) & 31;
  const rs1 = (w >> 15) & 31;
  const rs2 = (w >> 20) & 31;

  let op: RvOp | undefined;
  if (opcode === 0x73) {
    op = w === ECALL ? opByMnemonic('ecall') : w === EBREAK ? opByMnemonic('ebreak') : undefined;
  } else if (opcode === 0x37 || opcode === 0x17 || opcode === 0x6f) {
    op = DECODE.get(`${opcode}|-1|-1`);
  } else if (opcode === 0x33) {
    op = DECODE.get(`${opcode}|${f3}|${f7}`);
  } else if (opcode === 0x13) {
    // обычные команды различаются по f3, сдвиги — ещё и по старшим семи битам (srli и srai)
    op = DECODE.get(`${opcode}|${f3}|-1`) ?? DECODE.get(`${opcode}|${f3}|${f7}`);
  } else {
    op = DECODE.get(`${opcode}|${f3}|-1`);
  }

  let imm = 0;
  switch (op?.fmt) {
    case 'I':
    case 'L':
    case 'JR':
      imm = w >> 20;
      break;
    case 'SH':
      imm = rs2; // величина сдвига
      break;
    case 'S':
      imm = ((w >> 25) << 5) | ((w >> 7) & 0x1f);
      break;
    case 'B':
      imm =
        ((w >> 31) << 12) |
        (((w >>> 7) & 1) << 11) |
        (((w >>> 25) & 0x3f) << 5) |
        (((w >>> 8) & 0xf) << 1);
      break;
    case 'U':
      imm = (w >>> 12) & 0xfffff;
      break;
    case 'J':
      imm =
        ((w >> 31) << 20) |
        (((w >>> 12) & 0xff) << 12) |
        (((w >>> 20) & 1) << 11) |
        (((w >>> 21) & 0x3ff) << 1);
      break;
  }
  return { word: u32(w), op, rd, rs1, rs2, imm };
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Команда обратно в текст (имена регистров — как в ABI) */
export function disassemble(word: number): string {
  const d = decode(word);
  const r = regName;
  const o = d.op;
  if (!o) return `.word 0x${u32(word).toString(16).padStart(8, '0')}`;
  switch (o.fmt) {
    case 'R':
      return `${o.mnemonic} ${r(d.rd)}, ${r(d.rs1)}, ${r(d.rs2)}`;
    case 'I':
    case 'SH':
      return `${o.mnemonic} ${r(d.rd)}, ${r(d.rs1)}, ${d.imm}`;
    case 'L':
      return `${o.mnemonic} ${r(d.rd)}, ${d.imm}(${r(d.rs1)})`;
    case 'S':
      return `${o.mnemonic} ${r(d.rs2)}, ${d.imm}(${r(d.rs1)})`;
    case 'B':
      return `${o.mnemonic} ${r(d.rs1)}, ${r(d.rs2)}, ${signed(d.imm)}`;
    case 'U':
      return `${o.mnemonic} ${r(d.rd)}, 0x${d.imm.toString(16)}`;
    case 'J':
      return `jal ${r(d.rd)}, ${signed(d.imm)}`;
    case 'JR':
      return `jalr ${r(d.rd)}, ${d.imm}(${r(d.rs1)})`;
    case 'SYS':
      return o.mnemonic;
  }
}

/* ============================================================
   Разбор команды по полям — для учебного списка
   ============================================================ */

export interface BitField {
  name: string;
  bits: string;
  /** css-класс для цвета */
  cls: string;
}

const bin = (w: number, hi: number, lo: number): string =>
  ((u32(w) >>> lo) & ((1 << (hi - lo + 1)) - 1)).toString(2).padStart(hi - lo + 1, '0');

export function fieldsOf(word: number): { fmt: string; fields: BitField[] } {
  const d = decode(word);
  const f = (name: string, hi: number, lo: number, cls: string): BitField => ({
    name,
    bits: bin(word, hi, lo),
    cls,
  });
  const opcode = f('код', 6, 0, 'op');
  switch (d.op?.fmt) {
    case 'R':
      return {
        fmt: 'R',
        fields: [
          f('f7', 31, 25, 'f7'),
          f('rs2', 24, 20, 'rs2'),
          f('rs1', 19, 15, 'rs1'),
          f('f3', 14, 12, 'f3'),
          f('rd', 11, 7, 'rd'),
          opcode,
        ],
      };
    case 'I':
    case 'L':
    case 'JR':
      return {
        fmt: 'I',
        fields: [
          f('число [11:0]', 31, 20, 'imm'),
          f('rs1', 19, 15, 'rs1'),
          f('f3', 14, 12, 'f3'),
          f('rd', 11, 7, 'rd'),
          opcode,
        ],
      };
    case 'SH':
      return {
        fmt: 'I',
        fields: [
          f('f7', 31, 25, 'f7'),
          f('сдвиг', 24, 20, 'imm'),
          f('rs1', 19, 15, 'rs1'),
          f('f3', 14, 12, 'f3'),
          f('rd', 11, 7, 'rd'),
          opcode,
        ],
      };
    case 'S':
      return {
        fmt: 'S',
        fields: [
          f('число [11:5]', 31, 25, 'imm'),
          f('rs2', 24, 20, 'rs2'),
          f('rs1', 19, 15, 'rs1'),
          f('f3', 14, 12, 'f3'),
          f('число [4:0]', 11, 7, 'imm'),
          opcode,
        ],
      };
    case 'B':
      return {
        fmt: 'B',
        fields: [
          f('[12|10:5]', 31, 25, 'imm'),
          f('rs2', 24, 20, 'rs2'),
          f('rs1', 19, 15, 'rs1'),
          f('f3', 14, 12, 'f3'),
          f('[4:1|11]', 11, 7, 'imm'),
          opcode,
        ],
      };
    case 'U':
      return {
        fmt: 'U',
        fields: [f('число [31:12]', 31, 12, 'imm'), f('rd', 11, 7, 'rd'), opcode],
      };
    case 'J':
      return {
        fmt: 'J',
        fields: [f('[20|10:1|11|19:12]', 31, 12, 'imm'), f('rd', 11, 7, 'rd'), opcode],
      };
    default:
      return d.op?.fmt === 'SYS'
        ? { fmt: 'SYS', fields: [f('номер', 31, 7, 'imm'), opcode] }
        : { fmt: '?', fields: [f('слово', 31, 0, 'imm')] };
  }
}
