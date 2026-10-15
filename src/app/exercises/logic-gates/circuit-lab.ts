import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { TruthTable } from './truth-table';
import { BlockBoard } from './block-board';
import { CircuitView } from './circuit-view';
import { freeSpot } from './block-layout';
import {
  BlockDef,
  BlockInstance,
  BlockInterface,
  BlockLibrary,
  BlockSolution,
  BusWire,
  GateSolution,
  Expansion,
  Solution,
  ValueScope,
  childScope,
  createLibrary,
  expand,
  interfaceOfExercise,
  isBlockSolution,
  isGateSolution,
  localSolutionStore,
} from './blocks';
import {
  Bit,
  BOARD_H,
  BOARD_W,
  Circuit,
  COMPOSITE_GATES,
  GATE_H,
  GATE_W,
  GateInstance,
  GateType,
  INPUT_X,
  InputId,
  InputState,
  NodeValue,
  OUT_PIN_X,
  OUT_X,
  PinKind,
  PinRef,
  Point,
  TableRow,
  Wire,
  createsCycle,
  evaluateCircuit,
  inputsForRow,
  inputYs,
  outputValue,
  outputYs,
  pinPos,
  reserveUids,
  settleCircuit,
  samePin,
  uid,
  wirePath,
  zeroInputs,
} from './circuit.model';
import { Exercise, ExerciseStep } from './exercises';
import {
  RU_NAMES,
  gateBodyPath,
  gateBubbleCx,
  gateExtraArc,
  gatePinY,
  gatePinsOf,
} from './gate-shapes';
import { SECTIONS, Section } from '../../sections/sections';
import { touchProgress } from '../../nav/progress';
import { GuideAction } from './guides';
import {
  PanDrag,
  ZOOM,
  isClick,
  listenStickyCancel,
  clampWorld,
  dragPan,
  listenActivity,
  listenMiddleButton,
  listenZoomWheel,
  startPan,
  viewBoxOf,
  wheelFactor,
  zoomAround,
} from './board-pan';
import { ViewControls } from './view-controls';
import { PixelLock } from '../../ui/pixel-lock';
import { AutoWire, suggestWires } from './auto-wire';
import { AUTO_WIRE_RADIUS_FACTOR, SettingsService } from '../../settings/settings.service';
import { guideFor } from './guide-registry';
import { GuideSession } from '../../guide/guide-session';
import { nextInCourse } from '../../pages/chapters/chapters';
import { confirmMarkChapter } from '../../progress/mark-solved';
import { ConfirmService } from '../../ui/confirm.service';
import { GuidePlayer } from '../../guide/guide-player';

/** Сколько держится высокий уровень такта по кнопке «Такт» */
const TICK_MS = 600;
/** Допустимые частоты автогенератора, Гц (полный период = высокий + низкий уровень) */
export const CLOCK_RATES = [0.5, 1, 2, 4] as const;
/** Сколько последних изменений хранит временная диаграмма */
const HISTORY_MAX = 24;

/** Снимок сигналов после очередного изменения — один столбец временной диаграммы */
interface Sample {
  inputs: Partial<Record<InputId, Bit>>;
  outputs: Record<string, NodeValue>;
}

interface WaveRow {
  label: string;
  kind: 'in' | 'clk' | 'out';
  top: number;
  /** определённые участки сигнала */
  d: string;
  /** неопределённые («?») участки — пунктиром посередине */
  dx: string;
}

const WAVE = { labelW: 56, step: 26, rowH: 30, hi: 8, lo: 22, width: 56 + HISTORY_MAX * 26 };

/** Один уровень «погружения»: сама доска или блок внутри неё */
interface Level {
  title: string;
  /** Описание блока; у самой доски — null */
  def: BlockDef | null;
  iface: BlockInterface;
  solution: Solution;
  expansion: Expansion;
  scope: ValueScope;
}

/** id «призрака» элемента, пока его несут из палитры */
const DROP_ID = 'auto-new';

@Component({
  selector: 'app-circuit-lab',
  imports: [
    TruthTable,
    BlockBoard,
    CircuitView,
    NgTemplateOutlet,
    GuidePlayer,
    ViewControls,
    PixelLock,
  ],
  templateUrl: './circuit-lab.html',
  styleUrl: './circuit-lab.css',
})
export class CircuitLab {
  /** Раздел упражнений (упражнения + ключ прогресса) */
  readonly section = input.required<Section>();
  /** Открыть сразу это упражнение (id) — например, по ссылке «изменить блок» */
  readonly startExercise = input<string | null>(null);
  /** Вместе с startExercise: поставить на доску сохранённое решение */
  readonly loadSaved = input(false);

  // константы для шаблона
  protected readonly GATE_W = GATE_W;
  protected readonly GATE_H = GATE_H;
  protected readonly BOARD_W = BOARD_W;
  protected readonly BOARD_H = BOARD_H;
  protected readonly INPUT_X = INPUT_X;
  protected readonly OUT_X = OUT_X;

  /* ---------- состояние схемы ---------- */
  protected readonly gates = signal<GateInstance[]>([]);
  protected readonly wires = signal<Wire[]>([]);
  protected readonly inputState = signal<InputState>(zeroInputs());

  /* ---------- упражнения на блоках ---------- */
  protected readonly instances = signal<BlockInstance[]>([]);
  protected readonly busWires = signal<BusWire[]>([]);
  /** Библиотека блоков; пересоздаётся при смене упражнения, чтобы увидеть свежие решения */
  protected readonly library = signal<BlockLibrary>(createLibrary(SECTIONS));
  protected readonly inspectPath = signal<string[]>([]);
  protected readonly editUnlocked = signal(false);
  /** доска развёрнута на весь экран */
  protected readonly fullscreen = signal(false);
  /** окошко с заданием в полноэкранном режиме развёрнуто */
  protected readonly fsTaskOpen = signal(true);

  /* ---------- упражнение и прогресс ---------- */
  protected readonly currentIndex = signal(0);
  protected readonly solvedSet = signal<Set<number>>(new Set());

  protected readonly exercises = computed<readonly Exercise[]>(() => this.section().exercises);
  protected readonly exercise = computed<Exercise>(() => this.exercises()[this.currentIndex()]);
  protected readonly activeInputs = computed<readonly InputId[]>(() => this.exercise().inputs);
  protected readonly activeOutputs = computed<readonly string[]>(() => this.exercise().outputs);
  protected readonly inputYMap = computed<Record<string, number>>(() =>
    inputYs(this.activeInputs()),
  );
  protected readonly outputYMap = computed<Record<string, number>>(() =>
    outputYs(this.activeOutputs()),
  );
  protected readonly paletteGates = computed<readonly GateType[]>(() => this.exercise().allowed);
  protected readonly isStepsMode = computed(() => this.exercise().mode === 'steps');
  protected readonly isBlocksMode = computed(() => this.exercise().kind === 'blocks');
  protected readonly iface = computed<BlockInterface>(() => interfaceOfExercise(this.exercise()));

