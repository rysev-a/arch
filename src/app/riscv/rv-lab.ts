import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { touchProgress } from '../nav/progress';
import { ABI_NAMES, OPS, PSEUDO, disassemble, fieldsOf } from './rv-isa';
import { AsmResult, STACK_TOP, assemble } from './rv-asm';
import { MMIO_MAP, RvMachine, RvView } from './rv-machine';
import { CheckResult, RV_TASKS, RvTask, fullSource } from './rv-tasks';
import { REAL_TASKS } from './rv-real-tasks';
import { ProjectFile, projectFiles, projectZip } from './rv-project';
import { makeZip } from './zip';
import { GuidePlayer } from '../guide/guide-player';
import { GuideSession } from '../guide/guide-session';
import { CodeGuideController, CodeGuideHost, traceRun } from '../guide/code-guide';
import { codeGuideFor } from '../guide/code-registry';
import { nextInCourse } from '../pages/chapters/chapters';
import { ConfirmService } from '../ui/confirm.service';
import { DashProgress } from '../ui/dash-progress';
import { HintPopover } from '../ui/hint-popover';

const STORAGE_KEY = 'processor-riscv-v1';
const STORAGE_KEY_REAL = 'processor-riscv-real-v1';
const RUN_LIMIT = 200_000;

interface Saved {
  codes: Record<string, string>;
  solved: string[];
  current: number;
}

interface Cell {
  addr: number;
  hex: string;
  char: string;
  read: boolean;
  written: boolean;
}

interface MemWindow {
  id: string;
  title: string;
  from: number;
}

const hex8 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');

/**
 * Страница «RISC-V»: настоящие 32-битные команды на «мягком» процессоре с памятью и периферией.
 * В режиме real (маршрут /real) — целые настоящие программы, которые можно собрать у себя.
 */
@Component({
  selector: 'app-rv-lab',
  imports: [GuidePlayer, DashProgress, HintPopover],
  templateUrl: './rv-lab.html',
  styleUrl: './rv-lab.css',
})
export class RvLab {
  private readonly route = inject(ActivatedRoute);
  private readonly real = this.route.snapshot.data['mode'] === 'real';
  protected readonly isReal = this.real;
  protected readonly tasks: readonly RvTask[] = this.real ? REAL_TASKS : RV_TASKS;
  private readonly storageKey = this.real ? STORAGE_KEY_REAL : STORAGE_KEY;
  protected readonly ops = OPS;
  protected readonly pseudo = PSEUDO;
  protected readonly mmio = MMIO_MAP;
  protected readonly regNames = ABI_NAMES;
  protected readonly windows: readonly MemWindow[] = [
    { id: 'text', title: 'Команды (0x0000)', from: 0x0000 },
    { id: 'data', title: 'Данные (0x1000)', from: 0x1000 },
    { id: 'stack', title: 'Стек (вершина)', from: STACK_TOP - 0x100 },
  ];
  protected readonly ledIndexes = [7, 6, 5, 4, 3, 2, 1, 0];

  protected readonly index = signal(0);
  protected readonly codes = signal<Record<string, string>>({});
  protected readonly solved = signal<ReadonlySet<string>>(new Set());
  protected readonly dashItems = computed(() =>
    this.tasks.map((t) => ({ title: t.title, solved: this.solved().has(t.id) })),
  );
  protected readonly hintShown = signal(false);
  protected readonly selectedLine = signal<number | null>(null);
  protected readonly windowId = signal('text');

  protected readonly task = computed<RvTask>(() => this.tasks[this.index()]);
  /** Текст, который печатает режим авто; пока он есть, он заменяет ваш код (ваш не трогаем) */
  protected readonly guideCode = signal<string | null>(null);
  protected readonly source = computed(
    () => this.guideCode() ?? this.codes()[this.task().id] ?? this.task().starter,
  );
  protected readonly asm = computed<AsmResult>(() =>
    assemble(fullSource(this.source(), this.task())),
  );

  /** Любое действие с машиной увеличивает счётчик — так интерфейс узнаёт об изменениях */
  protected readonly version = signal(0);
  private readonly resets = signal(0);

  /** Новая машина — после любой правки программы, смены задания или «Сбросить» */
  private readonly machine = computed<RvMachine | null>(() => {
    this.resets();
    const a = this.asm();
    if (a.errors.length > 0) return null;
    return new RvMachine(a.image, { switches: this.task().switches, entry: a.entry });
  });

  protected readonly view = computed<RvView | null>(() => {
    this.version();
    return this.machine()?.view() ?? null;
  });

  protected readonly result = computed<CheckResult | null>(() => {
    const v = this.view();
    if (!v) return null;
    if (v.error) return { ok: false, message: v.error };
    return v.halted ? this.task().check(v, this.asm().symbols) : null;
  });

  protected readonly canStep = computed(() => {
    const v = this.view();
    return !!v && !v.halted && !v.error;
  });

  /** Файлы для сборки на своём компьютере: ваша программа + Makefile + README */
  protected readonly files = computed<ProjectFile[]>(() => projectFiles(this.source()));
  protected readonly openFile = signal('program.s');
  protected readonly shownFile = computed(
    () => this.files().find((f) => f.name === this.openFile()) ?? this.files()[0],
  );

  protected readonly switches = computed(() => this.task().switches ?? 0);

  protected readonly listing = computed(() => {
    const pc = this.view()?.pc ?? -1;
    return this.asm().lines.map((l) => ({
      ...l,
      parts: fieldsOf(l.word),
      wordHex: l.word.toString(16).padStart(8, '0'),
      addrHex: l.addr.toString(16).padStart(4, '0'),
      current: l.addr === pc,
    }));
  });

