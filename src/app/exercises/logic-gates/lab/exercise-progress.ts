import { touchProgress } from '../../../nav/progress';
import { SECTIONS, Section } from '../../../sections/sections';
import { COMPOSITE_GATES, GateType } from '../circuit.model';

/**
 * Прогресс упражнений со схемами в localStorage: какие решены (по номеру в разделе) и на каком мы.
 * Здесь же — что открывается решением: составные элементы (XOR, XNOR…) закрыты, пока не собраны вручную.
 */

const storageKey = (section: Section): string => `processor-progress-v2-${section.progressKey}`;

export interface SectionProgress {
  solved: Set<number>;
  current: number;
}

export function loadProgress(section: Section): SectionProgress {
  try {
    const raw = localStorage.getItem(storageKey(section));
    if (raw) {
      const parsed = JSON.parse(raw) as { solved?: unknown; current?: unknown };
      const max = section.exercises.length;
      const solved = Array.isArray(parsed.solved)
        ? new Set(
            parsed.solved.filter((n): n is number => typeof n === 'number' && n >= 0 && n < max),
          )
        : new Set<number>();
      const current =
        typeof parsed.current === 'number' && parsed.current >= 0 && parsed.current < max
          ? parsed.current
          : 0;
      return { solved, current };
    }
  } catch {
    // нет сохранения — начинаем с нуля
  }
  return { solved: new Set<number>(), current: 0 };
}

export function saveProgress(section: Section, solved: Iterable<number>, current: number): void {
  try {
    localStorage.setItem(storageKey(section), JSON.stringify({ solved: [...solved], current }));
  } catch {
    // localStorage недоступен — прогресс просто не сохранится
  }
  touchProgress();
}

/** решено ли упражнение `exerciseId` раздела `slug` (по сохранению в браузере) */
export function hasSolved(slug: string, exerciseId: string): boolean {
  const section = SECTIONS.find((s) => s.slug === slug);
  const idx = section?.exercises.findIndex((e) => e.id === exerciseId) ?? -1;
  return !!section && idx >= 0 && loadProgress(section).solved.has(idx);
}

/** составной ли элемент (XOR, XNOR, NAND, DFF) */
export function isComposite(type: GateType): boolean {
  return COMPOSITE_GATES[type] !== undefined;
}

/** составные элементы открываются после сборки их вручную */
export function isGateUnlocked(type: GateType): boolean {
  const req = COMPOSITE_GATES[type];
  return !req || hasSolved(req.sectionSlug, req.exerciseId);
}

/** подсказка для закрытого элемента: что нужно собрать */
export function gateLockHint(type: GateType): string {
  const req = COMPOSITE_GATES[type];
  if (!req) return '';
  const section = SECTIONS.find((s) => s.slug === req.sectionSlug);
  const ex = section?.exercises.find((e) => e.id === req.exerciseId);
  return `Соберите «${ex?.title ?? req.exerciseId}» в разделе «${section?.title ?? req.sectionSlug}»`;
}
