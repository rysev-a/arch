import { CodeSpec } from './code-guide';
import { ASM_SPECS } from './code-specs-asm';
import { REAL_SPECS } from './code-specs-real';
import { RISCV_SPECS } from './code-specs-riscv';

/** Тексты разборов заданий по программированию, ключ — `<глава>/<задание>` */
export const CODE_SPECS: Record<string, CodeSpec> = {
  ...ASM_SPECS,
  ...RISCV_SPECS,
  ...REAL_SPECS,
};
