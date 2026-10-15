import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { touchProgress } from '../nav/progress';
import { AsmResult, assemble } from './assembler';
import { OPS, PSEUDO, REG_COUNT, fields } from './isa';
import { CpuInspector } from '../cpu8/cpu-inspector';
import { GateMachine } from '../cpu8/gate-machine';
import { Machine, MachineView } from './machine';
import { AsmTask, CheckResult, TASKS, hex } from './tasks';
import { GuidePlayer } from '../guide/guide-player';
import { GuideSession } from '../guide/guide-session';
import { CodeGuideController, CodeGuideHost, traceRun } from '../guide/code-guide';
import { codeGuideFor } from '../guide/code-registry';
import { CHAPTERS, nextInCourse } from '../pages/chapters/chapters';
import { confirmMarkChapter } from '../progress/mark-solved';

const STORAGE_KEY = 'processor-asm-v1';
const RUN_LIMIT = 100_000;

interface Saved {
  codes: Record<string, string>;
  solved: string[];
  current: number;
}

interface Cell {
  addr: number;
  hex: string;
  char: string;
  changed: boolean;
  written: boolean;
  read: boolean;
  region: number;
}

/** Страница «Ассемблер»: пишем программу на языке процессора Мини-8 и запускаем её на виртуальном диске */
/** Что умеет и эмулятор, и процессор на вентилях */
type Runner = Machine | GateMachine;

@Component({
  selector: 'app-asm-lab',
  imports: [CpuInspector, GuidePlayer],
  templateUrl: './asm-lab.html',
  styleUrl: './asm-lab.css',
})
export class AsmLab {
  private readonly route = inject(ActivatedRoute);
  protected readonly tasks = TASKS;
  protected readonly ops = OPS;
  protected readonly pseudo = PSEUDO;
  protected readonly regNames = Array.from({ length: REG_COUNT }, (_, i) => `r${i}`);

  protected readonly index = signal(0);
  protected readonly codes = signal<Record<string, string>>({});
  protected readonly solved = signal<ReadonlySet<string>>(new Set());
  protected readonly hintShown = signal(false);
  protected readonly solutionShown = signal(false);
  protected readonly selectedLine = signal<number | null>(null);
  /** Чем выполнять: быстрой программой-эмулятором или настоящей схемой из вентилей */
  protected readonly engine = signal<'emu' | 'gates'>('emu');

  protected readonly task = computed<AsmTask>(() => TASKS[this.index()]);
  /** Текст, который печатает режим авто; пока он есть, он заменяет ваш код (ваш не трогаем) */
  protected readonly guideCode = signal<string | null>(null);
  protected readonly source = computed(
    () => this.guideCode() ?? this.codes()[this.task().id] ?? this.task().starter,
  );
  protected readonly asm = computed<AsmResult>(() => assemble(this.source()));

  /** Любое действие с машиной увеличивает счётчик — так интерфейс узнаёт об изменениях */
  protected readonly version = signal(0);
  private readonly resets = signal(0);

  /** Новая машина — после любой правки программы, смены задания, движка или «Сбросить» */
  private readonly machine = computed<Runner | null>(() => {
    this.resets();
    const a = this.asm();
    if (a.errors.length > 0) return null;
    return this.engine() === 'gates'
      ? new GateMachine(a.words, this.task().disk)
      : new Machine(a.words, this.task().disk);
  });

  /** Схема процессора — только когда выбран режим «из вентилей» */
  protected readonly gateMachine = computed(() => {
    const m = this.machine();
    return m instanceof GateMachine ? m : null;
  });

  protected readonly view = computed<MachineView | null>(() => {
    this.version();
    return this.machine()?.view() ?? null;
  });

  /** Итог: появляется, когда программа остановилась */
  protected readonly result = computed<CheckResult | null>(() => {
    const v = this.view();
    if (!v) return null;
    if (v.error) return { ok: false, message: v.error };
    return v.halted ? this.task().check(v.mem) : null;
  });

  protected readonly canStep = computed(() => {
    const v = this.view();
    return !!v && !v.halted && !v.error;
  });

  protected readonly listing = computed(() => {
    const pc = this.view()?.pc ?? -1;
    return this.asm().lines.map((l) => ({
      ...l,
      bits: fields(l.word),
      wordHex: l.word.toString(16).padStart(4, '0'),
      current: l.addr === pc,
    }));
  });

  protected readonly grid = computed<{ addr: number; cells: Cell[] }[]>(() => {
    const v = this.view();
    const t = this.task();
    const mem = v?.mem ?? t.disk;
    const region = (i: number) => t.regions.findIndex((r) => i >= r.from && i < r.from + r.length);
    return Array.from({ length: 16 }, (_, row) => ({
      addr: row * 16,
      cells: Array.from({ length: 16 }, (_, col) => {
        const addr = row * 16 + col;
        const b = mem[addr];
        return {
          addr,
          hex: b.toString(16).toUpperCase().padStart(2, '0'),
          char: b >= 32 && b < 127 ? String.fromCharCode(b) : '·',
          changed: b !== t.disk[addr],
          written: v?.lastWrite === addr,
          read: v?.lastRead === addr,
          region: region(addr),
        };
      }),
    }));
  });

  protected readonly regionHex = hex;

