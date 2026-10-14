import { GATE_W, GateType, PinKind } from './circuit.model';

/** Как рисуется вентиль: контур, дополнительные дуги, пузырёк инверсии, положение входных пинов. */

const GATE_BODY: Record<GateType, string> = {
  AND: 'M0 0 H40 A24 24 0 0 1 40 48 H0 Z',
  OR: 'M0 0 Q34 2 64 24 Q34 46 0 48 Q18 24 0 0 Z',
  NOR: 'M0 0 Q34 2 64 24 Q34 46 0 48 Q18 24 0 0 Z',
  NOT: 'M0 0 L48 24 L0 48 Z',
  NAND: 'M0 0 H40 A24 24 0 0 1 40 48 H0 Z',
  XOR: 'M0 0 Q34 2 64 24 Q34 46 0 48 Q18 24 0 0 Z',
  XNOR: 'M0 0 Q34 2 64 24 Q34 46 0 48 Q18 24 0 0 Z',
  DFF: 'M0 0 H64 V48 H0 Z',
};

/** Вторая дуга на входе XOR/XNOR — «двойная линия» отличает их от OR */
const XOR_EXTRA_ARC = 'M-8 0 Q10 24 -8 48';

/** Треугольник у тактового входа триггера — стандартное обозначение «срабатывает по фронту» */
const DFF_CLOCK_MARK = 'M0 27 L9 34 L0 41';

export const RU_NAMES: Record<GateType, string> = {
  AND: 'И',
  OR: 'ИЛИ',
  NOR: 'ИЛИ-НЕ',
  NOT: 'НЕ',
  NAND: 'И-НЕ',
  XOR: 'искл. ИЛИ',
  XNOR: 'искл. ИЛИ-НЕ',
  DFF: 'D-триггер по фронту',
};

const TWO_IN_PINS = ['in0', 'in1'] as const;
const NOT_IN_PINS = ['in0'] as const;

export function gateBodyPath(type: GateType): string {
  return GATE_BODY[type];
}

/** путь второй входной дуги XOR/XNOR или метки такта триггера, если они есть */
export function gateExtraArc(type: GateType): string | null {
  if (type === 'DFF') return DFF_CLOCK_MARK;
  return type === 'XOR' || type === 'XNOR' ? XOR_EXTRA_ARC : null;
}

/** cx пузырька инверсии, если он есть у этого типа гейта */
export function gateBubbleCx(type: GateType): number | null {
  switch (type) {
    case 'NOR':
    case 'NAND':
    case 'XNOR':
      return GATE_W + 6;
    case 'NOT':
      return 53;
    default:
      return null;
  }
}

export function gatePinsOf(type: GateType): readonly PinKind[] {
  return type === 'NOT' ? NOT_IN_PINS : TWO_IN_PINS;
}

export function gatePinY(type: GateType, pin: PinKind): number {
  if (type === 'NOT') return 24;
  return pin === 'in0' ? 14 : 34;
}
