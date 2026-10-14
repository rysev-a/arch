import { assemble, DATA_BASE, RAM_SIZE } from './rv-asm';
import { ABI_NAMES, OPS, decode, disassemble, fieldsOf, regNum } from './rv-isa';
import { RvMachine } from './rv-machine';
import { GOLDEN } from './rv-golden.testing';

const words = (src: string): number[] => {
  const a = assemble(src);
  expect(a.errors, JSON.stringify(a.errors)).toEqual([]);
  return a.lines.map((l) => l.word);
};

/** Собрать, выполнить до остановки, вернуть машину */
function run(src: string, opts: { switches?: number; max?: number } = {}): RvMachine {
  const a = assemble(src);
  expect(a.errors, JSON.stringify(a.errors)).toEqual([]);
  const m = new RvMachine(a.image, { switches: opts.switches });
  m.run(opts.max);
  return m;
}
const reg = (m: RvMachine, name: string): number => m.regs[regNum(name)!];

describe('регистры', () => {
  it('имена: x0…x31, ABI и fp', () => {
    expect(regNum('x0')).toBe(0);
    expect(regNum('x31')).toBe(31);
    expect(regNum('zero')).toBe(0);
    expect(regNum('sp')).toBe(2);
    expect(regNum('a0')).toBe(10);
    expect(regNum('fp')).toBe(8);
    expect(regNum('s0')).toBe(8);
    expect(regNum('t6')).toBe(31);
    expect(regNum('x32')).toBeUndefined();
    expect(regNum('q1')).toBeUndefined();
    ABI_NAMES.forEach((n, i) => expect(regNum(n)).toBe(i));
  });
});

describe('кодирование команд: независимый эталон', () => {
  it('эталонных слов достаточно, чтобы покрыть каждую команду', () => {
    const covered = new Set(GOLDEN.map(([a]) => a.split(' ')[0]));
    for (const o of OPS) expect(covered.has(o.mnemonic), o.mnemonic).toBe(true);
  });

  it('ассемблер выдаёт ровно те слова, что посчитал независимый энкодер', () => {
    for (const [asm, word] of GOLDEN) {
      const a = assemble(asm);
      expect(a.errors, asm).toEqual([]);
      expect(a.lines.length, asm).toBe(1);
      expect(
        a.lines[0].word,
        `${asm}: 0x${a.lines[0].word.toString(16)} ≠ 0x${word.toString(16)}`,
      ).toBe(word);
    }
  });

  it('дизассемблер → ассемблер возвращает то же слово', () => {
    for (const [asm, word] of GOLDEN) {
      const text = disassemble(word);
      const back = assemble(text);
      expect(back.errors, `${asm} → ${text}`).toEqual([]);
      expect(back.lines[0].word, `${asm} → ${text}`).toBe(word);
    }
  });

  it('известные слова из настоящих программ', () => {
    expect(words('ret')).toEqual([0x00008067]);
    expect(words('nop')).toEqual([0x00000013]);
    expect(words('addi sp, sp, -16')).toEqual([0xff010113]);
    expect(words('sw ra, 12(sp)')).toEqual([0x00112623]);
    expect(words('lw ra, 12(sp)')).toEqual([0x00c12083]);
    expect(words('mv a0, a1')).toEqual([0x00058513]);
    expect(words('li a0, 0')).toEqual([0x00000513]);
    expect(words('add a3, a1, a2')).toEqual([0x00c586b3]);
  });

  it('разбор по полям: суммарно 32 бита, код операции — последние семь', () => {
    for (const [, word] of GOLDEN) {
      const { fields } = fieldsOf(word);
      expect(fields.reduce((n, f) => n + f.bits.length, 0)).toBe(32);
      expect(fields[fields.length - 1].bits).toBe((word & 0x7f).toString(2).padStart(7, '0'));
      expect(fields.map((f) => f.bits).join('')).toBe((word >>> 0).toString(2).padStart(32, '0'));
    }
  });

  it('непонятное слово не декодируется', () => {
    expect(decode(0xffffffff).op).toBeUndefined();
    expect(decode(0x00000000).op).toBeUndefined();
    expect(disassemble(0)).toBe('.word 0x00000000');
    // сдвиг с неверными старшими битами — не slli
    expect(decode(0x40101013).op).toBeUndefined();
  });
});

