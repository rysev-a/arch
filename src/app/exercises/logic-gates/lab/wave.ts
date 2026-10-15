import { InputId, NodeValue } from '../circuit.model';
import { Exercise } from '../exercises';

/** Сколько последних изменений хранит временная диаграмма */
export const HISTORY_MAX = 24;

/** Снимок сигналов после очередного изменения — один столбец временной диаграммы */
export interface Sample {
  inputs: Partial<Record<InputId, 0 | 1>>;
  outputs: Record<string, NodeValue>;
}

export interface WaveRow {
  label: string;
  kind: 'in' | 'clk' | 'out';
  top: number;
  /** определённые участки сигнала */
  d: string;
  /** неопределённые («?») участки — пунктиром посередине */
  dx: string;
}

export interface Wave {
  rows: WaveRow[];
  height: number;
  cols: number[];
  lastX: number;
}

export const WAVE = { labelW: 56, step: 26, rowH: 30, hi: 8, lo: 22, width: 56 + HISTORY_MAX * 26 };

function waveRow(
  label: string,
  kind: WaveRow['kind'],
  top: number,
  values: readonly NodeValue[],
): WaveRow {
  let d = '';
  let dx = '';
  let prevY: number | null = null;
  values.forEach((v, i) => {
    const x0 = WAVE.labelW + i * WAVE.step;
    const x1 = x0 + WAVE.step;
    if (v === undefined) {
      dx += `M ${x0} ${top + (WAVE.hi + WAVE.lo) / 2} H ${x1} `;
      prevY = null;
      return;
    }
    const y = top + (v === 1 ? WAVE.hi : WAVE.lo);
    d += prevY === null ? `M ${x0} ${y} H ${x1} ` : prevY === y ? `H ${x1} ` : `V ${y} H ${x1} `;
    prevY = y;
  });
  return { label, kind, top, d, dx };
}

/** Временная диаграмма по истории изменений: по строке на каждый вход и выход упражнения */
export function buildWave(samples: readonly Sample[], ex: Exercise): Wave {
  const labels = (id: InputId) => ex.labels?.[ex.inputs.indexOf(id)] ?? id;
  const rows: WaveRow[] = [
    ...ex.inputs.map((id) => ({
      label: labels(id),
      kind: (ex.clock === id ? 'clk' : 'in') as WaveRow['kind'],
      values: samples.map((smp) => smp.inputs[id] as NodeValue),
    })),
    ...ex.outputs.map((o) => ({
      label: o,
      kind: 'out' as const,
      values: samples.map((smp) => smp.outputs[o]),
    })),
  ].map((r, i) => waveRow(r.label, r.kind, i * WAVE.rowH, r.values));
  return {
    rows,
    height: rows.length * WAVE.rowH,
    cols: samples.map((_, i) => WAVE.labelW + i * WAVE.step),
    lastX: WAVE.labelW + (samples.length - 1) * WAVE.step,
  };
}
