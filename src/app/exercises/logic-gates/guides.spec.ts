import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CircuitLab } from './circuit-lab';
import {
  BOARD_H,
  BOARD_W,
  Circuit,
  GATE_H,
  GATE_MAX_X,
  GATE_MAX_Y,
  GATE_MIN_X,
  GATE_MIN_Y,
  GATE_W,
  GateInstance,
  INPUT_IDS,
  Wire,
} from './circuit.model';
import { Exercise } from './exercises';
import { gatePinsOf } from './gate-shapes';
import { Guide, GuideAction } from './guides';
import { guideFor } from './guide-registry';
import { GuideSession } from '../../guide/guide-session';
import { SECTIONS, Section } from '../../sections/sections';
import {
  ALU_SOLUTIONS,
  BLOCK_SOLUTIONS,
  CPU_SOLUTIONS,
  DECODER_SOLUTIONS,
  MEMORY_SOLUTIONS,
  build,
  expectStepsMatch,
  expectTableMatches,
} from './netlists.testing';

interface Case {
  section: Section;
  ex: Exercise;
  guide: Guide;
  key: string;
}

const cases: Case[] = SECTIONS.flatMap((section) =>
  section.exercises.flatMap((ex) => {
    const guide = guideFor(section.slug, ex.id);
    return guide ? [{ section, ex, guide, key: `${section.slug}/${ex.id}` }] : [];
  }),
);

/** Собрать схему так же, как это делает режим авто: только по действиям разбора */
function circuitOf(guide: Guide): Circuit {
  const gates: GateInstance[] = [];
  let wires: Wire[] = [];
  const ids = new Map<string, string>();
  let n = 0;
  for (const step of guide.steps) {
    for (const a of step.do ?? []) {
      if ('place' in a) {
        const id = `g_${a.name}`;
        ids.set(a.name, id);
        gates.push({ id, type: a.place, x: a.at.x - GATE_W / 2, y: a.at.y - GATE_H / 2 });
      } else if ('wire' in a) {
        const node = (name: string) => ids.get(name) ?? name;
        const to = { node: node(a.wire.to), pin: a.wire.pin };
        wires = [
          ...wires.filter((w) => !(w.to.node === to.node && w.to.pin === to.pin)),
          { id: `w${++n}`, from: { node: node(a.wire.from), pin: 'out' }, to },
        ];
      }
    }
  }
  return { gates, wires };
}

/** Решения предыдущих упражнений: из них в палитре открываются блоки (как делает демо-режим) */
function seedSolutions(): void {
  const gate = { ...MEMORY_SOLUTIONS, ...DECODER_SOLUTIONS, ...ALU_SOLUTIONS, ...CPU_SOLUTIONS };
  for (const sec of SECTIONS) {
    for (const e of sec.exercises) {
      if (!e.block) continue;
      const key = `processor-solution-v1-${sec.progressKey}-${e.id}`;
      const blocks = BLOCK_SOLUTIONS[e.id];
      const sol = gate[e.id as keyof typeof gate];
      if (blocks) localStorage.setItem(key, JSON.stringify(blocks));
      else if (sol) {
        const c = build(e, sol.net, sol.outs);
        localStorage.setItem(key, JSON.stringify({ gates: c.gates, wires: c.wires }));
      }
    }
  }
}

