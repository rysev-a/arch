import { assemble } from './rv-asm';
import { RvMachine } from './rv-machine';
import { REAL_TASKS } from './rv-real-tasks';

function runReal(src: string) {
  const a = assemble(src);
  expect(a.errors, JSON.stringify(a.errors)).toEqual([]);
  const m = new RvMachine(a.image, { entry: a.entry });
  m.run(200_000);
  return { m, a };
}

describe('задания этапа 4 (настоящие программы)', () => {
  it('шесть заданий, id уникальны, данных «сверху» нет', () => {
    expect(REAL_TASKS.length).toBe(6);
    expect(new Set(REAL_TASKS.map((t) => t.id)).size).toBe(6);
    for (const t of REAL_TASKS) expect(t.data).toBe('');
  });

  for (const t of REAL_TASKS) {
    it(`«${t.title}»: эталон проходит`, () => {
      const { m, a } = runReal(t.solution);
      expect(m.error).toBeNull();
      const r = t.check(m.view(), a.symbols);
      expect(r.ok, r.message).toBe(true);
    });

    it(`«${t.title}»: заготовка не проходит`, () => {
      const { m, a } = runReal(t.starter);
      expect(t.check(m.view(), a.symbols).ok).toBe(false);
    });
  }

  it('_start не в начале файла: выполнение идёт с метки', () => {
    const { m } = runReal(
      'helper:\n  li a0, 99\n  ret\n  .globl _start\n_start:\n  li a0, 7\n  li a7, 93\n  ecall\n',
    );
    expect(m.exitCode).toBe(7);
  });

  it('exit без write: пустой вывод и код возврата', () => {
    const { m } = runReal('_start:\n  li a0, 3\n  li a7, 93\n  ecall\n');
    expect(m.view().exitCode).toBe(3);
    expect(m.view().uart).toBe('');
  });

  it('li: число без знака из старших значений — то же слово, что и со знаком', () => {
    const w = (src: string) => assemble(src).lines.map((l) => l.word);
    expect(w('li a0, 4294967295')).toEqual(w('li a0, -1'));
    expect(w('li a0, 4294967295')).toEqual([0xfff00513]);
    expect(w('li a0, 0xFFFFF800')).toEqual(w('li a0, -2048'));
    expect(w('li a0, 0x80000000')).toEqual([0x80000537]);
    expect(w('li a0, 0xFFFFF000').length).toBe(1);
  });
});
