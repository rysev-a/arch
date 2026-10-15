import { SECTIONS } from '../../sections/sections';
import { Guide } from './guides';
import { GUIDES, guideKey } from './guides';
import { GuideSpec, buildBlockGuide, buildGuide } from './guide-builder';
import { CPU_BLOCK_SPECS } from './guide-specs-cpu';
import { SPECS } from './guide-specs';
import { BLOCK_SOLUTIONS, SECTION_SOLUTIONS } from './solutions';

const cache = new Map<string, Guide | null>();

/** Разбор упражнения: ручной (guides.ts) либо собранный из эталонной схемы и текстов */
export function guideFor(sectionSlug: string, exerciseId: string): Guide | null {
  const key = guideKey(sectionSlug, exerciseId);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let guide: Guide | null = GUIDES[key] ?? null;
  if (!guide) {
    const spec: GuideSpec | undefined = SPECS[key];
    const section = SECTIONS.find((s) => s.slug === sectionSlug);
    const ex = section?.exercises.find((e) => e.id === exerciseId);
    const sol = SECTION_SOLUTIONS[sectionSlug]?.[exerciseId];
    const blockSpec = CPU_BLOCK_SPECS[key];
    const blockSol = BLOCK_SOLUTIONS[exerciseId];
    if (spec && ex && sol) guide = buildGuide(ex, sol, spec);
    else if (blockSpec && ex && blockSol) guide = buildBlockGuide(ex, blockSol, blockSpec);
  }
  cache.set(key, guide);
  return guide;
}

export const hasGuide = (sectionSlug: string, exerciseId: string): boolean =>
  guideFor(sectionSlug, exerciseId) !== null;
