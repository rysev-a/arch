import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NodeValue, Point, wirePath } from './circuit.model';
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
import {
  BlockInstance,
  BlockInterface,
  BlockLibrary,
  BlockPort,
  BusEnd,
  BusWire,
  Expansion,
  PortsOf,
  TOP,
  ValueScope,
  addBusWire,
  connectionError,
  endInfo,
  isSourceEnd,
  portValues,
} from './blocks';
import {
  BLOCK_W,
  BoxLayout,
  PinRow,
  SIDE_W,
  layoutBox,
  pinCenter,
  rowKey,
  sideBoxes,
} from './block-layout';
import { busText } from './interfaces';

export const BLOCKS_BOARD_W = 880;
export const BLOCKS_BOARD_H = 560;

/** Провод на доске: готовый путь, подпись и класс окраски */
interface WireView {
  id: string;
  d: string;
  mx: number;
  my: number;
  text: string;
  width: number;
  cls: string;
}

/**
 * Доска с блоками: прямоугольники с типизированными портами, соединяемые шинами.
 * Порт можно раскрыть (▸) и тянуть провод от отдельного поля. Типы совместимы только по имени.
 */
@Component({
  selector: 'app-block-board',
  imports: [ViewControls],
  templateUrl: './block-board.html',
  styleUrl: './block-board.css',
})
export class BlockBoard {
  /** Порты самого упражнения (или заглядываемого блока) */
  readonly iface = input.required<BlockInterface>();
  readonly library = input.required<BlockLibrary>();
  readonly instances = model<BlockInstance[]>([]);
  readonly busWires = model<BusWire[]>([]);
  readonly expansion = input<Expansion | null>(null);
  readonly scope = input<ValueScope>(() => undefined);
  /** Только просмотр: ничего нельзя двигать, соединять и удалять */
  readonly readonly = input(false);
  /** Узел входа-такта: подсвечивается на доске */
  readonly clockNode = input<string | null>(null);
  readonly height = input(BLOCKS_BOARD_H);
  /** Сдвиг доски: она без границ, колесом мыши (или за пустое место) её можно двигать */
  readonly pan = model<Point>({ x: 0, y: 0 });
  /** Масштаб доски: 1 — как задумано, меньше — «отъехать», больше — «приблизить» */
  readonly zoom = model(1);
  /**
   * Раздвинуть блоки друг от друга (для просмотра тесной схемы): координаты блоков умножаются на этот
   * коэффициент, а доска становится шире и выше. 1 — как в решении.
   */
  readonly spread = input(1);

  /** Щелчок по биту входа упражнения: узел, который нужно переключить */
  readonly toggle = output<string>();
  /** Заглянуть внутрь экземпляра блока */
  readonly inspect = output<string>();
  /** Сообщение для ученика (почему провод не соединился) */
  readonly message = output<string>();

  /** Ширина доски: при раздвигании блоков она растёт, чтобы колонка выходов не оказалась поверх блоков */
  protected readonly W = computed(() => {
    const k = this.spread();
    if (k === 1) return BLOCKS_BOARD_W;
    const right = Math.max(0, ...this.instances().map((i) => this.spreadX(i.x)));
    return Math.max(BLOCKS_BOARD_W, Math.round(right + BLOCK_W + 30 + SIDE_W + 6));
  });
  protected readonly H = computed(() => {
    if (this.spread() === 1) return this.height();
    const bottom = Math.max(0, ...this.instances().map((i) => this.spreadY(i.y) + 290));
    return Math.max(this.height(), Math.round(bottom));
  });
  protected readonly viewBox = computed(() =>
    viewBoxOf(this.pan(), this.zoom(), this.W(), this.H()),
  );
  protected readonly viewW = computed(() => this.W() / this.zoom());
  protected readonly viewH = computed(() => this.H() / this.zoom());
  protected readonly ZOOM_STEP = ZOOM.step;