describe('режим авто: пошаговые разборы', () => {
  it('разбор есть у каждого упражнения со схемами', () => {
    const missing = SECTIONS.flatMap((sec) =>
      sec.exercises.filter((e) => !guideFor(sec.slug, e.id)).map((e) => `${sec.slug}/${e.id}`),
    );
    expect(missing).toEqual([]);
    expect(cases.length).toBe(SECTIONS.reduce((n, sec) => n + sec.exercises.length, 0));
  });

  for (const { section, ex, guide, key } of cases) {
    describe(key, () => {
      it('итоговый шаг не повторяется сам в себе', () => {
        const paras = guide.steps.at(-1)!.text.split('\n\n');
        paras.forEach((p, i) => {
          const before = paras.slice(0, i).join(' ');
          for (let k = 0; k + 35 <= p.length; k++) {
            expect(
              before.includes(p.slice(k, k + 35)),
              `${key}: абзац ${i + 1} повторяет предыдущие`,
            ).toBe(false);
          }
        });
      });

      it('у каждого шага есть заголовок и объяснение; первый и последний ничего не делают', () => {
        expect(guide.steps.length).toBeGreaterThan(3);
        for (const s of guide.steps) {
          expect(s.title.trim().length, `${key}: заголовок`).toBeGreaterThan(2);
          expect(s.text.trim().length, `${key}: «${s.title}»`).toBeGreaterThan(30);
          expect(s.text, `${key}: «${s.title}» — недописанный шаблон`).not.toMatch(
            /undefined|\[object|NaN/,
          );
        }
        expect(guide.steps[0].do).toBeUndefined();
        expect(guide.steps[guide.steps.length - 1].do).toBeUndefined();
      });

      if (ex.kind === 'blocks') {
        it('блоки и шины разбора — ровно эталонное решение, каждая шина проведена один раз', () => {
          const ref = BLOCK_SOLUTIONS[ex.id];
          const placed = new Map<string, string>();
          const wires: unknown[] = [];
          for (const st of guide.steps) {
            for (const a of st.do ?? []) {
              if ('block' in a) {
                expect(placed.has(a.block.id), `блок «${a.block.id}» поставлен дважды`).toBe(false);
                placed.set(a.block.id, a.block.blockId);
              }
              if ('bus' in a) {
                for (const end of [a.bus.from, a.bus.to]) {
                  expect(
                    end.node === '$' || placed.has(end.node),
                    `${key}: шина к ещё не поставленному «${end.node}»`,
                  ).toBe(true);
                }
                wires.push({ from: a.bus.from, to: a.bus.to });
              }
            }
          }
          expect([...placed.entries()].sort()).toEqual(
            ref.instances.map((i) => [i.id, i.blockId] as [string, string]).sort(),
          );
          const sortJson = (list: unknown[]) => list.map((x) => JSON.stringify(x)).sort();
          expect(sortJson(wires)).toEqual(
            sortJson(ref.busWires.map((w) => ({ from: w.from, to: w.to }))),
          );
        });
      } else {
        it('схема, построенная разбором, решает упражнение', () => {
          const circuit = circuitOf(guide);
          if (ex.mode === 'steps') expectStepsMatch(ex, circuit);
          else expectTableMatches(ex, circuit);
        });
      }

      it.skipIf(ex.kind === 'blocks')(
        'элементы разрешены в упражнении, провода ведут на существующие выводы',
        () => {
          const placed = new Map<string, string>();
          for (const s of guide.steps) {
            for (const a of s.do ?? []) {
              if ('place' in a) {
                expect(ex.allowed, `${key}: ${a.name} (${a.place})`).toContain(a.place);
                expect(placed.has(a.name), `имя «${a.name}» занято`).toBe(false);
                placed.set(a.name, a.place);
              }
              if ('wire' in a) {
                const { from, to, pin } = a.wire;
                expect(
                  placed.has(from) || (INPUT_IDS as readonly string[]).includes(from),
                  `${key}: источник «${from}» ещё не поставлен`,
                ).toBe(true);
                if (placed.has(to)) {
                  expect(gatePinsOf(placed.get(to) as never), `${key}: ${to}.${pin}`).toContain(
                    pin,
                  );
                } else {
                  expect(ex.outputs, `${key}: приёмник «${to}»`).toContain(to);
                  expect(pin).toBe('in0');
                }
              }
            }
          }
        },
      );

      it.skipIf(ex.kind === 'blocks')(
        'элементы лежат в пределах доски и не наезжают друг на друга',
        () => {
          const gates = circuitOf(guide).gates;
          for (const g of gates) {
            expect(g.x, `${key}: ${g.id}`).toBeGreaterThanOrEqual(GATE_MIN_X);
            expect(g.x).toBeLessThanOrEqual(GATE_MAX_X);
            expect(g.y).toBeGreaterThanOrEqual(GATE_MIN_Y);
            expect(g.y).toBeLessThanOrEqual(GATE_MAX_Y);
            expect(g.x + GATE_W).toBeLessThan(BOARD_W);
            expect(g.y + GATE_H).toBeLessThan(BOARD_H);
          }
          for (let i = 0; i < gates.length; i++) {
            for (let j = i + 1; j < gates.length; j++) {
              const [a, b] = [gates[i], gates[j]];
              const overlap = Math.abs(a.x - b.x) < GATE_W + 14 && Math.abs(a.y - b.y) < GATE_H + 4;
              expect(overlap, `${key}: ${a.id} и ${b.id} слишком близко`).toBe(false);
            }
          }
        },
      );

      if (ex.mode === 'steps') {
        it('шаги сценария выполняются по порядку и с теми же тумблерами', () => {
          const done: number[] = [];
          for (const s of guide.steps) {
            if (s.completes === undefined) continue;
            done.push(s.completes);
            const want = ex.steps![s.completes];
            const acts = s.do as GuideAction[];
            const pulse = acts.find((a) => 'pulse' in a);
            const set = acts.find((a) => 'set' in a);
            if (ex.ticks) {
              if (want.inputs[ex.clock!] === 1) {
                expect(pulse, `${key}: шаг ${s.completes}`).toBeDefined();
                expect('pulse' in pulse! && (pulse.pulse === true ? 1 : pulse.pulse)).toBe(
                  want.pulses ?? 1,
                );
              } else {
                expect(pulse, `${key}: шаг ${s.completes} без такта`).toBeUndefined();
              }
              for (const id of ex.inputs) {
                if (id === ex.clock) continue;
                expect(set && 'set' in set ? set.set[id] : undefined, `${key}: ${id}`).toBe(
                  want.inputs[id],
                );
              }
            } else {
              for (const id of ex.inputs) {
                expect(set && 'set' in set ? set.set[id] : undefined, `${key}: ${id}`).toBe(
                  want.inputs[id],
                );
              }
            }
          }
          expect(done).toEqual(ex.steps!.map((_, i) => i));
        });
      }

      it(`разбор проходится в упражнении до решения (${section.slug})`, () => {
        vi.useFakeTimers();
        try {
          localStorage.clear();
          if (ex.kind === 'blocks') seedSolutions();
          TestBed.resetTestingModule();
          TestBed.configureTestingModule({ providers: [provideRouter([])] });
          TestBed.inject(GuideSession).auto.set(false);
          const f = TestBed.createComponent(CircuitLab);
          f.componentRef.setInput('section', section);
          f.componentRef.setInput('startExercise', ex.id);
          f.detectChanges();
          const el = f.nativeElement as HTMLElement;
          const find = (root: ParentNode, text: string) =>
            [...root.querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as
              HTMLButtonElement | undefined;
          find(el, 'Режим авто')!.click();
          f.detectChanges();
          const player = () => el.querySelector('app-guide-player')!;
          for (let i = 1; i < guide.steps.length; i++) {
            find(player(), 'Вперёд')!.click();
            f.detectChanges();
            // импульсы такта идут по-настоящему, с паузами
            for (let t = 0; t < 40; t++) {
              vi.advanceTimersByTime(700);
              f.detectChanges();
              if (!find(player(), 'Вперёд')?.disabled) break;
            }
          }
          expect(player().textContent, key).toContain('Что вы узнали');
          expect(player().querySelector('.badge-success'), `${key}: решено`).toBeTruthy();
        } finally {
          vi.useRealTimers();
        }
      });
    });
  }
});

describe('режим авто: переходы и кнопки', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(GuideSession).auto.set(false);
  });

  function lab(slug: string, exerciseId: string) {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === slug),
    );
    f.componentRef.setInput('startExercise', exerciseId);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const click = (text: string) => {
      const b = [...el.querySelectorAll('button')].find((x) => x.textContent!.includes(text))!;
      expect(b, text).toBeTruthy();
      b.click();
      f.detectChanges();
    };
    return { f, el, click };
  }

  it('«Вперёд» строит решение шаг за шагом, «Назад» откатывает', () => {
    const { el, click } = lab('simple-circuits', 'and');
    click('Режим авто');
    const player = () => el.querySelector('app-guide-player')!;
    expect(player().textContent).toContain('Что мы строим');
    expect(el.querySelectorAll('.gate').length).toBe(0);
    click('Вперёд');
    expect(el.querySelectorAll('.gate').length).toBe(1);
    click('Вперёд');
    click('Вперёд');
    expect(el.querySelectorAll('.wire').length).toBe(2);
    click('Назад');
    expect(el.querySelectorAll('.wire').length).toBe(1);
    click('Назад');
    click('Назад');
    expect(el.querySelectorAll('.gate').length).toBe(0);
    expect(el.querySelectorAll('.wire').length).toBe(0);
  });

  it('«Выйти» оставляет схему на доске и выключает режим для следующих упражнений', () => {
    const { el, click } = lab('simple-circuits', 'and');
    click('Режим авто');
    click('Вперёд');
    click('Вперёд');
    click('Выйти');
    expect(el.querySelector('app-guide-player')).toBeNull();
    expect(el.querySelectorAll('.gate').length).toBe(1);
    expect(TestBed.inject(GuideSession).auto()).toBe(false);
  });

  it('на последнем шаге «Вперёд» становится «Следующее упражнение» и ведёт к следующему', async () => {
    const { f, el, click } = lab('simple-circuits', 'wire');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    click('Режим авто');
    const player = () => el.querySelector('app-guide-player')!;
    const btn = () =>
      [...player().querySelectorAll('button')].find(
        (b) => b.textContent!.includes('Вперёд') || b.textContent!.includes('Следующее упражнение'),
      ) as HTMLButtonElement;
    const total = guideFor('simple-circuits', 'wire')!.steps.length;
    for (let i = 1; i < total; i++) click('Вперёд');
    expect(btn().textContent).toContain('Следующее упражнение');
    expect(btn().disabled).toBe(false);
    btn().click();
    f.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/', 'simple-circuits', 'not']);
  });

  it('режим авто переносится на следующее упражнение', () => {
    const { f, el, click } = lab('simple-circuits', 'wire');
    click('Режим авто');
    expect(TestBed.inject(GuideSession).auto()).toBe(true);
    // адрес сменился на следующее упражнение (как после перехода)
    f.componentRef.setInput('startExercise', 'not');
    f.detectChanges();
    f.detectChanges();
    expect(el.querySelector('app-guide-player')).toBeTruthy();
    expect(el.querySelector('app-guide-player')!.textContent).toContain('Что мы строим');
    expect(el.querySelector('.card-title')).toBeTruthy();
    expect(el.querySelectorAll('.gate').length).toBe(0);
  });

  /** Дойти до последнего шага разбора и вернуть кнопку «Следующее упражнение» */
  function lastStep(slug: string, id: string) {
    const { f, el, click } = lab(slug, id);
    click('Режим авто');
    const total = guideFor(slug, id)!.steps.length;
    const fwd = () =>
      [...el.querySelectorAll('app-guide-player button')].find(
        (b) =>
          b.textContent!.includes('Вперёд') ||
          b.textContent!.includes('Следующее упражнение') ||
          b.textContent!.includes('конец курса'),
      ) as HTMLButtonElement;
    vi.useFakeTimers();
    try {
      for (let i = 1; i < total; i++) {
        fwd().click();
        f.detectChanges();
        for (let t = 0; t < 40 && fwd().disabled; t++) {
          vi.advanceTimersByTime(700);
          f.detectChanges();
        }
      }
    } finally {
      vi.useRealTimers();
    }
    return { f, el, fwd };
  }

  it('после последнего упражнения раздела «Следующее» ведёт в первое упражнение следующего', () => {
    const last = SECTIONS[0].exercises.at(-1)!;
    const { f, fwd } = lastStep(SECTIONS[0].slug, last.id);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(fwd().textContent).toContain('Следующее упражнение');
    fwd().click();
    f.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/', SECTIONS[1].slug, SECTIONS[1].exercises[0].id]);
  });

  it('после сборки процессора «Следующее» ведёт в первое задание по ассемблеру', () => {
    seedSolutions();
    const cpu = SECTIONS.find((s) => s.slug === 'cpu')!;
    const { f, fwd } = lastStep('cpu', cpu.exercises.at(-1)!.id);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(fwd().disabled).toBe(false);
    expect(fwd().textContent).toContain('Следующее упражнение');
    fwd().click();
    f.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/', 'asm', 'patch-byte']);
  });

  it('без решений предыдущих упражнений разбор «из блоков» не стартует и объясняет почему', () => {
    const { el, click } = lab('cpu', 'decode-bus');
    click('Режим авто');
    expect(el.querySelector('app-guide-player')).toBeNull();
    expect(el.textContent).toContain('нужны блоки из предыдущих упражнений');
  });
});
