import { AUTO_WIRE_RADIUS_DEFAULT } from '../../settings/settings.service';
import { GateInstance, PinRef, Point, Wire, createsCycle, pinPos, samePin } from './circuit.model';
import { gatePinsOf } from './gate-shapes';

/** На каком расстоянии (в единицах доски) контакты считаются «близкими» */
export const AUTO_WIRE_RADIUS = AUTO_WIRE_RADIUS_DEFAULT;
/** Насколько уже показанная связь «липнет»: более близкая пара должна выиграть хотя бы на столько */
export const AUTO_WIRE_STICK = 6;

export interface AutoWire {
  from: PinRef;
  to: PinRef;
  /** концы провода на доске — для пунктирного предпросмотра */
  a: Point;
  b: Point;
}

export interface AutoWireInput {
  /** элемент, который двигают или ставят (его ещё может не быть в `gates`) */
  gate: GateInstance;
  /** остальные элементы доски */
  gates: readonly GateInstance[];
  wires: readonly Wire[];
  inputYMap: Record<string, number>;
  outputYMap: Record<string, number>;
  /** в пошаговом режиме циклы разрешены — это суть защёлок */
  stepsMode: boolean;
  radius?: number;
  /** связи, предложенные раньше в этом же перетаскивании: держатся, пока их не перехватит более близкая пара контактов */
  keep?: readonly AutoWire[];
}

const dist = (p: Point, q: Point): number => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Какие провода стоит подставить для элемента на его месте: каждый свободный вход тянется
 * к ближайшему выходу (тумблер или другой элемент), а каждый выход — к ближайшему
 * свободному входу (элемента или выхода схемы). Занятые входы не трогаем.
 */
export function suggestWires(input: AutoWireInput): AutoWire[] {
  const { gate, wires, inputYMap, outputYMap, stepsMode } = input;
  const radius = input.radius ?? AUTO_WIRE_RADIUS;
  const keep = input.keep ?? [];
  const kept = (from: PinRef, to: PinRef): boolean =>
    keep.some((k) => samePin(k.from, from) && samePin(k.to, to));
  const others = input.gates.filter((g) => g.id !== gate.id);
  const all = [...others, gate];
  const result: AutoWire[] = [];
  // провода, которые мы уже решили добавить, тоже учитываются при поиске циклов
  const planned: Wire[] = [];

  const posOf = (ref: PinRef): Point => pinPos(ref, all, outputYMap, inputYMap);
  const driven = (to: PinRef): boolean =>
    wires.some((w) => samePin(w.to, to)) || planned.some((w) => samePin(w.to, to));

  const accept = (from: PinRef, to: PinRef): boolean => {
    if (from.node === to.node) return false;
    if (!stepsMode) {
      const circuit = { gates: all, wires: [...wires, ...planned] };
      if (createsCycle(circuit, from, to)) return false;
    }
    planned.push({ id: `auto${planned.length}`, from, to });
    result.push({ from, to, a: posOf(from), b: posOf(to) });
    return true;
  };

  // все возможные связи элемента: свободные входы ← источники, выход → свободные входы
  interface Candidate {
    from: PinRef;
    to: PinRef;
    /** с каким элементом связь и в какую сторону — на пару «элемент + сторона» достаточно одного провода */
    group: string;
    d: number;
    held: boolean;
  }
  const cands: Candidate[] = [];
  const consider = (from: PinRef, to: PinRef, other: string, dir: 'in' | 'out'): void => {
    const held = kept(from, to);
    const d = dist(posOf(from), posOf(to));
    if (held || d <= radius) cands.push({ from, to, group: `${dir}:${other}`, d, held });
  };

  // источники сигнала: тумблеры входов и выходы других элементов
  const sources: PinRef[] = [
    ...Object.keys(inputYMap).map((node) => ({ node, pin: 'out' as const })),
    ...others.map((g) => ({ node: g.id, pin: 'out' as const })),
  ];
  for (const pin of gatePinsOf(gate.type)) {
    const to: PinRef = { node: gate.id, pin };
    if (driven(to)) continue;
    for (const from of sources) consider(from, to, from.node, 'in');
  }

  // приёмники сигнала: свободные входы других элементов и выходы схемы
  const sinks: PinRef[] = [
    ...others.flatMap((g) => gatePinsOf(g.type).map((pin) => ({ node: g.id, pin }))),
    ...Object.keys(outputYMap).map((node) => ({ node, pin: 'in0' as const })),
  ];
  const out: PinRef = { node: gate.id, pin: 'out' };
  for (const to of sinks) if (!driven(to)) consider(out, to, to.node, 'out');

  // как магнит: берём самые короткие связи, а у уже показанной есть небольшой «залипающий» запас,
  // чтобы пунктир не дрожал. Лок не вечен — более близкая пара контактов перехватывает контакт.
  // Если два контакта тянутся к одному и тому же элементу, пунктир остаётся у ближнего,
  // а второй контакт ищет себе другого соседа
  const pull = (c: Candidate): number => c.d - (c.held ? AUTO_WIRE_STICK : 0);
  cands.sort((p, q) => pull(p) - pull(q));
  const usedGroups = new Set<string>();
  const usedPins = new Set<string>();
  for (const c of cands) {
    // у выхода — одна связь, у каждого входа — тоже одна
    const pinKey = c.from.node === gate.id ? 'out' : c.to.pin;
    if (usedPins.has(pinKey) || usedGroups.has(c.group)) continue;
    if (!accept(c.from, c.to)) continue;
    usedPins.add(pinKey);
    usedGroups.add(c.group);
  }

  return result;
}