describe('псевдокоманды', () => {
  it('простые сокращения', () => {
    expect(words('not a0, a1')).toEqual(words('xori a0, a1, -1'));
    expect(words('neg a0, a1')).toEqual(words('sub a0, zero, a1'));
    expect(words('seqz a0, a1')).toEqual(words('sltiu a0, a1, 1'));
    expect(words('snez a0, a1')).toEqual(words('sltu a0, zero, a1'));
    expect(words('jr t0')).toEqual(words('jalr zero, 0(t0)'));
    expect(words('jalr t0')).toEqual(words('jalr ra, 0(t0)'));
  });

  it('ветвления: сокращения с нулём и перестановкой операндов', () => {
    const src = (a: string, b: string) => `x: nop\n ${a} t0, t1, x\n`;
    void src;
    const eq = (a: string, b: string) => {
      const p = words(`x: nop\n ${a}`);
      const q = words(`x: nop\n ${b}`);
      expect(p).toEqual(q);
    };
    eq('beqz a0, x', 'beq a0, zero, x');
    eq('bnez a0, x', 'bne a0, zero, x');
    eq('blez a0, x', 'bge zero, a0, x');
    eq('bgez a0, x', 'bge a0, zero, x');
    eq('bltz a0, x', 'blt a0, zero, x');
    eq('bgtz a0, x', 'blt zero, a0, x');
    eq('bgt a0, a1, x', 'blt a1, a0, x');
    eq('ble a0, a1, x', 'bge a1, a0, x');
    eq('bgtu a0, a1, x', 'bltu a1, a0, x');
    eq('bleu a0, a1, x', 'bgeu a1, a0, x');
  });

  it('li: одна команда для малых чисел, lui + addi для больших, с поправкой на знак младшей части', () => {
    expect(words('li a0, 2047').length).toBe(1);
    expect(words('li a0, -2048').length).toBe(1);
    expect(words('li a0, 2048').length).toBe(2);
    expect(words('li a0, 0x12345000').length).toBe(1); // младшие 12 бит нули — одна lui
    expect(words('li a0, 0x12345678').length).toBe(2);
    for (const v of [
      0, 1, -1, 2047, -2048, 2048, -2049, 0x7ff, 0x800, 0xfff, 0x1000, 0x12345678, 0x12345fff,
      -0x12345678, 0x7fffffff, -0x80000000, 0xffffffff, 0xdeadbeef, 100000, -100000,
    ]) {
      const m = run(`li a0, ${v}\n ebreak`);
      expect(m.regs[10] | 0, `li ${v}`).toBe(v | 0);
    }
  });

  it('la и call: адрес считается относительно самой команды', () => {
    const m = run(`
      la   a0, значение
      lw   a1, 0(a0)
      call функция
      ebreak
    функция:
      addi a1, a1, 1
      ret
      .data
    значение: .word 41`);
    expect(m.regs[11]).toBe(42);
    expect(m.regs[10]).toBe(DATA_BASE);
  });

  it('tail вызывает и не возвращается сюда', () => {
    const m = run('tail конец\n li a0, 1\nконец: li a0, 2\n ebreak');
    expect(m.regs[10]).toBe(2);
  });
});

