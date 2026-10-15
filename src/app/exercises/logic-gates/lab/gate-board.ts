import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  BOARD_H,
  BOARD_W,
  Circuit,
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
  Wire,
  createsCycle,
  inputYs,
  outputYs,
  pinPos,
  samePin,
  uid,
  wirePath,
} from '../circuit.model';
import { gateBodyPath, gateBubbleCx, gateExtraArc, gatePinY, gatePinsOf } from '../gate-shapes';
import {
  PanDrag,
  ZOOM,
  clampWorld,
  dragPan,
  isClick,
  listenActivity,
  listenMiddleButton,
  listenStickyCancel,
  listenZoomWheel,
  startPan,
  viewBoxOf,
  wheelFactor,
  zoomAround,
} from '../board-pan';
import { AutoWire, suggestWires } from '../auto-wire';
import {
  AUTO_WIRE_RADIUS_FACTOR,
  BOARD_HEIGHT_MAX,
  BOARD_HEIGHT_MIN,
  SettingsService,
} from '../../../settings/settings.service';
import { ViewControls } from '../view-controls';
import { GatePalette, PaletteGate } from './gate-palette';

/** id «призрака» элемента, пока его несут из палитры */
const DROP_ID = 'auto-new';

/**
 * Доска со схемой из вентилей: элементы, провода, входы и выходы упражнения.
 * Здесь всё, что касается мыши и холста: перенос элементов, провода, автоподстановка, сдвиг и масштаб,
 * высота. Сама схема (`gates`, `wires`) принадлежит упражнению — доска меняет её через двустороннюю связь
 * и сообщает `edited`, чтобы значения пересчитались.
 */
@Component({
  selector: 'app-gate-board',
  imports: [ViewControls, GatePalette],
  templateUrl: './gate-board.html',
  styleUrl: './gate-board.css',
})
export class GateBoard {
  /** схема: элементы и провода; доска их меняет */
  readonly gates = model.required<GateInstance[]>();
  readonly wires = model.required<Wire[]>();
  /** схема целиком (для проверки циклов) */
  readonly circuit = input.required<Circuit>();
  /** входы упражнения и подписи на доске (по порядку входов) */
  readonly inputs = input.required<readonly InputId[]>();
  readonly labels = input.required<readonly string[]>();
  readonly outputs = input.required<readonly string[]>();
  readonly inputState = input.required<InputState>();
  readonly clockId = input<InputId | null>(null);
  /** в пошаговом режиме циклы разрешены — это суть защёлок */
  readonly stepsMode = input(false);
  /** значение узла схемы — для цвета проводов и контактов */
  readonly valueFn = input.required<(node: string) => NodeValue>();
  /** элементы панели на доске */
  readonly palette = input<readonly PaletteGate[]>([]);
  /** что только что добавил шаг режима авто: подсвечивается */
  readonly guideFocus = input<ReadonlySet<string>>(new Set());
  /** доска развёрнута на весь экран: размер определяет экран, а не пропорции */
  readonly fullscreen = input(false);

  readonly toggleInput = output<InputId>();
  /** схема изменилась пользователем */
  readonly edited = output<void>();
  readonly message = output<string>();
  /** щёлкнули по закрытому элементу панели */
  readonly lockedPick = output<GateType>();

  private readonly settings = inject(SettingsService);

  // константы для шаблона
  protected readonly GATE_W = GATE_W;
  protected readonly INPUT_X = INPUT_X;
  protected readonly OUT_X = OUT_X;
  protected readonly ZOOM_STEP = ZOOM.step;

  protected readonly boardEl = viewChild<ElementRef<SVGSVGElement>>('board');

  /* ---------- размеры и положение ---------- */
  protected readonly inputYMap = computed<Record<string, number>>(() => inputYs(this.inputs()));
  protected readonly outputYMap = computed<Record<string, number>>(() => outputYs(this.outputs()));

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
  /** высота доски, заданная вручную (null — по пропорциям) */
  protected readonly boardHeight = this.settings.boardHeight;
  /** ширина доски на экране в пикселях (следим за ней, чтобы высота «как есть» не меняла масштаб) */
  private readonly boardPxW = signal(0);
  /** высота задана вручную: масштаб определяет только ширина, высота лишь открывает больше или меньше поля */
  private readonly manualHeight = computed(
    () => !this.fullscreen() && this.boardHeight() !== null && this.boardPxW() > 0,
  );
  /** высота видимой части «мира» в единицах доски (при масштабе 1) */
  private readonly worldH = computed(() =>
    this.manualHeight() ? (this.boardHeight()! * BOARD_W) / this.boardPxW() : BOARD_H,
  );
  protected readonly viewBox = computed(() =>
    viewBoxOf(this.pan(), this.zoom(), BOARD_W, this.worldH()),
  );
  protected readonly viewW = computed(() => BOARD_W / this.zoom());
  protected readonly viewH = computed(() => this.worldH() / this.zoom());

