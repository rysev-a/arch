import { MEM_SIZE, REG_COUNT, decode, disassemble, toSigned } from './isa';

/** Что видит интерфейс после очередного шага */
export interface MachineView {
  regs: number[];
  pc: number;
  mem: Uint8Array;
  halted: boolean;
  error: string | null;
  steps: number;
  /** адрес памяти, который прочитала/записала последняя команда */
  lastRead: number | null;
  lastWrite: number | null;
  /** какой регистр изменила последняя команда */
  lastReg: number | null;
}

/** Эмулятор процессора «Мини-8»: память команд отдельно, память данных (виртуальный диск) — 256 байт */
export class Machine {
  readonly regs: number[] = new Array(REG_COUNT).fill(0);
  readonly mem = new Uint8Array(MEM_SIZE);
  pc = 0;
  halted = false;
  error: string | null = null;
  steps = 0;
  lastRead: number | null = null;
  lastWrite: number | null = null;
  lastReg: number | null = null;

  constructor(
    readonly program: readonly number[],
    disk: ArrayLike<number>,
  ) {
    for (let i = 0; i < MEM_SIZE; i++) this.mem[i] = disk[i] ?? 0;
  }

  get running(): boolean {
    return !this.halted && this.error === null;
  }

  /** Выполнить одну команду */
  step(): void {
    if (!this.running) return;
    if (this.pc < 0 || this.pc >= this.program.length) {
      this.error = `Счётчик команд вышел за пределы программы (адрес ${this.pc}). Не забыли hlt в конце?`;
      return;
    }
    const word = this.program[this.pc];
    const d = decode(word);
    this.lastRead = this.lastWrite = this.lastReg = null;

    const setReg = (r: number, v: number) => {
      if (r !== 0) {
        this.regs[r] = v & 0xff;
        this.lastReg = r;
      }
    };
    const addr = () => (this.regs[d.b] + toSigned(d.c, 6)) & 0xff;
    let next = this.pc + 1;

    switch (d.def?.mnemonic) {
      case 'hlt':
        this.halted = true;
        next = this.pc;
        break;
      case 'li':
        setReg(d.a, word & 0xff);
        break;
      case 'add':
        setReg(d.a, this.regs[d.b] + this.regs[d.c & 7]);
        break;
      case 'sub':
        setReg(d.a, this.regs[d.b] - this.regs[d.c & 7]);
        break;
      case 'and':
        setReg(d.a, this.regs[d.b] & this.regs[d.c & 7]);
        break;
      case 'or':
        setReg(d.a, this.regs[d.b] | this.regs[d.c & 7]);
        break;
      case 'xor':
        setReg(d.a, this.regs[d.b] ^ this.regs[d.c & 7]);
        break;
      case 'addi':
        setReg(d.a, this.regs[d.b] + toSigned(d.c, 6));
        break;
      case 'lb': {
        const a = addr();
        this.lastRead = a;
        setReg(d.a, this.mem[a]);
        break;
      }
      case 'sb': {
        const a = addr();
        this.lastWrite = a;
        this.mem[a] = this.regs[d.a];
        break;
      }
      case 'beq':
        if (this.regs[d.a] === this.regs[d.b]) next = this.pc + toSigned(d.c, 6);
        break;
      case 'bne':
        if (this.regs[d.a] !== this.regs[d.b]) next = this.pc + toSigned(d.c, 6);
        break;
      case 'bltu':
        if (this.regs[d.a] < this.regs[d.b]) next = this.pc + toSigned(d.c, 6);
        break;
      case 'bgeu':
        if (this.regs[d.a] >= this.regs[d.b]) next = this.pc + toSigned(d.c, 6);
        break;
      case 'jmp':
        next = this.pc + toSigned(word & 0xfff, 12);
        break;
      default:
        this.error = `Неизвестная команда ${disassemble(word)} по адресу ${this.pc}`;
        return;
    }
    this.steps++;
    this.pc = next;
  }

  /** Выполнять до остановки, ошибки или лимита шагов (защита от бесконечного цикла) */
  run(maxSteps = 100_000): void {
    let left = maxSteps;
    while (this.running && left-- > 0) this.step();
    if (this.running) {
      this.error = `Превышен лимит в ${maxSteps} шагов — похоже, цикл не заканчивается.`;
    }
  }

  view(): MachineView {
    return {
      regs: [...this.regs],
      pc: this.pc,
      mem: this.mem.slice(),
      halted: this.halted,
      error: this.error,
      steps: this.steps,
      lastRead: this.lastRead,
      lastWrite: this.lastWrite,
      lastReg: this.lastReg,
    };
  }
}