describe('ассемблер: директивы и выражения', () => {
  it('данные: .word .half .byte .ascii .asciz .space .align; метки данных', () => {
    const a = assemble(`
      ebreak
      .data
    a: .byte 1, 2, 0xff, 'A'
    b: .half 0x1234
       .align 2
    c: .word 0xdeadbeef, a
    s: .asciz "Hi\\n"
       .ascii "ab"
       .space 3
    e: .word 7`);
    expect(a.errors).toEqual([]);
    const at = (n: string) => a.symbols[n];
    expect(at('a')).toBe(DATA_BASE);
    expect([...a.image.slice(at('a'), at('a') + 4)]).toEqual([1, 2, 255, 65]);
    expect(a.image[at('b')] | (a.image[at('b') + 1] << 8)).toBe(0x1234);
    expect(at('c') % 4).toBe(0);
    const w = (addr: number) =>
      (a.image[addr] |
        (a.image[addr + 1] << 8) |
        (a.image[addr + 2] << 16) |
        (a.image[addr + 3] << 24)) >>>
      0;
    expect(w(at('c'))).toBe(0xdeadbeef);
    expect(w(at('c') + 4)).toBe(at('a')); // метка внутри .word
    expect([...a.image.slice(at('s'), at('s') + 4)]).toEqual([72, 105, 10, 0]);
    expect(at('e') - (at('s') + 4)).toBe(2 + 3);
  });

  it('.equ, выражения с метками, %hi и %lo', () => {
    const m = run(`
      .equ ADDR, 0x1000
      .equ STEP, 4
      lui  t0, %hi(ADDR + STEP)
      addi t0, t0, %lo(ADDR + STEP)
      ebreak`);
    expect(m.regs[5]).toBe(0x1004);
    const n = run(`
      lui  t0, %hi(x)
      addi t0, t0, %lo(x)
      ebreak
      .data
      .space 0x7ff
    x: .word 1`);
    expect(n.regs[5]).toBe(DATA_BASE + 0x7ff);
  });

  it('символы в кавычках и экранирование', () => {
    const m = run("li a0, 'A'\n li a1, '\\n'\n li a2, ','\n li a3, 'a' - 'A'\n ebreak");
    expect([m.regs[10], m.regs[11], m.regs[12], m.regs[13]]).toEqual([65, 10, 44, 32]);
  });

  it('комментарии #, ; и //, пустые строки, несколько меток', () => {
    const a = assemble('# заголовок\n\nа: б: nop ; комментарий\n // ещё\n в: ebreak # конец');
    expect(a.errors).toEqual([]);
    expect(a.symbols['а']).toBe(0);
    expect(a.symbols['б']).toBe(0);
    expect(a.symbols['в']).toBe(4);
  });

  it('ошибки с номерами строк, все сразу', () => {
    const a = assemble(
      'addi a0, a0, 5000\n frob a0\n add a0, a1\n lw a0, 4[sp]\n beq a0, a1, нет\n li a0\nх:\nх: nop\n addi q9, a0, 1\n .data\n nop',
    );
    const by = Object.fromEntries(a.errors.map((e) => [e.line, e.message]));
    expect(by[1]).toContain('не помещается');
    expect(by[2]).toContain('Неизвестная команда');
    expect(by[3]).toContain('3 операнда');
    expect(by[4]).toContain('смещение(регистр)');
    expect(by[5]).toContain('Нет метки');
    expect(by[6]).toContain('2 операнда');
    expect(by[8]).toContain('уже объявлена');
    expect(by[9]).toContain('регистр');
    expect(by[11]).toContain('.text');
  });

  it('метка слишком далеко для условного перехода', () => {
    // условный переход достаёт на ±4 КиБ, jal — на ±1 МиБ
    expect(assemble('beq a0, a1, 5000').errors[0].message).toContain('слишком далеко');
    expect(assemble('beq a0, a1, 4094').errors).toEqual([]);
    expect(assemble('beq a0, a1, -4096').errors).toEqual([]);
    expect(assemble('jal zero, 1048576').errors[0].message).toContain('слишком далеко');
    expect(assemble('beq a0, a1, 3').errors[0].message).toContain('чётным');
  });

  it('границы памяти: слишком много команд и слишком много данных', () => {
    const many = Array.from({ length: 1030 }, () => 'nop').join('\n');
    expect(assemble(many).errors[0].message).toContain('слишком длинная');
    expect(assemble('.data\n .space 0x2f00').errors[0].message).toContain('стек');
  });

  it('в образе команды стоят с адреса 0, данные с 0x1000; размеры считаются', () => {
    const a = assemble('li a0, 0x12345678\n ebreak\n .data\n .word 1, 2');
    expect(a.textSize).toBe(12);
    expect(a.dataSize).toBe(8);
    expect(a.image.length).toBe(RAM_SIZE);
    expect(a.lines.map((l) => l.addr)).toEqual([0, 4, 8]);
    expect(a.lines.map((l) => l.pseudo)).toEqual([true, true, false]);
  });
});

