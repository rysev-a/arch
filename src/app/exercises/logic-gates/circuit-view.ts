import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  BOARD_H,
  BOARD_W,
  GATE_W,
  GateInstance,
  INPUT_X,
  InputId,
  NodeValue,
  OUT_PIN_X,
  OUT_X,
  PinKind,
  Point,
  Wire,
  inputYs,
  outputYs,
  pinPos,
  wirePath,
} from './circuit.model';
import { BlockInterface, ValueScope } from './blocks';
import { gateBodyPath, gateBubbleCx, gateExtraArc, gatePinY, gatePinsOf } from './gate-shapes';
import {
  PanDrag,
  ZOOM,
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

/**
 * Схема из вентилей только для просмотра — «внутренность» блока.
 * Значения берутся из общей симуляции, так что сигналы здесь живые.
 */
@Component({
  selector: 'app-circuit-view',
  imports: [ViewControls],
  templateUrl: './circuit-view.html',
  styleUrl: './circuit-view.css',
})
export class CircuitView {
  readonly gates = input.required<readonly GateInstance[]>();
  readonly wires = input.required<readonly Wire[]>();
  readonly iface = input.required<BlockInterface>();
  readonly scope = input<ValueScope>(() => undefined);

  /**
   * Раздвинуть вентили друг от друга (для просмотра тесной схемы): координаты умножаются на этот
   * коэффициент, а доска становится шире и выше. 1 — как в решении.
   */
  readonly spread = input(1);
  /** Сдвиг и масштаб доски: она без границ, колесом мыши (или за пустое место) её можно двигать */
  readonly pan = model<Point>({ x: 0, y: 0 });
  readonly zoom = model(1);

  private spreadX(x: number): number {
    return Math.round(150 + (x - 150) * this.spread());
  }
  private spreadY(y: number): number {
    return Math.round(20 + (y - 20) * this.spread());
  }

  /** Вентили на своих (возможно, раздвинутых) местах; перетащенные — на новых */
  protected readonly placed = computed<GateInstance[]>(() =>
    this.gates().map((g) => ({
      ...g,
      x: this.moved()[g.id]?.x ?? this.spreadX(g.x),
      y: this.moved()[g.id]?.y ?? this.spreadY(g.y),
    })),
  );

  /** Ширина доски: при раздвигании растёт, а колонка выходов отъезжает вправо */
  protected readonly W = computed(() => {
    if (this.spread() === 1) return BOARD_W;
    const right = Math.max(0, ...this.gates().map((g) => this.spreadX(g.x)));
    return Math.max(BOARD_W, right + 110 + 160);
  });
  /** На сколько выходы сдвинуты вправо относительно обычной доски */
  protected readonly extraW = computed(() => this.W() - BOARD_W);

  /** Высота доски растёт вместе со схемой: много вентилей или много портов — больше места */
  protected readonly H = computed(() => {
    const f = this.iface();
    const lowest = Math.max(0, ...this.gates().map((g) => this.spreadY(g.y))) + 110;
    const ports = Math.max(f.inputs.length, f.outputs.length) * 50 + 40;
    return Math.max(BOARD_H, lowest, ports);
  });
  protected readonly viewBox = computed(() =>
    viewBoxOf(this.pan(), this.zoom(), this.W(), this.H()),
  );
  protected readonly viewW = computed(() => this.W() / this.zoom());
  protected readonly viewH = computed(() => this.H() / this.zoom());
  protected readonly ZOOM_STEP = ZOOM.step;

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  protected readonly panning = signal(false);
  protected readonly zoomReady = signal(false);
  private panDrag: PanDrag | null = null;

  /** Вентили, которые ученик перетащил при просмотре (временно: схема не меняется) */
  private readonly moved = signal<Record<string, Point>>({});
  private movingId: string | null = null;
  private moveOffset: Point = { x: 0, y: 0 };
  protected readonly viewChanged = computed(
    () =>
      this.pan().x !== 0 ||
      this.pan().y !== 0 ||
      this.zoom() !== 1 ||
      Object.keys(this.moved()).length > 0,
  );

  private lastGates: readonly GateInstance[] | null = null;
  private readonly resetOnNewScheme = effect(() => {
    const list = this.gates();
    untracked(() => {
      const changed = this.lastGates !== null && this.lastGates !== list;
      this.lastGates = list;
      if (changed) {
        this.moved.set({});
        this.pan.set({ x: 0, y: 0 });
        this.zoom.set(1);
      }
    });
  });

  private readonly interaction = effect((onCleanup) => {
    const el = this.svg()?.nativeElement;
    if (!el) return;
    onCleanup(listenMiddleButton(el, (event) => this.beginPan(event)));
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

  private metrics(): { rect: DOMRect; base: number; offX: number; offY: number } {
    const rect = this.svg()!.nativeElement.getBoundingClientRect();
    const base = Math.min(rect.width / this.W(), rect.height / this.H());
    return {
      rect,
      base,
      offX: (rect.width - this.W() * base) / 2,
      offY: (rect.height - this.H() * base) / 2,
    };
  }

  private toBoard(clientX: number, clientY: number): Point {
    if (!this.svg()) return { x: 0, y: 0 };
    const m = this.metrics();
    const scale = m.base * this.zoom();
    return {
      x: (clientX - m.rect.left - m.offX) / scale + this.pan().x,
      y: (clientY - m.rect.top - m.offY) / scale + this.pan().y,
    };
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

  protected zoomBy(factor: number): void {
    const m = this.metrics();
    this.applyZoom(factor, {
      x: (m.rect.width - 2 * m.offX) / 2,
      y: (m.rect.height - 2 * m.offY) / 2,
    });
  }

  private beginPan(event: PointerEvent): void {
    this.panDrag = startPan(event, this.metrics().base * this.zoom(), this.pan());
    this.panning.set(true);
  }

  /** Левая кнопка: за вентиль — переставить его, за пустое место — двигать всю доску */
  protected boardDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const gateEl = target.closest?.('.gate');
    if (gateEl) {
      const id = gateEl.getAttribute('data-id');
      const g = this.placed().find((x) => x.id === id);
      if (!g) return;
      event.preventDefault();
      const p = this.toBoard(event.clientX, event.clientY);
      this.moveOffset = { x: p.x - g.x, y: p.y - g.y };
      this.movingId = g.id;
      return;
    }
    if (target === this.svg()?.nativeElement || target.classList?.contains('cv-bg')) {
      event.preventDefault();
      this.beginPan(event);
    }
  }

  @HostListener('document:pointermove', ['$event'])
  protected onMove(event: PointerEvent): void {
    if (this.panDrag) {
      this.pan.set(dragPan(this.panDrag, event));
      return;
    }
    const id = this.movingId;
    if (id) {
      const p = this.toBoard(event.clientX, event.clientY);
      const { x, y } = clampWorld(
        { x: p.x - this.moveOffset.x, y: p.y - this.moveOffset.y },
        GATE_W,
        48,
      );
      this.moved.update((m) => ({ ...m, [id]: { x, y } }));
    }
  }

  @HostListener('document:pointerup')
  protected onUp(): void {
    this.panDrag = null;
    this.movingId = null;
    this.panning.set(false);
  }

  protected resetView(): void {
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
    this.moved.set({});
  }

  protected readonly GATE_W = GATE_W;
  protected readonly INPUT_X = INPUT_X;
  protected readonly OUT_X = OUT_X;

  /** Входы и выходы: когда их много, растягиваем по всей высоте доски (иначе коробки наезжают друг на друга) */
  protected readonly inputYMap = computed(() => {
    const ids = this.iface().inputs;
    return ids.length > 4 ? spread(ids, this.H()) : inputYs(ids as readonly InputId[]);
  });
  protected readonly outputYMap = computed(() => {
    const ids = this.iface().outputs;
    return ids.length > 4 ? spread(ids, this.H()) : outputYs(ids);
  });

  protected inputY(id: string): number {
    return this.inputYMap()[id] ?? 200;
  }

  protected outputY(id: string): number {
    return this.outputYMap()[id] ?? 200;
  }

  protected label(id: string): string {
    const f = this.iface();
    const i = f.inputs.indexOf(id);
    return f.labels?.[i] ?? id;
  }

  protected val(node: string): NodeValue {
    return this.scope()(node);
  }

  protected pos(ref: { node: string; pin: PinKind }) {
    const p = pinPos(ref, this.placed(), this.outputYMap(), this.inputYMap());
    // колонка выходов при раздвигании уехала вправо вместе с доской
    return ref.pin !== 'out' && this.iface().outputs.includes(ref.node)
      ? { x: p.x + this.extraW(), y: p.y }
      : p;
  }

  protected wireD(w: Wire): string {
    return wirePath(this.pos(w.from), this.pos(w.to));
  }

  protected wireVal(w: Wire): NodeValue {
    return this.val(w.from.node);
  }

  /** значение, пришедшее на входной пин гейта */
  protected pinVal(node: string, pin: PinKind): NodeValue {
    const w = this.wires().find((x) => x.to.node === node && x.to.pin === pin);
    return w ? this.val(w.from.node) : undefined;
  }

  protected cls(v: NodeValue): string {
    return v === 1 ? 'v1' : v === 0 ? 'v0' : 'vx';
  }

  protected text(v: NodeValue): string {
    return v === undefined ? '?' : String(v);
  }

  protected body(g: GateInstance): string {
    return gateBodyPath(g.type);
  }
  protected extra(g: GateInstance): string | null {
    return gateExtraArc(g.type);
  }
  protected bubble(g: GateInstance): number | null {
    return gateBubbleCx(g.type);
  }
  protected pins(g: GateInstance): readonly PinKind[] {
    return gatePinsOf(g.type);
  }
  protected pinY(g: GateInstance, pin: PinKind): number {
    return gatePinY(g.type, pin);
  }
  protected outX(g: GateInstance): number {
    return OUT_PIN_X[g.type];
  }
}

/** Узлы равномерно по всей высоте */
function spread(names: readonly string[], height: number): Record<string, number> {
  const res: Record<string, number> = {};
  const step = names.length > 1 ? (height - 80) / (names.length - 1) : 0;
  names.forEach((n, i) => (res[n] = names.length === 1 ? height / 2 : 40 + i * step));
  return res;
}