  private readonly sizeWatch = effect((onCleanup) => {
    const el = this.boardEl()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => this.boardPxW.set(el.getBoundingClientRect().width));
    ro.observe(el);
    this.boardPxW.set(el.getBoundingClientRect().width);
    onCleanup(() => ro.disconnect());
  });

  /* ---------- перенос, провода ---------- */
  private panDrag: PanDrag | null = null;
  private resizeDrag: { startY: number; startH: number } | null = null;
  protected readonly placing = signal<GateType | null>(null);
  protected readonly cursorClient = signal<Point | null>(null);
  protected readonly movingId = signal<string | null>(null);
  protected readonly pendingFrom = signal<PinRef | null>(null);
  /** провод «прилип» к мыши: после щелчка по контакту он тянется за курсором до следующего щелчка */
  protected readonly pendingSticky = signal(false);
  private pinDownAt: Point = { x: 0, y: 0 };
  protected readonly cursorBoard = signal<Point | null>(null);
  protected readonly hoveredPin = signal<PinRef | null>(null);
  private moveOffset: Point = { x: 0, y: 0 };
  private moveFrom: Point = { x: 0, y: 0 };
  /** связи, предложенные в этом перетаскивании (для удержания) */
  private autoMemo: AutoWire[] = [];
  /** элемент сдвинули заметно (а не просто щёлкнули по нему) */
  private readonly movedFar = signal(false);

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

  /* ---------- автоподстановка ---------- */

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
    if (!this.settings.autoWire()) return [];
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

  private autoWiresFor(gate: GateInstance, keep: readonly AutoWire[] = []): AutoWire[] {
    return suggestWires({
      keep,
      gate,
      gates: this.gates(),
      wires: this.wires(),
      inputYMap: this.inputYMap(),
      outputYMap: this.outputYMap(),
      stepsMode: this.stepsMode(),
      radius: this.settings.autoWireRadius() * AUTO_WIRE_RADIUS_FACTOR,
    });
  }

  private addAutoWires(list: readonly AutoWire[]): void {
    this.wires.update((all) => [
      ...all,
      ...list.map((w) => ({ id: uid('w'), from: w.from, to: w.to })),
    ]);
    this.edited.emit();
  }

  /* ============================================================
     Панель элементов: перенос на доску
     ============================================================ */

  protected startPlace(event: PointerEvent, type: GateType): void {
    if (this.palette().find((p) => p.type === type)?.locked) {
      this.lockedPick.emit(type);
      return;
    }
    event.preventDefault();
    this.placing.set(type);
    this.cursorClient.set({ x: event.clientX, y: event.clientY });
  }

  protected place(type: GateType, at: Point, held: readonly AutoWire[] | null = null): void {
    const { x, y } = clampWorld({ x: at.x - GATE_W / 2, y: at.y - GATE_H / 2 }, GATE_W, GATE_H);
    const gate: GateInstance = { id: uid('g'), type, x, y };
    // связи, показанные пунктиром у «призрака», переносим на настоящий элемент
    const remap = (r: PinRef): PinRef => (r.node === DROP_ID ? { ...r, node: gate.id } : r);
    const keep = (held ?? []).map((w) => ({ ...w, from: remap(w.from), to: remap(w.to) }));
    const auto = held && this.settings.autoWire() ? this.autoWiresFor(gate, keep) : [];
    this.gates.update((list) => [...list, gate]);
    if (auto.length > 0) this.addAutoWires(auto);
    else this.edited.emit();
  }

  private defaultSpot(): Point {
    const n = this.gates().length;
    return { x: 400, y: 100 + (n % 4) * 70 };
  }

  /* ============================================================
     Перемещение элемента и провода
     ============================================================ */

  protected gateDown(event: PointerEvent, gate: GateInstance): void {
    event.preventDefault();
    const p = this.toBoard(event.clientX, event.clientY);
    this.moveOffset = { x: p.x - gate.x, y: p.y - gate.y };
    this.moveFrom = { x: gate.x, y: gate.y };
    this.movedFar.set(false);
    this.movingId.set(gate.id);
  }

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

  /** Отменить начатый провод; true — провод был */
  cancelWire(): boolean {
    const had = this.pendingFrom() !== null;
    this.pendingFrom.set(null);
    this.pendingSticky.set(false);
    this.hoveredPin.set(null);
    this.cursorBoard.set(null);
    return had;
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
    this.edited.emit();
  }

  protected removeGate(id: string): void {
    this.gates.update((list) => list.filter((g) => g.id !== id));
    this.wires.update((list) => list.filter((w) => w.from.node !== id && w.to.node !== id));
    this.edited.emit();
  }

  private tryConnect(a: PinRef, b: PinRef): void {
    const from = a.pin === 'out' ? a : b;
    const to = a.pin === 'out' ? b : a;
    if (from.pin !== 'out' || to.pin === 'out' || from.node === to.node) {
      this.message.emit('Соединять нужно выход элемента со входом другого');
      return;
    }
    // на входной пин можно подать только один сигнал — старый провод заменяется
    this.wires.update((list) => list.filter((w) => !samePin(w.to, to)));
    // в пошаговом режиме циклы разрешены — это суть защёлок
    if (!this.stepsMode() && createsCycle(this.circuit(), from, to)) {
      this.message.emit('Так схема замкнётся в цикл — сигнал будет бежать по кругу');
      return;
    }
    this.wires.update((list) => [...list, { id: uid('w'), from, to }]);
    this.edited.emit();
  }

  /* ============================================================
     Глобальные обработчики перетаскивания
     ============================================================ */

  @HostListener('document:pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (this.resizeDrag) {
      this.setBoardHeight(this.resizeDrag.startH + event.clientY - this.resizeDrag.startY);
      return;
    }
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
  protected onPointerUp(event: PointerEvent): void {
    if (this.resizeDrag) {
      this.resizeDrag = null;
      return;
    }
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
        } else if (el.closest('.board-palette')) {
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
     Сдвиг, масштаб, высота
     ============================================================ */

  /** Положение доски на экране: пикселей на единицу при масштабе 1 и поля от вписывания в контейнер */
  private metrics(): { rect: DOMRect; base: number; offX: number; offY: number } {
    const rect = this.boardEl()!.nativeElement.getBoundingClientRect();
    if (this.manualHeight()) {
      // высота задана вручную: масштаб по ширине, доска прижата к верху — поля не нужны
      return { rect, base: rect.width / BOARD_W, offX: 0, offY: 0 };
    }
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

  private toBoard(clientX: number, clientY: number): Point {
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

  /** Кнопки «+» и «−»: масштаб относительно центра видимой доски */
  protected zoomBy(factor: number): void {
    const m = this.metrics();
    this.applyZoom(factor, {
      x: (m.rect.width - 2 * m.offX) / 2,
      y: (m.rect.height - 2 * m.offY) / 2,
    });
  }

  /** Вернуть доску на место и масштаб 100 % */
  resetView(): void {
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
  }

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

  /** Начало изменения высоты доски: тянут за ручку под ней */
  protected resizeDown(event: PointerEvent): void {
    const svg = this.boardEl()?.nativeElement;
    if (!svg) return;
    event.preventDefault();
    this.resizeDrag = { startY: event.clientY, startH: svg.getBoundingClientRect().height };
  }

  protected resizeKey(event: KeyboardEvent): void {
    const svg = this.boardEl()?.nativeElement;
    const step = event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0;
    if (!svg || step === 0) return;
    event.preventDefault();
    this.setBoardHeight(svg.getBoundingClientRect().height + step);
  }

  private setBoardHeight(h: number): void {
    this.settings.boardHeight.set(
      Math.round(Math.min(BOARD_HEIGHT_MAX, Math.max(BOARD_HEIGHT_MIN, h))),
    );
  }

  /* ============================================================
     Хелперы для шаблона
     ============================================================ */

  protected pos(ref: PinRef): Point {
    return pinPos(ref, this.gates(), this.outputYMap(), this.inputYMap());
  }

  protected outPinX(type: GateType): number {
    return OUT_PIN_X[type];
  }

  protected bodyPath = gateBodyPath;
  protected bubbleCx = gateBubbleCx;
  protected extraArc = gateExtraArc;
  protected gatePins = gatePinsOf;
  protected pinY = gatePinY;

  /** значение узла схемы */
  protected val(node: string): NodeValue {
    return this.valueFn()(node);
  }

  /** подпись входа на доске (может отличаться от id: R, S, D, E…) */
  protected inputLabel(id: InputId): string {
    return this.labels()[this.inputs().indexOf(id)] ?? id;
  }

  /** значение на пине: для выходного — значение узла, для входного — сигнал с провода */
  protected pinValue(node: string, pin: PinKind): NodeValue {
    if (pin === 'out') return this.val(node);
    const wire = this.wires().find((w) => samePin(w.to, { node, pin }));
    return wire ? this.val(wire.from.node) : undefined;
  }

  protected wireValue(w: Wire): NodeValue {
    return this.val(w.from.node);
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

  protected valText(v: NodeValue): string {
    return v === undefined ? '?' : String(v);
  }
}
