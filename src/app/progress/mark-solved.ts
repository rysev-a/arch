import { touchProgress } from '../nav/progress';
import { Chapter } from '../pages/chapters/chapters';

/** Подсказка у кнопки «Отметить решённым» */
export const MARK_HINT =
  'Для тех, кто решает курс заново и потерял прогресс: упражнение будет считаться решённым';

/**
 * Отметить решённым одно упражнение главы — прямо в хранилище (когда страница главы открыта,
 * лабораторий с их собственным состоянием нет). Текущее упражнение и ваши тексты программ остаются.
 */
export function markExerciseSolved(chapter: Chapter, exerciseId: string): void {
  const at = chapter.exercises.findIndex((e) => e.id === exerciseId);
  if (at < 0) return;
  try {
    const raw = JSON.parse(localStorage.getItem(chapter.storageKey) ?? 'null') as {
      codes?: unknown;
      current?: unknown;
      solved?: unknown;
    } | null;
    const current = typeof raw?.current === 'number' ? raw.current : 0;
    const prev = Array.isArray(raw?.solved) ? (raw!.solved as unknown[]) : [];
    const data =
      chapter.kind === 'circuit'
        ? { solved: [...new Set([...(prev as number[]), at])], current }
        : {
            codes: raw?.codes ?? {},
            solved: [...new Set([...(prev as string[]), exerciseId])],
            current,
          };
    localStorage.setItem(chapter.storageKey, JSON.stringify(data));
  } catch {
    // localStorage недоступен — отметить нечего
  }
  touchProgress();
}
