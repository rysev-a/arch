import { GuideSpec } from './guide-builder';
import { CPU_GATE_SPECS } from './guide-specs-cpu';
import { DECODER_SPECS } from './guide-specs-decoder';
import { MEMORY_SPECS } from './guide-specs-memory';
import { ALU_SPECS } from './guide-specs-alu';
import { ADDERS_SPECS } from './guide-specs-adders';
import { LATCHES_SPECS } from './guide-specs-latches';
import { REGISTERS_SPECS } from './guide-specs-registers';
import { MUX_SPECS } from './guide-specs-mux';
import { SIMPLE_SPECS } from './guide-specs-simple';

/** Тексты для сборки разборов, ключ — `<глава>/<упражнение>` */
export const SPECS: Record<string, GuideSpec> = {
  ...SIMPLE_SPECS,
  ...MUX_SPECS,
  ...LATCHES_SPECS,
  ...REGISTERS_SPECS,
  ...ADDERS_SPECS,
  ...ALU_SPECS,
  ...MEMORY_SPECS,
  ...DECODER_SPECS,
  ...CPU_GATE_SPECS,
};
