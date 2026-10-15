import { Injectable, effect, signal } from '@angular/core';

const KEY = 'processor-settings-v1';

interface Saved {
  autoWire?: boolean;
}

/** Настройки учебника: хранятся в браузере, к прогрессу не относятся */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  /**
   * Автоподстановка связей: пока элемент тащат по доске, пунктиром показываются возможные
   * провода к близким контактам, а когда его поставили — они становятся настоящими.
   */
  readonly autoWire = signal(false);

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
      if (saved && typeof saved.autoWire === 'boolean') this.autoWire.set(saved.autoWire);
    } catch {
      // нет сохранения — настройки по умолчанию
    }
    effect(() => {
      const data: Saved = { autoWire: this.autoWire() };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        // localStorage недоступен — настройки не сохранятся
      }
    });
  }
}
