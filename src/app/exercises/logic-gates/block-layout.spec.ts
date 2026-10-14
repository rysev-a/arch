import { BlockPort, TOP } from './blocks';
import {
  BLOCK_W,
  HEAD_H,
  PAD,
  ROW_H,
  freeSpot,
  layoutBox,
  pinCenter,
  rowKey,
  sideBoxes,
} from './block-layout';

const ports: BlockPort[] = [
  { name: 'addr', type: 'Addr2', dir: 'in', nodes: ['A', 'B'] },
  { name: 'z', type: 'Bit', dir: 'in', nodes: ['C'] },
  { name: 'instr', type: 'Instr', dir: 'out', nodes: ['W3', 'W2', 'W1', 'W0'] },
];

const none = new Set<string>();

describe('block-layout', () => {
  it('входы слева, выходы справа, строки идут друг под другом без наложений', () => {
    const box = layoutBox('b', 'Блок', ports, none, { x: 100, y: 50, w: BLOCK_W }, 'block');
    expect(box.rows.map((r) => `${r.name}:${r.side}`)).toEqual(['addr:in', 'z:in', 'instr:out']);
    expect(box.rows[0].y).toBe(HEAD_H + PAD + ROW_H / 2);
    expect(box.rows[1].y - box.rows[0].y).toBe(ROW_H);
    expect(box.rows[2].y).toBe(box.rows[0].y); // выходы начинаются с той же высоты
    expect(box.h).toBe(HEAD_H + 2 * PAD + 2 * ROW_H);
  });

  it('раскрытие порта добавляет строки полей и высоту, ключи уникальны', () => {
    const instr = rowKey({ node: 'b', port: 'instr', path: '' });
    const box = layoutBox(
      'b',
      'Блок',
      ports,
      new Set([instr]),
      { x: 0, y: 0, w: BLOCK_W },
      'block',
    );
    const rows = box.rows.filter((r) => r.end.port === 'instr');
    expect(rows.map((r) => `${r.depth}:${r.name}`)).toEqual(['0:instr', '1:op', '1:k']);
    expect(rows[0].expanded).toBe(true);
    expect(rows[1].expandable).toBe(true); // op — Op2, у него есть поля
    expect(new Set(box.rows.map((r) => r.key)).size).toBe(box.rows.length);
    // выходная сторона стала длиннее входной
    expect(box.h).toBe(HEAD_H + 2 * PAD + 3 * ROW_H);
  });

  it('раскрытие вложенного поля: op → Op1, Op0', () => {
    const open = new Set([
      rowKey({ node: 'b', port: 'instr', path: '' }),
      rowKey({ node: 'b', port: 'instr', path: 'op' }),
    ]);
    const box = layoutBox('b', 'Блок', ports, open, { x: 0, y: 0, w: BLOCK_W }, 'block');
    const names = box.rows.filter((r) => r.end.port === 'instr').map((r) => r.name);
    expect(names).toEqual(['instr', 'op', 'Op1', 'Op0', 'k']);
    const op0 = box.rows.find((r) => r.name === 'Op0')!;
    expect(op0.nodes).toEqual(['W2']); // второй бит команды
    expect(op0.expandable).toBe(false);
  });

  it('узлы строки — срез узлов порта по полю', () => {
    const open = new Set([rowKey({ node: 'b', port: 'instr', path: '' })]);
    const box = layoutBox('b', 'Блок', ports, open, { x: 0, y: 0, w: BLOCK_W }, 'block');
    expect(box.rows.find((r) => r.name === 'op')!.nodes).toEqual(['W3', 'W2']);
    expect(box.rows.find((r) => r.name === 'k')!.nodes).toEqual(['W1', 'W0']);
  });

  it('пины: вход на левом краю, выход на правом, центр строки по вертикали', () => {
    const box = layoutBox('b', 'Блок', ports, none, { x: 100, y: 50, w: BLOCK_W }, 'block');
    expect(pinCenter(box, box.rows[0])).toEqual({ x: 100, y: 50 + box.rows[0].y });
    expect(pinCenter(box, box.rows[2])).toEqual({ x: 100 + BLOCK_W, y: 50 + box.rows[2].y });
  });

  it('колонки упражнения: входы-источники справа от своего прямоугольника, выходы слева', () => {
    const { inBox, outBox } = sideBoxes(
      [
        { name: 'clk', type: 'Clk', dir: 'in', nodes: ['A'] },
        { name: 'acc', type: 'Word2', dir: 'out', nodes: ['Q1', 'Q0'] },
      ],
      none,
      880,
    );
    expect(inBox.rows.every((r) => r.side === 'out')).toBe(true);
    expect(outBox.rows.every((r) => r.side === 'in')).toBe(true);
    expect(inBox.rows[0].end.node).toBe(TOP);
    expect(inBox.x).toBeLessThan(outBox.x);
  });

  it('свободное место: новые блоки не ложатся друг на друга', () => {
    const taken: { x: number; y: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const spot = freeSpot(taken, 880);
      expect(taken.some((t) => t.x === spot.x && t.y === spot.y)).toBe(false);
      taken.push(spot);
    }
    expect(new Set(taken.map((t) => `${t.x},${t.y}`)).size).toBe(8);
  });
});
