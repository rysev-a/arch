import { Component, computed, input } from '@angular/core';
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
  Wire,
  inputYs,
  outputYs,
  pinPos,
  wirePath,
} from './circuit.model';
import { BlockInterface, ValueScope } from './blocks';
import { gateBodyPath, gateBubbleCx, gateExtraArc, gatePinY, gatePinsOf } from './gate-shapes';

/**
 * Схема из вентилей только для просмотра — «внутренность» блока.
 * Значения берутся из общей симуляции, так что сигналы здесь живые.
 */
@Component({
  selector: 'app-circuit-view',
  templateUrl: './circuit-view.html',
  styleUrl: './circuit-view.css',
})
export class CircuitView {
  readonly gates = input.required<readonly GateInstance[]>();
  readonly wires = input.required<readonly Wire[]>();
  readonly iface = input.required<BlockInterface>();
  readonly scope = input<ValueScope>(() => undefined);

  protected readonly W = BOARD_W;
  protected readonly H = BOARD_H;
  protected readonly GATE_W = GATE_W;
  protected readonly INPUT_X = INPUT_X;
  protected readonly OUT_X = OUT_X;

  protected readonly inputYMap = computed(() => inputYs(this.iface().inputs as readonly InputId[]));
  protected readonly outputYMap = computed(() => outputYs(this.iface().outputs));

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
    return pinPos(ref, [...this.gates()], this.outputYMap(), this.inputYMap());
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
