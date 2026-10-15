import { WritableSignal, computed, effect, signal, untracked } from '@angular/core';
import { GuideSession } from '../../../guide/guide-session';
import { nextInCourse } from '../../../pages/chapters/chapters';
import { Section } from '../../../sections/sections';
import { BlockInstance, BlockLibrary, BusWire } from '../blocks';
import {
  GATE_H,
  GATE_W,
  GateInstance,
  InputId,
  PinRef,
  Wire,
  samePin,
  uid,
} from '../circuit.model';
import { clampWorld } from '../board-pan';
import { Exercise } from '../exercises';
import { guideFor } from '../guide-registry';
import { GuideAction } from '../guides';
import { ClockController } from './clock-controller';

/** Что режиму авто нужно от упражнения: доска, такт, прогресс сценария и диалоги */
export interface GateGuideHost {
  section(): Section;
  exercise(): Exercise;
  /** индекс текущего упражнения: при его смене режим перезапускается */
  index(): number;
  /** открыто «изменение блока» (?edit=1): режим авто в этом случае не включается */
  editing(): boolean;
  solved(): boolean;
  library(): BlockLibrary;
  gates: WritableSignal<GateInstance[]>;
  wires: WritableSignal<Wire[]>;
  instances: WritableSignal<BlockInstance[]>;
  busWires: WritableSignal<BusWire[]>;
  clock: ClockController;
  clockId(): InputId | null;
  setInput(id: InputId, level: 0 | 1): void;
  afterEdit(): void;
  /** очистить доску и сбросить прогресс сценария */
  clearBoard(): void;
  setPassedSteps(n: number): void;
  notify(text: string): void;
  confirm(options: {
    title: string;
    description: string;
    confirmText: string;
    cancelText: string;
    destructive: boolean;
  }): Promise<boolean>;
  navigate(commands: string[]): void;
}

/**
 * Режим авто на доске со схемой: решение собирается само по шагам, каждый шаг объясняется.
 * «Залипает»: пока он включён, каждое следующее упражнение тоже открывается в нём.
 */
export class GateGuideController {
  /** Разбор для текущего упражнения; null — для него разбора пока нет */
  readonly guide = computed(() => guideFor(this.host.section().slug, this.host.exercise().id));
  readonly on = signal(false);
  /** номер показанного шага (0 — вступление) */
  readonly pos = signal(0);
  readonly cardOpen = signal(true);
  /** что шаг только что добавил на доске: подсвечивается */
  readonly focus = signal<ReadonlySet<string>>(new Set());
  /** идёт серия импульсов такта: «Вперёд» ждёт её окончания */
  readonly busy = signal(false);
  readonly step = computed(() => this.guide()?.steps[this.pos()] ?? null);

  /** Куда ведёт «Следующее упражнение» на последнем шаге: дальше по курсу, в том числе в ассемблер */
  readonly nextExercise = computed(() =>
    nextInCourse(this.host.section().slug, this.host.exercise().id),
  );

  /** имена элементов шага → id на доске */
  private named = new Map<string, string>();

  constructor(
    private readonly host: GateGuideHost,
    private readonly session: GuideSession,
  ) {
    /**
     * Режим авто «залипает»: пока он включён, каждое упражнение открывается в нём.
     * При смене упражнения доска чистая, поэтому разбор стартует без вопросов.
     */
    effect(() => {
      this.host.section();
      this.host.index();
      const wantAuto = this.session.auto();
      const available = this.guide() !== null;
      const edit = this.host.editing();
      untracked(() => {
        if (wantAuto && available && !edit && this.blocksReady(true)) this.begin();
        else this.stop();
      });
    });
  }

