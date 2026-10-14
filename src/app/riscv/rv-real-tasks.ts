import { RvView } from './rv-machine';
import { CheckResult, RvTask } from './rv-tasks';

/**
 * Задания этапа 4: это целые настоящие программы. Их можно собрать обычным
 * ассемблером (clang или GNU as), запустить в qemu-riscv32 и получить тот же вывод.
 * Консоль — системный вызов write (a7 = 64), выход — exit (a7 = 93), как в Linux.
 */

const ok = (message: string): CheckResult => ({ ok: true, message });
const bad = (message: string): CheckResult => ({ ok: false, message });
const show = (s: string) => JSON.stringify(s);

/** Проверка «вывод и код возврата» */
function expectRun(stdout: string, code = 0): RvTask['check'] {
  return (v: RvView) => {
    if (v.exitCode === null) {
      return bad(
        'Программа не завершилась вызовом exit: нужно li a7, 93 и ecall (код возврата — в a0).',
      );
    }
    if (v.uart !== stdout) {
      return bad(`Вывод ${show(v.uart)}, а ожидалось ${show(stdout)}`);
    }
    if ((v.exitCode | 0) !== code) {
      return bad(`Код возврата ${v.exitCode | 0}, а ожидался ${code}`);
    }
    return ok(`Вывод верный, код возврата ${code}. Такая же программа соберётся и у вас.`);
  };
}

/** Готовая функция печати знакового числа: используется в нескольких заданиях */
const PRINT_INT = `
# print_int(a0): печатает знаковое число и перевод строки.
# Цифры собираются в буфере на стеке справа налево, потом одним write уходят в консоль.
print_int:
  addi sp, sp, -32
  addi t0, sp, 31        # t0 — куда писать следующий символ
  li   t1, 10
  sb   t1, 0(t0)         # перевод строки — последним
  mv   t2, a0
  srai t3, t2, 31        # t3 = -1 у отрицательного числа, иначе 0
  xor  t2, t2, t3
  sub  t2, t2, t3        # t2 = модуль числа
print_int_loop:
  remu t4, t2, t1        # младшая цифра
  addi t4, t4, '0'
  addi t0, t0, -1
  sb   t4, 0(t0)
  divu t2, t2, t1
  bnez t2, print_int_loop
  beqz t3, print_int_out
  addi t0, t0, -1
  li   t4, '-'
  sb   t4, 0(t0)
print_int_out:
  li   a0, 1             # fd = 1: стандартный вывод
  mv   a1, t0            # адрес первого символа
  addi a2, sp, 32
  sub  a2, a2, t0        # длина
  li   a7, 64            # write
  ecall
  addi sp, sp, 32
  ret
`;

const EXIT0 = `  li   a0, 0
  li   a7, 93            # exit(0)
  ecall
`;

