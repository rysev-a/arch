import { assemble } from '../asm/assembler';
import { Machine } from '../asm/machine';
import { TASKS } from '../asm/tasks';
import { GateMachine } from './gate-machine';

describe('GateMachine: процессор на вентилях с интерфейсом эмулятора', () => {
  for (const t of TASKS) {
    it(`«${t.title}»: шаг за шагом и запуск целиком дают то же, что эмулятор`, () => {
      const { words } = assemble(t.solution);
      const emu = new Machine(words, t.disk);
      const gates = new GateMachine(words, t.disk);
      while (emu.running) {
        emu.step();
        gates.step();
        const e = emu.view();
        const g = gates.view();
        expect(g.pc).toBe(e.pc);
        expect(g.regs).toEqual(e.regs);
        expect(g.halted).toBe(e.halted);
        expect(g.steps).toBe(e.steps);
        expect([...g.mem]).toEqual([...e.mem]);
      }
      expect(t.check(gates.view().mem).ok).toBe(true);

      // запуск целиком — тот же итог
      const all = new GateMachine(words, t.disk);
      all.run();
      expect([...all.view().mem]).toEqual([...emu.view().mem]);
      expect(all.steps).toBe(emu.steps);
    });
  }

  it('подсветка: записанный байт и изменённый регистр', () => {
    const { words } = assemble("li r1, 'J'\n li r2, 0x10\n sb r1, 0(r2)\n hlt");
    const m = new GateMachine(words, new Uint8Array(256));
    m.step();
    expect([m.lastReg, m.lastWrite]).toEqual([1, null]);
    m.step();
    m.step();
    expect([m.lastReg, m.lastWrite]).toEqual([null, 0x10]);
  });

  it('программа без hlt: понятная ошибка, а не молчаливая остановка на нулях ПЗУ', () => {
    const m = new GateMachine(assemble('li r1, 1').words, new Uint8Array(256));
    m.run();
    expect(m.error).toContain('hlt');
  });

  it('бесконечный цикл останавливается по лимиту шагов', () => {
    const m = new GateMachine(assemble('x: j x').words, new Uint8Array(256));
    m.run(500);
    expect(m.error).toContain('лимит');
  });
});