  /** Схема из блоков, развёрнутая в плоскую: дальше всё считается как обычная схема */
  protected readonly expansion = computed<Expansion | null>(() =>
    this.isBlocksMode()
      ? expand(
          { instances: this.instances(), busWires: this.busWires() },
          this.iface(),
          this.library().lookup,
        )
      : null,
  );

  protected readonly blockPalette = computed(() => {
    const lib = this.library();
    return (this.exercise().blocks ?? []).flatMap((id) => {
      const def = lib.def(id);
      if (!def) return [];
      const ins = def.ports.filter((p) => p.dir === 'in').map((p) => p.name);
      const outs = def.ports.filter((p) => p.dir === 'out').map((p) => p.name);
      return [
        {
          id,
          title: def.title,
          available: lib.available(id),
          hint: lib.lockHint(id),
          summary: `${ins.join(', ')} → ${outs.join(', ')}`,
        },
      ];
    });
  });

  /** Значения узлов плоской схемы — для шин на доске */
  protected readonly scopeFn: ValueScope = (node) => this.valueAt(node);

  /* ---------- такт и временная диаграмма ---------- */
  protected readonly clockId = computed<InputId | null>(() => this.exercise().clock ?? null);
  protected readonly clockLevel = computed<Bit>(() => {
    const id = this.clockId();
    return id ? this.inputState()[id] : 0;
  });
  /** идёт импульс по кнопке «Такт» */
  protected readonly ticking = signal(false);
  /** работает автогенератор */
  protected readonly auto = signal(false);
  protected readonly rate = signal<number>(1);
  protected readonly rates = CLOCK_RATES;
  /** сколько раз «щёлкнул» такт (фронтов 0 → 1) с начала упражнения */
  protected readonly edges = signal(0);

  protected readonly history = signal<Sample[]>([]);
  protected readonly wave = computed(() => {
    const samples = this.history();
    const ex = this.exercise();
    const labels = (id: InputId) => ex.labels?.[ex.inputs.indexOf(id)] ?? id;
    const rows: WaveRow[] = [
      ...ex.inputs.map((id) => ({
        label: labels(id),
        kind: (ex.clock === id ? 'clk' : 'in') as WaveRow['kind'],
        values: samples.map((smp) => smp.inputs[id] as NodeValue),
      })),
      ...ex.outputs.map((o) => ({
        label: o,
        kind: 'out' as const,
        values: samples.map((smp) => smp.outputs[o]),
      })),
    ].map((r, i) => this.waveRow(r.label, r.kind, i * WAVE.rowH, r.values));
    const total = rows.length * WAVE.rowH;
    return {
      rows,
      height: total,
      cols: samples.map((_, i) => WAVE.labelW + i * WAVE.step),
      lastX: WAVE.labelW + (samples.length - 1) * WAVE.step,
    };
  });

  private clockTimer: ReturnType<typeof setTimeout> | undefined;
  private autoTimer: ReturnType<typeof setInterval> | undefined;

  /* ---------- интерактив ---------- */
  protected readonly placing = signal<GateType | null>(null);
  /** сдвиг доски: она без границ, колесом мыши (или за пустое место) её можно двигать */
  protected readonly pan = signal<Point>({ x: 0, y: 0 });
  protected readonly panning = signal(false);
  /** на доску нажали и курсор с неё не уходил: колесо мыши меняет масштаб */
  protected readonly zoomReady = signal(false);
  /** масштаб доски: 1 — как задумано, меньше — «отъехать», больше — «приблизить» */
  protected readonly zoom = signal(1);
  protected readonly viewChanged = computed(
    () => this.pan().x !== 0 || this.pan().y !== 0 || this.zoom() !== 1,
  );
  protected readonly viewBox = computed(() => viewBoxOf(this.pan(), this.zoom(), BOARD_W, BOARD_H));
  protected readonly viewW = computed(() => BOARD_W / this.zoom());
  protected readonly viewH = computed(() => BOARD_H / this.zoom());
  private panDrag: PanDrag | null = null;
  protected readonly cursorClient = signal<Point | null>(null);
  protected readonly movingId = signal<string | null>(null);
  protected readonly pendingFrom = signal<PinRef | null>(null);
  /** провод «прилип» к мыши: после щелчка по контакту он тянется за курсором до следующего щелчка */
  protected readonly pendingSticky = signal(false);
  private pinDownAt: Point = { x: 0, y: 0 };
  protected readonly cursorBoard = signal<Point | null>(null);
  protected readonly hoveredPin = signal<PinRef | null>(null);
  protected readonly hintShown = signal(false);
  protected readonly flash = signal<string | null>(null);

  /* ---------- значения узлов ---------- */
  /** комбинационный расчёт (режим таблицы) */
  private readonly tableValues = computed(() => evaluateCircuit(this.circuit(), this.inputState()));
  /** устоявшиеся значения для последовательностных схем (режим шагов) */
  protected readonly seqValues = signal<Map<string, NodeValue>>(new Map());
  private lastStable = new Map<string, NodeValue>();