export const REAL_TASKS: readonly RvTask[] = [
  {
    id: 'real-hello',
    title: 'Hello из настоящего write',
    text: 'Теперь без периферии учебной платы: это обычная программа. Точка входа — метка _start, строка лежит в секции .rodata. Выведите её системным вызовом write(fd = 1, буфер, длина): номер вызова 64 кладётся в a7, аргументы — в a0, a1, a2, потом ecall. Затем завершите программу вызовом exit(0): a7 = 93, a0 = код возврата. Сборка у себя: make run (описание ниже).',
    hint: 'a0 = 1 (стандартный вывод), a1 = адрес строки (la a1, msg), a2 = её длина (15 байт вместе с переводом строки), a7 = 64, ecall. Затем li a0, 0; li a7, 93; ecall.',
    starter: `  .globl _start
  .text
_start:
  # напишите write(1, msg, 15) и exit(0)

  .section .rodata
msg:
  .ascii "Hello, RISC-V!\\n"
`,
    solution: `  .globl _start
  .text
_start:
  li   a0, 1             # fd = 1: стандартный вывод
  la   a1, msg           # адрес строки
  li   a2, 15            # длина
  li   a7, 64            # write
  ecall
${EXIT0}
  .section .rodata
msg:
  .ascii "Hello, RISC-V!\\n"
`,
    data: '',
    check: expectRun('Hello, RISC-V!\n'),
  },
  {
    id: 'real-print-uint',
    title: 'Печать числа: print_uint',
    text: 'write умеет выводить только байты, поэтому число нужно превратить в текст самому. Допишите функцию print_uint(a0): она печатает беззнаковое число в десятичном виде и перевод строки. Основная программа уже вызывает её для 0, 7, 1234567 и 4294967295. Алгоритм: пока число не стало нулём — взять остаток от деления на 10 (remu), прибавить код символа «0», записать в буфер на стеке и разделить число на 10 (divu). Цифры получаются с конца, поэтому буфер заполняется справа налево.',
    hint: 'Выделите на стеке 16 байт (addi sp, sp, -16), положите в конец перевод строки (10) и пишите цифры, уменьшая указатель. Число 0 — особый случай: цикл должен выполниться хотя бы раз (проверка условия в конце цикла, как do…while). В конце — write(1, начало, длина) и addi sp, sp, 16 перед ret.',
    starter: `  .globl _start
  .text
_start:
  li   a0, 0
  call print_uint
  li   a0, 7
  call print_uint
  li   a0, 1234567
  call print_uint
  li   a0, 4294967295
  call print_uint
${EXIT0}
# print_uint(a0): напечатать число и перевод строки
print_uint:
  # ваш код
  ret
`,
    solution: `  .globl _start
  .text
_start:
  li   a0, 0
  call print_uint
  li   a0, 7
  call print_uint
  li   a0, 1234567
  call print_uint
  li   a0, 4294967295
  call print_uint
${EXIT0}
# print_uint(a0): напечатать число и перевод строки
print_uint:
  addi sp, sp, -16
  addi t0, sp, 15        # куда писать следующий символ
  li   t1, 10
  sb   t1, 0(t0)         # перевод строки в конце буфера
print_uint_loop:
  remu t2, a0, t1        # младшая десятичная цифра
  addi t2, t2, '0'
  addi t0, t0, -1
  sb   t2, 0(t0)
  divu a0, a0, t1
  bnez a0, print_uint_loop
  li   a0, 1
  mv   a1, t0
  addi a2, sp, 16
  sub  a2, a2, t0        # длина = конец буфера - начало
  li   a7, 64
  ecall
  addi sp, sp, 16
  ret
`,
    data: '',
    check: expectRun('0\n7\n1234567\n4294967295\n'),
  },
  {
    id: 'real-fizzbuzz',
    title: 'FizzBuzz',
    text: 'Классика: для чисел от 1 до 30 выведите по строке: «FizzBuzz», если число делится и на 3, и на 5; «Fizz» — если только на 3; «Buzz» — если только на 5; иначе само число. Готовая print_int уже есть — она печатает число и перевод строки. Текстовые слова выводите сами через write. Остаток от деления даёт команда rem.',
    hint: 'Счётчик храните в s0 — этот регистр не портится вызовом print_int (вызываемая функция обязана его сохранять; наша print_int вообще его не трогает). Проверяйте сначала деление на 15, потом на 3, потом на 5.',
    starter: `  .globl _start
  .text
_start:
  li   s0, 1             # счётчик
  # ваш цикл от 1 до 30
${EXIT0}${PRINT_INT}
  .section .rodata
fizz:
  .ascii "Fizz\\n"
buzz:
  .ascii "Buzz\\n"
fizzbuzz:
  .ascii "FizzBuzz\\n"
`,
    solution: `  .globl _start
  .text
_start:
  li   s0, 1             # счётчик
  li   s1, 31            # предел
  li   s2, 3
  li   s3, 5
  li   s4, 15
loop:
  rem  t0, s0, s4
  beqz t0, say_fizzbuzz
  rem  t0, s0, s2
  beqz t0, say_fizz
  rem  t0, s0, s3
  beqz t0, say_buzz
  mv   a0, s0
  call print_int
  j    next
say_fizzbuzz:
  la   a1, fizzbuzz
  li   a2, 9
  j    say
say_fizz:
  la   a1, fizz
  li   a2, 5
  j    say
say_buzz:
  la   a1, buzz
  li   a2, 5
say:
  li   a0, 1
  li   a7, 64
  ecall
next:
  addi s0, s0, 1
  blt  s0, s1, loop
${EXIT0}${PRINT_INT}
  .section .rodata
fizz:
  .ascii "Fizz\\n"
buzz:
  .ascii "Buzz\\n"
fizzbuzz:
  .ascii "FizzBuzz\\n"
`,
    data: '',
    check: expectRun(
      Array.from({ length: 30 }, (_, i) => {
        const n = i + 1;
        return n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n);
      }).join('\n') + '\n',
    ),
  },
  {
    id: 'real-fib',
    title: 'Числа Фибоначчи',
    text: 'Выведите первые 15 чисел Фибоначчи (0, 1, 1, 2, 3, 5, …, 377), по числу в строке. Готовая print_int уже есть. Каждое следующее число — сумма двух предыдущих, поэтому держите два регистра и обновляйте их в цикле.',
    hint: 'Пусть s0 = текущее число (сначала 0), s1 = следующее (сначала 1), s2 = сколько ещё напечатать. В цикле: напечатать s0; t = s0 + s1; s0 = s1; s1 = t; s2--.',
    starter: `  .globl _start
  .text
_start:
  # ваш цикл: 15 чисел Фибоначчи
${EXIT0}${PRINT_INT}`,
    solution: `  .globl _start
  .text
_start:
  li   s0, 0             # F(n)
  li   s1, 1             # F(n+1)
  li   s2, 15            # сколько напечатать
loop:
  mv   a0, s0
  call print_int
  add  t0, s0, s1
  mv   s0, s1
  mv   s1, t0
  addi s2, s2, -1
  bnez s2, loop
${EXIT0}${PRINT_INT}`,
    data: '',
    check: expectRun(
      (() => {
        const out: number[] = [];
        let [a, b] = [0, 1];
        for (let i = 0; i < 15; i++) {
          out.push(a);
          [a, b] = [b, a + b];
        }
        return out.join('\n') + '\n';
      })(),
    ),
  },
  {
    id: 'real-sort-print',
    title: 'Отсортировать и напечатать',
    text: 'В секции .data лежит массив из восьми 32-битных слов со знаком: 5, −3, 99, 0, −100, 42, 7, −1 (метка arr, число элементов — константа N). Отсортируйте его по возрастанию на месте и напечатайте элементы по одному в строке (готовая print_int печатает и отрицательные числа).',
    hint: 'Сортировка пузырьком, как раньше: адрес i-го слова — arr + 4·i. Для печати пройдите массив ещё раз: lw a0, 0(указатель); call print_int. Счётчики и указатели, которые должны пережить call, держите в s-регистрах.',
    starter: `  .equ N, 8              # число элементов
  .globl _start
  .text
_start:
  # 1) отсортируйте arr   2) напечатайте элементы по порядку
${EXIT0}${PRINT_INT}
  .data
arr:
  .word 5, -3, 99, 0, -100, 42, 7, -1
`,
    solution: `  .equ N, 8              # число элементов
  .globl _start
  .text
_start:
  la   s0, arr
  li   s1, N
outer:
  addi s1, s1, -1
  blez s1, print
  li   t1, 0             # i
inner:
  bge  t1, s1, outer
  slli t2, t1, 2
  add  t2, t2, s0        # адрес arr[i]
  lw   t3, 0(t2)
  lw   t4, 4(t2)
  ble  t3, t4, skip      # уже по порядку
  sw   t4, 0(t2)
  sw   t3, 4(t2)
skip:
  addi t1, t1, 1
  j    inner
print:
  li   s1, N             # сколько напечатать
  mv   s2, s0            # указатель
print_loop:
  lw   a0, 0(s2)
  call print_int
  addi s2, s2, 4
  addi s1, s1, -1
  bnez s1, print_loop
${EXIT0}${PRINT_INT}
  .data
arr:
  .word 5, -3, 99, 0, -100, 42, 7, -1
`,
    data: '',
    check: expectRun('-100\n-3\n-1\n0\n5\n7\n42\n99\n'),
  },
  {
    id: 'real-exit-code',
    title: 'Код возврата: гласные',
    text: 'Программа может сообщить результат кодом возврата: он лежит в a0 при вызове exit, а в терминале его показывает «echo $?». Посчитайте, сколько в строке text английских гласных (a, e, i, o, u — строчных; строка заканчивается нулевым байтом), и верните это число как код возврата. Ничего выводить не нужно.',
    hint: 'Идите по строке lbu до нулевого байта. Для каждого символа сравнивайте по очереди с пятью гласными (beq) и увеличивайте счётчик. Результат — в a0, затем li a7, 93; ecall.',
    starter: `  .globl _start
  .text
_start:
  la   t0, text
  # посчитайте гласные, результат — в a0, затем exit(a0)

  .section .rodata
text:
  .asciz "programming in assembly is fun"
`,
    solution: `  .globl _start
  .text
_start:
  la   t0, text
  li   a0, 0             # счётчик гласных
  li   t2, 'a'
  li   t3, 'e'
  li   t4, 'i'
  li   t5, 'o'
  li   t6, 'u'
loop:
  lbu  t1, 0(t0)
  beqz t1, done
  beq  t1, t2, vowel
  beq  t1, t3, vowel
  beq  t1, t4, vowel
  beq  t1, t5, vowel
  beq  t1, t6, vowel
  j    next
vowel:
  addi a0, a0, 1
next:
  addi t0, t0, 1
  j    loop
done:
  li   a7, 93            # exit(a0)
  ecall

  .section .rodata
text:
  .asciz "programming in assembly is fun"
`,
    data: '',
    check: expectRun(
      '',
      [...'programming in assembly is fun'].filter((c) => 'aeiou'.includes(c)).length,
    ),
  },
];