  protected readonly regs = computed(() => {
    const v = this.view();
    return Array.from({ length: 32 }, (_, i) => {
      const u = v?.regs[i] ?? 0;
      return {
        num: i,
        name: ABI_NAMES[i],
        signed: u | 0,
        hex: (u >>> 0).toString(16).padStart(8, '0'),
        changed: v?.lastReg === i,
      };
    });
  });

  protected readonly grid = computed<{ addr: number; cells: Cell[] }[]>(() => {
    const v = this.view();
    const base = this.windows.find((w) => w.id === this.windowId())!.from;
    const mem = v?.mem ?? this.asm().image;
    return Array.from({ length: 16 }, (_, row) => ({
      addr: base + row * 16,
      cells: Array.from({ length: 16 }, (_, col) => {
        const addr = base + row * 16 + col;
        const b = mem[addr] ?? 0;
        return {
          addr,
          hex: hex8(b),
          char: b >= 32 && b < 127 ? String.fromCharCode(b) : '·',
          read: v?.lastRead === addr,
          written: v?.lastWrite === addr,
        };
      }),
    }));
  });

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
      this.selectedLine.set(null);
      this.save();
    });
  });

  /* ---------- режим авто ---------- */
  private readonly session = inject(GuideSession);
  private readonly dialogs = inject(ConfirmService);
  private readonly slug = this.real ? 'real' : 'riscv';
  protected readonly guide = computed(() => codeGuideFor(this.slug, this.task().id));
  private readonly guideHost: CodeGuideHost = {
    guide: () => this.guide(),
    setCode: (code) => this.guideCode.set(code),
    resetMachine: () => this.resets.update((n) => n + 1),
    exec: (n) => {
      const m = this.machine();
      if (!m) return ['Программа пока не собирается: проверьте текст.'];
      const listing = this.asm().lines;
      const hexw = (v: number) => (v >>> 0).toString(16);
      const lines = traceRun(m, n, {
        insnAt: (pc) => {
          const l = listing.find((x) => x.addr === pc);
          if (!l) return '?';
          // псевдокоманда: показываем настоящую команду и то, из чего она получилась
          return l.pseudo ? `${disassemble(l.word)}   (${l.text})` : l.text;
        },
        regName: (i) => ABI_NAMES[i],
        fmtReg: (v) => `${v | 0} (0x${hexw(v)})`,
        fmtAddr: (a) => `0x${hexw(a)}`,
        fmtPc: (pc) => `0x${hexw(pc)}`,
        fmtByte: (v) => `${v} (0x${hexw(v)})`,
        insnSize: 4,
      });
      this.version.update((v) => v + 1);
      return lines;
    },
    next: () => nextInCourse(this.slug, this.task().id),
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
      const raw = JSON.parse(
        localStorage.getItem(this.storageKey) ?? 'null',
      ) as Partial<Saved> | null;
      if (raw) {
        this.codes.set(raw.codes ?? {});
        this.solved.set(new Set(raw.solved ?? []));
        if (
          typeof raw.current === 'number' &&
          raw.current >= 0 &&
          raw.current < this.tasks.length
        ) {
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
      localStorage.setItem(this.storageKey, JSON.stringify(data));
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
    void this.router.navigate(['/', this.real ? 'real' : 'riscv', this.tasks[i].id]);
  }

  protected step(): void {
    this.machine()?.step();
    this.followMemory();
    this.version.update((n) => n + 1);
  }

  protected run(): void {
    this.machine()?.run(RUN_LIMIT);
    this.followMemory();
    this.version.update((n) => n + 1);
  }

  protected reset(): void {
    this.resets.update((n) => n + 1);
  }

  /** Окно памяти само перескакивает туда, где команда только что читала или писала */
  private followMemory(): void {
    const m = this.machine();
    if (!m) return;
    const addr = m.lastWrite ?? m.lastRead;
    if (addr === null) return;
    const w = this.windows.find((x) => addr >= x.from && addr < x.from + 0x100);
    if (w) this.windowId.set(w.id);
  }

  protected async showSolution(): Promise<void> {
    const sure = await this.dialogs.ask({
      title: 'Показать эталонное решение?',
      description: 'Ваш текущий код в этом задании будет заменён решением.',
      confirmText: 'Показать решение',
      cancelText: 'Отмена',
    });
    if (!sure) return;
    this.codes.update((c) => ({ ...c, [this.task().id]: this.task().solution }));
    this.save();
  }

  protected restoreStarter(): void {
    this.codes.update((c) => ({ ...c, [this.task().id]: this.task().starter }));
    this.save();
  }

  protected download(f: ProjectFile): void {
    this.saveBlob(new Blob([f.content], { type: 'text/plain;charset=utf-8' }), f.name);
  }

  protected downloadZip(): void {
    const zip = makeZip(projectZip(this.files()));
    this.saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), 'riscv-program.zip');
  }

  private saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected cellClass(c: Cell): string {
    return ['cell', c.read ? 'read' : '', c.written ? 'written' : ''].filter(Boolean).join(' ');
  }

  /** Оболочка (echo $?) показывает код возврата по модулю 256 */
  protected shellCode(code: number): number {
    return code & 0xff;
  }

  protected hexByte(n: number): string {
    return hex8(n);
  }

  protected hexAddr(n: number): string {
    return n.toString(16).toUpperCase().padStart(4, '0');
  }

  protected ledOn(i: number): boolean {
    return ((this.view()?.leds ?? 0) >> i) & 1 ? true : false;
  }

  protected switchOn(i: number): boolean {
    return (this.switches() >> i) & 1 ? true : false;
  }
}