  private spreadX(x: number): number {
    return Math.round(SIDE_W + 18 + (x - (SIDE_W + 18)) * this.spread());
  }
  private spreadY(y: number): number {
    return Math.round(20 + (y - 20) * this.spread());
  }
  protected readonly BLOCK_W = BLOCK_W;
  protected readonly Math = Math;

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  protected readonly panning = signal(false);
  /** на доску нажали и курсор с неё не уходил: колесо мыши меняет масштаб */
  protected readonly zoomReady = signal(false);
  private panDrag: PanDrag | null = null;
  /**
   * В режиме просмотра (заглянули внутрь блока) блоки тоже можно двигать — чтобы раздвинуть тесную
   * схему и разобраться. Это временная раскладка: сама схема не меняется, при смене схемы она сбрасывается.
   */
  private readonly moved = signal<Record<string, Point>>({});
  protected readonly viewChanged = computed(
    () =>
      this.pan().x !== 0 ||
      this.pan().y !== 0 ||
      this.zoom() !== 1 ||
      Object.keys(this.moved()).length > 0,
  );

  private lastInstances: readonly BlockInstance[] | null = null;
  private readonly resetOnNewScheme = effect(() => {
    const list = this.instances(); // другая схема (или другой блок) — раскладка начинается заново
    untracked(() => {
      const changed = this.lastInstances !== null && this.lastInstances !== list;
      this.lastInstances = list;
      if (changed && this.readonly()) {
        this.moved.set({});
        this.pan.set({ x: 0, y: 0 });
        this.zoom.set(1);
      }
    });
  });

