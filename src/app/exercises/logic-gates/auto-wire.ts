import { GateInstance, PinRef, Point, Wire, createsCycle, pinPos, samePin } from './circuit.model';
import { gatePinsOf } from './gate-shapes';

/** На каком расстоянии (в единицах доски) контакты считаются «близкими» */
export const AUTO_WIRE_RADIUS = 56;
/** Уже предложенная связь «держится» дольше: пунктир не мерцает, пока элемент тянут рядом */
export const AUTO_WIRE_KEEP_RADIUS = 96;

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
  /** связи, предложенные на прошлом шаге этого же перетаскивания */
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
  const keepRadius = Math.max(radius, AUTO_WIRE_KEEP_RADIUS);
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

  // источники сигнала: тумблеры входов и выходы других элементов
  const sources: PinRef[] = [
    ...Object.keys(inputYMap).map((node) => ({ node, pin: 'out' as const })),
    ...others.map((g) => ({ node: g.id, pin: 'out' as const })),
  ];
  for (const pin of gatePinsOf(gate.type)) {
    const to: PinRef = { node: gate.id, pin };
    if (driven(to)) continue;
    const at = posOf(to);
    const near = sources
      .map((from) => ({ from, d: dist(posOf(from), at), held: kept(from, to) }))
      .filter((c) => c.d <= (c.held ? keepRadius : radius))
      .sort((p, q) => Number(q.held) - Number(p.held) || p.d - q.d);
    for (const c of near) if (accept(c.from, to)) break;
  }

  // приёмники сигнала: свободные входы других элементов и выходы схемы
  const sinks: PinRef[] = [
    ...others.flatMap((g) => gatePinsOf(g.type).map((pin) => ({ node: g.id, pin }))),
    ...Object.keys(outputYMap).map((node) => ({ node, pin: 'in0' as const })),
  ];
  const out: PinRef = { node: gate.id, pin: 'out' };
  const outAt = posOf(out);
  const near = sinks
    .filter((to) => !driven(to))
    .map((to) => ({ to, d: dist(posOf(to), outAt), held: kept(out, to) }))
    .filter((c) => c.d <= (c.held ? keepRadius : radius))
    .sort((p, q) => Number(q.held) - Number(p.held) || p.d - q.d);
  for (const c of near) if (accept(out, c.to)) break;

  return result;
}
