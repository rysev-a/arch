import {
  ECALL,
  EBREAK,
  RvOp,
  encB,
  encI,
  encJ,
  encR,
  encS,
  encSH,
  encU,
  opByMnemonic,
  regNum,
} from './rv-isa';

/** Карта памяти учебного «мягкого процессора» */
export const RAM_SIZE = 0x4000; // 16 КиБ
export const TEXT_BASE = 0x0000;
export const DATA_BASE = 0x1000;
/** Под стек оставляем последнюю килобайтную область памяти */
export const STACK_RESERVE = 0x400;
export const STACK_TOP = RAM_SIZE;

export interface AsmLine {
  /** номер строки исходника, с 1 */
  line: number;
  addr: number;
  word: number;
  /** исходный текст команды */
  text: string;
  /** эта команда — часть развёрнутой псевдокоманды */
  pseudo: boolean;
}

export interface AsmError {
  line: number;
  message: string;
}

export interface AsmResult {
  /** образ оперативной памяти: команды с адреса 0, данные с DATA_BASE */
  image: Uint8Array;
  /** сколько байт занимают команды / данные */
  textSize: number;
  dataSize: number;
  lines: AsmLine[];
  symbols: Record<string, number>;
  /** с какого адреса начинается выполнение: метка _start, а если её нет — 0 */
  entry: number;
  errors: AsmError[];
}

type Section = 'text' | 'data';

interface Item {
  line: number;
  section: Section;
  /** смещение в своей секции */
  offset: number;
  kind: 'insn' | 'data';
  text: string;
  mnemonic: string;
  operands: string[];
  /** для данных — готовые байты, для команд — число слов */
  bytes?: number[];
  words?: number;
  /** для .word / .half / .byte — выражения, которые считаем во втором проходе */
  exprs?: { expr: string; size: number }[];
}

/** Имена меток и констант: латиница, кириллица, цифры, _ . $ */
const IDENT = /^[A-Za-zА-Яа-яЁё_.$][\wА-Яа-яЁё.$]*$/;

function stripComment(s: string): string {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' || c === ';') return s.slice(0, i);
    else if (c === '/' && s[i + 1] === '/') return s.slice(0, i);
  }
  return s;
}

function splitOperands(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === '\\') cur += s[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '(') {
      depth++;
      cur += c;
    } else if (c === ')') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '' || out.length > 0) out.push(cur.trim());
  return out;
}

const ESC: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, '"': 34, "'": 39 };

function parseString(token: string): number[] | undefined {
  const m = /^"((?:\\.|[^"\\])*)"$/.exec(token.trim());
  if (!m) return undefined;
  const out: number[] = [];
  for (let i = 0; i < m[1].length; i++) {
    let ch = m[1][i];
    if (ch === '\\') {
      ch = m[1][++i];
      out.push(ESC[ch] ?? ch.charCodeAt(0));
    } else out.push(...new TextEncoder().encode(ch));
  }
  return out;
}

const sext = (v: number, bits: number): number => {
  const m = 1 << (bits - 1);
  return ((v & ((1 << bits) - 1)) ^ m) - m;
};

