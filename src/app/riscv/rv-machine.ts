import { decode, disassemble } from './rv-isa';
import { RAM_SIZE, STACK_TOP } from './rv-asm';

/**
 * Карта адресов «мягкого» процессора — как в учебной плате на ПЛИС:
 *   0x0000_0000 … 0x0000_3FFF — оперативная память 16 КиБ (команды, данные, стек)
 *   0x1000_0000 UART: запись байта — вывод символа; чтение +4 — «передатчик готов» (1)
 *   0x1000_1000 светодиоды: запись — зажечь (младшие 8 бит); чтение — что записано
 *   0x1000_1004 переключатели: чтение — их состояние (8 бит)
 *   0x1000_2000 таймер: чтение — число выполненных команд (младшие 32 бита)
 */
export const UART_TX = 0x10000000;
export const UART_STATUS = 0x10000004;
export const LEDS = 0x10001000;
export const SWITCHES = 0x10001004;
export const TIMER = 0x10002000;

export interface MmioRegion {
  name: string;
  addr: number;
  note: string;
}
export const MMIO_MAP: readonly MmioRegion[] = [
  { name: 'UART — вывод', addr: UART_TX, note: 'sb: записанный байт появляется в консоли' },
  { name: 'UART — состояние', addr: UART_STATUS, note: 'lw: 1, когда можно слать следующий байт' },
  { name: 'Светодиоды', addr: LEDS, note: 'sw: младшие 8 бит зажигают LED0…LED7' },
  { name: 'Переключатели', addr: SWITCHES, note: 'lw: 8 переключателей SW0…SW7' },
  { name: 'Таймер', addr: TIMER, note: 'lw: сколько команд уже выполнено' },
];

export interface RvView {
  regs: number[]; // без знака
  pc: number;
  mem: Uint8Array;
  steps: number;
  halted: boolean;
  exitCode: number | null;
  error: string | null;
  uart: string;
  leds: number;
  ledLog: { cycle: number; value: number }[];
  /** адрес последнего чтения/записи памяти и какой регистр изменила последняя команда */
  lastRead: number | null;
  lastWrite: number | null;
  lastReg: number | null;
  /** текст последней выполненной команды */
  lastInsn: string;
}

const hex = (n: number, w = 8) => `0x${(n >>> 0).toString(16).padStart(w, '0')}`;

/** Процессор RV32IM: регистры, память, периферия. Один «шаг» — одна команда. */
export class RvMachine {
  readonly regs = new Int32Array(32);
  readonly mem = new Uint8Array(RAM_SIZE);
  pc = 0;
  steps = 0;
  halted = false;
  exitCode: number | null = null;
  error: string | null = null;
  uart: number[] = [];
  leds = 0;
  ledLog: { cycle: number; value: number }[] = [];
  switches: number;
  lastRead: number | null = null;
  lastWrite: number | null = null;
  lastReg: number | null = null;
  lastInsn = '';

  constructor(image: Uint8Array, opts: { switches?: number; entry?: number } = {}) {
    this.mem.set(image.subarray(0, RAM_SIZE));
    this.switches = (opts.switches ?? 0) & 0xff;
    this.pc = (opts.entry ?? 0) >>> 0;
    this.regs[2] = STACK_TOP; // sp — вершина стека, как задаёт загрузчик
  }

  get running(): boolean {
    return !this.halted && this.error === null;
  }

  private fault(message: string): void {
    this.error = message;
  }

  /* ---------- память и периферия ---------- */

  private load(addr: number, size: 1 | 2 | 4): number | undefined {
    const a = addr >>> 0;
    this.lastRead = a;
    if (a >= 0x10000000) {
      if (size !== 4 && a !== UART_STATUS) {
        // устройства читаются целыми словами; байтовое чтение допускаем для удобства
      }
      switch (a & ~3) {
        case UART_STATUS:
          return 1;
        case LEDS:
          return this.leds;
        case SWITCHES:
          return this.switches;
        case TIMER:
          return this.steps >>> 0;
        case UART_TX:
          return 0;
        default:
          this.fault(`Чтение по адресу ${hex(a)}: там нет устройства`);
          return undefined;
      }
    }
    if (a + size > RAM_SIZE) {
      this.fault(`Чтение по адресу ${hex(a)} за пределами памяти (0x0 … ${hex(RAM_SIZE - 1)})`);
      return undefined;
    }
    if (a % size !== 0) {
      this.fault(
        `Невыровненное чтение по адресу ${hex(a)}: ${size === 4 ? 'слово' : 'полуслово'} должно лежать по адресу, кратному ${size}`,
      );
      return undefined;
    }
    let v = 0;
    for (let k = size - 1; k >= 0; k--) v = (v << 8) | this.mem[a + k];
    return v;
  }

