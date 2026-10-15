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

/* ============================================================
   Масштаб
   ============================================================ */

export const ZOOM = { min: 0.3, max: 3, step: 1.25 } as const;

export const clampZoom = (z: number): number => Math.min(ZOOM.max, Math.max(ZOOM.min, z));

/**
 * Изменить масштаб, не сдвигая точку под курсором. `anchor` — точка в пикселях
 * от угла самой доски (без полей), `base` — пикселей экрана на единицу доски при масштабе 1.
 */
export function zoomAround(
  state: { pan: Point; zoom: number },
  factor: number,
  anchor: Point,
  base: number,
): { pan: Point; zoom: number } {
  const zoom = clampZoom(state.zoom * factor);
  if (zoom === state.zoom || !(base > 0)) return state;
  const wx = anchor.x / (base * state.zoom) + state.pan.x;
  const wy = anchor.y / (base * state.zoom) + state.pan.y;
  return {
    zoom,
    pan: {
      x: Math.round(wx - anchor.x / (base * zoom)),
      y: Math.round(wy - anchor.y / (base * zoom)),
    },
  };
}

/** Размер видимого окна доски: чем крупнее масштаб, тем меньше кусок «мира» */
export const viewBoxOf = (pan: Point, zoom: number, w: number, h: number): string =>
  [pan.x, pan.y, w / zoom, h / zoom].map((n) => Math.round(n * 100) / 100).join(' ');

/**
 * Колесо над доской. Ctrl (⌘) + колесо или щипок на тачпаде масштабируют всегда. Обычное колесо
 * масштабирует, только если доска «активна» (на неё нажали, курсор от неё не уходил) или она
 * развёрнута на весь экран; иначе оно прокручивает страницу, как везде.
 */
export function listenZoomWheel(
  el: Element,
  onZoom: (event: WheelEvent) => void,
  isActive: () => boolean = () => false,
): () => void {
  const handler = (e: Event) => {
    const event = e as WheelEvent;
    const forced = event.ctrlKey || event.metaKey;
    if (!forced && !isActive() && !el.closest('.fullscreen')) return;
    event.preventDefault();
    onZoom(event);
  };
  el.addEventListener('wheel', handler, { passive: false });
  return () => el.removeEventListener('wheel', handler);
}

/** Доска «активна» после нажатия на неё и перестаёт быть такой, когда курсор ушёл */
export function listenActivity(el: Element, set: (active: boolean) => void): () => void {
  const on = () => set(true);
  const off = () => set(false);
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerleave', off);
  return () => {
    el.removeEventListener('pointerdown', on);
    el.removeEventListener('pointerleave', off);
  };
}

/** Коэффициент масштаба за один «тик» колеса: плавно и в обе стороны одинаково */
export const wheelFactor = (event: WheelEvent): number => Math.exp(-event.deltaY * 0.0025);

/* ============================================================
   Провод «тянется за мышью» после клика по контакту
   ============================================================ */

/** Сдвиг курсора (в пикселях экрана), меньше которого нажатие на контакт считается щелчком */
export const CLICK_SLOP = 6;

export const isClick = (down: { x: number; y: number }, event: PointerEvent): boolean =>
  Math.hypot(event.clientX - down.x, event.clientY - down.y) < CLICK_SLOP;

/**
 * Пока провод тянется за мышью, любое нажатие не на контакт его отменяет. Внутри доски такое
 * нажатие больше ничего не делает (не двигает элемент, не удаляет провод) — оно лишь отменяет.
 * Колесо мыши (двигает доску) и кнопки масштаба провод не отменяют.
 */
export function listenStickyCancel(
  board: Element,
  isSticky: () => boolean,
  isPin: (target: Element) => boolean,
  cancel: () => void,
): () => void {
  const handler = (e: Event) => {
    const event = e as PointerEvent;
    if (!isSticky() || event.button === 1) return;
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;
    if (isPin(target) || target.closest('app-view-controls')) return;
    cancel();
    if (board.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener('pointerdown', handler, { capture: true });
  return () => document.removeEventListener('pointerdown', handler, { capture: true });
}