  /* ---------- шаги сценария ---------- */
  protected readonly passedSteps = signal(0);
  protected readonly totalSteps = computed(() => this.exercise().steps?.length ?? 0);
  protected readonly currentStepNo = computed(() =>
    Math.min(this.passedSteps() + 1, this.totalSteps()),
  );

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);
  private appliedSection: Section | null = null;
  private moveOffset: Point = { x: 0, y: 0 };
  private moveFrom: Point = { x: 0, y: 0 };
  /** связи, предложенные в этом перетаскивании (для удержания) */
  private autoMemo: AutoWire[] = [];
  /** элемент сдвинули заметно (а не просто щёлкнули по нему) */
  private readonly movedFar = signal(false);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly boardEl = viewChild<ElementRef<SVGSVGElement>>('board');

  /** Колесо мыши: двигаем доску, не трогая элементы под курсором */
  private readonly middleButton = effect((onCleanup) => {
    const el = this.boardEl()?.nativeElement;
    if (!el) return;
    onCleanup(listenMiddleButton(el, (event) => this.beginPan(event)));
    onCleanup(
      listenStickyCancel(
        el,
        () => this.pendingSticky(),
        (t) => !!t.closest('.pin-hit'),
        () => this.cancelWire(),
      ),
    );
    onCleanup(listenActivity(el, (on) => this.zoomReady.set(on)));
    onCleanup(
      listenZoomWheel(
        el,
        (event) => {
          const m = this.metrics();
          this.applyZoom(wheelFactor(event), {
            x: event.clientX - m.rect.left - m.offX,
            y: event.clientY - m.rect.top - m.offY,
          });
        },
        () => this.zoomReady(),
      ),
    );
  });

  private readonly cleanup = this.destroyRef.onDestroy(() => {
    clearTimeout(this.clockTimer);
    clearInterval(this.autoTimer);
    document.documentElement.classList.remove('board-fullscreen');
  });

  /* ---------- вычисляемое ---------- */
  protected readonly circuit = computed<Circuit>(() => {
    const flat = this.expansion();
    return flat ? flat.circuit : { gates: this.gates(), wires: this.wires() };
  });

  /** где окажется элемент, если отпустить палитру прямо сейчас (null — мышь не над доской) */
  private readonly dropGate = computed<GateInstance | null>(() => {
    const type = this.placing();
    const cursor = this.cursorClient();
    const board = this.boardEl();
    if (!type || !cursor || !board) return null;
    const r = board.nativeElement.getBoundingClientRect();
    if (cursor.x < r.left || cursor.x > r.right || cursor.y < r.top || cursor.y > r.bottom) {
      return null;
    }
    const at = this.toBoard(cursor.x, cursor.y);
    const { x, y } = clampWorld({ x: at.x - GATE_W / 2, y: at.y - GATE_H / 2 }, GATE_W, GATE_H);
    return { id: DROP_ID, type, x, y };
  });

  /** пунктирные провода автоподстановки для элемента, который ставят или двигают */
  protected readonly autoWires = computed<AutoWire[]>(() => {
    if (!this.settings.autoWire() || this.isBlocksMode()) return [];
    const moving = this.movingId();
    const gate = moving
      ? this.movedFar()
        ? (this.gates().find((g) => g.id === moving) ?? null)
        : null
      : this.dropGate();
    // появившаяся связь «залипает» и держится, пока её не перехватит более близкая пара контактов
    const wires = gate ? this.autoWiresFor(gate, this.autoMemo) : [];
    this.autoMemo = wires;
    return wires;
  });

  protected readonly autoWirePaths = computed(() =>
    this.autoWires().map((w) => wirePath(w.a, w.b)),
  );

  protected readonly tableRows = computed<TableRow[]>(() => {
    const c = this.circuit();
    const ex = this.exercise();
    if (ex.mode === 'steps') return [];
    return ex.target.map((targetRow, row) => {
      const inputs = inputsForRow(ex.inputs, row);
      const actuals = ex.outputs.map((o) => outputValue(c, inputs, o));
      return {
        targets: targetRow,
        actuals,
        ok: actuals.every((a, i) => a === targetRow[i]),
      };
    });
  });

  protected readonly matched = computed(() => this.tableRows().filter((r) => r.ok).length);
  protected readonly solved = computed(() => {
    const ex = this.exercise();
    if (ex.mode === 'steps') {
      return this.totalSteps() > 0 && this.passedSteps() === this.totalSteps();
    }
    return this.tableRows().length > 0 && this.tableRows().every((r) => r.ok);
  });

  /** строка таблицы, соответствующая текущим тумблерам */
  protected readonly currentRow = computed(() => {
    const ids = this.activeInputs();
    const s = this.inputState();
    return ids.reduce((acc, id) => (acc << 1) | s[id], 0);
  });

  /* ============================================================
     Эффекты: загрузка раздела, сохранение прогресса, проверка шагов
     ============================================================ */

  private readonly sectionEffect = effect(() => {
    const section = this.section();
    const start = this.startExercise();
    const load = this.loadSaved();
    const progress = this.loadProgress(section);
    const wanted = start ? section.exercises.findIndex((e) => e.id === start) : -1;
    const index = wanted >= 0 ? wanted : progress.current;
    // адрес сменился на то упражнение, которое уже открыто (например, после «Дальше»
    // или после того, как из адреса убрали ?edit=1): доску не трогаем
    if (this.appliedSection === section && untracked(this.currentIndex) === index && !load) return;
    this.solvedSet.set(progress.solved);
    this.currentIndex.set(index);
    // clearBoard читает другие сигналы — подписываться на них эффект не должен
    untracked(() => {
      this.clearBoard();
      if (load) this.restoreSaved();
      this.persist();
      this.appliedSection = section;
      if (load) {
        this.router.navigate([], {
          queryParams: { edit: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  });

  /** Решённое блочное или вентильное упражнение запоминает свою схему — из неё потом строится блок */
  private readonly saveEffect = effect(() => {
    const ex = this.exercise();
    if (!ex.block || !this.solved()) return;
    const sol: Solution = this.isBlocksMode()
      ? { instances: this.instances(), busWires: this.busWires() }
      : { gates: this.gates(), wires: this.wires() };
    untracked(() => localSolutionStore.save(this.section().progressKey, ex.id, sol));
  });

  /** Любое изменение блоков или шин — пересчёт значений */
  private readonly blocksEffect = effect(() => {
    this.instances();
    this.busWires();
    this.library();
    untracked(() => this.afterEdit());
  });

  private readonly progressEffect = effect(() => {
    this.section(); // зависимость от раздела: при смене — перепроверить прогресс
    const idx = this.currentIndex();
    if (this.solved() && !this.solvedSet().has(idx)) {
      this.solvedSet.update((s) => new Set(s).add(idx));
      this.persist();
    }
  });

  /** проверка текущего шага сценария */
  private readonly stepEffect = effect(() => {
    const ex = this.exercise();
    if (ex.mode !== 'steps' || !ex.steps) return;
    const step = ex.steps[this.passedSteps()];
    if (!step) return;

    const s = this.inputState();
    const inputsMatch = ex.inputs.every((id) => s[id] === step.inputs[id]);
    if (!inputsMatch) return;

    const v = this.seqValues();
    const outputsMatch = ex.outputs.every(
      (o) => step.expect[o] === undefined || v.get(o) === step.expect[o],
    );
    if (outputsMatch) {
      this.passedSteps.update((n) => n + 1);
    }
  });

  /* ============================================================
     Прогресс: хранение
     ============================================================ */

  private storageKey(section: Section): string {
    return `processor-progress-v2-${section.progressKey}`;
  }

  private loadProgress(section: Section): { solved: Set<number>; current: number } {
    try {
      const raw = localStorage.getItem(this.storageKey(section));
      if (raw) {
        const parsed = JSON.parse(raw) as { solved?: unknown; current?: unknown };
        const max = section.exercises.length;
        const solved = Array.isArray(parsed.solved)
          ? new Set(
              parsed.solved.filter((n): n is number => typeof n === 'number' && n >= 0 && n < max),
            )
          : new Set<number>();
        const current =
          typeof parsed.current === 'number' && parsed.current >= 0 && parsed.current < max
            ? parsed.current
            : 0;
        return { solved, current };
      }
    } catch {
      // нет сохранения — начинаем с нуля
    }
    return { solved: new Set<number>(), current: 0 };
  }

  private persist(): void {
    try {
      localStorage.setItem(
        this.storageKey(this.section()),
        JSON.stringify({ solved: [...this.solvedSet()], current: this.currentIndex() }),
      );
    } catch {
      // localStorage недоступен — прогресс просто не сохранится
    }
    touchProgress();
  }

  /* ============================================================
     Переключение упражнений
     ============================================================ */

  /** Переход к упражнению — это переход по адресу /<глава>/<упражнение>; доску сменит sectionEffect */
  /** Все упражнения главы решены — кнопка «Отметить решённым» больше не нужна */
  protected readonly chapterSolved = computed(
    () => this.solvedSet().size >= this.exercises().length,
  );

  /** Кто уже знает материал, засчитывает всю главу разом */
  protected async markChapterSolved(): Promise<void> {
    const section = this.section();
    if (!(await confirmMarkChapter(this.dialogs, section.title, this.exercises().length))) return;
    this.solvedSet.set(new Set(this.exercises().map((_, i) => i)));
    this.persist();
  }

  protected selectExercise(index: number): void {
    if (index === this.currentIndex()) return;
    const ex = this.exercises()[index];
    if (!ex) return;
    void this.router.navigate(['/', this.section().slug, ex.id]);
  }

  protected next(): void {
    this.selectExercise(Math.min(this.currentIndex() + 1, this.exercises().length - 1));
  }

  protected prev(): void {
    this.selectExercise(Math.max(this.currentIndex() - 1, 0));
  }

  private clearBoard(): void {
    this.stopClock();
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
    this.inputState.set(zeroInputs());
    this.gates.set([]);
    this.wires.set([]);
    this.instances.set([]);
    this.busWires.set([]);
    this.inspectPath.set([]);
    this.editUnlocked.set(false);
    this.library.set(createLibrary(SECTIONS));
    this.hintShown.set(false);
    this.passedSteps.set(0);
    this.edges.set(0);
    this.lastStable = new Map();
    this.seqValues.set(new Map());
    this.history.set([]);
    this.recordSample();
  }

  /* ============================================================
     Значения: симуляция
     ============================================================ */

  /** пересчитать значения в режиме шагов (с памятью о прошлом состоянии) */
  private touchValues(): void {
    if (!this.isStepsMode()) return;
    const res = settleCircuit(this.circuit(), this.inputState(), this.lastStable);
    this.lastStable = res.stable ? res.values : new Map();
    this.seqValues.set(res.values);
  }

  /** значение узла с учётом режима упражнения */
  protected valueAt(node: string): NodeValue {
    return this.isStepsMode() ? this.seqValues().get(node) : this.tableValues().get(node);
  }

  /* ============================================================
     Палитра: перетаскивание элемента на доску
     ============================================================ */

  protected startPlace(event: PointerEvent, type: GateType): void {
    if (!this.isUnlocked(type)) {
      this.notify(`${this.lockHint(type)} — и элемент откроется`);
      return;
    }
    event.preventDefault();
    this.placing.set(type);
    this.cursorClient.set({ x: event.clientX, y: event.clientY });
  }

  protected ruName(type: GateType): string {
    return RU_NAMES[type];
  }

  /* ============================================================
     Перемещение гейта по доске
     ============================================================ */

  protected gateDown(event: PointerEvent, gate: GateInstance): void {
    event.preventDefault();
    const p = this.toBoard(event.clientX, event.clientY);
    this.moveOffset = { x: p.x - gate.x, y: p.y - gate.y };
    this.moveFrom = { x: gate.x, y: gate.y };
    this.movedFar.set(false);
    this.movingId.set(gate.id);
  }

  /* ============================================================
     Провода
     ============================================================ */

  protected pinDown(event: PointerEvent, node: string, pin: PinKind): void {
    event.preventDefault();
    event.stopPropagation();
    const from = this.pendingFrom();
    if (from && this.pendingSticky()) {
      // провод уже тянется за мышью: этот щелчок — его конец (повторный щелчок по началу — отмена)
      this.cancelWire();
      if (!samePin(from, { node, pin })) this.tryConnect(from, { node, pin });
      return;
    }
    this.pendingFrom.set({ node, pin });
    this.pendingSticky.set(false);
    this.pinDownAt = { x: event.clientX, y: event.clientY };
    this.hoveredPin.set(null);
    this.cursorBoard.set(this.toBoard(event.clientX, event.clientY));
  }

  /** Отменить начатый провод */
  protected cancelWire(): void {
    this.pendingFrom.set(null);
    this.pendingSticky.set(false);
    this.hoveredPin.set(null);
    this.cursorBoard.set(null);
  }

  protected pinEnter(node: string, pin: PinKind): void {
    if (this.pendingFrom()) this.hoveredPin.set({ node, pin });
  }

  protected pinLeave(node: string, pin: PinKind): void {
    const h = this.hoveredPin();
    if (h && samePin(h, { node, pin })) this.hoveredPin.set(null);
  }

  protected removeWire(id: string): void {
    this.wires.update((list) => list.filter((w) => w.id !== id));
    this.afterEdit();
  }

  protected removeGate(id: string): void {
    this.gates.update((list) => list.filter((g) => g.id !== id));
    this.wires.update((list) => list.filter((w) => w.from.node !== id && w.to.node !== id));
    this.afterEdit();
  }

  private tryConnect(a: PinRef, b: PinRef): void {
    const from = a.pin === 'out' ? a : b;
    const to = a.pin === 'out' ? b : a;
    if (from.pin !== 'out' || to.pin === 'out' || from.node === to.node) {
      this.notify('Соединять нужно выход элемента со входом другого');
      return;
    }
    // на входной пин можно подать только один сигнал — старый провод заменяется
    this.wires.update((list) => list.filter((w) => !samePin(w.to, to)));
    // в пошаговом режиме циклы разрешены — это суть защёлок
    if (!this.isStepsMode() && createsCycle(this.circuit(), from, to)) {
      this.notify('Так схема замкнётся в цикл — сигнал будет бежать по кругу');
      return;
    }
    this.wires.update((list) => [...list, { id: uid('w'), from, to }]);
    this.afterEdit();
  }

  /* ============================================================
     Доска во весь экран
     ============================================================ */

  protected toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.pendingFrom()) {
      this.cancelWire(); // сначала отменяем провод, а полный экран остаётся
      return;
    }
    if (this.fullscreen()) this.fullscreen.set(false);
  }

  /** Пока доска развёрнута, страница под ней не прокручивается */
  private readonly fullscreenEffect = effect(() => {
    document.documentElement.classList.toggle('board-fullscreen', this.fullscreen());
  });

  /* ============================================================
     Блоки: палитра, «заглянуть внутрь», редактирование
     ============================================================ */

  protected boardHint(): string {
    if (this.isBlocksMode()) {
      return this.isStepsMode()
        ? 'Соедините блоки шинами и выполняйте шаги сценария — на вход подаётся такт'
        : 'Соедините блоки шинами так, чтобы столбцы «Схема» совпали со столбцами «Цель»';
    }
    return this.isStepsMode()
      ? 'Соберите схему и выполняйте шаги сценария — сигналы меняются тумблерами'
      : 'Соберите схему так, чтобы столбцы «Схема» совпали со столбцами «Цель»';
  }

  protected addBlock(blockId: string): void {
    const lib = this.library();
    if (!lib.available(blockId)) {
      this.notify(`${lib.lockHint(blockId)} — и блок откроется`);
      return;
    }
    const list = this.instances();
    let n = list.length + 1;
    while (list.some((i) => i.id === `i${n}`)) n++;
    this.instances.set([...list, { id: `i${n}`, blockId, ...freeSpot(list, BOARD_W) }]);
  }

  /** Щелчок по биту входа на доске блоков */
  protected onBoardToggle(node: string): void {
    if ((this.exercise().inputs as readonly string[]).includes(node)) {
      this.toggleInput(node as InputId);
    }
  }

  /** Уровни просмотра: доска упражнения и вложенные блоки, в которые «провалились» */
  protected readonly levels = computed(() => {
    const exp = this.expansion();
    if (!exp) return [];
    const top: Level = {
      title: this.exercise().title,
      def: null,
      iface: this.iface(),
      solution: { instances: this.instances(), busWires: this.busWires() },
      expansion: exp,
      scope: this.scopeFn,
    };
    const out: Level[] = [top];
    for (const id of this.inspectPath()) {
      const cur = out[out.length - 1];
      const sub = cur.expansion.subs.get(id);
      if (!sub) break;
      out.push({
        title: sub.def.title,
        def: sub.def,
        iface: sub.def,
        solution: sub.solution,
        expansion: sub.expansion,
        scope: childScope(cur.scope, cur.expansion, id, sub.def),
      });
    }
    return out;
  });

  /** Просматриваемый блок; null — смотрим на саму доску упражнения */
  protected readonly current = computed<Level | null>(() => {
    const lv = this.levels();
    return this.inspectPath().length > 0 && lv.length > 1 ? lv[lv.length - 1] : null;
  });

  protected isBlockSolution(s: Solution): s is BlockSolution {
    return isBlockSolution(s);
  }

  protected isGate(s: Solution): s is GateSolution {
    return isGateSolution(s);
  }

  protected inspectInto(instanceId: string): void {
    this.inspectPath.update((p) => [...p, instanceId]);
    this.editUnlocked.set(false);
  }

  protected inspectUp(): void {
    this.inspectPath.update((p) => p.slice(0, -1));
    this.editUnlocked.set(false);
  }

  /** К уровню i в хлебных крошках: 0 — сама доска */
  protected inspectTo(level: number): void {
    this.inspectPath.update((p) => p.slice(0, level));
    this.editUnlocked.set(false);
  }

  /** Переход в упражнение, где собран блок: схема ставится на доску, исправленное решение обновит блок */
  protected async openEditor(def: BlockDef): Promise<void> {
    const src = def.source;
    if (!src) return;
    const hasWork = (this.instances().length > 0 || this.gates().length > 0) && !this.solved();
    if (
      hasWork &&
      !(await this.dialogs.ask({
        title: 'Перейти к редактору блока?',
        description: 'Несохранённая схема на этой доске пропадёт.',
        confirmText: 'Перейти',
        cancelText: 'Остаться',
        destructive: true,
      }))
    ) {
      return;
    }
    void this.router.navigate(['/', src.sectionSlug, src.exerciseId], {
      queryParams: { edit: 1 },
    });
  }

  /** Поставить на доску ранее сохранённое решение текущего упражнения */
  private restoreSaved(): void {
    const sol = localSolutionStore.load(this.section().progressKey, this.exercise().id);
    if (!sol) return;
    if (isBlockSolution(sol)) {
      reserveUids([...sol.instances.map((i) => i.id), ...sol.busWires.map((w) => w.id)]);
      this.instances.set(sol.instances);
      this.busWires.set(sol.busWires);
    } else if (isGateSolution(sol)) {
      reserveUids([...sol.gates.map((g) => g.id), ...sol.wires.map((w) => w.id)]);
      this.gates.set(sol.gates);
      this.wires.set(sol.wires);
    }
    this.afterEdit();
  }

  /* ============================================================
     Входы-тумблеры и кнопки
     ============================================================ */

  protected toggleInput(id: InputId): void {
    this.setInput(id, (this.inputState()[id] ^ 1) as Bit);
  }

  private setInput(id: InputId, level: Bit): void {
    if (this.inputState()[id] === level) return;
    if (id === this.clockId() && level === 1) this.edges.update((n) => n + 1);
    this.inputState.update((s) => ({ ...s, [id]: level }));
    this.touchValues();
    this.recordSample();
  }

  /* ============================================================
     Такт: импульс по кнопке и автогенератор
     ============================================================ */

  /** один полный период: CLK = 1 на время TICK_MS, затем снова 0 */
  protected tick(done?: () => void): boolean {
    const id = this.clockId();
    if (!id || this.ticking() || this.auto() || this.clockLevel() === 1) return false;
    this.ticking.set(true);
    this.setInput(id, 1);
    this.clockTimer = setTimeout(() => {
      this.setInput(id, 0);
      this.ticking.set(false);
      done?.();
    }, TICK_MS);
    return true;
  }

  protected toggleAuto(): void {
    if (this.auto()) {
      this.stopClock();
      return;
    }
    const id = this.clockId();
    if (!id || this.ticking()) return;
    this.auto.set(true);
    this.startAutoTimer();
  }

  protected setRate(hz: number): void {
    this.rate.set(hz);
    if (this.auto()) this.startAutoTimer();
  }

  private startAutoTimer(): void {
    clearInterval(this.autoTimer);
    const id = this.clockId();
    if (!id) return;
    // половина периода — высокий уровень, половина — низкий
    this.autoTimer = setInterval(
      () => this.setInput(id, (this.inputState()[id] ^ 1) as Bit),
      500 / this.rate(),
    );
  }

  /** остановить автогенератор и импульс; такт возвращается в 0 */
  protected stopClock(): void {
    clearTimeout(this.clockTimer);
    clearInterval(this.autoTimer);
    const wasRunning = this.auto() || this.ticking();
    this.auto.set(false);
    this.ticking.set(false);
    const id = this.clockId();
    if (wasRunning && id && this.inputState()[id] === 1) this.setInput(id, 0);
  }

  /* ============================================================
     Временная диаграмма
     ============================================================ */

  private snapshot(): Sample {
    const ex = this.exercise();
    const s = this.inputState();
    const v = this.seqValues();
    return {
      inputs: Object.fromEntries(ex.inputs.map((id) => [id, s[id]])),
      outputs: Object.fromEntries(ex.outputs.map((o) => [o, v.get(o)])),
    };
  }

  /** новый столбец: после каждого изменения тумблеров */
  private recordSample(): void {
    if (!this.isStepsMode()) return;
    this.history.update((h) => [...h, this.snapshot()].slice(-HISTORY_MAX));
  }

  /** схема изменилась, тумблеры — нет: обновить последний столбец */
  private refreshSample(): void {
    if (!this.isStepsMode() || this.history().length === 0) return;
    this.history.update((h) => [...h.slice(0, -1), this.snapshot()]);
  }

  private afterEdit(): void {
    this.touchValues();
    this.refreshSample();
  }

  protected clearHistory(): void {
    this.history.set([]);
    this.recordSample();
  }

  private waveRow(
    label: string,
    kind: WaveRow['kind'],
    top: number,
    values: readonly NodeValue[],
  ): WaveRow {
    let d = '';
    let dx = '';
    let prevY: number | null = null;
    values.forEach((v, i) => {
      const x0 = WAVE.labelW + i * WAVE.step;
      const x1 = x0 + WAVE.step;
      if (v === undefined) {
        dx += `M ${x0} ${top + (WAVE.hi + WAVE.lo) / 2} H ${x1} `;
        prevY = null;
        return;
      }
      const y = top + (v === 1 ? WAVE.hi : WAVE.lo);
      d += prevY === null ? `M ${x0} ${y} H ${x1} ` : prevY === y ? `H ${x1} ` : `V ${y} H ${x1} `;
      prevY = y;
    });
    return { label, kind, top, d, dx };
  }

  protected readonly WAVE = WAVE;

  protected reset(): void {
    this.stopClock();
    this.gates.set([]);
    this.wires.set([]);
    this.instances.set([]);
    this.busWires.set([]);
    this.inspectPath.set([]);
    this.passedSteps.set(0);
    this.lastStable = new Map();
    this.seqValues.set(new Map());
    this.refreshSample();
  }

  protected toggleHint(): void {
    this.hintShown.update((v) => !v);
  }

  protected notify(text: string): void {
    this.flash.set(text);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(null), 2800);
  }

  /* ============================================================
     Глобальные обработчики перетаскивания
     ============================================================ */

  @HostListener('document:pointermove', ['$event'])
  private onPointerMove(event: PointerEvent): void {
    if (this.panDrag) {
      this.pan.set(dragPan(this.panDrag, event));
      return;
    }
    if (this.placing()) {
      this.cursorClient.set({ x: event.clientX, y: event.clientY });
      return;
    }
    const id = this.movingId();
    if (id) {
      const p = this.toBoard(event.clientX, event.clientY);
      const { x, y } = clampWorld(
        { x: p.x - this.moveOffset.x, y: p.y - this.moveOffset.y },
        GATE_W,
        GATE_H,
      );
      this.gates.update((list) => list.map((g) => (g.id === id ? { ...g, x, y } : g)));
      if (!this.movedFar() && Math.hypot(x - this.moveFrom.x, y - this.moveFrom.y) > 6) {
        this.movedFar.set(true);
      }
      return;
    }
    if (this.pendingFrom()) {
      this.cursorBoard.set(this.toBoard(event.clientX, event.clientY));
    }
  }

  @HostListener('document:pointerup', ['$event'])
  private onPointerUp(event: PointerEvent): void {
    if (this.panDrag) {
      this.panDrag = null;
      this.panning.set(false);
      return;
    }
    const placing = this.placing();
    if (placing) {
      // пунктирные связи, которые показывались на лету: элемент ещё «не на доске», их надо запомнить
      const held = this.autoWires();
      this.placing.set(null);
      this.cursorClient.set(null);
      const el = event.target as Element | null;
      if (el && typeof el.closest === 'function') {
        if (el.closest('.board-svg')) {
          this.place(placing, this.toBoard(event.clientX, event.clientY), held);
        } else if (el.closest('.palette')) {
          this.place(placing, this.defaultSpot());
        }
      }
      return;
    }

    if (this.movingId()) {
      // поставили элемент на место — пунктирные провода становятся настоящими
      const auto = this.autoWires();
      this.movingId.set(null);
      this.movedFar.set(false);
      if (auto.length > 0) this.addAutoWires(auto);
      return;
    }

    const from = this.pendingFrom();
    if (from && !this.pendingSticky()) {
      const target = this.hoveredPin();
      if (target && !samePin(from, target)) {
        // протянули и отпустили над другим контактом
        this.tryConnect(from, target);
        this.cancelWire();
      } else if (isClick(this.pinDownAt, event)) {
        // просто щёлкнули по контакту: провод тянется за мышью до следующего щелчка
        this.pendingSticky.set(true);
      } else {
        this.cancelWire();
      }
    }
  }

  /* ============================================================
     Режим авто: пошаговый разбор (учебник + тренажёр)
     ============================================================ */

  /** Разбор для текущего упражнения; null — для него разбора пока нет */
  protected readonly guide = computed(() => guideFor(this.section().slug, this.exercise().id));
  protected readonly guideOn = signal(false);
  /** номер показанного шага (0 — вступление) */
  protected readonly guidePos = signal(0);
  protected readonly guideCardOpen = signal(true);
  /** что шаг только что добавил на доске: подсвечивается */
  protected readonly guideFocus = signal<ReadonlySet<string>>(new Set());
  /** идёт серия импульсов такта: «Вперёд» ждёт её окончания */
  protected readonly guideBusy = signal(false);
  private readonly session = inject(GuideSession);
  private readonly dialogs = inject(ConfirmService);
  private guideGates = new Map<string, string>();

  protected readonly guideStep = computed(() => this.guide()?.steps[this.guidePos()] ?? null);

  /** Куда ведёт «Следующее упражнение» на последнем шаге: дальше по курсу, в том числе в ассемблер */
  protected readonly nextExercise = computed(() =>
    nextInCourse(this.section().slug, this.exercise().id),
  );

  /**
   * Режим авто «залипает»: пока он включён, каждое упражнение открывается в нём.
   * При смене упражнения доска чистая, поэтому разбор стартует без вопросов.
   */
  private readonly guideSyncEffect = effect(() => {
    this.section();
    this.currentIndex();
    const wantAuto = this.session.auto();
    const available = this.guide() !== null;
    const edit = this.loadSaved();
    untracked(() => {
      if (wantAuto && available && !edit && this.guideBlocksReady(true)) this.beginGuide();
      else this.stopGuide();
    });
  });

  /** Кнопка «Режим авто» на доске */
  protected async startGuide(): Promise<void> {
    if (!this.guide()) return;
    const hasWork = (this.instances().length > 0 || this.gates().length > 0) && !this.solved();
    if (
      hasWork &&
      !(await this.dialogs.ask({
        title: 'Начать с чистой доски?',
        description:
          'Режим авто собирает решение с нуля, поэтому схема на доске пропадёт. Продолжить?',
        confirmText: 'Начать',
        cancelText: 'Отмена',
        destructive: true,
      }))
    ) {
      return;
    }
    if (!this.guideBlocksReady(true)) return;
    this.session.auto.set(true);
    this.beginGuide();
  }

  /** Разбор «из блоков» нужны решения предыдущих упражнений; без них блоки в палитре закрыты */
  private guideBlocksReady(announce: boolean): boolean {
    const lib = this.library();
    const missing = new Set<string>();
    for (const step of this.guide()?.steps ?? []) {
      for (const a of step.do ?? []) {
        if ('block' in a && !lib.available(a.block.blockId)) missing.add(a.block.blockId);
      }
    }
    if (missing.size === 0) return true;
    if (announce) {
      this.notify(
        `Для разбора нужны блоки из предыдущих упражнений (${[...missing].join(', ')}): ` +
          'пройдите их — можно тоже в режиме авто.',
      );
    }
    return false;
  }

  private beginGuide(): void {
    this.stopClock();
    this.clearBoard();
    this.guideGates = new Map();
    this.guideFocus.set(new Set());
    this.guideBusy.set(false);
    this.guidePos.set(0);
    this.guideCardOpen.set(true);
    this.guideOn.set(true);
  }

  /** «Выйти»: режим выключается и для следующих упражнений; схема остаётся на доске */
  protected leaveGuide(): void {
    this.session.auto.set(false);
    this.stopGuide();
  }

  protected stopGuide(): void {
    if (!this.guideOn()) return;
    this.guideOn.set(false);
    this.guideBusy.set(false);
    this.guideFocus.set(new Set());
  }

  /** На последнем шаге «Вперёд» превращается в переход к следующему упражнению */
  protected goNextExercise(): void {
    const next = this.nextExercise();
    if (!next) return;
    void this.router.navigate(['/', next.slug, next.id]);
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  protected onGuideRight(e: Event): void {
    if (this.guideOn() && !this.isTyping(e)) this.guideNext();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  protected onGuideLeft(e: Event): void {
    if (this.guideOn() && !this.isTyping(e)) this.guidePrev();
  }

  private isTyping(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'INPUT');
  }

  protected guideNext(): void {
    const guide = this.guide();
    if (!guide || this.ticking() || this.guideBusy() || this.guidePos() >= guide.steps.length - 1)
      return;
    const pos = this.guidePos() + 1;
    this.guidePos.set(pos);
    this.guideCardOpen.set(true);
    this.applyGuideStep(pos, true);
  }

  protected guidePrev(): void {
    if (this.guidePos() > 0) this.guideJump(this.guidePos() - 1);
  }

  /** Перейти к шагу: доска собирается заново и повторяет все шаги до него */
  protected guideJump(target: number): void {
    const guide = this.guide();
    if (!guide) return;
    const n = Math.max(0, Math.min(target, guide.steps.length - 1));
    if (n === this.guidePos() && this.guideOn()) return;
    this.stopClock();
    this.clearBoard();
    this.guideGates = new Map();
    let passed = -1;
    for (let i = 1; i <= n; i++) {
      this.applyGuideStep(i, false);
      const c = guide.steps[i].completes;
      if (c !== undefined) passed = Math.max(passed, c);
    }
    if (n === 0) this.guideFocus.set(new Set());
    // шаги сценария упражнения, которые разбор уже прошёл
    this.passedSteps.set(passed + 1);
    this.guidePos.set(n);
    this.guideCardOpen.set(true);
  }

  /** Выполнить действия шага на доске; live — импульс такта идёт по-настоящему, с задержкой */
  private applyGuideStep(index: number, live: boolean): void {
    const step = this.guide()?.steps[index];
    const focus = new Set<string>();
    for (const action of step?.do ?? []) this.applyGuideAction(action, live, focus);
    this.guideFocus.set(focus);
    this.afterEdit();
  }

  /** Серия настоящих тактовых импульсов с паузами, пока доска показывает каждый фронт */
  private pulseSeries(count: number): void {
    this.guideBusy.set(true);
    let left = count;
    const next = () => {
      if (left-- <= 0 || !this.guideOn()) {
        this.guideBusy.set(false);
        return;
      }
      if (!this.tick(next)) this.guideBusy.set(false);
    };
    next();
  }

  private applyGuideAction(action: GuideAction, live: boolean, focus: Set<string>): void {
    if ('place' in action) {
      const id = uid('g');
      this.guideGates.set(action.name, id);
      const { x, y } = clampWorld(
        { x: action.at.x - GATE_W / 2, y: action.at.y - GATE_H / 2 },
        GATE_W,
        GATE_H,
      );
      this.gates.update((list) => [...list, { id, type: action.place, x, y }]);
      focus.add(id);
    } else if ('wire' in action) {
      const node = (name: string) => this.guideGates.get(name) ?? name;
      const { from, to, pin } = action.wire;
      const target: PinRef = { node: node(to), pin };
      const id = uid('w');
      this.wires.update((list) => [
        ...list.filter((w) => !samePin(w.to, target)),
        { id, from: { node: node(from), pin: 'out' }, to: target },
      ]);
      focus.add(id);
    } else if ('block' in action) {
      const { id, blockId, x, y } = action.block;
      this.instances.update((list) => [...list, { id, blockId, x, y }]);
      focus.add(id);
    } else if ('bus' in action) {
      const { id, from, to } = action.bus;
      this.busWires.update((list) => [...list, { id, from, to }]);
      focus.add(id);
    } else if ('set' in action) {
      for (const [id, level] of Object.entries(action.set)) this.setInput(id as InputId, level);
    } else {
      const count = action.pulse === true ? 1 : action.pulse;
      if (live) {
        this.pulseSeries(count);
      } else {
        // при повторе шагов импульсы «прокручиваются» мгновенно
        const clk = this.clockId();
        if (clk) {
          for (let i = 0; i < count; i++) {
            this.setInput(clk, 1);
            this.setInput(clk, 0);
          }
        }
      }
    }
  }

  /* ============================================================
     Хелперы для шаблона
     ============================================================ */

  protected place(type: GateType, at: Point, held: readonly AutoWire[] | null = null): void {
    const { x, y } = clampWorld({ x: at.x - GATE_W / 2, y: at.y - GATE_H / 2 }, GATE_W, GATE_H);
    const gate: GateInstance = { id: uid('g'), type, x, y };
    // связи, показанные пунктиром у «призрака», переносим на настоящий элемент
    const remap = (r: PinRef): PinRef => (r.node === DROP_ID ? { ...r, node: gate.id } : r);
    const keep = (held ?? []).map((w) => ({ ...w, from: remap(w.from), to: remap(w.to) }));
    const auto =
      held && this.settings.autoWire() && !this.isBlocksMode() ? this.autoWiresFor(gate, keep) : [];
    this.gates.update((list) => [...list, gate]);
    if (auto.length > 0) this.addAutoWires(auto);
    else this.afterEdit();
  }

  private autoWiresFor(gate: GateInstance, keep: readonly AutoWire[] = []): AutoWire[] {
    return suggestWires({
      keep,
      gate,
      gates: this.gates(),
      wires: this.wires(),
      inputYMap: this.inputYMap(),
      outputYMap: this.outputYMap(),
      stepsMode: this.isStepsMode(),
      radius: this.settings.autoWireRadius() * AUTO_WIRE_RADIUS_FACTOR,
    });
  }

  private addAutoWires(list: readonly AutoWire[]): void {
    this.wires.update((all) => [
      ...all,
      ...list.map((w) => ({ id: uid('w'), from: w.from, to: w.to })),
    ]);
    this.afterEdit();
  }

  private defaultSpot(): Point {
    const n = this.gates().length;
    return { x: 400, y: 100 + (n % 4) * 70 };
  }

  /** Положение доски на экране: пикселей на единицу при масштабе 1 и поля от вписывания в контейнер */
  private metrics(): { rect: DOMRect; base: number; offX: number; offY: number } {
    const rect = this.boardEl()!.nativeElement.getBoundingClientRect();
    // доска вписана в контейнер с сохранением пропорций: в полноэкранном режиме есть поля по краям
    const base = Math.min(rect.width / BOARD_W, rect.height / BOARD_H);
    return {
      rect,
      base,
      offX: (rect.width - BOARD_W * base) / 2,
      offY: (rect.height - BOARD_H * base) / 2,
    };
  }

  private boardScale(): number {
    return this.metrics().base * this.zoom();
  }

  private applyZoom(factor: number, anchor: Point): void {
    const next = zoomAround(
      { pan: this.pan(), zoom: this.zoom() },
      factor,
      anchor,
      this.metrics().base,
    );
    this.pan.set(next.pan);
    this.zoom.set(next.zoom);
  }

  /** Кнопки «+» и «−»: масштаб относительно центра видимой доски */
  protected zoomBy(factor: number): void {
    const m = this.metrics();
    this.applyZoom(factor, {
      x: (m.rect.width - 2 * m.offX) / 2,
      y: (m.rect.height - 2 * m.offY) / 2,
    });
  }

  protected readonly ZOOM_STEP = ZOOM.step;

  private beginPan(event: PointerEvent): void {
    this.panDrag = startPan(event, this.boardScale(), this.pan());
    this.panning.set(true);
  }

  /** Левая кнопка на пустом месте доски тоже двигает её (для тачпадов и телефонов) */
  protected boardDown(event: PointerEvent): void {
    if (event.button !== 0 || this.placing() || this.pendingFrom()) return;
    const target = event.target as Element;
    if (target === this.boardEl()?.nativeElement || target.classList?.contains('board-bg')) {
      event.preventDefault();
      this.beginPan(event);
    }
  }

  protected resetView(): void {
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
  }

  private toBoard(clientX: number, clientY: number): Point {
    const m = this.metrics();
    const scale = m.base * this.zoom();
    return {
      x: (clientX - m.rect.left - m.offX) / scale + this.pan().x,
      y: (clientY - m.rect.top - m.offY) / scale + this.pan().y,
    };
  }

  protected pos(ref: PinRef): Point {
    return pinPos(ref, this.gates(), this.outputYMap(), this.inputYMap());
  }

  protected outPinX(type: GateType): number {
    return OUT_PIN_X[type];
  }

  protected bodyPath(type: GateType): string {
    return gateBodyPath(type);
  }

  protected gatePins(type: GateType): readonly PinKind[] {
    return gatePinsOf(type);
  }

  protected pinY(type: GateType, pin: PinKind): number {
    return gatePinY(type, pin);
  }

  /** cx пузырька инверсии, если он есть у этого типа гейта */
  protected bubbleCx(type: GateType): number | null {
    return gateBubbleCx(type);
  }

  /** путь второй входной дуги XOR/XNOR, если она есть */
  protected extraArc(type: GateType): string | null {
    return gateExtraArc(type);
  }

  /** составной ли элемент (для бейджа в палитре) */
  protected isComposite(type: GateType): boolean {
    return COMPOSITE_GATES[type] !== undefined;
  }

  /** составные элементы открываются после сборки их вручную */
  protected isUnlocked(type: GateType): boolean {
    const req = COMPOSITE_GATES[type];
    if (!req) return true;
    return this.hasSolved(req.sectionSlug, req.exerciseId);
  }

  /** подсказка для закрытого элемента: что нужно собрать */
  protected lockHint(type: GateType): string {
    const req = COMPOSITE_GATES[type];
    if (!req) return '';
    const section = SECTIONS.find((s) => s.slug === req.sectionSlug);
    const ex = section?.exercises.find((e) => e.id === req.exerciseId);
    return `Соберите «${ex?.title ?? req.exerciseId}» в разделе «${section?.title ?? req.sectionSlug}»`;
  }

  private hasSolved(slug: string, exerciseId: string): boolean {
    try {
      const section = SECTIONS.find((s) => s.slug === slug);
      if (!section) return false;
      const idx = section.exercises.findIndex((e) => e.id === exerciseId);
      if (idx < 0) return false;
      const raw = localStorage.getItem(this.storageKey(section));
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { solved?: unknown };
      return Array.isArray(parsed.solved) && parsed.solved.includes(idx);
    } catch {
      return false;
    }
  }

  /** подпись входа на доске (может отличаться от id: R, S, D, E…) */
  protected inputLabel(id: InputId): string {
    const ex = this.exercise();
    const i = ex.inputs.indexOf(id);
    return ex.labels?.[i] ?? id;
  }

  protected labels(): readonly string[] {
    const ex = this.exercise();
    return ex.labels ?? ex.inputs;
  }

  /** значение на пине: для выходного — значение узла, для входного — сигнал с провода */
  protected pinValue(node: string, pin: PinKind): NodeValue {
    if (pin === 'out') return this.valueAt(node);
    const wire = this.wires().find((w) => samePin(w.to, { node, pin }));
    return wire ? this.valueAt(wire.from.node) : undefined;
  }

  protected wireValue(w: Wire): NodeValue {
    return this.valueAt(w.from.node);
  }

  protected wireD(w: Wire): string {
    return wirePath(this.pos(w.from), this.pos(w.to));
  }

  protected inputY(id: InputId): number {
    return this.inputYMap()[id] ?? 200;
  }

  protected outputY(output: string): number {
    return this.outputYMap()[output] ?? 200;
  }

  protected previewD(): string | null {
    const from = this.pendingFrom();
    if (!from) return null;
    const target = this.hoveredPin();
    const end = target ? this.pos(target) : this.cursorBoard();
    if (!end) return null;
    return wirePath(this.pos(from), end);
  }

  /** можно ли бросить текущий провод на наведённый пин */
  protected dropOk(): boolean {
    const from = this.pendingFrom();
    const to = this.hoveredPin();
    if (!from || !to) return false;
    return (from.pin === 'out') !== (to.pin === 'out') && from.node !== to.node;
  }

  protected pinCls(v: NodeValue): string {
    return v === 1 ? 'v1' : v === 0 ? 'v0' : 'vx';
  }

  /** шаг без проверяемых выходов — только подготовка входов */
  protected noExpectation(step: ExerciseStep): boolean {
    return this.activeOutputs().every((o) => step.expect[o] === undefined);
  }

  protected valText(v: NodeValue): string {
    return v === undefined ? '?' : String(v);
  }
}