  private readonly solvedEffect = effect(() => {
    const r = this.result();
    const id = this.task().id;
    if (r?.ok && !untracked(this.solved).has(id)) {
      this.solved.update((s) => new Set(s).add(id));
      untracked(() => this.save());
    }
  });

  /** Адрес /<глава>/<задание>: какое задание открыто, определяет адрес */
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly taskParamEffect = effect(() => {
    const id = this.params().get('exercise');
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i < 0 || i === untracked(this.index)) return;
    untracked(() => {
      this.index.set(i);
      this.hintShown.set(false);
      this.solutionShown.set(false);
      this.selectedLine.set(null);
      this.save();
    });
  });

  /* ---------- режим авто ---------- */
  private readonly session = inject(GuideSession);
  protected readonly guide = computed(() => codeGuideFor('asm', this.task().id));
  private readonly guideHost: CodeGuideHost = {
    guide: () => this.guide(),
    setCode: (code) => this.guideCode.set(code),
    resetMachine: () => this.resets.update((n) => n + 1),
    exec: (n) => {
      const m = this.machine();
      if (!m) return ['Программа пока не собирается: проверьте текст.'];
      const listing = this.asm().lines;
      const lines = traceRun(m, n, {
        insnAt: (pc) => listing.find((l) => l.addr === pc)?.text ?? '?',
        regName: (i) => `r${i}`,
        fmtReg: (v) => `${v} (0x${v.toString(16).toUpperCase().padStart(2, '0')})`,
        fmtAddr: (a) => `0x${a.toString(16).toUpperCase().padStart(2, '0')}`,
        fmtPc: (pc) => String(pc),
        fmtByte: (v) => `${v} (0x${v.toString(16).toUpperCase().padStart(2, '0')})`,
        insnSize: 1,
      });
      this.version.update((v) => v + 1);
      return lines;
    },
    next: () => nextInCourse('asm', this.task().id),
    go: (to) => void this.router.navigate(['/', to.slug, to.id]),
  };
  protected readonly gc = new CodeGuideController(this.guideHost, this.session);

  /** Режим авто «залипает»: пока он включён, каждое задание открывается в нём */
  private readonly guideSyncEffect = effect(() => {
    this.task();
    const want = this.session.auto();
    const available = this.guide() !== null;
    untracked(() => {
      if (want && available) this.gc.begin();
      else this.gc.stop();
    });
  });

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Saved> | null;
      if (raw) {
        this.codes.set(raw.codes ?? {});
        this.solved.set(new Set(raw.solved ?? []));
        if (typeof raw.current === 'number' && raw.current >= 0 && raw.current < TASKS.length) {
          this.index.set(raw.current);
        }
      }
    } catch {
      // нет сохранения — начинаем с нуля
    }
  }

  private save(): void {
    try {
      const data: Saved = {
        codes: this.codes(),
        solved: [...this.solved()],
        current: this.index(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage недоступен — прогресс не сохранится
    }
    touchProgress();
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.codes.update((c) => ({ ...c, [this.task().id]: text }));
    this.selectedLine.set(null);
    this.save();
  }

  /** Tab в редакторе вставляет отступ, а не уходит с поля */
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const el = event.target as HTMLTextAreaElement;
    const { selectionStart: s, selectionEnd: e, value } = el;
    el.value = `${value.slice(0, s)}  ${value.slice(e)}`;
    el.selectionStart = el.selectionEnd = s + 2;
    el.dispatchEvent(new Event('input'));
  }

  /** Переход к заданию — это переход по адресу; состояние сменит taskParamEffect */
  protected selectTask(i: number): void {
    if (i === this.index()) return;
    void this.router.navigate(['/', 'asm', this.tasks[i].id]);
  }

  protected step(): void {
    this.machine()?.step();
    this.version.update((n) => n + 1);
  }

  protected run(): void {
    this.machine()?.run(RUN_LIMIT);
    this.version.update((n) => n + 1);
  }

  /** Все задания главы решены — кнопка «Отметить решённым» больше не нужна */
  protected readonly chapterSolved = computed(() => this.solved().size >= this.tasks.length);

  /** Кто уже знает материал, засчитывает всю главу разом */
  protected markChapterSolved(): void {
    const title = CHAPTERS.find((c) => c.slug === 'asm')?.title ?? '';
    if (!confirmMarkChapter(title, this.tasks.length)) return;
    this.solved.set(new Set(this.tasks.map((t) => t.id)));
    this.save();
  }

  protected reset(): void {
    this.resets.update((n) => n + 1);
  }

  protected showSolution(): void {
    if (!confirm('Показать эталонное решение? Ваш текущий код будет заменён.')) return;
    this.codes.update((c) => ({ ...c, [this.task().id]: this.task().solution }));
    this.solutionShown.set(true);
    this.save();
  }

  protected restoreStarter(): void {
    this.codes.update((c) => ({ ...c, [this.task().id]: this.task().starter }));
    this.save();
  }

  /** Классы ячейки диска: область, изменён, прочитан, записан */
  protected cellClass(c: Cell): string {
    return [
      'cell',
      c.region >= 0 ? `rg${c.region}` : '',
      c.changed ? 'changed' : '',
      c.read ? 'read' : '',
      c.written ? 'written' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  protected hexByte(n: number): string {
    return n.toString(16).toUpperCase().padStart(2, '0');
  }
}