describe('процессор: арифметика и логика', () => {
  it('сложение, вычитание и переполнение в 32 бита', () => {
    const m = run(
      'li a0, 0x7fffffff\n addi a1, a0, 1\n li a2, -0x80000000\n addi a3, a2, -1\n sub a4, zero, a2\n ebreak',
    );
    expect([m.regs[11], m.regs[13], m.regs[14]]).toEqual([
      0x80000000 | 0,
      0x7fffffff,
      0x80000000 | 0,
    ]);
  });

  it('логика и сдвиги: логический и арифметический вправо', () => {
    const m = run(`
      li  a0, 0xf0f0f0f0
      li  a1, 0x0ff00ff0
      and a2, a0, a1
      or  a3, a0, a1
      xor a4, a0, a1
      srli a5, a0, 4
      srai a6, a0, 4
      slli a7, a1, 8
      ebreak`);
    expect(m.regs[12] >>> 0).toBe(0x00f000f0);
    expect(m.regs[13] >>> 0).toBe(0xfff0fff0);
    expect(m.regs[14] >>> 0).toBe(0xff00ff00);
    expect(m.regs[15] >>> 0).toBe(0x0f0f0f0f);
    expect(m.regs[16] >>> 0).toBe(0xff0f0f0f);
    expect(m.regs[17] >>> 0).toBe(0xf00ff000);
  });

  it('сдвиги по регистру берут только пять младших бит', () => {
    const m = run(
      'li a0, 1\n li a1, 33\n sll a2, a0, a1\n li a3, -16\n li a4, 36\n sra a5, a3, a4\n srl a6, a3, a4\n ebreak',
    );
    expect(m.regs[12]).toBe(2); // 33 & 31 = 1
    expect(m.regs[15]).toBe(-1); // −16 >> 4
    expect(m.regs[16] >>> 0).toBe(0x0fffffff);
  });

  it('сравнения: со знаком и без знака', () => {
    const m = run(`
      li   a0, -1
      li   a1, 1
      slt  a2, a0, a1        # −1 < 1 со знаком → 1
      sltu a3, a0, a1        # 0xffffffff < 1 без знака → 0
      slti a4, a0, 0
      sltiu a5, a1, -1       # число −1 как беззнаковое — максимальное
      seqz a6, zero
      snez a7, a1
      ebreak`);
    expect([m.regs[12], m.regs[13], m.regs[14], m.regs[15], m.regs[16], m.regs[17]]).toEqual([
      1, 0, 1, 1, 1, 1,
    ]);
  });

  it('умножение: младшие и старшие 32 бита, со знаком и без', () => {
    const m = run(`
      li a0, 0x12345678
      li a1, 0x10000
      mul   a2, a0, a1
      mulhu a3, a0, a1
      li a4, -3
      li a5, 7
      mul   a6, a4, a5
      mulh  a7, a4, a5
      mulhu t0, a4, a5
      mulhsu t1, a4, a5
      ebreak`);
    expect(m.regs[12] >>> 0).toBe(0x56780000);
    expect(m.regs[13] >>> 0).toBe(0x1234);
    expect(m.regs[16]).toBe(-21);
    expect(m.regs[17]).toBe(-1); // старшая часть −21
    expect(m.regs[5] >>> 0).toBe(6); // (2³²−3)·7 >> 32 = 6
    expect(m.regs[6]).toBe(-1); // −3·7 со знаком на первом
  });

  it('деление и остаток, включая нуль и переполнение (как задаёт спецификация)', () => {
    const m = run(`
      li a0, -7
      li a1, 2
      div  a2, a0, a1       # −3: деление к нулю
      rem  a3, a0, a1       # −1: знак — как у делимого
      divu a4, a0, a1       # (2³²−7)/2
      remu a5, a0, a1
      li   t0, 0
      div  a6, a0, t0       # на ноль: −1
      rem  a7, a0, t0       # на ноль: делимое
      divu t1, a0, t0       # на ноль: 2³²−1
      li   t2, -0x80000000
      li   t3, -1
      div  t4, t2, t3       # переполнение: само делимое
      rem  t5, t2, t3       # переполнение: 0
      ebreak`);
    expect([m.regs[12], m.regs[13]]).toEqual([-3, -1]);
    expect(m.regs[14] >>> 0).toBe(0x7ffffffc);
    expect(m.regs[15]).toBe(1);
    expect([m.regs[16], m.regs[17]]).toEqual([-1, -7]);
    expect(m.regs[6] >>> 0).toBe(0xffffffff);
    expect([m.regs[29], m.regs[30]]).toEqual([-0x80000000, 0]);
  });

  it('x0 всегда ноль: запись игнорируется, чтение даёт 0', () => {
    const m = run('li zero, 5\n addi zero, zero, 7\n add a0, zero, zero\n ebreak');
    expect(m.regs[0]).toBe(0);
    expect(m.regs[10]).toBe(0);
  });

  it('lui и auipc', () => {
    const m = run('lui a0, 0xabcde\n nop\n auipc a1, 1\n ebreak');
    expect(m.regs[10] >>> 0).toBe(0xabcde000);
    expect(m.regs[11]).toBe(8 + 0x1000);
  });
});