  /** Колесо мыши: двигаем доску, не трогая блоки и шины под курсором */
  private readonly middleButton = effect((onCleanup) => {
    const el = this.svg()?.nativeElement;
    if (!el) return;
    onCleanup(listenMiddleButton(el, (event) => this.beginPan(event)));
    onCleanup(
      listenStickyCancel(
        el,
        () => this.sticky(),
        (t) => !!t.closest('.bpin-hit'),
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

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly pending = signal<BusEnd | null>(null);
  /** шина «прилипла» к мыши: после щелчка по порту она тянется за курсором до следующего щелчка */
  protected readonly sticky = signal(false);
  private pinDownAt: Point = { x: 0, y: 0 };
  protected readonly cursor = signal<Point | null>(null);
  protected readonly hover = signal<string | null>(null);
  protected readonly movingId = signal<string | null>(null);
  private moveOffset: Point = { x: 0, y: 0 };

  /* ---------- раскладка ---------- */

  protected readonly portsOf = computed<PortsOf>(() => {
    const iface = this.iface();
    const lib = this.library();
    const insts = this.instances();
    return (node) =>
      node === TOP ? iface.ports : lib.def(insts.find((i) => i.id === node)?.blockId ?? '')?.ports;
  });

  protected readonly boxes = computed<BoxLayout[]>(() => {
    const open = this.expanded();
    const { inBox, outBox } = sideBoxes(this.iface().ports, open, this.W());
    const lib = this.library();
    const blocks = this.instances().map((inst) => {
      const def = lib.def(inst.blockId);
      return layoutBox(
        inst.id,
        def?.title ?? 'Неизвестный блок',
        def?.ports ?? [],
        open,
        {
          x: this.moved()[inst.id]?.x ?? this.spreadX(inst.x),
          y: this.moved()[inst.id]?.y ?? this.spreadY(inst.y),
          w: BLOCK_W,
        },
        'block',
      );
    });
    return [inBox, outBox, ...blocks];
  });

  /** Все пины по ключу строки */
  private readonly pins = computed(() => {
    const map = new Map<string, { box: BoxLayout; row: PinRow; pos: Point }>();
    for (const box of this.boxes()) {
      for (const row of box.rows) map.set(row.key, { box, row, pos: pinCenter(box, row) });
    }
    return map;
  });

  /** Пин строки; если поле не раскрыто — пин ближайшего раскрытого родителя */
  private pinFor(end: BusEnd): { box: BoxLayout; row: PinRow; pos: Point } | undefined {
    const pins = this.pins();
    let path = end.path;
    for (;;) {
      const hit = pins.get(rowKey({ ...end, path }));
      if (hit) return hit;
      const dot = path.lastIndexOf('.');
      if (path === '') return undefined;
      path = dot < 0 ? '' : path.slice(0, dot);
    }
  }

  protected readonly wiresView = computed<WireView[]>(() => {
    const exp = this.expansion();
    const scope = this.scope();
    const portsOf = this.portsOf();
    return this.busWires().flatMap((w) => {
      const a = this.pinFor(w.from);
      const b = this.pinFor(w.to);
      if (!a || !b) return [];
      const info = endInfo(w.from, portsOf);
      const values: NodeValue[] = exp && info ? portValues(scope, exp, w.from, portsOf) : [];
      const width = info?.length ?? 1;
      const known = values.length > 0 && values.every((v) => v !== undefined);
      const cls =
        width === 1
          ? values[0] === 1
            ? 'v1'
            : values[0] === 0
              ? 'v0'
              : 'vx'
          : known
            ? 'bus'
            : 'bus vx';
      return [
        {
          id: w.id,
          d: wirePath(a.pos, b.pos),
          mx: (a.pos.x + b.pos.x) / 2,
          my: (a.pos.y + b.pos.y) / 2,
          text: busText(values),
          width,
          cls,
        },
      ];
    });
  });

  protected readonly preview = computed<{ d: string; ok: boolean } | null>(() => {
    const from = this.pending();
    if (!from) return null;
    const a = this.pinFor(from);
    if (!a) return null;
    const hoverKey = this.hover();
    const target = hoverKey ? this.pins().get(hoverKey) : undefined;
    const end = target?.pos ?? this.cursor();
    if (!end) return null;
    // провод рисуется от источника к приёмнику, как на готовой схеме
    const flip = a.row.side === 'in';
    const d = flip ? wirePath(end, a.pos) : wirePath(a.pos, end);
    return { d, ok: !!target && this.canJoin(from, target.row.end) };
  });

  /** Какие пины подходят к начатому проводу: остальные приглушаются */
  private readonly compatible = computed(() => {
    const from = this.pending();
    const set = new Set<string>();
    if (!from) return set;
    for (const [key, p] of this.pins()) if (this.canJoin(from, p.row.end)) set.add(key);
    return set;
  });

  protected dim(row: PinRow): boolean {
    return this.pending() !== null && !this.compatible().has(row.key);
  }

  /* ---------- значения ---------- */

  /** значения бит строки по порядку — для подписей у колонок упражнения */
  protected rowText(row: PinRow): string {
    return busText(row.nodes.map((n) => this.scope()(n)));
  }

  protected bitValue(node: string): NodeValue {
    return this.scope()(node);
  }

  protected chipX(row: PinRow, index: number, boxW: number): number {
    return boxW - 16 - (row.nodes.length - index) * 21;
  }

  protected isClock(node: string): boolean {
    return node === this.clockNode();
  }

  /* ---------- раскрытие полей ---------- */

  protected toggleExpand(row: PinRow, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(row.key)) {
        // закрывая порт, закрываем и вложенные поля
        for (const k of next) if (k === row.key || k.startsWith(`${row.key}.`)) next.delete(k);
      } else {
        next.add(row.key);
      }
      return next;
    });
  }

  /* ---------- провода ---------- */

  /** Можно ли соединить два конца (в любом порядке) */
  private canJoin(a: BusEnd, b: BusEnd): boolean {
    const { from, to } = this.orient(a, b);
    return connectionError(from, to, this.portsOf()) === undefined;
  }

  /** Источник — тот конец, с которого идёт сигнал */
  private orient(a: BusEnd, b: BusEnd): { from: BusEnd; to: BusEnd } {
    const portsOf = this.portsOf();
    const ia = endInfo(a, portsOf);
    return ia && isSourceEnd(a, ia) ? { from: a, to: b } : { from: b, to: a };
  }

  protected pinDown(event: PointerEvent, row: PinRow): void {
    if (this.readonly()) return;
    event.preventDefault();
    event.stopPropagation();
    const from = this.pending();
    if (from && this.sticky()) {
      // шина уже тянется за мышью: этот щелчок — её конец (повторный щелчок по началу — отмена)
      this.cancelWire();
      if (!sameEnd(from, row.end)) this.connect(from, row.end);
      return;
    }
    this.pending.set(row.end);
    this.sticky.set(false);
    this.pinDownAt = { x: event.clientX, y: event.clientY };
    this.hover.set(null);
    this.cursor.set(this.toBoard(event.clientX, event.clientY));
  }

  /** Отменить начатую шину */
  protected cancelWire(): void {
    this.pending.set(null);
    this.sticky.set(false);
    this.hover.set(null);
    this.cursor.set(null);
  }

  protected pinEnter(row: PinRow): void {
    if (this.pending()) this.hover.set(row.key);
  }

  protected pinLeave(row: PinRow): void {
    if (this.hover() === row.key) this.hover.set(null);
  }

  protected removeWire(id: string): void {
    if (this.readonly()) return;
    this.busWires.update((list) => list.filter((w) => w.id !== id));
  }

  protected removeInstance(id: string, event: Event): void {
    event.stopPropagation();
    this.instances.update((list) => list.filter((i) => i.id !== id));
    this.busWires.update((list) => list.filter((w) => w.from.node !== id && w.to.node !== id));
  }

  private connect(a: BusEnd, b: BusEnd): void {
    const { from, to } = this.orient(a, b);
    const error = connectionError(from, to, this.portsOf());
    if (error) {
      this.message.emit(error);
      return;
    }
    const id = this.nextId();
    this.busWires.update((list) => addBusWire(list, { id, from, to }, this.portsOf()));
  }

  private nextId(): string {
    const used = new Set(this.busWires().map((w) => w.id));
    let n = used.size + 1;
    while (used.has(`b${n}`)) n++;
    return `b${n}`;
  }

  /* ---------- перемещение блоков ---------- */

  protected boxDown(event: PointerEvent, box: BoxLayout): void {
    if (box.kind !== 'block') return;
    event.preventDefault();
    const p = this.toBoard(event.clientX, event.clientY);
    this.moveOffset = { x: p.x - box.x, y: p.y - box.y };
    this.movingId.set(box.node);
  }

  @HostListener('document:pointermove', ['$event'])
  protected onMove(event: PointerEvent): void {
    if (this.panDrag) {
      this.pan.set(dragPan(this.panDrag, event));
      return;
    }
    const id = this.movingId();
    if (id) {
      const p = this.toBoard(event.clientX, event.clientY);
      const box = this.boxes().find((b) => b.node === id);
      const h = box?.h ?? 80;
      const { x, y } = clampWorld(
        { x: p.x - this.moveOffset.x, y: p.y - this.moveOffset.y },
        BLOCK_W,
        h,
      );
      if (this.readonly()) {
        // просмотр: двигаем только на экране (в «раздвинутых» координатах), схема не меняется
        this.moved.update((m) => ({ ...m, [id]: { x, y } }));
      } else {
        this.instances.update((list) => list.map((i) => (i.id === id ? { ...i, x, y } : i)));
      }
      return;
    }
    if (this.pending()) this.cursor.set(this.toBoard(event.clientX, event.clientY));
  }

  @HostListener('document:pointerup', ['$event'])
  protected onUp(event: PointerEvent): void {
    if (this.panDrag) {
      this.panDrag = null;
      this.panning.set(false);
      return;
    }
    if (this.movingId()) {
      this.movingId.set(null);
      return;
    }
    const from = this.pending();
    if (!from || this.sticky()) return;
    const target = this.hover() ? this.pins().get(this.hover()!) : undefined;
    if (target && !sameEnd(from, target.row.end)) {
      // протянули и отпустили над другим портом
      this.connect(from, target.row.end);
      this.cancelWire();
    } else if (isClick(this.pinDownAt, event)) {
      // просто щёлкнули по порту: шина тянется за мышью до следующего щелчка
      this.sticky.set(true);
      this.message.emit(
        'Кликните по порту, куда ведёт шина. Esc или клик в пустом месте — отмена.',
      );
    } else {
      this.cancelWire();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.pending()) this.cancelWire();
  }

  private metrics(): { rect: DOMRect; base: number; offX: number; offY: number } {
    const rect = this.svg()!.nativeElement.getBoundingClientRect();
    // доска вписана в контейнер с сохранением пропорций (в полноэкранном режиме есть поля)
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

  private beginPan(event: PointerEvent): void {
    this.panDrag = startPan(event, this.boardScale(), this.pan());
    this.panning.set(true);
  }

  /** Левая кнопка на пустом месте доски тоже двигает её (для тачпадов и телефонов) */
  protected boardDown(event: PointerEvent): void {
    if (event.button !== 0 || this.pending()) return;
    const target = event.target as Element;
    if (target === this.svg()?.nativeElement || target.classList?.contains('bb-bg')) {
      event.preventDefault();
      this.beginPan(event);
    }
  }

  /** Вернуть доску на место: сдвиг и (при просмотре) временную раскладку блоков */
  protected resetView(): void {
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
    this.moved.set({});
  }

  protected typeTitle(port: BlockPort): string {
    return port.type;
  }
}

const sameEnd = (a: BusEnd, b: BusEnd): boolean =>
  a.node === b.node && a.port === b.port && a.path === b.path;
