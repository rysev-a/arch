import { Point } from './circuit.model';

/**
 * Доска без границ: её можно двигать, зажав колесо мыши (или потянув за пустое место).
 * Сама доска — окно (viewBox) на бесконечный «мир»; здесь — общая арифметика для обеих досок.
 */

/** Насколько далеко можно уносить элементы от начала координат */
export const WORLD = { minX: -4000, maxX: 4000, minY: -3000, maxY: 3000 } as const;

export const clampWorld = (p: Point, w = 0, h = 0): Point => ({
  x: Math.min(WORLD.maxX - w, Math.max(WORLD.minX, p.x)),
  y: Math.min(WORLD.maxY - h, Math.max(WORLD.minY, p.y)),
});

export interface PanDrag {
  /** где нажали (экран) и каким был сдвиг доски */
  cx: number;
  cy: number;
  ox: number;
  oy: number;
  /** сколько пикселей экрана в одной единице доски */
  scale: number;
}

export const startPan = (event: PointerEvent, scale: number, offset: Point): PanDrag => ({
  cx: event.clientX,
  cy: event.clientY,
  ox: offset.x,
  oy: offset.y,
  scale,
});

/** Доска «едет» за рукой: потянули вправо — содержимое сдвинулось вправо */
export const dragPan = (d: PanDrag, event: PointerEvent): Point => ({
  x: Math.round(d.ox - (event.clientX - d.cx) / d.scale),
  y: Math.round(d.oy - (event.clientY - d.cy) / d.scale),
});

/**
 * Подписывается на нажатия колеса мыши на доске (в фазе перехвата, до обработчиков элементов,
 * чтобы колесо не удаляло провода и не тащило элементы). Возвращает функцию отписки.
 */
export function listenMiddleButton(
  el: Element,
  onStart: (event: PointerEvent) => void,
): () => void {
  const down = (e: Event) => {
    const event = e as PointerEvent;
    if (event.button !== 1) return;
    event.preventDefault(); // без «автопрокрутки» браузера
    event.stopPropagation();
    onStart(event);
  };
  const mouse = (e: Event) => {
    if ((e as MouseEvent).button === 1) e.preventDefault();
  };
  el.addEventListener('pointerdown', down, { capture: true });
  el.addEventListener('mousedown', mouse, { capture: true });
  el.addEventListener('auxclick', mouse, { capture: true });
  return () => {
    el.removeEventListener('pointerdown', down, { capture: true });
    el.removeEventListener('mousedown', mouse, { capture: true });
    el.removeEventListener('auxclick', mouse, { capture: true });
  };
}