describe('процессор: память', () => {
  it('lb/lbu/lh/lhu: расширение знака и порядок байт (младший первым)', () => {
    const m = run(`
      la  t0, d
      lb  a0, 0(t0)
      lbu a1, 0(t0)
      lh  a2, 2(t0)
      lhu a3, 2(t0)
      lw  a4, 0(t0)
      lbu a5, 3(t0)
      ebreak
      .data
    d: .word 0x8070f0e1`);
    expect(m.regs[10]).toBe(-31); // 0xe1
    expect(m.regs[11]).toBe(0xe1);
    expect(m.regs[12]).toBe(0x8070 - 0x10000);
    expect(m.regs[13]).toBe(0x8070);
    expect(m.regs[14] >>> 0).toBe(0x8070f0e1);
    expect(m.regs[15]).toBe(0x80);
  });

  it('sb/sh/sw пишут нужное число байт; отрицательные смещения', () => {
    const m = run(`
      la  t0, d
      addi t0, t0, 8
      li  a0, 0x11223344
      sw  a0, -8(t0)
      sh  a0, -4(t0)
      sb  a0, -2(t0)
      ebreak
      .data
    d: .space 12`);
    const a = assemble('.data\nd: .space 12').symbols['d'];
    expect([...m.mem.slice(a, a + 4)]).toEqual([0x44, 0x33, 0x22, 0x11]);
    // sh записал два байта, а sb поверх третьего
    expect([...m.mem.slice(a + 4, a + 8)]).toEqual([0x44, 0x33, 0x44, 0]);
  });

  it('ошибки доступа: невыровненное слово, за пределами памяти, нет устройства', () => {
    expect(run('li t0, 0x1001\n lw a0, 0(t0)\n ebreak').error).toContain('Невыровненное');
    expect(run('li t0, 0x1002\n sw a0, 0(t0)\n ebreak').error).toContain('Невыровненная');
    expect(run('li t0, 0x5000\n lw a0, 0(t0)\n ebreak').error).toContain('за пределами');
    expect(run('li t0, 0x10009000\n lw a0, 0(t0)\n ebreak').error).toContain('нет устройства');
    expect(run('li t0, 0x10001004\n sw a0, 0(t0)\n ebreak').error).toContain('нельзя записывать');
  });
});

describe('процессор: переходы', () => {
  it('все шесть условий — берутся и не берутся', () => {
    const taken = (op: string, a: number, b: number) =>
      run(
        `li t0, ${a}\n li t1, ${b}\n li a0, 0\n ${op} t0, t1, да\n j конец\nда: li a0, 1\nконец: ebreak`,
      ).regs[10] === 1;
    expect(taken('beq', 5, 5)).toBe(true);
    expect(taken('beq', 5, 6)).toBe(false);
    expect(taken('bne', 5, 6)).toBe(true);
    expect(taken('bne', 5, 5)).toBe(false);
    expect(taken('blt', -1, 1)).toBe(true);
    expect(taken('blt', 1, -1)).toBe(false);
    expect(taken('bltu', -1, 1)).toBe(false); // без знака −1 — огромное число
    expect(taken('bltu', 1, -1)).toBe(true);
    expect(taken('bge', 3, 3)).toBe(true);
    expect(taken('bge', -2, 1)).toBe(false);
    expect(taken('bgeu', -2, 1)).toBe(true);
    expect(taken('bgeu', 1, 2)).toBe(false);
  });

  it('jal и jalr: ссылка на возврат и сброс младшего бита адреса', () => {
    const m = run(`
      jal  ra, цель
      li   a1, 111
      ebreak
    цель:
      mv   a0, ra
      la   t0, возврат
      addi t0, t0, 1         # младший бит адреса сбрасывается
      jalr zero, 0(t0)
      li   a1, 222
    возврат:
      ebreak`);
    expect(m.regs[10]).toBe(4);
    expect(m.regs[11]).toBe(0);
    expect(m.error).toBeNull();
  });

  it('вызов функции и стек: рекурсия сохраняет ra и s0, sp возвращается', () => {
    const m = run(`
      li   a0, 6
      call fact
      ebreak
    fact:
      addi sp, sp, -16
      sw   ra, 12(sp)
      sw   s0, 8(sp)
      mv   s0, a0
      li   t0, 2
      blt  s0, t0, база
      addi a0, s0, -1
      call fact
      mul  a0, a0, s0
      j    выход
    база:
      li   a0, 1
    выход:
      lw   s0, 8(sp)
      lw   ra, 12(sp)
      addi sp, sp, 16
      ret`);
    expect(m.regs[10]).toBe(720);
    expect(m.regs[2]).toBe(RAM_SIZE);
    expect(m.error).toBeNull();
  });

  it('ошибки выполнения: выход за память, данные вместо команды, лимит шагов, нет ebreak', () => {
    expect(run('nop').error).toContain('ebreak');
    expect(run('j данные\n данные: .word 0').error).toContain('Непонятная команда'); // слово 0 — не команда
    expect(run('x: j x', { max: 1000 }).error).toContain('лимит');
    const bad = assemble('j 8\n nop\n .word 0xffffffff\n ebreak');
    const m = new RvMachine(bad.image);
    m.run();
    expect(m.error).toContain('Непонятная команда');
    // jalr на нечётное четвёрки
    expect(run('li t0, 6\n jalr zero, 0(t0)').error).toContain('не кратный 4');
  });
});

