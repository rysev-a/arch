import { Expansion, expand } from '../exercises/logic-gates/blocks';
import { MachineView } from '../asm/machine';
import { PROGRAM_MAX, MEM_SIZE } from '../asm/isa';
import { CPU8_BLOCKS, cpu8Lookup } from './blocks';
import { nodesOf } from './builders';
import { CompiledSim } from './sim';

/** Процессор в виде схемы разворачивается один раз — это самая дорогая часть, дальше можно запускать сколько угодно */
let cached: Expansion | undefined;
export function cpuExpansion(): Expansion {
  if (!cached) {
    const cpu = CPU8_BLOCKS.get('c8-cpu')!;
    cached = expand(cpu.solution, cpu.def, cpu8Lookup);
  }
  return cached;
}

const ROM = 'rom__mem';
const RAM = 'ram__mem';
const CLK = 'clk';
const REG_NODES = [1, 2, 3, 4, 5, 6, 7].map((k) => nodesOf(`r${k}`, 'Byte'));
const PC_NODES = nodesOf('pc', 'Byte');

/**
 * Процессор «Мини-8», собранный из вентилей, с тем же интерфейсом, что у эмулятора:
 * шаг, запуск до остановки, текущее состояние. Один шаг — один такт: целая команда.
 */
export class GateMachine {
  readonly sim: CompiledSim;
  readonly expansion: Expansion;
  steps = 0;
  halted = false;
  error: string | null = null;
  lastRead: number | null = null;
  lastWrite: number | null = null;
  lastReg: number | null = null;

  constructor(
    readonly program: readonly number[],
    disk: ArrayLike<number>,
  ) {
    this.expansion = cpuExpansion();
    this.sim = new CompiledSim(this.expansion.circuit);
    this.sim.loadRom(ROM, program.slice(0, PROGRAM_MAX));
    this.sim.loadRam(RAM, disk);
  }

  get running(): boolean {
    return !this.halted && this.error === null;
  }

  get pc(): number {
    return this.sim.read(PC_NODES) ?? 0;
  }

  /** Номера регистров r0…r7: нулевой всегда ноль */
  regs(): number[] {
    return [0, ...REG_NODES.map((nodes) => this.sim.read(nodes) ?? 0)];
  }

  step(): void {
    if (!this.running) return;
    if (this.pc >= this.program.length) {
      this.error = `Счётчик команд вышел за пределы программы (адрес ${this.pc}). Не забыли hlt в конце?`;
      return;
    }
    const regsBefore = this.regs();
    const memBefore = this.sim.memory(RAM);
    this.sim.pulse(CLK);
    this.steps++;
    this.halted = this.sim.get('halted') === 1;

    // что изменила команда — для подсветки на диске и у регистров
    const regsAfter = this.regs();
    const memAfter = this.sim.memory(RAM);
    this.lastReg = regsAfter.findIndex((v, i) => v !== regsBefore[i]);
    if (this.lastReg < 0) this.lastReg = null;
    let written: number | null = null;
    for (let i = 0; i < MEM_SIZE; i++) if (memAfter[i] !== memBefore[i]) written = i;
    this.lastWrite = written;
    this.lastRead = null;
  }

  run(maxSteps = 100_000): void {
    let left = maxSteps;
    while (this.running && left-- > 0) this.step();
    if (this.running) {
      this.error = `Превышен лимит в ${maxSteps} шагов — похоже, цикл не заканчивается.`;
    }
  }

  view(): MachineView {
    return {
      regs: this.regs(),
      pc: this.pc,
      mem: Uint8Array.from(this.sim.memory(RAM)),
      halted: this.halted,
      error: this.error,
      steps: this.steps,
      lastRead: this.lastRead,
      lastWrite: this.lastWrite,
      lastReg: this.lastReg,
    };
  }
}
