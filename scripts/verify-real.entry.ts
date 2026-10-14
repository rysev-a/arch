// Сверка нашего ассемблера и процессора с настоящим инструментарием LLVM.
// Запускается через scripts/verify-real.sh, который собирает этот файл esbuild-ом.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assemble } from '../src/app/riscv/rv-asm';
import { RvMachine } from '../src/app/riscv/rv-machine';
import { REAL_TASKS } from '../src/app/riscv/rv-real-tasks';
import { GOLDEN } from '../src/app/riscv/rv-golden.testing';

const BIN = process.env['LLVM_BIN'] ?? '';
const tool = (name: string) => (BIN ? join(BIN, name) : name);
const LLD = process.env['LLD_BIN'] ?? '';
const dir = mkdtempSync(join(tmpdir(), 'verify-real-'));
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

const sh = (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });

// 1) Каждое «эталонное» слово — ещё и в настоящем ассемблере
console.log('Команды: наш ассемблер против llvm-mc');
{
  const src = GOLDEN.map(([a]) => a).join('\n') + '\n';
  const out = sh(tool('llvm-mc'), [
    '-triple=riscv32',
    '-mattr=+m',
    '-show-encoding',
    '-riscv-no-aliases=false',
  ]).length;
  void out;
  writeFileSync(join(dir, 'golden.s'), src);
  let bad = 0;
  for (const [asmText, word] of GOLDEN) {
    const enc = execFileSync(tool('llvm-mc'), ['-triple=riscv32', '-mattr=+m', '-show-encoding'], {
      input: asmText + '\n',
      encoding: 'utf8',
    });
    const m = /encoding: \[([^\]]*)\]/.exec(enc);
    if (!m) {
      bad++;
      fail(`llvm-mc не принял «${asmText}»`);
      continue;
    }
    const bytes = m[1].split(',').map((x) => parseInt(x.trim().replace('0x', ''), 16));
    const w = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    if (w !== word >>> 0) {
      bad++;
      fail(`«${asmText}»: llvm-mc ${w.toString(16)}, эталон ${(word >>> 0).toString(16)}`);
    }
  }
  console.log(bad === 0 ? `  ✓ ${GOLDEN.length} команд совпали` : `  ${bad} расхождений`);
}

// 1б) Загрузка констант: li может занимать одну или две команды — сравниваем со всеми границами
console.log('Псевдокоманда li: наш ассемблер против llvm-mc');
{
  const vals = [
    0, 1, -1, 2047, 2048, -2048, -2049, 4095, 4096, 0x7ff, 0x800, 0xfff, 0x1000, 0x12345,
    0x7fffffff, 0x80000000, 0xfffff800, 0xfffff7ff, 0xffffffff, 0x7ffff800, 0x7ffff7ff, 0xdeadbeef,
    0x10000000, -0x80000000, -0x7fffffff, 305419896, 1234567,
  ];
  let bad = 0;
  for (const v of vals) {
    const text = `li a0, ${v}`;
    const enc = execFileSync(tool('llvm-mc'), ['-triple=riscv32', '-mattr=+m', '-show-encoding'], {
      input: text + '\n',
      encoding: 'utf8',
    });
    const theirs = [...enc.matchAll(/encoding: \[([^\]]*)\]/g)].map((m) => {
      const b = m[1].split(',').map((x) => parseInt(x.trim().replace('0x', ''), 16));
      return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    });
    const ours = assemble(text).lines.map((l) => l.word >>> 0);
    // llvm иногда выбирает другую последовательность (например, addi + slli), поэтому
    // сравниваем не слова, а результат: выполняем обе последовательности и смотрим a0
    const exec = (words: number[]): number => {
      const img = new Uint8Array(64);
      [...words, 0x00100073].forEach((w, i) => new DataView(img.buffer).setUint32(i * 4, w, true));
      const m = new RvMachine(img);
      m.run(10);
      return m.regs[10] >>> 0;
    };
    const want = v >>> 0;
    if (exec(theirs) !== want || exec(ours) !== want) {
      bad++;
      fail(`${text}: llvm даёт ${exec(theirs)}, у нас ${exec(ours)}, нужно ${want}`);
    }
  }
  console.log(bad === 0 ? `  ✓ ${vals.length} констант совпали` : `  ${bad} расхождений`);
}

// 2) Целые программы: собираем настоящим clang+lld и сравниваем образ и поведение
const ld = `ENTRY(_start)
SECTIONS {
  . = 0;
  .text : { *(.text*) }
  . = 0x1000;
  .data : { *(.rodata*) *(.data*) *(.sdata*) *(.bss*) }
}
`;
writeFileSync(join(dir, 'link.ld'), ld);

for (const t of REAL_TASKS) {
  console.log(`Программа «${t.title}»`);
  const s = join(dir, `${t.id}.s`);
  const elf = join(dir, `${t.id}.elf`);
  const bin = join(dir, `${t.id}.bin`);
  writeFileSync(s, t.solution);
  try {
    sh(tool('clang'), [
      '--target=riscv32',
      '-march=rv32im',
      '-mabi=ilp32',
      '-mno-relax',
      '-nostdlib',
      '-static',
      `-fuse-ld=${LLD ? join(LLD, 'ld.lld') : 'lld'}`,
      `-Wl,-T,${join(dir, 'link.ld')}`,
      '-o',
      elf,
      s,
    ]);
    sh(tool('llvm-objcopy'), ['-O', 'binary', elf, bin]);
  } catch (e) {
    fail(`настоящий инструментарий не собрал программу: ${(e as Error).message}`);
    continue;
  }
  const real = new Uint8Array(readFileSync(bin));
  const entryLine = /Entry point address:\s+(0x[0-9a-f]+)/i.exec(
    sh(tool('llvm-readelf'), ['-h', elf]),
  );
  const entry = entryLine ? parseInt(entryLine[1], 16) : -1;

  const ours = assemble(t.solution);
  if (ours.errors.length) {
    fail(`наш ассемблер: ${JSON.stringify(ours.errors)}`);
    continue;
  }
  if (entry !== ours.entry) fail(`точка входа: llvm ${entry}, у нас ${ours.entry}`);
  const n = Math.max(
    real.length,
    ours.textSize + 0x1000 - 0 > real.length ? real.length : real.length,
  );
  let diff = -1;
  for (let i = 0; i < n; i++) {
    if ((real[i] ?? 0) !== (ours.image[i] ?? 0)) {
      diff = i;
      break;
    }
  }
  if (diff >= 0) {
    fail(`образ памяти расходится с llvm по адресу 0x${diff.toString(16)}`);
  } else {
    console.log(`  ✓ образ совпал побайтно (${real.length} байт)`);
  }

  // и поведение: исполняем то, что собрал llvm
  const img = new Uint8Array(0x4000);
  img.set(real.subarray(0, 0x4000));
  const m = new RvMachine(img, { entry });
  m.run(500_000);
  const r = t.check(m.view(), ours.symbols);
  if (!r.ok) fail(`бинарник llvm в нашем процессоре: ${r.message}`);
  else console.log(`  ✓ бинарник llvm в нашем процессоре: ${r.message}`);
}

console.log(
  failures === 0 ? '\nВсё совпало с настоящим инструментарием.' : `\nРасхождений: ${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
