import {
  Component,
  DestroyRef,
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
  OUT_X,
  Point,
  TableRow,
  Wire,
  evaluateCircuit,
  inputsForRow,
  inputYs,
  outputValue,
  outputYs,
  reserveUids,
  settleCircuit,
  zeroInputs,
} from './circuit.model';
import { Exercise } from './exercises';
import { RU_NAMES } from './gate-shapes';
import { SECTIONS, Section } from '../../sections/sections';
import { PixelLock } from '../../ui/pixel-lock';
import { HintLink, HintPopover } from '../../ui/hint-popover';
import { SettingsService } from '../../settings/settings.service';
import { GuideSession } from '../../guide/guide-session';
import { CHAPTERS, nextInCourse } from '../../pages/chapters/chapters';
import { ConfirmService } from '../../ui/confirm.service';
import { GuidePlayer } from '../../guide/guide-player';
import { WaveDiagram } from './lab/wave-diagram';
import { GateBoard } from './lab/gate-board';
import { SuccessAlert } from './lab/success-alert';
import { BoardTools } from './lab/board-tools';
import { ExerciseCard } from './lab/exercise-card';
import { CheckPanel } from './lab/check-panel';
import { FullscreenTask } from './lab/fullscreen-task';
import { PaletteGate } from './lab/gate-palette';
import { ClockController } from './lab/clock-controller';
import { GateGuideController } from './lab/gate-guide';
import { gateLockHint, isGateUnlocked, loadProgress, saveProgress } from './lab/exercise-progress';
import { HISTORY_MAX, Sample, buildWave } from './lab/wave';

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

