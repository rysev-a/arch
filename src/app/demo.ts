import { COMPOSITE_GATES } from './exercises/logic-gates/circuit.model';
import { SECTIONS } from './sections/sections';

/**
 * Демо-режим: адрес с параметром `?demo` подгружает эталонные решения (файл demo-solutions.json)
 * и открывает всё, что нужно для сборки процессора из блоков.
 * Ничего чужого не затирает: сохранённые решения ученика остаются, прогресс только дополняется.
 */
export const DEMO_FILE = 'demo-solutions.json';

const SOLUTION_PREFIX = 'processor-solution-v1-';
const progressKey = (section: string) => `processor-progress-v2-${section}`;

function readProgress(key: string): { solved: number[]; current: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(progressKey(key)) ?? 'null') as {
      solved?: unknown;
      current?: unknown;
    } | null;
    return {
      solved: Array.isArray(raw?.solved)
        ? raw.solved.filter((n): n is number => typeof n === 'number')
        : [],
      current: typeof raw?.current === 'number' ? raw.current : 0,
    };
  } catch {
    return { solved: [], current: 0 };
  }
}

/** Отметить упражнения решёнными (добавляет к уже решённым) */
function markSolved(sectionKey: string, exerciseIds: readonly string[], focus?: string): void {
  const section = SECTIONS.find((s) => s.progressKey === sectionKey);
  if (!section) return;
  const progress = readProgress(sectionKey);
  const solved = new Set(progress.solved);
  for (const id of exerciseIds) {
    const i = section.exercises.findIndex((e) => e.id === id);
    if (i >= 0) solved.add(i);
  }
  const focusIndex = focus ? section.exercises.findIndex((e) => e.id === focus) : -1;
  localStorage.setItem(
    progressKey(sectionKey),
    JSON.stringify({
      solved: [...solved],
      current: focusIndex >= 0 ? focusIndex : progress.current,
    }),
  );
}

/** Возвращает true, если всё установилось */
export async function installDemo(): Promise<boolean> {
  try {
    const url = new URL(DEMO_FILE, document.baseURI);
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
      console.error(`Демо: ${url} не отдаёт JSON (статус ${res.status}).`);
      return false;
    }
    const solutions = (await res.json()) as Record<string, unknown>;

    const solvedBySection = new Map<string, string[]>();
    for (const [key, solution] of Object.entries(solutions)) {
      if (!key.startsWith(SOLUTION_PREFIX)) continue;
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(solution));
      // ключ вида processor-solution-v1-<раздел>-<упражнение>
      const rest = key.slice(SOLUTION_PREFIX.length);
      const section = SECTIONS.find((s) => rest.startsWith(`${s.progressKey}-`));
      if (section) {
        const list = solvedBySection.get(section.progressKey) ?? [];
        list.push(rest.slice(section.progressKey.length + 1));
        solvedBySection.set(section.progressKey, list);
      }
    }

    // составные вентили (NAND, XOR, DFF) открываются решением своих упражнений
    for (const req of Object.values(COMPOSITE_GATES)) {
      const section = SECTIONS.find((s) => s.slug === req.sectionSlug);
      if (!section) continue;
      const list = solvedBySection.get(section.progressKey) ?? [];
      list.push(req.exerciseId);
      solvedBySection.set(section.progressKey, list);
    }

    for (const [section, ids] of solvedBySection) {
      markSolved(section, ids, section === 'cpu' ? 'cpu' : undefined);
    }
    return true;
  } catch {
    return false;
  }
}

/** Если в адресе есть ?demo — установить и перейти к финалу (сборке процессора) */
export function runDemoIfRequested(): void {
  if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('demo')) return;
  installDemo().then((ok) => {
    if (!ok) {
      alert(
        'Не удалось загрузить demo-solutions.json. Файл появился после запуска сервера — ' +
          'перезапустите `ng serve` и откройте адрес ещё раз.',
      );
    }
    // адрес считаем от base href: сайт может жить не в корне домена (GitHub Pages)
    location.replace(new URL(ok ? 'cpu' : '', document.baseURI).href);
  });
}
