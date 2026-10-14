import {
  BLOCK_SOLUTIONS,
  DECODER_SOLUTIONS,
  MEMORY_SOLUTIONS,
  ALU_SOLUTIONS,
  CPU_SOLUTIONS,
  build,
} from './exercises/logic-gates/netlists.testing';
import { SECTIONS } from './sections/sections';

/** Файл демо-решений собирается из эталонов тестов. Обновить: UPDATE_DEMO=1 npx ng test --watch=false */
const FILE = 'public/demo-solutions.json';

function demoSolutions(): Record<string, unknown> {
  const gate = { ...MEMORY_SOLUTIONS, ...DECODER_SOLUTIONS, ...ALU_SOLUTIONS, ...CPU_SOLUTIONS };
  const out: Record<string, unknown> = {};
  for (const s of SECTIONS) {
    for (const ex of s.exercises) {
      if (!ex.block) continue;
      const key = `processor-solution-v1-${s.progressKey}-${ex.id}`;
      const blocks = BLOCK_SOLUTIONS[ex.id];
      const sol = gate[ex.id as keyof typeof gate];
      if (blocks) out[key] = blocks;
      else if (sol) {
        const c = build(ex, sol.net, sol.outs);
        // вентили в сетку: эталонные нетлисты положений не задают
        out[key] = {
          gates: c.gates.map((g, i) => ({
            ...g,
            x: 180 + (i % 5) * 110,
            y: 30 + Math.floor(i / 5) * 70,
          })),
          wires: c.wires,
        };
      }
    }
  }
  return out;
}

describe('демо-решения', () => {
  const proc = (
    globalThis as unknown as {
      process: { cwd(): string; env: Record<string, string>; getBuiltinModule(n: string): any };
    }
  ).process;
  const fs = proc.getBuiltinModule('node:fs');
  const path = `${proc.cwd()}/${FILE}`;
  const expected = JSON.stringify(demoSolutions());

  it('есть эталон для каждого упражнения, которое становится блоком', () => {
    const keys = Object.keys(JSON.parse(expected));
    const blocks = SECTIONS.flatMap((s) =>
      s.exercises.filter((e) => e.block).map((e) => `${s.progressKey}-${e.id}`),
    );
    expect(keys.map((k) => k.replace('processor-solution-v1-', '')).sort()).toEqual(blocks.sort());
  });

  it('файл public/demo-solutions.json актуален (UPDATE_DEMO=1 — пересоздать)', () => {
    if (proc.env['UPDATE_DEMO']) fs.writeFileSync(path, expected);
    expect(fs.existsSync(path), 'нет файла — запустите с UPDATE_DEMO=1').toBe(true);
    expect(fs.readFileSync(path, 'utf8')).toBe(expected);
  });
});
