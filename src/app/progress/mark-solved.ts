import { touchProgress } from '../nav/progress';
import { Chapter } from '../pages/chapters/chapters';

/** Подсказка у кнопки «Отметить решённым» */
export const MARK_HINT =
  'Для тех, кто решает курс заново и потерял прогресс: все упражнения главы сразу станут решёнными';

/**
 * Отметить решёнными все упражнения главы — прямо в хранилище (когда страница главы открыта,
 * лабораторий с их собственным состоянием нет); без вопросов — это для тех, кто решает заново. Текущее упражнение и ваши тексты программ остаются.
 */
export function markChapterSolved(chapter: Chapter): void {
  try {
    const raw = JSON.parse(localStorage.getItem(chapter.storageKey) ?? 'null') as {
      codes?: unknown;
      current?: unknown;
    } | null;
    const current = typeof raw?.current === 'number' ? raw.current : 0;
    const data =
      chapter.kind === 'circuit'
        ? { solved: chapter.exercises.map((_, i) => i), current }
        : { codes: raw?.codes ?? {}, solved: chapter.exercises.map((e) => e.id), current };
    localStorage.setItem(chapter.storageKey, JSON.stringify(data));
  } catch {
    // localStorage недоступен — отметить нечего
  }
  touchProgress();
}
