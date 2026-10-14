import { assemble } from './rv-asm';
import { RvMachine } from './rv-machine';
import { RV_TASKS, fullSource } from './rv-tasks';

function runTask(t: (typeof RV_TASKS)[number], user: string) {
  const a = assemble(fullSource(user, t));
  expect(a.errors, JSON.stringify(a.errors)).toEqual([]);
  const m = new RvMachine(a.image, { switches: t.switches });
  m.run(t.maxSteps);
  return { m, a };
}

describe('задания RISC-V', () => {
  it('девять заданий, id уникальны', () => {
    expect(RV_TASKS.length).toBe(9);
    expect(new Set(RV_TASKS.map((t) => t.id)).size).toBe(9);
  });

  for (const t of RV_TASKS) {
    it(`«${t.title}»: эталонное решение выполняет задание`, () => {
      const { m, a } = runTask(t, t.solution);
      expect(m.error).toBeNull();
      expect(m.halted).toBe(true);
      const r = t.check(m.view(), a.symbols);
      expect(r.ok, r.message).toBe(true);
      expect(m.steps).toBeLessThan(20000);
    });

    it(`«${t.title}»: заготовка не засчитывается`, () => {
      const { m, a } = runTask(
        t,
        t.starter.includes('ebreak') ? t.starter : `${t.starter}\n ebreak`,
      );
      const r = t.check(m.view(), a.symbols);
      expect(r.ok).toBe(false);
      expect(r.message.length).toBeGreaterThan(5);
    });
  }

  it('сортировка: почти верный ответ не проходит', () => {
    const t = RV_TASKS.find((x) => x.id === 'sort-words')!;
    // сортировка беззнаковая — отрицательные числа окажутся в конце
    const unsigned = t.solution
      .replace('bge  t1, s1, внешний', 'bge  t1, s1, внешний')
      .replace('ble  t3, t4, дальше', 'bleu t3, t4, дальше');
    expect(unsigned).not.toBe(t.solution);
    const { m, a } = runTask(t, unsigned);
    expect(t.check(m.view(), a.symbols).ok).toBe(false);
  });

  it('мигание: слишком короткая задержка не проходит', () => {
    const t = RV_TASKS.find((x) => x.id === 'timer-blink')!;
    const short = t.solution.replace('addi t4, t4, 200', 'addi t4, t4, 20');
    const { m, a } = runTask(t, short);
    const r = t.check(m.view(), a.symbols);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('хотя бы 200');
    // записать то же значение дважды — не переключение
    const same = t.solution.replace('xori t3, t3, 1', 'nop');
    const s = runTask(t, same);
    expect(t.check(s.m.view(), s.a.symbols).ok).toBe(false);
  });

  it('факториал: забытое восстановление sp ловится', () => {
    const t = RV_TASKS.find((x) => x.id === 'factorial')!;
    const leak = t.solution.replace('  addi sp, sp, 16\n  ret', '  ret');
    const { m, a } = runTask(t, leak);
    const r = t.check(m.view(), a.symbols);
    expect(r.ok).toBe(false);
  });

  it('данные задания нельзя «переписать» программой: они добавляются после неё', () => {
    const t = RV_TASKS.find((x) => x.id === 'uart-string')!;
    const src = fullSource('nop', t);
    expect(src.endsWith(`${t.data}\n`)).toBe(true);
    expect(src.indexOf('.data')).toBeGreaterThan(src.indexOf('nop'));
  });
});
