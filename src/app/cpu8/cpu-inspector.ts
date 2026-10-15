import { Component, computed, input, signal } from '@angular/core';
import { BlockBoard } from '../exercises/logic-gates/block-board';
import { CircuitView } from '../exercises/logic-gates/circuit-view';
import {
  BlockDef,
  BlockInterface,
  BlockSolution,
  Expansion,
  Solution,
  ValueScope,
  childScope,
  isBlockSolution,
  isGateSolution,
  isNativeSolution,
} from '../exercises/logic-gates/blocks';
import { CPU8_BLOCKS, cpu8Library } from './blocks';
import { GateMachine } from './gate-machine';

interface Level {
  title: string;
  def: BlockDef;
  iface: BlockInterface;
  solution: Solution;
  expansion: Expansion;
  scope: ValueScope;
}

/**
 * «Устройство процессора»: схема процессора из блоков, в которую можно спускаться
 * вплоть до отдельных вентилей. Значения на проводах — живые, по текущему такту.
 */
@Component({
  selector: 'app-cpu-inspector',
  imports: [BlockBoard, CircuitView],
  templateUrl: './cpu-inspector.html',
  styleUrl: './cpu-inspector.css',
})
export class CpuInspector {
  readonly machine = input.required<GateMachine>();
  /** Счётчик изменений состояния: по нему доска перерисовывает значения */
  readonly version = input.required<number>();

  protected readonly library = cpu8Library;
  protected readonly path = signal<string[]>([]);

  /** Значения узлов плоской схемы; чтение version делает расчёт «живым» */
  private readonly scope = computed<ValueScope>(() => {
    const m = this.machine();
    const v = this.version;
    return (node) => {
      v();
      return m.sim.get(node);
    };
  });

  protected readonly levels = computed<Level[]>(() => {
    const cpu = CPU8_BLOCKS.get('c8-cpu')!;
    const exp = this.machine().expansion;
    const out: Level[] = [
      {
        title: cpu.def.title,
        def: cpu.def,
        iface: cpu.def,
        solution: cpu.solution,
        expansion: exp,
        scope: this.scope(),
      },
    ];
    for (const id of this.path()) {
      const cur = out[out.length - 1];
      const sub = cur.expansion.subs.get(id);
      if (!sub) break;
      out.push({
        title: `${sub.def.title} (${id})`,
        def: sub.def,
        iface: sub.def,
        solution: sub.solution,
        expansion: sub.expansion,
        scope: childScope(cur.scope, cur.expansion, id, sub.def),
      });
    }
    return out;
  });

  protected readonly current = computed(() => this.levels()[this.levels().length - 1]);

  /** Сколько вентилей и триггеров внутри текущего блока — для подписи */
  protected readonly stats = computed(() => {
    const c = this.current().expansion.circuit;
    const dffs = c.gates.filter((g) => g.type === 'DFF').length;
    return { gates: c.gates.length - dffs, dffs };
  });

  protected blockSolution(s: Solution): BlockSolution | null {
    return isBlockSolution(s) ? s : null;
  }

  protected gateSolution(s: Solution) {
    return isGateSolution(s) ? s : null;
  }

  protected isNative(s: Solution): boolean {
    return isNativeSolution(s);
  }

  /** Высота доски с блоками: по самому нижнему экземпляру */
  protected boardHeight(s: BlockSolution): number {
    return Math.max(560, ...s.instances.map((i) => i.y + 290));
  }

  /** Насколько раздвинуть блоки при просмотре: чем больше блоков, тем сильнее */
  protected spreadFor(s: BlockSolution): number {
    const n = s.instances.length;
    return n > 8 ? 1.7 : n > 3 ? 1.4 : 1.2;
  }

  protected into(id: string): void {
    this.path.update((p) => [...p, id]);
  }

  protected up(): void {
    this.path.update((p) => p.slice(0, -1));
  }

  protected to(level: number): void {
    this.path.update((p) => p.slice(0, level));
  }
}
