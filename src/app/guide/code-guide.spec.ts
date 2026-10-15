import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AsmLab } from '../asm/asm-lab';
import { RvLab } from '../riscv/rv-lab';
import { CHAPTERS, nextInCourse } from '../pages/chapters/chapters';
import { codeGuideFor } from './code-registry';
import { GuideSession } from './guide-session';
import { TASKS as ASM_TASKS } from '../asm/tasks';
import { REAL_TASKS } from '../riscv/rv-real-tasks';
import { RV_TASKS } from '../riscv/rv-tasks';

const programChapters = CHAPTERS.filter((c) => c.kind !== 'circuit');

describe('режим авто для программ: разборы', () => {
  it('разбор есть у каждого задания по программированию', () => {
    const missing = programChapters.flatMap((c) =>
      c.exercises.filter((e) => !codeGuideFor(c.slug, e.id)).map((e) => `${c.slug}/${e.id}`),
    );
    expect(missing).toEqual([]);
  });

  for (const c of programChapters) {
    for (const e of c.exercises) {
      it(`${c.slug}/${e.id}: части дают в сумме эталонное решение, тексты не пустые`, () => {
        const g = codeGuideFor(c.slug, e.id)!;
        const code = g.steps.map((s) => s.append ?? '').join('');
        const solution = (
          c.slug === 'asm' ? ASM_TASKS : c.slug === 'riscv' ? RV_TASKS : REAL_TASKS
        ).find((t) => t.id === e.id)!.solution;
        expect(code).toBe(solution.replace(/\n+$/, '') + '\n');
        for (const s of g.steps) {
          expect(s.title.length, `${e.id}: заголовок`).toBeGreaterThan(2);
          expect(s.text.length, `${e.id}: «${s.title}»`).toBeGreaterThan(40);
        }
        // вступление и итог ничего не делают с программой; запуски идут после кода
        expect(g.steps[0].append).toBeUndefined();
        expect(g.steps.at(-1)!.run).toBeUndefined();
        const lastAppend = g.steps.map((s) => s.append !== undefined).lastIndexOf(true);
        const firstRun = g.steps.findIndex((s) => s.run !== undefined);
        expect(firstRun).toBeGreaterThan(lastAppend);
        expect(g.steps.some((s) => s.run === 'end')).toBe(true);
      });
    }
  }

  it('дальше по курсу: схемы → ассемблер → RISC-V → реальная сборка → конец', () => {
    expect(nextInCourse('cpu', 'cpu')).toEqual({ slug: 'asm', id: ASM_TASKS[0].id });
    expect(nextInCourse('asm', ASM_TASKS.at(-1)!.id)).toEqual({
      slug: 'riscv',
      id: RV_TASKS[0].id,
    });
    expect(nextInCourse('riscv', RV_TASKS.at(-1)!.id)).toEqual({
      slug: 'real',
      id: REAL_TASKS[0].id,
    });
    expect(nextInCourse('real', REAL_TASKS.at(-1)!.id)).toBeNull();
  });
});

