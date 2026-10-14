import { assemble } from './assembler';
import { OPS, decode, disassemble, fields, opByOpcode, pack, toSigned } from './isa';
import { Machine } from './machine';
import { TASKS } from './tasks';

const run = (src: string, disk: number[] = [], max?: number) => {
  const a = assemble(src);
  expect(a.errors, JSON.stringify(a.errors)).toEqual([]);
  const m = new Machine(a.words, disk);
  m.run(max);
  return m;
};

describe('isa', () => {
  it('опкоды уникальны и укладываются в четыре бита', () => {
    const codes = OPS.map((o) => o.opcode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toBeLessThan(16);
    expect(new Set(OPS.map((o) => o.mnemonic)).size).toBe(OPS.length);
  });

  it('знаковое число: границы шести и двенадцати бит', () => {
    expect(toSigned(31, 6)).toBe(31);
    expect(toSigned(32, 6)).toBe(-32);
    expect(toSigned(63, 6)).toBe(-1);
    expect(toSigned(0x800, 12)).toBe(-2048);
  });

  it('pack и decode обратимы', () => {
    const w = pack(0x7, 5, 3, 0b101010);
    const d = decode(w);
    expect([d.opcode, d.a, d.b, d.c]).toEqual([7, 5, 3, 0b101010]);
    expect(opByOpcode(d.opcode)?.mnemonic).toBe('addi');
    expect(fields(w)).toEqual({ opcode: '0111', a: '101', b: '011', c: '101010' });
  });

  it('ассемблер и дизассемблер возвращают то же самое для каждой команды', () => {
    const samples = [
      'hlt',
      'li r3, 200',
      'add r1, r2, r3',
      'sub r4, r5, r6',
      'and r1, r2, r3',
      'or r1, r2, r3',
      'xor r7, r6, r5',
      'addi r1, r2, -5',
      'lb r1, 4(r2)',
      'sb r3, -2(r4)',
    ];
    for (const s of samples) {
      const a = assemble(s);
      expect(a.errors, s).toEqual([]);
      expect(disassemble(a.words[0]), s).toBe(s);
    }
    // переходы показываются смещением
    const a = assemble('beq r1, r2, x\n nop\nx: hlt');
    expect(disassemble(a.words[0])).toBe('beq r1, r2, +2');
    expect(disassemble(assemble('start: jmp start').words[0])).toBe('jmp +0');
  });
});

describe('assembler', () => {
  it('метки, комментарии, пустые строки, метка и команда в одной строке', () => {
    const a = assemble('; заголовок\n\nstart: li r1, 1  # комментарий\n  jmp start\n');
    expect(a.errors).toEqual([]);
    expect(a.words.length).toBe(2);
    expect(a.labels['start']).toBe(0);
    expect(a.lines.map((l) => [l.line, l.addr])).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });

  it('числа: десятичные, 0x, 0b, символы, отрицательные, .equ', () => {
    const m = run(
      ".equ BASE, 0x20\n li r1, BASE\n li r2, 0b101\n li r3, 'A'\n li r4, '\\n'\n li r5, ','\n li r6, -1\n hlt",
    );
    expect(m.regs.slice(1, 7)).toEqual([0x20, 5, 65, 10, 44, 255]);
  });

  it('псевдокоманды раскрываются в настоящие', () => {
    const m = run('li r1, 5\n mv r2, r1\n inc r2\n dec r1\n nop\n hlt');
    expect([m.regs[1], m.regs[2]]).toEqual([4, 6]);
    const w = assemble('mv r1, r2').words[0];
    expect(disassemble(w)).toBe('addi r1, r2, 0');
    // bgtu / bleu меняют операнды местами
    expect(disassemble(assemble('bgtu r1, r2, x\nx: hlt').words[0])).toBe('bltu r2, r1, +1');
  });

  it('ошибки с номерами строк, собираются все сразу', () => {
    const a = assemble(
      'li r9, 1\n frob r1\n li r1\n addi r1, r1, 99\n beq r1, r1, нет\n lb r1, 0[r2]\nx:\nx: hlt',
    );
    const byLine = Object.fromEntries(a.errors.map((e) => [e.line, e.message]));
    expect(byLine[1]).toContain('регистр');
    expect(byLine[2]).toContain('Неизвестная команда');
    expect(byLine[3]).toContain('2 операнда');
    expect(byLine[4]).toContain('не помещается');
    expect(byLine[5]).toContain('Нет метки');
    expect(byLine[6]).toContain('смещение(регистр)');
    expect(byLine[8]).toContain('уже объявлена');
  });

  it('метка слишком далеко для условного перехода', () => {
    const body = Array.from({ length: 40 }, () => 'nop').join('\n');
    const a = assemble(`beq r0, r0, конец\n${body}\nконец: hlt`);
    expect(a.errors[0].message).toContain('слишком далеко');
    // а jmp дотягивается
    expect(assemble(`jmp конец\n${body}\nконец: hlt`).errors).toEqual([]);
  });
});

describe('machine', () => {
  it('арифметика по модулю 256 и r0 всегда ноль', () => {
    const m = run(
      'li r1, 250\n li r2, 10\n add r3, r1, r2\n sub r4, r2, r1\n li r0, 99\n addi r5, r0, 7\n hlt',
    );
    expect([m.regs[3], m.regs[4], m.regs[0], m.regs[5]]).toEqual([4, 16, 0, 7]);
  });

  it('логика побитово', () => {
    const m = run(
      'li r1, 0b1100\n li r2, 0b1010\n and r3, r1, r2\n or r4, r1, r2\n xor r5, r1, r2\n hlt',
    );
    expect([m.regs[3], m.regs[4], m.regs[5]]).toEqual([0b1000, 0b1110, 0b0110]);
  });

  it('lb / sb со смещением, в том числе отрицательным', () => {
    const disk = new Array(256).fill(0);
    disk[0x20] = 0xab;
    const m = run('li r1, 0x22\n lb r2, -2(r1)\n li r3, 0x77\n sb r3, 1(r1)\n hlt', disk);
    expect(m.regs[2]).toBe(0xab);
    expect(m.mem[0x23]).toBe(0x77);

    // «последняя запись» запоминается именно на шаге с sb, а следующая команда её сбрасывает
    const a = assemble('li r1, 0x22\n li r3, 0x77\n sb r3, 1(r1)\n hlt');
    const step = new Machine(a.words, []);
    for (let i = 0; i < 3; i++) step.step();
    expect([step.lastWrite, step.lastReg]).toEqual([0x23, null]);
    step.step();
    expect(step.lastWrite).toBeNull();
  });

  it('ветвления: равно, не равно, меньше и не меньше (без знака)', () => {
    const src = (op: string, a: number, b: number) =>
      `li r1, ${a}\n li r2, ${b}\n li r3, 0\n ${op} r1, r2, да\n j конец\nда: li r3, 1\nконец: hlt`;
    const taken = (op: string, a: number, b: number) => run(src(op, a, b)).regs[3] === 1;
    expect(taken('beq', 5, 5)).toBe(true);
    expect(taken('beq', 5, 6)).toBe(false);
    expect(taken('bne', 5, 6)).toBe(true);
    expect(taken('bltu', 3, 200)).toBe(true);
    expect(taken('bltu', 200, 3)).toBe(false); // без знака: 200 больше 3
    expect(taken('bgeu', 200, 3)).toBe(true);
    expect(taken('bgeu', 3, 3)).toBe(true);
  });

  it('ошибки выполнения: нет hlt, бесконечный цикл, неизвестная команда', () => {
    expect(run('nop').error).toContain('hlt');
    expect(run('x: j x', [], 1000).error).toContain('лимит');
    const m = new Machine([0xf000], []);
    m.run();
    expect(m.error).toContain('Неизвестная команда');
  });

  it('пошаговое выполнение даёт те же итоги, что и запуск целиком', () => {
    const a = assemble(TASKS[1].solution);
    const full = new Machine(a.words, TASKS[1].disk);
    full.run();
    const stepped = new Machine(a.words, TASKS[1].disk);
    while (stepped.running) stepped.step();
    expect(stepped.mem).toEqual(full.mem);
    expect(stepped.steps).toBe(full.steps);
  });
});

describe('задания', () => {
  it('восемь заданий, id уникальны', () => {
    expect(TASKS.length).toBe(8);
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(8);
  });

  for (const t of TASKS) {
    it(`«${t.title}»: эталонное решение выполняет задание`, () => {
      const m = run(t.solution, [...t.disk]);
      expect(m.halted).toBe(true);
      expect(t.check(m.mem), t.check(m.mem).message).toEqual({
        ok: true,
        message: expect.any(String),
      });
      expect(m.steps).toBeLessThan(5000);
    });

    it(`«${t.title}»: заготовка задания не засчитывается, ожидаемое отличается от исходного`, () => {
      const m = run(t.starter.includes('hlt') ? t.starter : `${t.starter}\nhlt`, [...t.disk]);
      const r = t.check(m.mem);
      expect(r.ok).toBe(false);
      expect(r.message).toContain('Адрес');
      expect(t.expected).not.toEqual(t.disk);
    });

    it(`«${t.title}»: области диска лежат внутри памяти`, () => {
      for (const r of t.regions) expect(r.from + r.length).toBeLessThanOrEqual(256);
    });
  }

  it('нехватка остановки не засчитывается, лишняя запись — тоже', () => {
    const t = TASKS[0];
    const noHlt = run("li r1, 'J'\n li r2, 0x10\n sb r1, 0(r2)\n hlt", [...t.disk]);
    expect(t.check(noHlt.mem).ok).toBe(true);
    const extra = run("li r1, 'J'\n li r2, 0x10\n sb r1, 0(r2)\n sb r1, 5(r2)\n hlt", [...t.disk]);
    expect(t.check(extra.mem).ok).toBe(false);
  });

  it('сортировка: проверка ловит почти-верное решение (один элемент не на месте)', () => {
    const t = TASKS[4];
    const mem = new Uint8Array(t.expected);
    [mem[0x10], mem[0x11]] = [mem[0x11], mem[0x10]];
    const r = t.check(mem);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('0x10');
  });

  describe('общая сортировка: работает с любым размером элемента', () => {
    const sort = TASKS.find((t) => t.id === 'sort-sized')!;

    /** Диск с размером S, количеством N и случайными элементами; ожидаемое — сортировка слов по байтам */
    function scenario(size: number, count: number, seed: number) {
      let x = seed;
      const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) >> 8) & 0xff;
      const items = Array.from({ length: count }, () =>
        Array.from({ length: size }, () => rnd() % 6),
      );
      const disk = new Uint8Array(256);
      disk[0x0e] = size;
      disk[0x0f] = count;
      items.flat().forEach((b, i) => (disk[0x10 + i] = b));
      const sorted = [...items].sort((a, b) => {
        for (let i = 0; i < size; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
      });
      const expected = new Uint8Array(disk);
      sorted.flat().forEach((b, i) => (expected[0x10 + i] = b));
      return { disk, expected };
    }

    for (const [size, count, seed] of [
      [1, 8, 1],
      [2, 6, 2],
      [3, 5, 3],
      [2, 1, 4],
      [4, 4, 5],
      [1, 2, 6],
    ]) {
      it(`размер ${size}, элементов ${count}`, () => {
        const { disk, expected } = scenario(size, count, seed);
        const m = run(sort.solution, [...disk], 200_000);
        expect(m.halted).toBe(true);
        expect([...m.mem]).toEqual([...expected]);
      });
    }
  });

  it('двухбайтные задания: сумма с переносом и сравнение по двум байтам', () => {
    const sum = TASKS.find((t) => t.id === 'sum16')!;
    const m = run(sum.solution, [...sum.disk]);
    expect([m.mem[0x0c], m.mem[0x0d]]).toEqual([0x06, 0xb7]);
    // 0x0123 + 0x00FF + 0x01C8 + 0x0099 + 0x0234
    expect(0x123 + 0xff + 0x1c8 + 0x99 + 0x234).toBe(0x6b7);

    // ошибка «забыли перенос» не проходит
    const noCarry = sum.solution.replace(
      '  inc  r4             ; был перенос в старший байт\n',
      '',
    );
    expect(noCarry).not.toBe(sum.solution);
    const wrong = run(noCarry, [...sum.disk]);
    expect(sum.check(wrong.mem).ok).toBe(false);

    const max = TASKS.find((t) => t.id === 'max16')!;
    // сравнивать только старшие байты недостаточно: 0x0300 и 0x0301 различаются младшим
    const hiOnly = max.solution.replace(
      '  bgeu r5, r7, дальше ; старшие равны: младший не больше\n',
      '  j дальше\n',
    );
    expect(max.check(run(hiOnly, [...max.disk]).mem).ok).toBe(false);
  });
});