  /** Кнопка «Режим авто» на доске */
  async start(): Promise<void> {
    if (!this.guide()) return;
    const hasWork =
      (this.host.instances().length > 0 || this.host.gates().length > 0) && !this.host.solved();
    if (
      hasWork &&
      !(await this.host.confirm({
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
    if (!this.blocksReady(true)) return;
    this.session.auto.set(true);
    this.begin();
  }

  /** «Выйти»: режим выключается и для следующих упражнений; схема остаётся на доске */
  leave(): void {
    this.session.auto.set(false);
    this.stop();
  }

  stop(): void {
    if (!this.on()) return;
    this.on.set(false);
    this.busy.set(false);
    this.focus.set(new Set());
  }

  /** На последнем шаге «Вперёд» превращается в переход к следующему упражнению */
  goNext(): void {
    const next = this.nextExercise();
    if (next) this.host.navigate(['/', next.slug, next.id]);
  }

  next(): void {
    const guide = this.guide();
    if (
      !guide ||
      this.host.clock.ticking() ||
      this.busy() ||
      this.pos() >= guide.steps.length - 1
    ) {
      return;
    }
    const pos = this.pos() + 1;
    this.pos.set(pos);
    this.cardOpen.set(true);
    this.applyStep(pos, true);
  }

  prev(): void {
    if (this.pos() > 0) this.jump(this.pos() - 1);
  }

  /** Перейти к шагу: доска собирается заново и повторяет все шаги до него */
  jump(target: number): void {
    const guide = this.guide();
    if (!guide) return;
    const n = Math.max(0, Math.min(target, guide.steps.length - 1));
    if (n === this.pos() && this.on()) return;
    this.host.clock.stop();
    this.host.clearBoard();
    this.named = new Map();
    let passed = -1;
    for (let i = 1; i <= n; i++) {
      this.applyStep(i, false);
      const c = guide.steps[i].completes;
      if (c !== undefined) passed = Math.max(passed, c);
    }
    if (n === 0) this.focus.set(new Set());
    // шаги сценария упражнения, которые разбор уже прошёл
    this.host.setPassedSteps(passed + 1);
    this.pos.set(n);
    this.cardOpen.set(true);
  }

  /** Разбор «из блоков» нужны решения предыдущих упражнений; без них блоки в палитре закрыты */
  private blocksReady(announce: boolean): boolean {
    const lib = this.host.library();
    const missing = new Set<string>();
    for (const step of this.guide()?.steps ?? []) {
      for (const a of step.do ?? []) {
        if ('block' in a && !lib.available(a.block.blockId)) missing.add(a.block.blockId);
      }
    }
    if (missing.size === 0) return true;
    if (announce) {
      this.host.notify(
        `Для разбора нужны блоки из предыдущих упражнений (${[...missing].join(', ')}): ` +
          'пройдите их — можно тоже в режиме авто.',
      );
    }
    return false;
  }

  private begin(): void {
    this.host.clock.stop();
    this.host.clearBoard();
    this.named = new Map();
    this.focus.set(new Set());
    this.busy.set(false);
    this.pos.set(0);
    this.cardOpen.set(true);
    this.on.set(true);
  }

  /** Выполнить действия шага на доске; live — импульс такта идёт по-настоящему, с задержкой */
  private applyStep(index: number, live: boolean): void {
    const step = this.guide()?.steps[index];
    const focus = new Set<string>();
    for (const action of step?.do ?? []) this.applyAction(action, live, focus);
    this.focus.set(focus);
    this.host.afterEdit();
  }

  /** Серия настоящих тактовых импульсов с паузами, пока доска показывает каждый фронт */
  private pulseSeries(count: number): void {
    this.busy.set(true);
    let left = count;
    const next = () => {
      if (left-- <= 0 || !this.on()) {
        this.busy.set(false);
        return;
      }
      if (!this.host.clock.tick(next)) this.busy.set(false);
    };
    next();
  }

  private applyAction(action: GuideAction, live: boolean, focus: Set<string>): void {
    if ('place' in action) {
      const id = uid('g');
      this.named.set(action.name, id);
      const { x, y } = clampWorld(
        { x: action.at.x - GATE_W / 2, y: action.at.y - GATE_H / 2 },
        GATE_W,
        GATE_H,
      );
      this.host.gates.update((list) => [...list, { id, type: action.place, x, y }]);
      focus.add(id);
    } else if ('wire' in action) {
      const node = (name: string) => this.named.get(name) ?? name;
      const { from, to, pin } = action.wire;
      const target: PinRef = { node: node(to), pin };
      const id = uid('w');
      this.host.wires.update((list) => [
        ...list.filter((w) => !samePin(w.to, target)),
        { id, from: { node: node(from), pin: 'out' }, to: target },
      ]);
      focus.add(id);
    } else if ('block' in action) {
      const { id, blockId, x, y } = action.block;
      this.host.instances.update((list) => [...list, { id, blockId, x, y }]);
      focus.add(id);
    } else if ('bus' in action) {
      const { id, from, to } = action.bus;
      this.host.busWires.update((list) => [...list, { id, from, to }]);
      focus.add(id);
    } else if ('set' in action) {
      for (const [id, level] of Object.entries(action.set)) {
        this.host.setInput(id as InputId, level);
      }
    } else {
      const count = action.pulse === true ? 1 : action.pulse;
      if (live) {
        this.pulseSeries(count);
      } else {
        // при повторе шагов импульсы «прокручиваются» мгновенно
        const clk = this.host.clockId();
        if (clk) {
          for (let i = 0; i < count; i++) {
            this.host.setInput(clk, 1);
            this.host.setInput(clk, 0);
          }
        }
      }
    }
  }
}