describe('режим авто для программ: в лаборатории', () => {
  beforeEach(() => localStorage.clear());

  function lab(slug: 'asm' | 'riscv' | 'real', id: string) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: slug === 'real' ? { mode: 'real' } : {} },
            paramMap: of(convertToParamMap({ exercise: id })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    TestBed.inject(GuideSession).auto.set(false);
    const f = (
      slug === 'asm' ? TestBed.createComponent(AsmLab) : TestBed.createComponent(RvLab)
    ) as ComponentFixture<unknown>;
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const find = (root: ParentNode, text: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as
        HTMLButtonElement | undefined;
    return { f, el, find };
  }

  for (const c of programChapters) {
    for (const e of c.exercises) {
      it(`${c.slug}/${e.id}: разбор проходится до «решено»`, () => {
        const { f, el, find } = lab(c.slug as 'asm', e.id);
        // свой код пользователя на месте до включения режима
        find(el, 'Режим авто')!.click();
        f.detectChanges();
        const player = () => el.querySelector('app-guide-player')!;
        const total = codeGuideFor(c.slug, e.id)!.steps.length;
        for (let i = 1; i < total; i++) {
          find(player(), 'Вперёд')!.click();
          f.detectChanges();
        }
        expect(player().textContent, e.id).toContain('Что вы узнали');
        expect(player().querySelector('.badge-success'), `${e.id}: решено`).toBeTruthy();
      });
    }
  }

  it('«Назад» откатывает код, а «Выйти» возвращает ваш текст', () => {
    const task = ASM_TASKS[0];
    const { f, el, find } = lab('asm', task.id);
    const editor = () => el.querySelector('textarea.editor') as HTMLTextAreaElement;
    // пользователь успел что-то написать
    editor().value = '  li r1, 5\n  hlt\n';
    editor().dispatchEvent(new Event('input'));
    f.detectChanges();

    find(el, 'Режим авто')!.click();
    f.detectChanges();
    expect(editor().value).toBe('');
    expect(editor().readOnly).toBe(true);
    const player = () => el.querySelector('app-guide-player')!;
    find(player(), 'Вперёд')!.click(); // первая часть
    f.detectChanges();
    const first = codeGuideFor('asm', task.id)!.steps[1].append!;
    expect(editor().value).toBe(first);
    find(player(), 'Вперёд')!.click();
    f.detectChanges();
    expect(editor().value.length).toBeGreaterThan(first.length);
    find(player(), 'Назад')!.click();
    f.detectChanges();
    expect(editor().value).toBe(first);

    find(player(), 'Выйти')!.click();
    f.detectChanges();
    expect(el.querySelector('app-guide-player')).toBeNull();
    expect(editor().value).toBe('  li r1, 5\n  hlt\n');
    expect(editor().readOnly).toBe(false);
    expect(TestBed.inject(GuideSession).auto()).toBe(false);
  });

  it('на последнем шаге «Следующее» ведёт к следующему заданию курса', () => {
    const task = ASM_TASKS.at(-1)!;
    const { f, el, find } = lab('asm', task.id);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    find(el, 'Режим авто')!.click();
    f.detectChanges();
    const total = codeGuideFor('asm', task.id)!.steps.length;
    for (let i = 1; i < total; i++) {
      find(el.querySelector('app-guide-player')!, 'Вперёд')!.click();
      f.detectChanges();
    }
    find(el.querySelector('app-guide-player')!, 'Следующее упражнение')!.click();
    expect(navigate).toHaveBeenCalledWith(['/', 'riscv', RV_TASKS[0].id]);
  });

  it('в самом последнем задании курса кнопка «следующее» недоступна', () => {
    const task = REAL_TASKS.at(-1)!;
    const { f, el, find } = lab('real', task.id);
    find(el, 'Режим авто')!.click();
    f.detectChanges();
    const total = codeGuideFor('real', task.id)!.steps.length;
    for (let i = 1; i < total; i++) {
      find(el.querySelector('app-guide-player')!, 'Вперёд')!.click();
      f.detectChanges();
    }
    const end = find(el.querySelector('app-guide-player')!, 'конец курса')!;
    expect(end.disabled).toBe(true);
  });

  it('программа считается решённой после разбора и запоминается', () => {
    const task = ASM_TASKS[0];
    const { f, el, find } = lab('asm', task.id);
    find(el, 'Режим авто')!.click();
    f.detectChanges();
    const total = codeGuideFor('asm', task.id)!.steps.length;
    for (let i = 1; i < total; i++) {
      find(el.querySelector('app-guide-player')!, 'Вперёд')!.click();
      f.detectChanges();
    }
    const saved = JSON.parse(localStorage.getItem('processor-asm-v1')!) as { solved: string[] };
    expect(saved.solved).toContain(task.id);
  });
});

describe('«Отметить решённым»', () => {
  beforeEach(() => localStorage.clear());

  it('в лаборатории программ задание засчитывается вручную и запоминается', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {} },
            paramMap: of(convertToParamMap({ exercise: ASM_TASKS[2].id })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    const f = TestBed.createComponent(AsmLab);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const btn = () =>
      [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Отметить решённым'));
    expect(btn()).toBeTruthy();
    btn()!.click();
    f.detectChanges();
    expect(btn()).toBeUndefined();
    expect(el.querySelectorAll('.step-chip.solved').length).toBe(1);
    const saved = JSON.parse(localStorage.getItem('processor-asm-v1')!) as { solved: string[] };
    expect(saved.solved).toEqual([ASM_TASKS[2].id]);
  });
});
