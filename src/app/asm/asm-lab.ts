import { Component, computed, effect, signal, untracked } from '@angular/core';
import { AsmResult, assemble } from './assembler';
import { OPS, PSEUDO, REG_COUNT, fields } from './isa';
import { Machine, MachineView } from './machine';
import { AsmTask, CheckResult, TASKS, hex } from './tasks';

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
@Component({
  selector: 'app-asm-lab',
  templateUrl: './asm-lab.html',
  styleUrl: './asm-lab.css',
})
export class AsmLab {
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

  protected readonly task = computed<AsmTask>(() => TASKS[this.index()]);
  protected readonly source = computed(() => this.codes()[this.task().id] ?? this.task().starter);
  protected readonly asm = computed<AsmResult>(() => assemble(this.source()));

  /** Любое действие с машиной увеличивает счётчик — так интерфейс узнаёт об изменениях */
  private readonly version = signal(0);
  private readonly resets = signal(0);

  /** Новая машина — после любой правки программы, смены задания или «Сбросить» */
  private readonly machine = computed<Machine | null>(() => {
    this.resets();
    const a = this.asm();
    return a.errors.length > 0 ? null : new Machine(a.words, this.task().disk);
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

  protected selectTask(i: number): void {
    if (i === this.index()) return;
    this.index.set(i);
    this.hintShown.set(false);
    this.solutionShown.set(false);
    this.selectedLine.set(null);
    this.save();
  }

  protected step(): void {
    this.machine()?.step();
    this.version.update((n) => n + 1);
  }

  protected run(): void {
    this.machine()?.run(RUN_LIMIT);
    this.version.update((n) => n + 1);
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