/** Ассемблер RV32IM: текст → образ памяти. Все ошибки собираются, а не только первая. */
export function assemble(source: string): AsmResult {
  const errors: AsmError[] = [];
  const fail = (line: number, message: string) => errors.push({ line, message });
  const equ = new Map<string, number>();
  /** метка → секция и смещение (адрес станет известен после первого прохода) */
  const labels = new Map<string, { section: Section; offset: number }>();
  const items: Item[] = [];
  const size: Record<Section, number> = { text: 0, data: 0 };
  let section: Section = 'text';

  /* ---------- выражения ---------- */

  /** значение выражения; symbols — доступны ли метки (после первого прохода) */
  const evalExpr = (
    expr: string,
    line: number,
    addrOf?: (name: string) => number | undefined,
  ): number | undefined => {
    const e = expr.trim();
    if (e === '') {
      fail(line, 'Пустое выражение');
      return undefined;
    }
    // %hi(...) и %lo(...)
    const fn = /^%(hi|lo)\((.*)\)$/.exec(e);
    if (fn) {
      const inner = evalExpr(fn[2], line, addrOf);
      if (inner === undefined) return undefined;
      return fn[1] === 'hi' ? ((inner + 0x800) >> 12) & 0xfffff : sext(inner, 12);
    }
    // сумма и разность термов
    const parts = e.match(/(?:^|[+-])\s*(?:'(?:\\.|[^\\'])'|[^+\-\s]+)/g);
    if (!parts || parts.join('').replace(/\s/g, '') !== e.replace(/\s/g, '')) {
      fail(line, `Не понимаю выражение «${e}»`);
      return undefined;
    }
    let total = 0;
    for (const raw of parts) {
      const sign = raw.trim().startsWith('-') ? -1 : 1;
      const t = raw.trim().replace(/^[+-]\s*/, '');
      let v: number | undefined;
      const ch = /^'(\\.|[^\\'])'$/.exec(t);
      if (ch) v = ch[1].length === 2 ? (ESC[ch[1][1]] ?? ch[1].charCodeAt(1)) : ch[1].charCodeAt(0);
      else if (/^0x[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(2), 16);
      else if (/^0b[01]+$/i.test(t)) v = parseInt(t.slice(2), 2);
      else if (/^\d+$/.test(t)) v = parseInt(t, 10);
      else if (equ.has(t)) v = equ.get(t);
      else if (IDENT.test(t)) {
        v = addrOf?.(t);
        if (v === undefined) {
          fail(
            line,
            addrOf ? `Нет метки «${t}»` : `Метки здесь нельзя использовать (нужно число): «${t}»`,
          );
          return undefined;
        }
      } else {
        fail(line, `Не понимаю «${t}»`);
        return undefined;
      }
      if (v === undefined) return undefined;
      total += sign * v;
    }
    return total;
  };

  /* ---------- проход 1: метки, размеры ---------- */

  const emitData = (line: number, bytes: number[]): void => {
    items.push({
      line,
      section,
      offset: size[section],
      kind: 'data',
      text: '',
      mnemonic: '',
      operands: [],
      bytes,
    });
    size[section] += bytes.length;
  };

  /** Сколько слов займёт команда или псевдокоманда */
  const insnWords = (mn: string, ops: string[], line: number): number => {
    switch (mn) {
      case 'la':
      case 'call':
      case 'tail':
        return 2;
      case 'li': {
        if (ops.length !== 2) return 1; // ошибку отловит второй проход
        const raw = evalExpr(ops[1], line);
        if (raw === undefined) return 1;
        const v = raw | 0; // 0xFFFFFFFF и −1 — одно и то же 32-битное слово
        if (v >= -2048 && v <= 2047) return 1;
        return (v & 0xfff) === 0 ? 1 : 2;
      }
      default:
        return 1;
    }
  };

  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let text = stripComment(raw).trim();
    if (text === '') return;

    // метки в начале строки (их может быть несколько)
    for (;;) {
      const m = /^([A-Za-zА-Яа-яЁё_.$][\wА-Яа-яЁё.$]*)\s*:\s*(.*)$/.exec(text);
      if (!m) break;
      if (labels.has(m[1])) fail(line, `Метка «${m[1]}» уже объявлена`);
      else labels.set(m[1], { section, offset: size[section] });
      text = m[2].trim();
    }
    if (text === '') return;

    const head = /^(\S+)\s*(.*)$/.exec(text)!;
    const mn = head[1].toLowerCase();
    const ops = splitOperands(head[2]);

    if (mn.startsWith('.')) {
      switch (mn) {
        case '.text':
          section = 'text';
          return;
        case '.data':
        case '.rodata':
        case '.bss':
          section = 'data';
          return;
        case '.section': {
          const name = (ops[0] ?? '').trim();
          section = name.startsWith('.text') ? 'text' : 'data';
          return;
        }
        case '.globl':
        case '.global':
        case '.type':
        case '.size':
        case '.option':
        case '.attribute':
        case '.file':
          return;
        case '.equ':
        case '.set': {
          const v = ops.length === 2 ? evalExpr(ops[1], line) : undefined;
          if (ops.length !== 2 || !IDENT.test(ops[0])) fail(line, 'Нужно так: .equ ИМЯ, число');
          else if (v !== undefined) equ.set(ops[0], v);
          return;
        }
        case '.word':
        case '.half':
        case '.short':
        case '.byte': {
          const sz = mn === '.word' ? 4 : mn === '.byte' ? 1 : 2;
          const exprs = ops.map((e) => ({ expr: e, size: sz }));
          items.push({
            line,
            section,
            offset: size[section],
            kind: 'data',
            text: '',
            mnemonic: mn,
            operands: ops,
            exprs,
          });
          size[section] += sz * ops.length;
          return;
        }
        case '.ascii':
        case '.asciz':
        case '.string': {
          const bytes: number[] = [];
          for (const o of ops) {
            const s = parseString(o);
            if (!s) {
              fail(line, `Ожидалась строка в кавычках, а здесь «${o}»`);
              continue;
            }
            bytes.push(...s);
            if (mn !== '.ascii') bytes.push(0);
          }
          emitData(line, bytes);
          return;
        }
        case '.space':
        case '.zero':
        case '.skip': {
          const n = ops.length >= 1 ? evalExpr(ops[0], line) : undefined;
          if (n === undefined || n < 0) fail(line, 'Нужно так: .space число_байт');
          else emitData(line, new Array<number>(n).fill(0));
          return;
        }
        case '.align':
        case '.balign': {
          const n = ops.length >= 1 ? evalExpr(ops[0], line) : undefined;
          if (n === undefined || n < 0) {
            fail(line, `Нужно так: ${mn} число`);
            return;
          }
          const a = mn === '.align' ? 1 << n : n;
          const pad = (a - (size[section] % a)) % a;
          if (pad > 0) emitData(line, new Array<number>(pad).fill(0));
          return;
        }
        default:
          fail(line, `Неизвестная директива «${mn}»`);
          return;
      }
    }

    if (section !== 'text') {
      fail(line, 'Команды можно писать только в секции .text (сейчас включена .data)');
      return;
    }
    const words = insnWords(mn, ops, line);
    items.push({
      line,
      section,
      offset: size.text,
      kind: 'insn',
      text,
      mnemonic: mn,
      operands: ops,
      words,
    });
    size.text += 4 * words;
  });

  if (size.text > DATA_BASE) {
    fail(
      1,
      `Программа слишком длинная: команды (${size.text} байт) не помещаются до адреса данных 0x${DATA_BASE.toString(16)}`,
    );
  }
  if (DATA_BASE + size.data > RAM_SIZE - STACK_RESERVE) {
    fail(
      1,
      `Слишком много данных: ${size.data} байт; нужно оставить ${STACK_RESERVE} байт под стек`,
    );
  }

  /* ---------- адреса меток ---------- */

  const symbols: Record<string, number> = {};
  for (const [name, l] of labels)
    symbols[name] = (l.section === 'text' ? TEXT_BASE : DATA_BASE) + l.offset;
  const addrOf = (name: string) => symbols[name];

  /* ---------- проход 2: кодирование ---------- */

  const image = new Uint8Array(RAM_SIZE);
  const lines: AsmLine[] = [];
  const put32 = (addr: number, w: number) => {
    for (let k = 0; k < 4; k++) if (addr + k < RAM_SIZE) image[addr + k] = (w >>> (8 * k)) & 0xff;
  };

  for (const it of items) {
    const base = (it.section === 'text' ? TEXT_BASE : DATA_BASE) + it.offset;
    if (it.kind === 'data') {
      if (it.bytes) it.bytes.forEach((b, k) => base + k < RAM_SIZE && (image[base + k] = b));
      else if (it.exprs) {
        let a = base;
        for (const { expr, size: sz } of it.exprs) {
          const v = evalExpr(expr, it.line, addrOf);
          if (v !== undefined) {
            for (let k = 0; k < sz; k++)
              if (a + k < RAM_SIZE) image[a + k] = (v >>> (8 * k)) & 0xff;
          }
          a += sz;
        }
      }
      continue;
    }

    const words = encodeInsn(it, base, addrOf, evalExpr, fail);
    if (!words) continue;
    words.forEach((w, k) => {
      put32(base + 4 * k, w);
      lines.push({
        line: it.line,
        addr: base + 4 * k,
        word: w,
        text: it.text,
        pseudo: words.length > 1 || isPseudo(it.mnemonic),
      });
    });
  }

  const entry = symbols['_start'] ?? TEXT_BASE;
  return { image, textSize: size.text, dataSize: size.data, lines, symbols, entry, errors };
}

