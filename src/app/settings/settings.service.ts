import { Injectable, effect, signal } from '@angular/core';

const KEY = 'processor-settings-v1';

/**
 * Радиус автоподстановки в настройках — «базовый»: на доске действует радиус в 4 раза больше.
 * Границы и значение по умолчанию — в базовых единицах.
 */
export const AUTO_WIRE_RADIUS_FACTOR = 4;
export const AUTO_WIRE_RADIUS_MIN = 16;
export const AUTO_WIRE_RADIUS_MAX = 108;
export const AUTO_WIRE_RADIUS_DEFAULT = 56;

export type TableLayout = 'bottom' | 'right';

/** Границы высоты доски, которую можно тянуть за нижний край (в пикселях) */
export const BOARD_HEIGHT_MIN = 220;
export const BOARD_HEIGHT_MAX = 1400;

interface Saved {
  autoWire?: boolean;
  autoWireRadius?: number;
  tableLayout?: TableLayout;
  boardHeight?: number | null;
}

/** Настройки учебника: хранятся в браузере, к прогрессу не относятся */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  /**
   * Автоподстановка связей: пока элемент тащат по доске, пунктиром показываются возможные
   * провода к близким контактам, а когда его поставили — они становятся настоящими.
   */
  readonly autoWire = signal(false);

  /** Радиус автоподстановки: на каком расстоянии контакты считаются «близкими» */
  readonly autoWireRadius = signal(AUTO_WIRE_RADIUS_DEFAULT);

  /** Где таблица истинности: под доской или справа от неё */
  readonly tableLayout = signal<TableLayout>('right');

  /** Высота доски в пикселях; null — по умолчанию (по пропорциям) */
  readonly boardHeight = signal<number | null>(null);

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
      if (saved && typeof saved.autoWire === 'boolean') this.autoWire.set(saved.autoWire);
      if (saved?.tableLayout === 'bottom' || saved?.tableLayout === 'right') {
        this.tableLayout.set(saved.tableLayout);
      }
      if (typeof saved?.boardHeight === 'number' && isFinite(saved.boardHeight)) {
        this.boardHeight.set(
          Math.min(BOARD_HEIGHT_MAX, Math.max(BOARD_HEIGHT_MIN, saved.boardHeight)),
        );
      }
      if (saved && typeof saved.autoWireRadius === 'number' && isFinite(saved.autoWireRadius)) {
        this.autoWireRadius.set(
          Math.min(AUTO_WIRE_RADIUS_MAX, Math.max(AUTO_WIRE_RADIUS_MIN, saved.autoWireRadius)),
        );
      }
    } catch {
      // нет сохранения — настройки по умолчанию
    }
    effect(() => {
      const data: Saved = {
        autoWire: this.autoWire(),
        autoWireRadius: this.autoWireRadius(),
        tableLayout: this.tableLayout(),
        boardHeight: this.boardHeight(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        // localStorage недоступен — настройки не сохранятся
      }
    });
  }
}