describe('процессор: система и периферия', () => {
  it('UART: запись байта выводит символ; состояние всегда «готов»', () => {
    const m = run(`
      li t0, 0x10000000
      li t1, 'O'
      sb t1, 0(t0)
      li t1, 'K'
      sb t1, 0(t0)
      lw a0, 4(t0)
      ebreak`);
    expect(m.view().uart).toBe('OK');
    expect(m.regs[10]).toBe(1);
  });

  it('светодиоды и переключатели', () => {
    const m = run('li t0, 0x10001000\n lw a0, 4(t0)\n sw a0, 0(t0)\n lw a1, 0(t0)\n ebreak', {
      switches: 0b10110010,
    });
    expect(m.leds).toBe(0b10110010);
    expect(m.regs[11]).toBe(0b10110010);
    // запись случилась на третьей команде: до неё выполнено две (li — одна lui)
    expect(m.view().ledLog).toEqual([{ cycle: 2, value: 0b10110010 }]);
  });

  it('таймер считает выполненные команды', () => {
    const m = run('li t0, 0x10002000\n lw a0, 0(t0)\n lw a1, 0(t0)\n ebreak');
    expect(m.regs[11] - m.regs[10]).toBe(1);
  });

  it('ecall: exit(код) и write(1, буфер, длина)', () => {
    const m = run(`
      li  a7, 64
      li  a0, 1
      la  a1, строка
      li  a2, 3
      ecall
      mv  s0, a0
      li  a7, 93
      li  a0, 7
      ecall
      .data
    строка: .ascii "abc"`);
    expect(m.view().uart).toBe('abc');
    expect(m.regs[8]).toBe(3);
    expect(m.exitCode).toBe(7);
    expect(m.halted).toBe(true);
    expect(run('li a7, 5\n ecall').error).toContain('ecall');
    expect(run('li a7, 64\n li a0, 2\n ecall').error).toContain('fd = 1');
  });

  it('ebreak останавливает без кода выхода, пошагово и целиком — одно и то же', () => {
    const a = assemble('li a0, 3\n addi a0, a0, 4\n ebreak');
    const m1 = new RvMachine(a.image);
    while (m1.running) m1.step();
    const m2 = new RvMachine(a.image);
    m2.run();
    expect(m1.regs[10]).toBe(7);
    expect(m1.view().regs).toEqual(m2.view().regs);
    expect(m1.steps).toBe(m2.steps);
    expect(m1.exitCode).toBeNull();
    expect(m1.pc).toBe(8);
  });

  it('подсветка: последний регистр и адреса памяти', () => {
    const a = assemble(
      'li a0, 5\n la t0, d\n sw a0, 0(t0)\n lw a1, 0(t0)\n ebreak\n .data\nd: .word 0',
    );
    const m = new RvMachine(a.image);
    m.step();
    expect(m.lastReg).toBe(10);
    m.step();
    m.step();
    m.step(); // sw
    expect(m.lastWrite).toBe(DATA_BASE);
    expect(m.lastReg).toBeNull();
    m.step(); // lw
    expect(m.lastRead).toBe(DATA_BASE);
    expect(m.lastReg).toBe(11);
  });
});
