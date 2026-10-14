import { BlockPort, BusEnd, TOP } from './blocks';
import { childFields, isSimple, sliceOf } from './interfaces';

/** Геометрия блоков на доске: прямоугольники, строки портов, положение пинов */

export const BLOCK_W = 176;
export const HEAD_H = 28;
export const ROW_H = 24;
export const PAD = 6;
/** Ширина боковых колонок с портами самого упражнения */
export const SIDE_W = 132;

export type PinSide = 'in' | 'out';

export interface PinRow {
  /** Уникальный ключ строки: «узел|порт|поле» — им же помечается раскрытие */
  key: string;
  end: BusEnd;
  port: BlockPort;
  name: string;
  type: string;
  /** Глубина вложенности: 0 — порт целиком, 1 — его поле и т. д. */
  depth: number;
  /** С какой стороны прямоугольника пин */
  side: PinSide;
  /** Смещение центра строки от верха прямоугольника */
  y: number;
  expandable: boolean;
  expanded: boolean;
  /** Узлы схемы, которые несёт эта строка (по порядку бит) */
  nodes: readonly string[];
}

export interface BoxLayout {
  node: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'top-in' | 'top-out' | 'block';
  rows: PinRow[];
}

export function rowKey(end: BusEnd): string {
  return `${end.node}|${end.port}|${end.path}`;
}

/** Строки порта: сам порт и, если он раскрыт, его поля (рекурсивно) */
function rowsOfPort(
  node: string,
  port: BlockPort,
  side: PinSide,
  expanded: ReadonlySet<string>,
  startY: number,
): PinRow[] {
  const rows: PinRow[] = [];
  let y = startY;

  const add = (path: string, name: string, type: string, depth: number): void => {
    const end: BusEnd = { node, port: port.name, path };
    const key = rowKey(end);
    const slice = sliceOf(port.type, path)!;
    const expandable = !isSimple(type);
    const isOpen = expandable && expanded.has(key);
    rows.push({
      key,
      end,
      port,
      name,
      type,
      depth,
      side,
      y: y + ROW_H / 2,
      expandable,
      expanded: isOpen,
      nodes: port.nodes.slice(slice.offset, slice.offset + slice.length),
    });
    y += ROW_H;
    if (isOpen) {
      for (const f of childFields(port.type, path)) add(f.path, f.name, f.type, depth + 1);
    }
  };

  add('', port.name, port.type, 0);
  return rows;
}

/** Раскладка прямоугольника с портами: слева — входы, справа — выходы */
export function layoutBox(
  node: string,
  title: string,
  ports: readonly BlockPort[],
  expanded: ReadonlySet<string>,
  at: { x: number; y: number; w: number },
  kind: BoxLayout['kind'],
): BoxLayout {
  const top = HEAD_H + PAD;
  const rows: PinRow[] = [];
  let leftY = top;
  let rightY = top;

  for (const port of ports) {
    // порты самого упражнения: вход — источник, поэтому его пин справа; выход — слева
    const side: PinSide =
      kind === 'top-in' ? 'out' : kind === 'top-out' ? 'in' : port.dir === 'in' ? 'in' : 'out';
    const startY = side === 'in' ? leftY : rightY;
    const added = rowsOfPort(node, port, side, expanded, startY);
    rows.push(...added);
    const next = startY + added.length * ROW_H;
    if (side === 'in') leftY = next;
    else rightY = next;
  }

  return {
    node,
    title,
    x: at.x,
    y: at.y,
    w: at.w,
    h: Math.max(leftY, rightY) + PAD,
    kind,
    rows,
  };
}

/** Центр пина строки в координатах доски */
export function pinCenter(box: BoxLayout, row: PinRow): { x: number; y: number } {
  return { x: row.side === 'in' ? box.x : box.x + box.w, y: box.y + row.y };
}

/** Прямоугольники колонок с портами самого упражнения */
export function sideBoxes(
  ports: readonly BlockPort[],
  expanded: ReadonlySet<string>,
  boardW: number,
  y = 16,
): { inBox: BoxLayout; outBox: BoxLayout } {
  const inPorts = ports.filter((p) => p.dir === 'in');
  const outPorts = ports.filter((p) => p.dir === 'out');
  return {
    inBox: layoutBox(TOP, 'Входы', inPorts, expanded, { x: 6, y, w: SIDE_W }, 'top-in'),
    outBox: layoutBox(
      TOP,
      'Выходы',
      outPorts,
      expanded,
      { x: boardW - SIDE_W - 6, y, w: SIDE_W },
      'top-out',
    ),
  };
}

/** Свободное место для нового блока: первая ячейка сетки, не занятая другими */
export function freeSpot(
  taken: readonly { x: number; y: number }[],
  boardW: number,
): { x: number; y: number } {
  const cols = Math.max(1, Math.floor((boardW - 2 * (SIDE_W + 30)) / (BLOCK_W + 30)));
  const x0 = SIDE_W + 30;
  for (let i = 0; i < 40; i++) {
    const x = x0 + (i % cols) * (BLOCK_W + 30);
    const y = 20 + Math.floor(i / cols) * 150;
    if (!taken.some((t) => Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 60)) return { x, y };
  }
  return { x: x0, y: 20 };
}
