import { TASKS as ASM_TASKS } from '../../asm/tasks';
import { REAL_TASKS } from '../../riscv/rv-real-tasks';
import { RV_TASKS } from '../../riscv/rv-tasks';
import { SECTIONS } from '../../sections/sections';
import { readProgress } from '../../nav/progress';

/** Тип главы определяет, какая страница показывает её упражнения */
export type ChapterKind = 'circuit' | 'asm' | 'riscv' | 'real';

export interface ExerciseRef {
  id: string;
  title: string;
}

export interface Chapter {
  slug: string;
  title: string;
  description: string;
  kind: ChapterKind;
  /** в какую часть курса входит глава */
  part: 'circuits' | 'programs';
  exercises: readonly ExerciseRef[];
  /** ключ localStorage, где глава хранит прогресс */
  storageKey: string;
}

export const PARTS: readonly { id: Chapter['part']; title: string; text: string }[] = [
  {
    id: 'circuits',
    title: 'Часть 1. От вентиля к процессору',
    text: 'Собираем схемы своими руками: от первых логических элементов до готового процессора.',
  },
  {
    id: 'programs',
    title: 'Часть 2. Программы для процессора',
    text: 'Пишем на ассемблере: сначала на учебной системе команд, потом на настоящем RISC-V.',
  },
];

const programChapters: readonly Chapter[] = [
  {
    slug: 'asm',
    title: 'Ассемблер',
    description:
      'Своя простая система команд «Мини-8»: ассемблер, эмулятор и тот же процессор, собранный из вентилей.',
    kind: 'asm',
    part: 'programs',
    exercises: ASM_TASKS,
    storageKey: 'processor-asm-v1',
  },
  {
    slug: 'riscv',
    title: 'RISC-V',
    description:
      'Настоящие 32-битные команды на учебной плате: память, UART, светодиоды, переключатели и таймер.',
    kind: 'riscv',
    part: 'programs',
    exercises: RV_TASKS,
    storageKey: 'processor-riscv-v1',
  },
  {
    slug: 'real',
    title: 'Реальная сборка',
    description:
      'Целые программы, которые собирает настоящий компилятор и которые запускаются у вас на компьютере.',
    kind: 'real',
    part: 'programs',
    exercises: REAL_TASKS,
    storageKey: 'processor-riscv-real-v1',
  },
];

export const CHAPTERS: readonly Chapter[] = [
  ...SECTIONS.map((s): Chapter => ({
    slug: s.slug,
    title: s.title,
    description: s.description,
    kind: 'circuit',
    part: 'circuits',
    exercises: s.exercises.map((e) => ({ id: e.id, title: e.title })),
    storageKey: `processor-progress-v2-${s.progressKey}`,
  })),
  ...programChapters,
];

export const chapterBySlug = (slug: string): Chapter | undefined =>
  CHAPTERS.find((c) => c.slug === slug);

export type Status = 'solved' | 'current' | 'todo';

export interface ExerciseStatus extends ExerciseRef {
  status: Status;
  /** это упражнение открыто на экране прямо сейчас */
  open: boolean;
}

export interface ChapterProgress {
  items: ExerciseStatus[];
  done: number;
  /** номер упражнения, с которого стоит продолжить */
  resume: number;
}

/** Сколько решено в главе и какое упражнение «текущее» (по сохранению в браузере) */
export function chapterProgress(c: Chapter, openNow?: string): ChapterProgress {
  const p = readProgress(c.storageKey);
  // схемы хранят номера решённых упражнений, остальные страницы — их id
  const isSolved = (e: ExerciseRef, i: number) =>
    c.kind === 'circuit' ? p.solved.has(i) : p.solved.has(e.id);
  const items = c.exercises.map((e, i): ExerciseStatus => {
    const solved = isSolved(e, i);
    const current = openNow ? e.id === openNow : p.current === i;
    return {
      ...e,
      status: solved ? 'solved' : current ? 'current' : 'todo',
      open: openNow !== undefined && e.id === openNow,
    };
  });
  const firstTodo = items.findIndex((e) => e.status !== 'solved');
  const saved = Math.min(Math.max(p.current, 0), items.length - 1);
  return {
    items,
    done: items.filter((e) => e.status === 'solved').length,
    resume: items[saved]?.status === 'solved' && firstTodo >= 0 ? firstTodo : saved,
  };
}

/** Следующее упражнение курса: дальше по главе, затем в первое упражнение следующей главы */
export function nextInCourse(
  slug: string,
  exerciseId: string,
): { slug: string; id: string } | null {
  const at = CHAPTERS.findIndex((c) => c.slug === slug);
  if (at < 0) return null;
  const i = CHAPTERS[at].exercises.findIndex((e) => e.id === exerciseId);
  if (i >= 0 && i + 1 < CHAPTERS[at].exercises.length) {
    return { slug, id: CHAPTERS[at].exercises[i + 1].id };
  }
  const next = CHAPTERS[at + 1];
  return next ? { slug: next.slug, id: next.exercises[0].id } : null;
}
