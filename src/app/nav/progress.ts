import { signal } from '@angular/core';

/**
 * Прогресс хранится в localStorage у каждого раздела свой. Чтобы боковая панель узнавала
 * об изменениях сразу, страницы вызывают touchProgress() после сохранения.
 */
export const progressVersion = signal(0);
export const touchProgress = (): void => progressVersion.update((n) => n + 1);

export interface ProgressInfo {
  /** какие упражнения решены: номера (схемы) или id (ассемблер) */
  solved: ReadonlySet<number | string>;
  /** номер текущего упражнения */
  current: number;
}

/** Прочитать сохранённый прогресс; без сохранения — пусто */
export function readProgress(storageKey: string): ProgressInfo {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const p = JSON.parse(raw) as { solved?: unknown; current?: unknown };
      const solved = Array.isArray(p.solved)
        ? new Set<number | string>(
            p.solved.filter(
              (x): x is number | string => typeof x === 'number' || typeof x === 'string',
            ),
          )
        : new Set<number | string>();
      return { solved, current: typeof p.current === 'number' ? p.current : 0 };
    }
  } catch {
    // нет сохранения или localStorage недоступен
  }
  return { solved: new Set(), current: 0 };
}
