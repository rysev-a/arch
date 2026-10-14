/**
 * Набор команд «Мини-8»: 8-битные данные, 8 регистров, команда — 16 бит.
 *
 *   15..12   11..9   8..6   5..0
 *   опкод      A      B      C
 *
 * Поля A, B, C трактуются по-разному в зависимости от формата команды.
 * Команды называются как в RISC-V, но набор намного проще — чтобы всё помещалось в голове.
 */

export const REG_COUNT = 8;
export const MEM_SIZE = 256;
export const PROGRAM_MAX = 256;

export type Format =
  | 'none' // hlt
  | 'li' // li rd, imm8
  | 'r' // add rd, rs, rt
  | 'i' // addi rd, rs, imm6
  | 'mem' // lb rd, imm6(rs)
  | 'branch' // beq ra, rb, метка
  | 'jump'; // jmp метка

export interface OpDef {
  mnemonic: string;
  opcode: number;
  format: Format;
  /** Что делает — одной строкой */
  meaning: string;
  example: string;
}

export const OPS: readonly OpDef[] = [
  { mnemonic: 'hlt', opcode: 0x0, format: 'none', meaning: 'остановить процессор', example: 'hlt' },
  {
    mnemonic: 'li',
    opcode: 0x1,
    format: 'li',
    meaning: 'rd = число (0…255)',
    example: 'li r1, 72',
  },
  { mnemonic: 'add', opcode: 0x2, format: 'r', meaning: 'rd = rs + rt', example: 'add r1, r2, r3' },
  { mnemonic: 'sub', opcode: 0x3, format: 'r', meaning: 'rd = rs − rt', example: 'sub r1, r2, r3' },
  {
    mnemonic: 'and',
    opcode: 0x4,
    format: 'r',
    meaning: 'rd = rs И rt (побитово)',
    example: 'and r1, r2, r3',
  },
  {
    mnemonic: 'or',
    opcode: 0x5,
    format: 'r',
    meaning: 'rd = rs ИЛИ rt (побитово)',
    example: 'or r1, r2, r3',
  },
  {
    mnemonic: 'xor',
    opcode: 0x6,
    format: 'r',
    meaning: 'rd = rs XOR rt (побитово)',
    example: 'xor r1, r2, r3',
  },
  {
    mnemonic: 'addi',
    opcode: 0x7,
    format: 'i',
    meaning: 'rd = rs + число (−32…31)',
    example: 'addi r1, r1, 1',
  },
  {
    mnemonic: 'lb',
    opcode: 0x8,
    format: 'mem',
    meaning: 'rd = байт из памяти [rs + смещение]',
    example: 'lb r1, 0(r2)',
  },
  {
    mnemonic: 'sb',
    opcode: 0x9,
    format: 'mem',
    meaning: 'память [rs + смещение] = rd',
    example: 'sb r1, 0(r2)',
  },
  {
    mnemonic: 'beq',
    opcode: 0xa,
    format: 'branch',
    meaning: 'если ra = rb — перейти на метку',
    example: 'beq r1, r2, конец',
  },
  {
    mnemonic: 'bne',
    opcode: 0xb,
    format: 'branch',
    meaning: 'если ra ≠ rb — перейти на метку',
    example: 'bne r1, r2, цикл',
  },
  {
    mnemonic: 'bltu',
    opcode: 0xc,
    format: 'branch',
    meaning: 'если ra < rb (без знака) — перейти',
    example: 'bltu r1, r2, дальше',
  },
  {
    mnemonic: 'bgeu',
    opcode: 0xd,
    format: 'branch',
    meaning: 'если ra ≥ rb (без знака) — перейти',
    example: 'bgeu r1, r2, дальше',
  },
  {
    mnemonic: 'jmp',
    opcode: 0xe,
    format: 'jump',
    meaning: 'безусловный переход на метку',
    example: 'jmp цикл',
  },
];

