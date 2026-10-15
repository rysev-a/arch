import { TASKS as ASM_TASKS } from '../asm/tasks';
import { REAL_TASKS } from '../riscv/rv-real-tasks';
import { RV_TASKS } from '../riscv/rv-tasks';
import { CodeGuide, CodeTaskInfo, buildCodeGuide } from './code-guide';
import { CODE_SPECS } from './code-specs';

const TASK_LISTS: Record<string, readonly (CodeTaskInfo & { id: string })[]> = {
  asm: ASM_TASKS,
  riscv: RV_TASKS,
  real: REAL_TASKS,
};

const cache = new Map<string, CodeGuide | null>();

/** Разбор задания по программированию (ассемблер Мини-8, RISC-V, реальная сборка) */
export function codeGuideFor(slug: string, id: string): CodeGuide | null {
  const key = `${slug}/${id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const spec = CODE_SPECS[key];
  const task = TASK_LISTS[slug]?.find((t) => t.id === id);
  const guide = spec && task ? buildCodeGuide(task, spec) : null;
  cache.set(key, guide);
  return guide;
}
