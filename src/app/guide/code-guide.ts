import { computed, signal } from '@angular/core';
import { GuideSession } from './guide-session';

/**
 * Режим авто для программ: «печатает» решение по частям с объяснением,
 * затем запускает его, показывая, что сделала каждая команда.
 */
export interface CodeGuideStep {
  title: string;
  text: string;
  /** Что дописать в программу (целые строки) */
  append?: string;
  /** Сколько команд выполнить на этом шаге (или до остановки) */
  run?: number | 'end';
}

export interface CodeGuide {
  steps: readonly CodeGuideStep[];
}

export interface CodePart {
  title: string;
  text: string;
  /** сколько строк решения входит в этот шаг */
  lines: number;
}

export interface CodeRun {
  title: string;
  text: string;
  run: number | 'end';
}

export interface CodeSpec {
  /** Идея решения — для вступления */
  idea: string;
  parts: readonly CodePart[];
  /** Шаги выполнения; без них — «первые команды» и «до конца» */
  runs?: readonly CodeRun[];
  outro: string;
}

export interface CodeTaskInfo {
  title: string;
  /** условие */
  text: string;
  /** эталонное решение */
  solution: string;
}

const DEFAULT_RUNS: readonly CodeRun[] = [
  {
    title: 'Запускаем: первые команды',
    text: 'Программа написана целиком. Смотрим, как она работает: ниже — первые команды и то, что каждая из них изменила (регистры, память, вывод).',
    run: 8,
  },
  {
    title: 'Выполняем до конца',
    text: 'Остальное процессор выполнит сам. Нажмите «Вперёд»: он дойдёт до остановки, а проверка сравнит результат с условием задания.',
    run: 'end',
  },
];

/** Режем эталонное решение на части по числу строк; сумма строк должна совпасть */
export function buildCodeGuide(task: CodeTaskInfo, spec: CodeSpec): CodeGuide {
  const lines = task.solution.replace(/\n+$/, '').split('\n');
  const total = spec.parts.reduce((n, p) => n + p.lines, 0);
  if (total !== lines.length) {
    throw new Error(
      `Разбор «${task.title}»: части покрывают ${total} строк, а в решении ${lines.length}`,
    );
  }
  let at = 0;
  const steps: CodeGuideStep[] = [
    { title: 'Что нужно сделать', text: `${task.text}\n\n**Идея решения.** ${spec.idea}` },
  ];
  for (const p of spec.parts) {
    steps.push({
      title: p.title,
      text: p.text,
      append: lines.slice(at, at + p.lines).join('\n') + '\n',
    });
    at += p.lines;
  }
  for (const r of spec.runs ?? DEFAULT_RUNS)
    steps.push({ title: r.title, text: r.text, run: r.run });
  steps.push({ title: 'Что вы узнали', text: spec.outro });
  return { steps };
}

/* ============================================================
   Журнал выполнения
   ============================================================ */

/** Что нужно знать о машине, чтобы описать ход выполнения */
export interface TraceMachine {
  readonly running: boolean;
  step(): void;
  view(): {
    regs: number[];
    pc: number;
    mem: Uint8Array;
    halted: boolean;
    error: string | null;
    steps: number;
    lastWrite: number | null;
    uart?: string;
  };
}

export interface TraceAdapter {
  /** текст команды по адресу pc (из листинга) */
  insnAt(pc: number): string;
  regName(i: number): string;
  /** запись значения регистра */
  fmtReg(value: number): string;
  /** запись адреса в памяти */
  fmtAddr(addr: number): string;
  /** запись счётчика команд */
  fmtPc(pc: number): string;
  /** запись байта в память */
  fmtByte(value: number): string;
  /** Сколько адресов занимает команда (1 для Мини-8, 4 для RISC-V) */
  insnSize: number;
}

const MAX_TRACE = 12;

/**
 * Выполнить n команд (или до конца) и описать по строке на команду.
 * Показываем первые MAX_TRACE команд подробно, остальное — одной строкой.
 */
