import { touchProgress } from '../nav/progress';
import { Chapter } from '../pages/chapters/chapters';

/** Вопрос перед массовой отметкой: действие необратимо иначе как сбросом прогресса */
export function confirmMarkChapter(chapterTitle: string, count: number): boolean {
  return confirm(
    `Отметить все упражнения главы «${chapterTitle}» (${count}) решёнными? ` +
      'Это для тех, кто уже знает материал: счётчики и статусы станут «решено».',
  );
}

/**
 * Отметить решёнными все упражнения главы — прямо в хранилище (когда страница главы открыта,
 * лабораторий с их собственным состоянием нет). Текущее упражнение и ваши тексты программ остаются.
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