  private store(addr: number, size: 1 | 2 | 4, value: number): boolean {
    const a = addr >>> 0;
    this.lastWrite = a;
    if (a >= 0x10000000) {
      switch (a & ~3) {
        case UART_TX:
          this.uart.push(value & 0xff);
          return true;
        case LEDS:
          this.leds = value & 0xff;
          this.ledLog.push({ cycle: this.steps, value: this.leds });
          return true;
        default:
          this.fault(`Запись по адресу ${hex(a)}: это устройство нельзя записывать`);
          return false;
      }
    }
    if (a + size > RAM_SIZE) {
      this.fault(`Запись по адресу ${hex(a)} за пределами памяти (0x0 … ${hex(RAM_SIZE - 1)})`);
      return false;
    }
    if (a % size !== 0) {
      this.fault(
        `Невыровненная запись по адресу ${hex(a)}: ${size === 4 ? 'слово' : 'полуслово'} должно лежать по адресу, кратному ${size}`,
      );
      return false;
    }
    for (let k = 0; k < size; k++) this.mem[a + k] = (value >>> (8 * k)) & 0xff;
    return true;
  }

  /* ---------- выполнение ---------- */

  step(): void {
    if (!this.running) return;
    const pc = this.pc;
    this.lastRead = this.lastWrite = this.lastReg = null;
    if (pc % 4 !== 0 || pc < 0 || pc + 4 > RAM_SIZE) {
      this.fault(`Счётчик команд вышел из памяти (адрес ${hex(pc)}). Не забыли ebreak в конце?`);
      return;
    }
    const word =
      this.mem[pc] | (this.mem[pc + 1] << 8) | (this.mem[pc + 2] << 16) | (this.mem[pc + 3] << 24);
    const d = decode(word);
    this.lastInsn = disassemble(word);
    const o = d.op;
    if (!o) {
      this.fault(
        `Непонятная команда ${hex(word)} по адресу ${hex(pc)}. Возможно, программа дошла до конца без ebreak или «убежала» в данные`,
      );
      return;
    }

    const r = this.regs;
    const a = r[d.rs1];
    const b = r[d.rs2];
    let next = pc + 4;
    let result: number | undefined;

    switch (o.mnemonic) {
      case 'add':
        result = (a + b) | 0;
        break;
      case 'sub':
        result = (a - b) | 0;
        break;
      case 'sll':
        result = a << (b & 31);
        break;
      case 'slt':
        result = a < b ? 1 : 0;
        break;
      case 'sltu':
        result = a >>> 0 < b >>> 0 ? 1 : 0;
        break;
      case 'xor':
        result = a ^ b;
        break;
      case 'srl':
        result = a >>> (b & 31);
        break;
      case 'sra':
        result = a >> (b & 31);
        break;
      case 'or':
        result = a | b;
        break;
      case 'and':
        result = a & b;
        break;
      case 'mul':
        result = Math.imul(a, b);
        break;
      case 'mulh':
        result = Number((BigInt(a) * BigInt(b)) >> 32n) | 0;
        break;
      case 'mulhsu':
        result = Number((BigInt(a) * BigInt(b >>> 0)) >> 32n) | 0;
        break;
      case 'mulhu':
        result = Number((BigInt(a >>> 0) * BigInt(b >>> 0)) >> 32n) | 0;
        break;
      case 'div':
        // деление на ноль даёт −1, переполнение (−2³¹ / −1) — −2³¹ (так задаёт спецификация)
        result = b === 0 ? -1 : a === -0x80000000 && b === -1 ? a : Math.trunc(a / b) | 0;
        break;
      case 'divu':
        result = b === 0 ? -1 : ((a >>> 0) / (b >>> 0)) | 0;
        break;
      case 'rem':
        result = b === 0 ? a : a === -0x80000000 && b === -1 ? 0 : (a % b) | 0;
        break;
      case 'remu':
        result = b === 0 ? a : ((a >>> 0) % (b >>> 0)) | 0;
        break;

      case 'addi':
        result = (a + d.imm) | 0;
        break;
      case 'slti':
        result = a < d.imm ? 1 : 0;
        break;
      case 'sltiu':
        result = a >>> 0 < d.imm >>> 0 ? 1 : 0;
        break;
      case 'xori':
        result = a ^ d.imm;
        break;
      case 'ori':
        result = a | d.imm;
        break;
      case 'andi':
        result = a & d.imm;
        break;
      case 'slli':
        result = a << d.imm;
        break;
      case 'srli':
        result = a >>> d.imm;
        break;
      case 'srai':
        result = a >> d.imm;
        break;

      case 'lb': {
        const v = this.load(a + d.imm, 1);
        if (v === undefined) return;
        result = (v << 24) >> 24;
        break;
      }
      case 'lh': {
        const v = this.load(a + d.imm, 2);
        if (v === undefined) return;
        result = (v << 16) >> 16;
        break;
      }
      case 'lw': {
        const v = this.load(a + d.imm, 4);
        if (v === undefined) return;
        result = v | 0;
        break;
      }
      case 'lbu': {
        const v = this.load(a + d.imm, 1);
        if (v === undefined) return;
        result = v;
        break;
      }
      case 'lhu': {
        const v = this.load(a + d.imm, 2);
        if (v === undefined) return;
        result = v;
        break;
      }
      case 'sb':
        if (!this.store(a + d.imm, 1, b)) return;
        break;
      case 'sh':
        if (!this.store(a + d.imm, 2, b)) return;
        break;
      case 'sw':
        if (!this.store(a + d.imm, 4, b)) return;
        break;

      case 'beq':
        if (a === b) next = pc + d.imm;
        break;
      case 'bne':
        if (a !== b) next = pc + d.imm;
        break;
      case 'blt':
        if (a < b) next = pc + d.imm;
        break;
      case 'bge':
        if (a >= b) next = pc + d.imm;
        break;
      case 'bltu':
        if (a >>> 0 < b >>> 0) next = pc + d.imm;
        break;
      case 'bgeu':
        if (a >>> 0 >= b >>> 0) next = pc + d.imm;
        break;

      case 'jal':
        result = pc + 4;
        next = pc + d.imm;
        break;
      case 'jalr':
        result = pc + 4;
        next = (a + d.imm) & ~1;
        break;
      case 'lui':
        result = d.imm << 12;
        break;
      case 'auipc':
        result = (pc + (d.imm << 12)) | 0;
        break;

      case 'ebreak':
        this.halted = true;
        break;
      case 'ecall':
        if (!this.syscall()) return;
        break;
    }

    if (result !== undefined && d.rd !== 0) {
      r[d.rd] = result;
      this.lastReg = d.rd;
    }
    r[0] = 0;
    if (!this.halted && next % 4 !== 0) {
      this.fault(
        `Переход на адрес ${hex(next)}, не кратный 4 — здесь команды только по четыре байта`,
      );
      return;
    }
    this.steps++;
    this.pc = this.halted ? pc : next;
  }