export function traceRun(
  m: TraceMachine,
  n: number | 'end',
  a: TraceAdapter,
  limit = 200_000,
): string[] {
  const lines: string[] = [];
  let done = 0;
  const cap = n === 'end' ? limit : n;
  while (done < cap && m.running) {
    if (done < MAX_TRACE) {
      // подробно описываем только первые команды: копировать память на каждом шаге дорого
      const before = m.view();
      m.step();
      done++;
      const after = m.view();
      const effects: string[] = [];
      after.regs.forEach((v, i) => {
        if (v !== before.regs[i]) effects.push(`${a.regName(i)} = ${a.fmtReg(v)}`);
      });
      if (after.lastWrite !== null && after.mem[after.lastWrite] !== before.mem[after.lastWrite]) {
        effects.push(
          `память[${a.fmtAddr(after.lastWrite)}] = ${a.fmtByte(after.mem[after.lastWrite])}`,
        );
      }
      if (after.uart !== undefined && after.uart.length > (before.uart ?? '').length) {
        effects.push(`в консоль: ${JSON.stringify(after.uart.slice((before.uart ?? '').length))}`);
      }
      if (!after.halted && !after.error && after.pc !== before.pc + a.insnSize) {
        effects.push(`переход на ${a.fmtPc(after.pc)}`);
      }
      if (after.halted) effects.push('остановка');
      lines.push(
        `${a.fmtPc(before.pc).padStart(4)}  ${a.insnAt(before.pc).padEnd(24)} ${effects.length ? '→ ' + effects.join(', ') : '→ без изменений'}`,
      );
    } else {
      m.step();
      done++;
    }
  }
  if (done > MAX_TRACE) lines.push(`… и ещё ${done - MAX_TRACE} команд(ы)`);
  const end = m.view();
  if (n === 'end') {
    lines.push(
      end.error ? `Остановка с ошибкой: ${end.error}` : `Готово: выполнено команд — ${end.steps}.`,
    );
  }
  return lines;
}

/* ============================================================
   Контроллер режима
   ============================================================ */

/** Что лаборатория умеет для режима авто */
export interface CodeGuideHost {
  guide(): CodeGuide | null;
  /** подставить текст программы пользователя вместо сохранённого (null — вернуть своё) */
  setCode(code: string | null): void;
  /** новая машина: всё с начала */
  resetMachine(): void;
  /** выполнить и вернуть журнал */
  exec(n: number | 'end'): string[];
  /** ссылка на следующее задание курса (null — конец) */
  next(): { slug: string; id: string } | null;
  go(to: { slug: string; id: string }): void;
}

export class CodeGuideController {
  readonly on = signal(false);
  readonly pos = signal(0);
  readonly cardOpen = signal(true);
  readonly log = signal<readonly string[]>([]);

  readonly step = computed(() => {
    this.pos();
    return this.host.guide()?.steps[this.pos()] ?? null;
  });

  constructor(
    private readonly host: CodeGuideHost,
    private readonly session: GuideSession,
  ) {}

  /** Кнопка «Режим авто» */
  start(): void {
    if (!this.host.guide()) return;
    this.session.auto.set(true);
    this.begin();
  }

  /** Автозапуск при переходе к следующему заданию в режиме авто */
  begin(): void {
    this.code = '';
    this.host.setCode('');
    this.host.resetMachine();
    this.pos.set(0);
    this.log.set([]);
    this.cardOpen.set(true);
    this.on.set(true);
  }

  /** «Выйти»: режим выключается и для следующих заданий; ваш код возвращается на место */
  leave(): void {
    this.session.auto.set(false);
    this.stop();
  }

  stop(): void {
    if (!this.on()) return;
    this.on.set(false);
    this.log.set([]);
    this.host.setCode(null);
    this.host.resetMachine();
  }

  next(): void {
    const g = this.host.guide();
    if (!g || this.pos() >= g.steps.length - 1) return;
    const i = this.pos() + 1;
    this.pos.set(i);
    this.cardOpen.set(true);
    this.apply(i, true);
  }

  prev(): void {
    if (this.pos() > 0) this.jump(this.pos() - 1);
  }

  jump(target: number): void {
    const g = this.host.guide();
    if (!g) return;
    const n = Math.max(0, Math.min(target, g.steps.length - 1));
    if (n === this.pos() && this.on()) return;
    this.host.setCode('');
    this.host.resetMachine();
    this.log.set([]);
    this.code = '';
    for (let i = 1; i <= n; i++) this.apply(i, false);
    this.pos.set(n);
    this.cardOpen.set(true);
  }

  hasNext(): boolean {
    return this.host.next() !== null;
  }

  goNext(): void {
    const to = this.host.next();
    if (to) this.host.go(to);
  }

  private code = '';

  private apply(i: number, live: boolean): void {
    const st = this.host.guide()!.steps[i];
    if (i === 0) this.code = '';
    if (st.append) {
      this.code += st.append;
      this.host.setCode(this.code);
    }
    if (st.run !== undefined) {
      const lines = this.host.exec(st.run);
      this.log.set(lines);
    } else {
      this.log.set([]);
    }
  }
}
