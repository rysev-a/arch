import { NodeValue } from './circuit.model';

/**
 * Типы интерфейсов блоков. Порт блока — не один бит, а именованный набор бит с полями:
 * так выходы одного блока подключаются ко входам другого одним проводом.
 * Типы совместимы только по ИМЕНИ: `Addr2` и `Word2` оба из двух бит, но это разные вещи —
 * между ними нужен явный переходник.
 */

export interface InterfaceField {
  name: string;
  type: string;
}

export interface InterfaceType {
  name: string;
  /** Короткое пояснение для подсказок на доске */
  title: string;
  /** Поля по порядку: старшее — первое. У простых типов (`Bit`, `Clk`) полей нет — это один бит */
  fields: readonly InterfaceField[];
}

const bits = (...names: string[]): InterfaceField[] => names.map((name) => ({ name, type: 'Bit' }));

export const INTERFACES: Readonly<Record<string, InterfaceType>> = {
  Bit: { name: 'Bit', title: 'один бит', fields: [] },
  Clk: { name: 'Clk', title: 'такт', fields: [] },
  Word2: { name: 'Word2', title: 'двухбитное слово', fields: bits('D1', 'D0') },
  Addr2: { name: 'Addr2', title: 'двухбитный адрес', fields: bits('A1', 'A0') },
  Op2: { name: 'Op2', title: 'код операции', fields: bits('Op1', 'Op0') },
  Instr: {
    name: 'Instr',
    title: 'команда: код операции и операнд',
    fields: [
      { name: 'op', type: 'Op2' },
      { name: 'k', type: 'Word2' },
    ],
  },
  Flags: { name: 'Flags', title: 'флаги результата', fields: bits('Z', 'N', 'Pe') },
  Ctl: {
    name: 'Ctl',
    title: 'управляющие сигналы',
    fields: bits('AccLoad', 'UseAdd', 'Take', 'PcLoad', 'Stop'),
  },
  Phases: { name: 'Phases', title: 'фазы такта', fields: bits('Fe', 'De', 'Ex', 'Wb') },

  // ---- процессор «Мини-8» ----
  Byte: {
    name: 'Byte',
    title: 'байт (8 бит)',
    fields: bits('B7', 'B6', 'B5', 'B4', 'B3', 'B2', 'B1', 'B0'),
  },
  Reg3: { name: 'Reg3', title: 'номер регистра (3 бита)', fields: bits('R2', 'R1', 'R0') },
  Op4: { name: 'Op4', title: 'код операции (4 бита)', fields: bits('O3', 'O2', 'O1', 'O0') },
  Imm6: {
    name: 'Imm6',
    title: 'число из команды (6 бит)',
    fields: bits('I5', 'I4', 'I3', 'I2', 'I1', 'I0'),
  },
  Instr16: {
    name: 'Instr16',
    title: 'команда (16 бит)',
    fields: [
      { name: 'op', type: 'Op4' },
      { name: 'a', type: 'Reg3' },
      { name: 'b', type: 'Reg3' },
      { name: 'c', type: 'Imm6' },
    ],
  },
  Oh8: {
    name: 'Oh8',
    title: 'один из восьми',
    fields: bits('H7', 'H6', 'H5', 'H4', 'H3', 'H2', 'H1', 'H0'),
  },
  Ctrl: {
    name: 'Ctrl',
    title: 'сигналы управления процессора',
    fields: bits(
      'regWrite',
      'selAdd',
      'selAnd',
      'selOr',
      'selXor',
      'selB',
      'sub',
      'useImm6',
      'useImm8',
      'load',
      'store',
      'isBeq',
      'isBne',
      'isBltu',
      'isBgeu',
      'isJmp',
      'isHlt',
      'isR',
    ),
  },
};

export function interfaceOf(type: string): InterfaceType {
  const t = INTERFACES[type];
  if (!t) throw new Error(`Неизвестный тип интерфейса «${type}»`);
  return t;
}

export function isSimple(type: string): boolean {
  return interfaceOf(type).fields.length === 0;
}

/** Сколько бит в типе */
export function typeWidth(type: string): number {
  const t = interfaceOf(type);
  return t.fields.length === 0 ? 1 : t.fields.reduce((sum, f) => sum + typeWidth(f.type), 0);
}

/** Пути всех бит типа по порядку: у `Instr` — op.Op1, op.Op0, k.D1, k.D0; у простого типа — [''] */
export function leafPaths(type: string, prefix = ''): string[] {
  const t = interfaceOf(type);
  if (t.fields.length === 0) return [prefix];
  return t.fields.flatMap((f) => leafPaths(f.type, prefix ? `${prefix}.${f.name}` : f.name));
}

/** Часть типа: какой тип, с какого бита и сколько бит */
export interface TypeSlice {
  type: string;
  offset: number;
  length: number;
}

/** Ищет поле по пути (`''` — весь тип, `'op'`, `'k.D1'`); `undefined`, если такого поля нет */
export function sliceOf(type: string, path: string): TypeSlice | undefined {
  let cur = type;
  let offset = 0;
  for (const segment of path === '' ? [] : path.split('.')) {
    let found = false;
    for (const f of interfaceOf(cur).fields) {
      if (f.name === segment) {
        cur = f.type;
        found = true;
        break;
      }
      offset += typeWidth(f.type);
    }
    if (!found) return undefined;
  }
  return { type: cur, offset, length: typeWidth(cur) };
}

/** Непосредственные поля типа по пути — для раскрытия порта на доске */
export function childFields(
  type: string,
  path: string,
): readonly { name: string; path: string; type: string }[] {
  const slice = sliceOf(type, path);
  if (!slice) return [];
  return interfaceOf(slice.type).fields.map((f) => ({
    name: f.name,
    path: path ? `${path}.${f.name}` : f.name,
    type: f.type,
  }));
}

/** Типы совместимы только при совпадении имён */
export function canConnect(from: string, to: string): boolean {
  return from === to;
}

/** Значение шины текстом: «10», «1?» (старший бит слева) */
export function busText(values: readonly NodeValue[]): string {
  return values.map((v) => (v === undefined ? '?' : String(v))).join('');
}