@Component({
  selector: 'app-circuit-lab',
  imports: [
    BlockBoard,
    CircuitView,
    NgTemplateOutlet,
    GuidePlayer,
    PixelLock,
    HintPopover,
    WaveDiagram,
    SuccessAlert,
    BoardTools,
    ExerciseCard,
    CheckPanel,
    FullscreenTask,
    GateBoard,
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
  /** закрытые элементы упражнения → ссылки на упражнения, где их можно открыть */
  protected readonly hintLinks = computed<HintLink[]>(() => {
    this.hintShown(); // пересчёт при каждом открытии подсказки: прогресс мог измениться
    this.solvedSet();
    const groups = new Map<string, { types: GateType[]; slug: string; id: string }>();
    for (const t of this.paletteGates()) {
      const req = COMPOSITE_GATES[t];
      if (!req || this.isUnlocked(t)) continue;
      const key = `${req.sectionSlug}/${req.exerciseId}`;
      const g = groups.get(key) ?? { types: [], slug: req.sectionSlug, id: req.exerciseId };
      g.types.push(t);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => {
      const section = SECTIONS.find((s) => s.slug === g.slug);
      const title = section?.exercises.find((e) => e.id === g.id)?.title ?? g.id;
      const names = g.types.join(' и ');
      return {
        text: `Элемент ${names} пока закрыт: он откроется, когда вы соберёте «${title}» в разделе «${section?.title ?? g.slug}».`,
        label: `Открыть упражнение «${title}»`,
        route: ['/', g.slug, g.id],
      };
    });
  });
  /** где таблица истинности: под доской или справа */
  protected readonly tableLayout = inject(SettingsService).tableLayout;

  protected readonly dashItems = computed(() =>
    this.exercises().map((ex, i) => ({ title: ex.title, solved: this.solvedSet().has(i) })),
  );
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
  /** квадратики панели элементов на доске */
  protected readonly paletteItems = computed<PaletteGate[]>(() => {
    this.solvedSet(); // открытие элемента зависит от прогресса
    return this.paletteGates().map((type) => {
      const locked = !this.isUnlocked(type);
      return {
        type,
        locked,
        title: locked
          ? this.lockHint(type)
          : `${type} — ${RU_NAMES[type]}${COMPOSITE_GATES[type] ? ' (составной)' : ''}`,
        label: `Добавить элемент ${type}, ${RU_NAMES[type]}`,
      };
    });
  });
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
  /** такт: импульс по кнопке и автогенератор */
  protected readonly clock = new ClockController({
    clockId: () => this.clockId(),
    level: (id) => this.inputState()[id],
    setLevel: (id, level) => this.setInput(id, level),
  });

  protected readonly history = signal<Sample[]>([]);
  protected readonly wave = computed(() => buildWave(this.history(), this.exercise()));

  /* ---------- интерактив ---------- */
  /** сдвиг доски блоков: она без границ, колесом мыши (или за пустое место) её можно двигать */
  protected readonly pan = signal<Point>({ x: 0, y: 0 });
  private readonly gateBoard = viewChild(GateBoard);
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
  private appliedSection: Section | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly cleanup = this.destroyRef.onDestroy(() => {
    this.clock.dispose();
    document.documentElement.classList.remove('board-fullscreen');
  });

  /* ---------- вычисляемое ---------- */
  protected readonly circuit = computed<Circuit>(() => {
    const flat = this.expansion();
    return flat ? flat.circuit : { gates: this.gates(), wires: this.wires() };
  });

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
    const progress = loadProgress(section);
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
      // решённое упражнение открывается с сохранённой схемой (режим авто всё равно начнёт с чистой доски)
      if (load || progress.solved.has(index)) this.restoreSaved();
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

  /**
   * Решённое упражнение запоминает свою схему: она вернётся на доску при следующем открытии,
   * а если из упражнения строится блок, из неё потом собирается и он
   */
  private readonly saveEffect = effect(() => {
    const ex = this.exercise();
    if (!this.solved()) return;
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

  private persist(): void {
    saveProgress(this.section(), this.solvedSet(), this.currentIndex());
  }

  /* ============================================================
     Переключение упражнений
     ============================================================ */

  /** Переход к упражнению — это переход по адресу /<глава>/<упражнение>; доску сменит sectionEffect */
  protected selectExercise(index: number): void {
    if (index === this.currentIndex()) return;
    const ex = this.exercises()[index];
    if (!ex) return;
    void this.router.navigate(['/', this.section().slug, ex.id]);
  }

  /** все упражнения раздела решены */
  protected readonly chapterSolved = computed(
    () => this.solvedSet().size >= this.exercises().length,
  );

  /** куда ведёт стрелка «вправо» с последнего упражнения решённого раздела: в начало следующего */
  private readonly nextChapterTarget = computed(() => {
    const list = this.exercises();
    return nextInCourse(this.section().slug, list[list.length - 1].id);
  });

  /** раздел пройден, и мы на его последнем упражнении: стрелка мигает и ведёт в следующий раздел */
  protected readonly nudgeNext = computed(
    () =>
      this.chapterSolved() &&
      this.currentIndex() === this.exercises().length - 1 &&
      this.nextChapterTarget() !== null,
  );

  protected readonly nextTitle = computed(() => {
    const target = this.nudgeNext() ? this.nextChapterTarget() : null;
    if (!target) return 'Следующее упражнение';
    const title = CHAPTERS.find((c) => c.slug === target.slug)?.title ?? target.slug;
    return `Раздел пройден! Дальше: «${title}»`;
  });

  protected next(): void {
    const target = this.nudgeNext() ? this.nextChapterTarget() : null;
    if (target) {
      void this.router.navigate(['/', target.slug, target.id]);
      return;
    }
    this.selectExercise(Math.min(this.currentIndex() + 1, this.exercises().length - 1));
  }

  protected prev(): void {
    this.selectExercise(Math.max(this.currentIndex() - 1, 0));
  }

  private clearBoard(): void {
    this.clock.stop();
    this.pan.set({ x: 0, y: 0 });
    this.gateBoard()?.resetView();
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
    this.clock.resetEdges();
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

  /** то же, но привязано к экземпляру: можно передавать в дочерние компоненты */
  protected readonly valueAtFn = (node: string): NodeValue => this.valueAt(node);

  /** значение узла с учётом режима упражнения */
  protected valueAt(node: string): NodeValue {
    return this.isStepsMode() ? this.seqValues().get(node) : this.tableValues().get(node);
  }

  /** Щёлкнули по закрытому элементу панели: подсказываем, где его открыть */
  protected onLockedPick(type: GateType): void {
    this.notify(`${this.lockHint(type)} — и элемент откроется`);
    this.hintShown.set(true); // в подсказке есть ссылка на нужное упражнение
  }

  /* ============================================================
     Доска во весь экран
     ============================================================ */

  protected toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    // сначала отменяем начатый провод, а полный экран остаётся
    if (this.gateBoard()?.cancelWire()) return;
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
    if (id === this.clockId() && level === 1) this.clock.countEdge();
    this.inputState.update((s) => ({ ...s, [id]: level }));
    this.touchValues();
    this.recordSample();
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

  protected reset(): void {
    this.clock.stop();
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

  protected notify(text: string): void {
    this.flash.set(text);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(null), 2800);
  }

  /* ============================================================
     Режим авто: пошаговый разбор (учебник + тренажёр)
     ============================================================ */

  private readonly dialogs = inject(ConfirmService);
  /** режим авто: разбор решения шаг за шагом */
  protected readonly gg = new GateGuideController(
    {
      section: () => this.section(),
      exercise: () => this.exercise(),
      index: () => this.currentIndex(),
      editing: () => this.loadSaved(),
      solved: () => this.solved(),
      library: () => this.library(),
      gates: this.gates,
      wires: this.wires,
      instances: this.instances,
      busWires: this.busWires,
      clock: this.clock,
      clockId: () => this.clockId(),
      setInput: (id, level) => this.setInput(id, level),
      afterEdit: () => this.afterEdit(),
      clearBoard: () => this.clearBoard(),
      setPassedSteps: (n) => this.passedSteps.set(n),
      notify: (text) => this.notify(text),
      confirm: (options) => this.dialogs.ask(options),
      navigate: (commands) => void this.router.navigate(commands),
    },
    inject(GuideSession),
  );

  @HostListener('document:keydown.arrowright', ['$event'])
  protected onGuideRight(e: Event): void {
    if (this.gg.on() && !this.isTyping(e)) this.gg.next();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  protected onGuideLeft(e: Event): void {
    if (this.gg.on() && !this.isTyping(e)) this.gg.prev();
  }

  private isTyping(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'INPUT');
  }

  /* ============================================================
     Хелперы для шаблона
     ============================================================ */

  protected isUnlocked = isGateUnlocked;
  protected lockHint = gateLockHint;

  protected labels(): readonly string[] {
    const ex = this.exercise();
    return ex.labels ?? ex.inputs;
  }
}