  /** Системные вызовы в стиле Linux RISC-V: номер — в a7, аргументы — в a0…a2 */
  private syscall(): boolean {
    const n = this.regs[17];
    switch (n) {
      case 93: // exit(код)
        this.halted = true;
        this.exitCode = this.regs[10];
        return true;
      case 64: {
        // write(fd, буфер, длина): только fd = 1 (консоль)
        if (this.regs[10] !== 1) {
          this.fault(
            `write: поддерживается только fd = 1 (консоль), а в a0 лежит ${this.regs[10]}`,
          );
          return false;
        }
        const [buf, len] = [this.regs[11] >>> 0, this.regs[12] >>> 0];
        if (buf + len > RAM_SIZE) {
          this.fault(`write: буфер ${hex(buf)} + ${len} выходит за пределы памяти`);
          return false;
        }
        for (let k = 0; k < len; k++) this.uart.push(this.mem[buf + k]);
        this.regs[10] = len;
        this.lastReg = 10;
        return true;
      }
      default:
        this.fault(
          `ecall: система не умеет вызов номер ${n} (a7). Доступны 93 — exit и 64 — write.`,
        );
        return false;
    }
  }

  run(maxSteps = 1_000_000): void {
    let left = maxSteps;
    while (this.running && left-- > 0) this.step();
    if (this.running)
      this.fault(`Превышен лимит в ${maxSteps} шагов — похоже, цикл не заканчивается.`);
  }

  view(): RvView {
    return {
      regs: Array.from(this.regs, (v) => v >>> 0),
      pc: this.pc,
      mem: this.mem.slice(),
      steps: this.steps,
      halted: this.halted,
      exitCode: this.exitCode,
      error: this.error,
      uart: new TextDecoder().decode(new Uint8Array(this.uart)),
      leds: this.leds,
      ledLog: [...this.ledLog],
      lastRead: this.lastRead,
      lastWrite: this.lastWrite,
      lastReg: this.lastReg,
      lastInsn: this.lastInsn,
    };
  }
}