const PSEUDO_NAMES = new Set([
  'nop',
  'li',
  'la',
  'mv',
  'not',
  'neg',
  'seqz',
  'snez',
  'j',
  'jr',
  'ret',
  'call',
  'tail',
  'beqz',
  'bnez',
  'blez',
  'bgez',
  'bltz',
  'bgtz',
  'bgt',
  'ble',
  'bgtu',
  'bleu',
]);
const isPseudo = (mn: string): boolean => PSEUDO_NAMES.has(mn);

type EvalFn = (
  e: string,
  line: number,
  addrOf?: (n: string) => number | undefined,
) => number | undefined;

function encodeInsn(
  it: Item,
  pc: number,
  addrOf: (n: string) => number | undefined,
  evalExpr: EvalFn,
  fail: (line: number, msg: string) => void,
): number[] | undefined {
  const { line } = it;
  let mn = it.mnemonic;
  let ops = [...it.operands];
  const need = (n: number, usage: string): boolean => {
    if (ops.length === n) return true;
    fail(
      line,
      `«${mn}» принимает ${n} ${n === 1 ? 'операнд' : n < 5 ? 'операнда' : 'операндов'}: ${usage}`,
    );
    return false;
  };
  const reg = (t: string | undefined): number | undefined => {
    const r = t === undefined ? undefined : regNum(t);
    if (r === undefined)
      fail(line, `Ожидался регистр (x0…x31 или zero, ra, sp, a0…), а здесь «${t ?? ''}»`);
    return r;
  };
  const num = (t: string, min: number, max: number, what: string): number | undefined => {
    const v = evalExpr(t, line, addrOf);
    if (v === undefined) return undefined;
    if (v < min || v > max) {
      fail(line, `${what}: ${v} не помещается — допустимо от ${min} до ${max}`);
      return undefined;
    }
    return v;
  };
  /** смещение до метки (или явное число) */
  const target = (t: string, bits: number): number | undefined => {
    const labelled = IDENT_RE.test(t.trim()) && addrOf(t.trim()) !== undefined;
    let off: number | undefined;
    if (labelled) off = addrOf(t.trim())! - pc;
    else off = evalExpr(t, line, addrOf);
    if (off === undefined) return undefined;
    const lim = 1 << (bits - 1);
    if (off % 2 !== 0) {
      fail(line, `Смещение ${off} должно быть чётным`);
      return undefined;
    }
    if (off < -lim || off >= lim) {
      fail(line, `Метка «${t}» слишком далеко: ${off} байт (можно от ${-lim} до ${lim - 2})`);
      return undefined;
    }
    return off;
  };
  const op = (m: string): RvOp => opByMnemonic(m)!;

  /* ---------- псевдокоманды ---------- */
  switch (mn) {
    case 'nop':
      if (!need(0, 'nop')) return undefined;
      return [encI(op('addi'), 0, 0, 0)];
    case 'ret':
      if (!need(0, 'ret')) return undefined;
      return [encI(op('jalr'), 0, 1, 0)];
    case 'mv': {
      if (!need(2, 'mv rd, rs')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      return rd === undefined || rs === undefined ? undefined : [encI(op('addi'), rd, rs, 0)];
    }
    case 'not': {
      if (!need(2, 'not rd, rs')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      return rd === undefined || rs === undefined ? undefined : [encI(op('xori'), rd, rs, -1)];
    }
    case 'neg': {
      if (!need(2, 'neg rd, rs')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      return rd === undefined || rs === undefined ? undefined : [encR(op('sub'), rd, 0, rs)];
    }
    case 'seqz': {
      if (!need(2, 'seqz rd, rs')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      return rd === undefined || rs === undefined ? undefined : [encI(op('sltiu'), rd, rs, 1)];
    }
    case 'snez': {
      if (!need(2, 'snez rd, rs')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      return rd === undefined || rs === undefined ? undefined : [encR(op('sltu'), rd, 0, rs)];
    }
    case 'li': {
      if (!need(2, 'li rd, число')) return undefined;
      const rd = reg(ops[0]);
      const raw = evalExpr(ops[1], line);
      if (rd === undefined || raw === undefined) return undefined;
      if (raw < -0x80000000 || raw > 0xffffffff) {
        fail(line, `Число ${raw} не помещается в 32 бита`);
        return undefined;
      }
      const v = raw | 0; // 0xFFFFFFFF и −1 — одно и то же 32-битное слово
      if (v >= -2048 && v <= 2047) return [encI(op('addi'), rd, 0, v)];
      const lo = sext(v, 12);
      const hi = ((v - lo) >>> 12) & 0xfffff;
      const words = [encU(op('lui'), rd, hi)];
      if (lo !== 0) words.push(encI(op('addi'), rd, rd, lo));
      return words;
    }
    case 'la':
    case 'call':
    case 'tail': {
      const isLa = mn === 'la';
      if (!need(isLa ? 2 : 1, isLa ? 'la rd, метка' : `${mn} метка`)) return undefined;
      const rd = isLa ? reg(ops[0]) : mn === 'call' ? 1 : 6;
      const sym = isLa ? ops[1] : ops[0];
      const dest = evalExpr(sym, line, addrOf);
      if (rd === undefined || dest === undefined) return undefined;
      const off = dest - pc;
      const lo = sext(off, 12);
      const hi = ((off - lo) >> 12) & 0xfffff;
      const second = isLa
        ? encI(op('addi'), rd, rd, lo)
        : encI(op('jalr'), mn === 'call' ? 1 : 0, rd, lo);
      return [encU(op('auipc'), rd, hi), second];
    }
    case 'j':
    case 'jal': {
      if (mn === 'j' || ops.length === 1) {
        if (!need(1, `${mn} метка`)) return undefined;
        const off = target(ops[0], 21);
        return off === undefined ? undefined : [encJ(op('jal'), mn === 'j' ? 0 : 1, off)];
      }
      break;
    }
    case 'jr': {
      if (!need(1, 'jr rs')) return undefined;
      const rs = reg(ops[0]);
      return rs === undefined ? undefined : [encI(op('jalr'), 0, rs, 0)];
    }
    case 'beqz':
    case 'bnez':
    case 'blez':
    case 'bgez':
    case 'bltz':
    case 'bgtz': {
      if (!need(2, `${mn} rs, метка`)) return undefined;
      const rs = reg(ops[0]);
      const off = target(ops[1], 13);
      if (rs === undefined || off === undefined) return undefined;
      const spec: Record<string, [string, boolean]> = {
        beqz: ['beq', false],
        bnez: ['bne', false],
        blez: ['bge', true], // bge zero, rs
        bgez: ['bge', false],
        bltz: ['blt', false],
        bgtz: ['blt', true], // blt zero, rs
      };
      const [m, swap] = spec[mn];
      return [encB(op(m), swap ? 0 : rs, swap ? rs : 0, off)];
    }
    case 'bgt':
    case 'ble':
    case 'bgtu':
    case 'bleu': {
      if (!need(3, `${mn} rs1, rs2, метка`)) return undefined;
      const [a, b] = [reg(ops[0]), reg(ops[1])];
      const off = target(ops[2], 13);
      if (a === undefined || b === undefined || off === undefined) return undefined;
      const m = { bgt: 'blt', ble: 'bge', bgtu: 'bltu', bleu: 'bgeu' }[mn]!;
      return [encB(op(m), b, a, off)];
    }
  }

  /* ---------- настоящие команды ---------- */
  const def = opByMnemonic(mn);
  if (!def) {
    fail(line, `Неизвестная команда «${it.mnemonic}»`);
    return undefined;
  }

  switch (def.fmt) {
    case 'SYS':
      if (!need(0, def.mnemonic)) return undefined;
      return [mn === 'ecall' ? ECALL : EBREAK];

    case 'R': {
      if (!need(3, `${mn} rd, rs1, rs2`)) return undefined;
      const [rd, a, b] = [reg(ops[0]), reg(ops[1]), reg(ops[2])];
      return rd === undefined || a === undefined || b === undefined
        ? undefined
        : [encR(def, rd, a, b)];
    }

    case 'I': {
      if (!need(3, `${mn} rd, rs1, число`)) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      const v = num(ops[2], -2048, 2047, 'Число');
      return rd === undefined || rs === undefined || v === undefined
        ? undefined
        : [encI(def, rd, rs, v)];
    }

    case 'SH': {
      if (!need(3, `${mn} rd, rs1, число 0…31`)) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      const v = num(ops[2], 0, 31, 'Величина сдвига');
      return rd === undefined || rs === undefined || v === undefined
        ? undefined
        : [encSH(def, rd, rs, v)];
    }

    case 'L':
    case 'S': {
      if (!need(2, `${mn} регистр, смещение(регистр)`)) return undefined;
      const r = reg(ops[0]);
      const m = /^(.*)\(\s*([^)]+?)\s*\)$/.exec(ops[1]);
      if (!m) {
        fail(line, `Адрес пишется как смещение(регистр), например 4(sp), а здесь «${ops[1]}»`);
        return undefined;
      }
      const base = reg(m[2]);
      const off = m[1].trim() === '' ? 0 : num(m[1], -2048, 2047, 'Смещение');
      if (r === undefined || base === undefined || off === undefined) return undefined;
      return [def.fmt === 'L' ? encI(def, r, base, off) : encS(def, r, base, off)];
    }

    case 'B': {
      if (!need(3, `${mn} rs1, rs2, метка`)) return undefined;
      const [a, b] = [reg(ops[0]), reg(ops[1])];
      const off = target(ops[2], 13);
      return a === undefined || b === undefined || off === undefined
        ? undefined
        : [encB(def, a, b, off)];
    }

    case 'U': {
      if (!need(2, `${mn} rd, число`)) return undefined;
      const rd = reg(ops[0]);
      const v = num(ops[1], -0x80000, 0xfffff, 'Число');
      return rd === undefined || v === undefined ? undefined : [encU(def, rd, v)];
    }

    case 'J': {
      if (!need(2, 'jal rd, метка')) return undefined;
      const rd = reg(ops[0]);
      const off = target(ops[1], 21);
      return rd === undefined || off === undefined ? undefined : [encJ(def, rd, off)];
    }

    case 'JR': {
      // jalr rd, смещение(rs)  |  jalr rd, rs, смещение  |  jalr rs
      if (ops.length === 1) {
        const rs = reg(ops[0]);
        return rs === undefined ? undefined : [encI(def, 1, rs, 0)];
      }
      if (ops.length === 2) {
        const m = /^(.*)\(\s*([^)]+?)\s*\)$/.exec(ops[1]);
        if (!m) {
          fail(line, `Нужно так: jalr rd, смещение(rs), а здесь «${ops[1]}»`);
          return undefined;
        }
        const [rd, rs] = [reg(ops[0]), reg(m[2])];
        const off = m[1].trim() === '' ? 0 : num(m[1], -2048, 2047, 'Смещение');
        return rd === undefined || rs === undefined || off === undefined
          ? undefined
          : [encI(def, rd, rs, off)];
      }
      if (!need(3, 'jalr rd, rs, смещение')) return undefined;
      const [rd, rs] = [reg(ops[0]), reg(ops[1])];
      const off = num(ops[2], -2048, 2047, 'Смещение');
      return rd === undefined || rs === undefined || off === undefined
        ? undefined
        : [encI(def, rd, rs, off)];
    }
  }
  return undefined;
}

const IDENT_RE = /^[A-Za-zА-Яа-яЁё_.$][\wА-Яа-яЁё.$]*$/;
