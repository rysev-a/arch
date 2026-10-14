import { PROGRAM_MAX, OpDef, opByMnemonic, pack } from './isa';

/** Одна собранная команда: откуда она, по какому адресу, во что превратилась */
export interface AsmLine {
  /** номер строки исходника, с 1 */
  line: number;
  addr: number;
  word: number;
  /** исходный текст команды (без метки и комментария) */
  text: string;
}

export interface AsmError {
  line: number;
  message: string;
}

export interface AsmResult {
  words: number[];
  lines: AsmLine[];
  labels: Record<string, number>;
  errors: AsmError[];
}

interface Parsed {
  line: number;
  mnemonic: string;
  operands: string[];
  text: string;
}

const IDENT = /^[A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*$/;

/** Убирает комментарий (; или #), не трогая символы в кавычках */
function stripComment(s: string): string {
  let quote = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") quote = !quote;
    if (!quote && (s[i] === ';' || s[i] === '#')) return s.slice(0, i);
  }
  return s;
}

/** Делит операнды по запятым, не ломая символ ',' в кавычках */
function splitOperands(s: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote = false;
  for (const ch of s) {
    if (ch === "'") quote = !quote;
    if (ch === ',' && !quote) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '' || parts.length > 0) parts.push(cur.trim());
  return parts;
}

const ESCAPES: Record<string, number> = { n: 10, t: 9, '0': 0, r: 13, '\\': 92, "'": 39 };

/** Число: 42, -5, 0x2A, 0b101, 'A', '\n' или имя из .equ */
function parseNumber(token: string, equ: ReadonlyMap<string, number>): number | undefined {
  const t = token.trim();
  if (equ.has(t)) return equ.get(t);
  const ch = /^'(\\.|[^\\'])'$/.exec(t);
  if (ch) {
    const body = ch[1];
    if (body.length === 2) return ESCAPES[body[1]];
    return body.codePointAt(0);
  }
  const m = /^([+-]?)(0x[0-9a-f]+|0b[01]+|\d+)$/i.exec(t);
  if (!m) return undefined;
  const n = m[2].toLowerCase().startsWith('0x')
    ? parseInt(m[2].slice(2), 16)
    : m[2].toLowerCase().startsWith('0b')
      ? parseInt(m[2].slice(2), 2)
      : parseInt(m[2], 10);
  return m[1] === '-' ? -n : n;
}

function parseReg(token: string): number | undefined {
  const t = token.trim().toLowerCase();
  if (t === 'zero') return 0;
  const m = /^r([0-7])$/.exec(t);
  return m ? Number(m[1]) : undefined;
}

/** Ассемблер: текст программы → машинные слова. Все ошибки собираются, а не только первая. */
export function assemble(source: string): AsmResult {
  const errors: AsmError[] = [];
  const labels: Record<string, number> = {};
  const equ = new Map<string, number>();
  const parsed: Parsed[] = [];
  const fail = (line: number, message: string) => errors.push({ line, message });

  /* ---------- проход 1: метки, константы, разбор строк ---------- */
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let text = stripComment(raw).trim();
    if (text === '') return;

    // метка в начале строки
    const lab = /^([^\s:,]+):\s*(.*)$/.exec(text);
    if (lab) {
      if (!IDENT.test(lab[1])) fail(line, `Недопустимое имя метки «${lab[1]}»`);
      else if (lab[1] in labels) fail(line, `Метка «${lab[1]}» уже объявлена`);
      else labels[lab[1]] = parsed.length;
      text = lab[2].trim();
      if (text === '') return;
    }

    const head = /^(\S+)\s*(.*)$/.exec(text)!;
    const mnemonic = head[1].toLowerCase();
    const operands = splitOperands(head[2]);

    if (mnemonic === '.equ') {
      const name = operands[0];
      const value = operands.length === 2 ? parseNumber(operands[1], equ) : undefined;
      if (operands.length !== 2 || !IDENT.test(name ?? ''))
        fail(line, 'Нужно так: .equ ИМЯ, число');
      else if (value === undefined) fail(line, `Не понимаю число «${operands[1]}»`);
      else equ.set(name, value);
      return;
    }

    parsed.push({ line, mnemonic, operands, text });
  });

  if (parsed.length > PROGRAM_MAX) {
    fail(parsed[PROGRAM_MAX].line, `Слишком длинная программа: не больше ${PROGRAM_MAX} команд`);
  }

  /* ---------- проход 2: кодирование ---------- */
  const words: number[] = [];
  const lines: AsmLine[] = [];

  parsed.forEach((p, addr) => {
    const { line } = p;
    let mnemonic = p.mnemonic;
    let ops = p.operands;

    // псевдокоманды
    const need = (n: number, usage: string): boolean => {
      if (ops.length !== n) {
        fail(line, `«${mnemonic}» принимает ${n} ${n === 1 ? 'операнд' : 'операнда'}: ${usage}`);
        return false;
      }
      return true;
    };
    switch (mnemonic) {
      case 'nop':
        if (!need(0, 'nop')) return;
        [mnemonic, ops] = ['addi', ['r0', 'r0', '0']];
        break;
      case 'mv':
        if (!need(2, 'mv rd, rs')) return;
        [mnemonic, ops] = ['addi', [ops[0], ops[1], '0']];
        break;
      case 'inc':
        if (!need(1, 'inc rd')) return;
        [mnemonic, ops] = ['addi', [ops[0], ops[0], '1']];
        break;
      case 'dec':
        if (!need(1, 'dec rd')) return;
        [mnemonic, ops] = ['addi', [ops[0], ops[0], '-1']];
        break;
      case 'beqz':
      case 'bnez':
        if (!need(2, `${mnemonic} r, метка`)) return;
        [mnemonic, ops] = [mnemonic === 'beqz' ? 'beq' : 'bne', [ops[0], 'r0', ops[1]]];
        break;
      case 'bgtu':
      case 'bleu':
        if (!need(3, `${mnemonic} ra, rb, метка`)) return;
        [mnemonic, ops] = [mnemonic === 'bgtu' ? 'bltu' : 'bgeu', [ops[1], ops[0], ops[2]]];
        break;
      case 'j':
        if (!need(1, 'j метка')) return;
        mnemonic = 'jmp';
        break;
    }

    const def = opByMnemonic(mnemonic);
    if (!def) {
      fail(line, `Неизвестная команда «${p.mnemonic}»`);
      return;
    }

    const word = encode(def, ops, addr, line, labels, equ, fail);
    if (word === undefined) return;
    words.push(word);
    lines.push({ line, addr, word, text: p.text });
  });

  return { words, lines, labels, errors };
}