/** Псевдокоманды — удобные сокращения, ассемблер сам заменяет их настоящими */
export const PSEUDO: readonly { name: string; example: string; becomes: string }[] = [
  { name: 'nop', example: 'nop', becomes: 'addi r0, r0, 0' },
  { name: 'mv', example: 'mv r1, r2', becomes: 'addi r1, r2, 0' },
  { name: 'inc', example: 'inc r1', becomes: 'addi r1, r1, 1' },
  { name: 'dec', example: 'dec r1', becomes: 'addi r1, r1, -1' },
  { name: 'beqz', example: 'beqz r1, метка', becomes: 'beq r1, r0, метка' },
  { name: 'bnez', example: 'bnez r1, метка', becomes: 'bne r1, r0, метка' },
  { name: 'bgtu', example: 'bgtu r1, r2, метка', becomes: 'bltu r2, r1, метка' },
  { name: 'bleu', example: 'bleu r1, r2, метка', becomes: 'bgeu r2, r1, метка' },
  { name: 'j', example: 'j метка', becomes: 'jmp метка' },
];

const BY_MNEMONIC = new Map(OPS.map((o) => [o.mnemonic, o]));
const BY_OPCODE = new Map(OPS.map((o) => [o.opcode, o]));

export const opByMnemonic = (m: string): OpDef | undefined => BY_MNEMONIC.get(m);
export const opByOpcode = (c: number): OpDef | undefined => BY_OPCODE.get(c);

/** Число из `bits` бит → со знаком */
export function toSigned(value: number, bits: number): number {
  const mask = (1 << bits) - 1;
  const v = value & mask;
  return v & (1 << (bits - 1)) ? v - (1 << bits) : v;
}

/** Собрать слово из полей */
export function pack(opcode: number, a: number, b: number, c: number): number {
  return ((opcode & 0xf) << 12) | ((a & 7) << 9) | ((b & 7) << 6) | (c & 0x3f);
}

export interface Decoded {
  word: number;
  opcode: number;
  a: number;
  b: number;
  c: number;
  def: OpDef | undefined;
}

export function decode(word: number): Decoded {
  const w = word & 0xffff;
  const opcode = w >> 12;
  return {
    word: w,
    opcode,
    a: (w >> 9) & 7,
    b: (w >> 6) & 7,
    c: w & 0x3f,
    def: opByOpcode(opcode),
  };
}

/** Команда обратно в текст — для списка машинного кода */
export function disassemble(word: number): string {
  const d = decode(word);
  const r = (n: number) => `r${n}`;
  switch (d.def?.format) {
    case 'none':
      return 'hlt';
    case 'li':
      return `li ${r(d.a)}, ${word & 0xff}`;
    case 'r':
      return `${d.def.mnemonic} ${r(d.a)}, ${r(d.b)}, ${r(d.c & 7)}`;
    case 'i':
      return `${d.def.mnemonic} ${r(d.a)}, ${r(d.b)}, ${toSigned(d.c, 6)}`;
    case 'mem':
      return `${d.def.mnemonic} ${r(d.a)}, ${toSigned(d.c, 6)}(${r(d.b)})`;
    case 'branch':
      return `${d.def.mnemonic} ${r(d.a)}, ${r(d.b)}, ${signedStr(toSigned(d.c, 6))}`;
    case 'jump':
      return `jmp ${signedStr(toSigned(word & 0xfff, 12))}`;
    default:
      return `.word 0x${d.word.toString(16).padStart(4, '0')}`;
  }
}

const signedStr = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Двоичная запись слова по полям — для «как устроена команда» */
export function fields(word: number): { opcode: string; a: string; b: string; c: string } {
  const d = decode(word);
  const bin = (n: number, w: number) => n.toString(2).padStart(w, '0');
  return { opcode: bin(d.opcode, 4), a: bin(d.a, 3), b: bin(d.b, 3), c: bin(d.c, 6) };
}