function encode(
  def: OpDef,
  ops: string[],
  addr: number,
  line: number,
  labels: Record<string, number>,
  equ: ReadonlyMap<string, number>,
  fail: (line: number, message: string) => void,
): number | undefined {
  const reg = (token: string | undefined): number | undefined => {
    const r = token === undefined ? undefined : parseReg(token);
    if (r === undefined) fail(line, `Ожидался регистр r0…r7, а здесь «${token ?? ''}»`);
    return r;
  };
  const num = (token: string | undefined, min: number, max: number, what: string) => {
    const v = token === undefined ? undefined : parseNumber(token, equ);
    if (v === undefined) {
      fail(line, `Ожидалось число, а здесь «${token ?? ''}»`);
      return undefined;
    }
    if (v < min || v > max) {
      fail(line, `${what}: ${v} не помещается — допустимо от ${min} до ${max}`);
      return undefined;
    }
    return v;
  };
  const count = (n: number, usage: string): boolean => {
    if (ops.length === n) return true;
    fail(line, `«${def.mnemonic}» принимает ${n} ${n === 1 ? 'операнд' : 'операнда'}: ${usage}`);
    return false;
  };
  /** смещение до метки (или числом) — в командах от самой этой команды */
  const target = (token: string, bits: number): number | undefined => {
    let off: number | undefined;
    if (token in labels) off = labels[token] - addr;
    else {
      const n = parseNumber(token, equ);
      if (n === undefined) {
        fail(
          line,
          IDENT.test(token) ? `Нет метки «${token}»` : `Ожидалась метка, а здесь «${token}»`,
        );
        return undefined;
      }
      off = n;
    }
    const lim = 1 << (bits - 1);
    if (off < -lim || off >= lim) {
      fail(line, `Метка «${token}» слишком далеко (${off} команд); можно от ${-lim} до ${lim - 1}`);
      return undefined;
    }
    return off;
  };

  switch (def.format) {
    case 'none':
      return count(0, def.mnemonic) ? pack(def.opcode, 0, 0, 0) : undefined;

    case 'li': {
      if (!count(2, 'li rd, число')) return undefined;
      const rd = reg(ops[0]);
      const v = num(ops[1], -128, 255, 'Число');
      return rd === undefined || v === undefined
        ? undefined
        : (def.opcode << 12) | (rd << 9) | (v & 0xff);
    }

    case 'r': {
      if (!count(3, `${def.mnemonic} rd, rs, rt`)) return undefined;
      const [rd, rs, rt] = [reg(ops[0]), reg(ops[1]), reg(ops[2])];
      return rd === undefined || rs === undefined || rt === undefined
        ? undefined
        : pack(def.opcode, rd, rs, rt);
    }

    case 'i': {
      if (!count(3, `${def.mnemonic} rd, rs, число`)) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      const v = num(ops[2], -32, 31, 'Число');
      return rd === undefined || rs === undefined || v === undefined
        ? undefined
        : pack(def.opcode, rd, rs, v);
    }

    case 'mem': {
      if (!count(2, `${def.mnemonic} rd, смещение(rs)`)) return undefined;
      const rd = reg(ops[0]);
      const m = /^(.*)\(\s*([^)]+?)\s*\)$/.exec(ops[1]);
      if (!m) {
        fail(line, `Адрес пишется как смещение(регистр), например 0(r2), а здесь «${ops[1]}»`);
        return undefined;
      }
      const rs = reg(m[2]);
      const off = m[1].trim() === '' ? 0 : num(m[1], -32, 31, 'Смещение');
      return rd === undefined || rs === undefined || off === undefined
        ? undefined
        : pack(def.opcode, rd, rs, off);
    }

    case 'branch': {
      if (!count(3, `${def.mnemonic} ra, rb, метка`)) return undefined;
      const [ra, rb] = [reg(ops[0]), reg(ops[1])];
      const off = target(ops[2], 6);
      return ra === undefined || rb === undefined || off === undefined
        ? undefined
        : pack(def.opcode, ra, rb, off);
    }

    case 'jump': {
      if (!count(1, 'jmp метка')) return undefined;
      const off = target(ops[0], 12);
      return off === undefined ? undefined : (def.opcode << 12) | (off & 0xfff);
    }
  }
}
