import {
  Bit,
  GATE_MAX_X,
  GATE_MAX_Y,
  GATE_MIN_X,
  GATE_MIN_Y,
  GATE_H,
  GATE_W,
  GateType,
  InputId,
  PinKind,
  inputYs,
  outputYs,
} from './circuit.model';
import { Exercise } from './exercises';
import { Guide, GuideAction, GuideStep } from './guides';
import { BlockSolution } from './blocks';
import { Net } from './solutions';

/**
 * Тексты разбора: схему, порядок и раскладку на доске строит сам конструктор — по эталонному
 * нетлисту упражнения. Авторы пишут только то, чего машина знать не может: идею решения
 * и объяснение к каждому элементу.
 */
export interface GuideSpec {
  /** Идея решения: 1–3 абзаца для вступления (после условия) */
  idea: string;
  /** Имя элемента из нетлиста → [краткая подпись, объяснение] */
  notes: Record<string, readonly [label: string, text: string]>;
  /** Объединить элементы в один шаг (иначе — по одному на шаг) */
  groups?: readonly (readonly string[])[];
  /** Свои пояснения к проверкам таблицы: номер строки → текст; без них строки выбираются сами */
  rows?: Record<number, string>;
  /** Что сказать про выход (подключение результата) */
  out?: string;
  /** Дополнение к итогам */
  outro?: string;
  /** Заголовок для вступления первого упражнения курса: объясняет сам режим авто */
  first?: boolean;
}

const TYPE_NAME: Record<GateType, string> = {
  AND: 'элемент И',
  OR: 'элемент ИЛИ',
  NOT: 'инвертор НЕ',
  NOR: 'элемент ИЛИ-НЕ',
  NAND: 'элемент И-НЕ',
  XOR: 'элемент XOR',
  XNOR: 'элемент XNOR',
  DFF: 'D-триггер',
};

const TYPE_BLURB: Record<GateType, string> = {
  AND: 'Напомним: И выдаёт 1 только тогда, когда на всех входах 1.',
  OR: 'Напомним: ИЛИ выдаёт 1, когда хотя бы на одном входе 1.',
  NOT: 'Напомним: НЕ переворачивает сигнал — из 0 делает 1, из 1 делает 0.',
  NOR: 'Напомним: ИЛИ-НЕ выдаёт 1 только тогда, когда на обоих входах 0.',
  NAND: 'Напомним: И-НЕ выдаёт 0 только тогда, когда на обоих входах 1.',
  XOR: 'Напомним: XOR выдаёт 1, когда входы РАЗНЫЕ.',
  XNOR: 'Напомним: XNOR выдаёт 1, когда входы ОДИНАКОВЫЕ.',
  DFF: 'Напомним: D-триггер запоминает D на фронте CLK (при переходе 0 → 1) и держит до следующего фронта.',
};

interface Placed {
  name: string;
  type: GateType;
  sources: string[];
  x: number;
  y: number;
}

const ROW_GAP = 54;
const Y_MIN = GATE_MIN_Y + GATE_H / 2;
const Y_MAX = GATE_MAX_Y + GATE_H / 2;
const X_MIN = GATE_MIN_X + GATE_W / 2 + 20;
const X_MAX = GATE_MAX_X + GATE_W / 2 - 20;

/** Раскладка: столбцы по «глубине» схемы, внутри столбца — по средней высоте источников */
export function layoutNet(
  ex: Exercise,
  net: Net,
  outs: Record<string, string>,
): { order: Placed[]; resolve: (n: string) => string } {
  const labels = ex.labels ?? ex.inputs;
  const resolve = (name: string): string => {
    const li = labels.indexOf(name);
    if (li >= 0 && !(name in net)) return ex.inputs[li];
    return name;
  };
  const names = Object.keys(net);
  const srcOf = (g: string): string[] =>
    [net[g][1], net[g][2]].filter((s): s is string => s !== undefined).map(resolve);

  const level = new Map<string, number>();
  const state = new Map<string, 1 | 2>();
  const visit = (g: string): number => {
    const known = level.get(g);
    if (known !== undefined) return known;
    state.set(g, 1);
    let lv = 1;
    for (const s of srcOf(g)) {
      if (!(s in net)) continue; // вход-тумблер
      if (state.get(s) === 1) continue; // обратная связь не углубляет схему
      lv = Math.max(lv, visit(s) + 1);
    }
    state.set(g, 2);
    level.set(g, lv);
    return lv;
  };
  names.forEach(visit);
  const depth = Math.max(1, ...names.map((g) => level.get(g)!));

  const yIn = inputYs(ex.inputs);
  const yOut = outputYs(ex.outputs);
  const ys = new Map<string, number>(Object.entries(yIn));
  const placed: Placed[] = [];
  for (let lv = 1; lv <= depth; lv++) {
    const x = depth === 1 ? 430 : Math.round(X_MIN + ((lv - 1) * (X_MAX - X_MIN)) / (depth - 1));
    const col = names
      .filter((g) => level.get(g) === lv)
      .map((g) => {
        const known = srcOf(g)
          .map((s) => ys.get(s))
          .filter((v): v is number => v !== undefined);
        // у элементов, питающих только выходы, ориентир — высота выхода
        const feeds = Object.entries(outs)
          .filter(([, src]) => resolve(src) === g)
          .map(([o]) => yOut[o]);
        const all = [...known, ...feeds];
        const want = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 220;
        return { g, want };
      })
      .sort((a, b) => a.want - b.want);

    // шаг между элементами столбца: обычно ROW_GAP, а в плотных столбцах — меньше, но не слипаясь
    const gap =
      col.length > 1
        ? Math.max(GATE_H + 4, Math.min(ROW_GAP, (Y_MAX - Y_MIN) / (col.length - 1)))
        : ROW_GAP;
    const pos = col.map((c) => c.want);
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + gap);
    const over = (pos[pos.length - 1] ?? 0) - Y_MAX;
    if (over > 0) for (let i = 0; i < pos.length; i++) pos[i] -= over;
    if (pos.length && pos[0] < Y_MIN) {
      const lift = Y_MIN - pos[0];
      for (let i = 0; i < pos.length; i++) pos[i] += lift;
    }

    col.forEach((c, i) => {
      const y = Math.round(pos[i]);
      ys.set(c.g, y);
      placed.push({ name: c.g, type: net[c.g][0], sources: srcOf(c.g), x, y });
    });
  }
  return { order: placed, resolve };
}

const pinOf = (index: number): PinKind => (index === 0 ? 'in0' : 'in1');

const bitsText = (ex: Exercise, inputs: Partial<Record<InputId, Bit>>): string => {
  const labels = ex.labels ?? ex.inputs;
  return ex.inputs.map((id, i) => `${labels[i]} = ${inputs[id] ?? 0}`).join(', ');
};

/** Строки таблицы для проверок: разные ответы + первая и последняя */
function pickRows(ex: Exercise): number[] {
  const rows = ex.target.length;
  if (rows <= 4) return Array.from({ length: rows }, (_, i) => i);
  const seen = new Set<string>();
  const picks: number[] = [];
  for (let r = 0; r < rows && picks.length < 4; r++) {
    const key = ex.target[r].join(',');
    if (!seen.has(key)) {
      seen.add(key);
      picks.push(r);
    }
  }
  if (!picks.includes(rows - 1)) picks.push(rows - 1);
  if (!picks.includes(0)) picks.unshift(0);
  return picks.sort((a, b) => a - b);
}

/** Шаги проверки: сценарий упражнения или избранные строки таблицы */
export function verificationSteps(ex: Exercise, rowsSpec?: Record<number, string>): GuideStep[] {
  const steps: GuideStep[] = [];
  if (ex.mode === 'steps') {
    const clock = ex.clock;
    ex.steps!.forEach((st, i) => {
      const actions: GuideAction[] = [];
      let title: string;
      if (ex.ticks && clock) {
        const data: Partial<Record<InputId, Bit>> = {};
        for (const id of ex.inputs) if (id !== clock) data[id] = st.inputs[id];
        if (Object.keys(data).length) actions.push({ set: data });
        // в шаге с CLK = 0 такт не подаётся: меняются только входы
        const pulsed = st.inputs[clock] === 1;
        if (pulsed) actions.push({ pulse: st.pulses ?? 1 });
        title = pulsed ? `Такт ${i + 1}` : `Шаг ${i + 1} из ${ex.steps!.length}`;
      } else {
        actions.push({ set: { ...st.inputs } });
        title = `Шаг ${i + 1} из ${ex.steps!.length}`;
      }
      const expect = Object.entries(st.expect)
        .map(([o, b]) => `${o} = ${b}`)
        .join(', ');
      steps.push({
        title,
        do: actions,
        completes: i,
        text: `${st.text}\n\n**Тумблеры:** ${bitsText(ex, st.inputs)}. **Ожидаем на выходе:** ${expect}.`,
      });
    });
  } else {
    const rows = rowsSpec
      ? Object.keys(rowsSpec)
          .map(Number)
          .sort((a, b) => a - b)
      : pickRows(ex);
    const n = ex.inputs.length;
    for (const r of rows) {
      const inputs: Partial<Record<InputId, Bit>> = {};
      ex.inputs.forEach((id, i) => (inputs[id] = ((r >> (n - 1 - i)) & 1) as Bit));
      const result = ex.outputs.map((o, i) => `${o} = ${ex.target[r][i]}`).join(', ');
      steps.push({
        title: `Проверка: ${bitsText(ex, inputs)}`,
        do: [{ set: inputs }],
        text:
          rowsSpec?.[r] ??
          `Выставляем ${bitsText(ex, inputs)}. Схема выдаёт **${result}**, и это совпадает со строкой таблицы «Цель». Смотрите, как значения бегут по проводам: зелёный — 1, серый — 0.`,
      });
    }
  }

  return steps;
}

export const introStep = (ex: Exercise, idea: string, first?: boolean): GuideStep => ({
  title: 'Что мы строим',
  text: [
    ex.task,
    `**Идея решения.** ${idea}`,
    first
      ? 'Режим авто сам построит схему и объяснит каждое действие. «Вперёд» — следующее действие на доске, «Назад» — отменить его. Любой шаг можно повторить своими руками: сотрите схему и соберите её сами.'
      : '',
  ]
    .filter(Boolean)
    .join('\n\n'),
});

/** Есть ли в тексте `a` кусок из `n` символов, который уже есть в `b` */
const repeats = (a: string, b: string, n = 30): boolean => {
  for (let i = 0; i + n <= a.length; i++) if (b.includes(a.slice(i, i + n))) return true;
  return false;
};

/** Итоги: текст упражнения, формула и (если не пересказывает текст упражнения) своё дополнение */
export const outroStep = (ex: Exercise, outro?: string): GuideStep => ({
  title: 'Что вы узнали',
  text: [
    ex.success,
    ex.formula ? `Формула: **${ex.formula}**.` : '',
    outro && !repeats(outro, ex.success) ? outro : '',
  ]
    .filter(Boolean)
    .join('\n\n'),
});

export function buildGuide(
  ex: Exercise,
  sol: { net: Net; outs: Record<string, string> },
  spec: GuideSpec,
): Guide {
  const { net, outs } = sol;
  const { order, resolve } = layoutNet(ex, net, outs);
  const labels = ex.labels ?? ex.inputs;
  const inputLabel = (id: string) => labels[ex.inputs.indexOf(id as InputId)] ?? id;
  const labelOf = (node: string): string =>
    node in net ? (spec.notes[node]?.[0] ?? node) : inputLabel(node);
  const steps: GuideStep[] = [];

  steps.push(introStep(ex, spec.idea, spec.first));

  // --- элементы: по одному на шаг (или группами), порядок — слева направо
  const groups: string[][] = [];
  const grouped = new Set((spec.groups ?? []).flat());
  for (const g of order) {
    if (grouped.has(g.name)) {
      const grp = (spec.groups ?? []).find((x) => x.includes(g.name))!;
      if (!groups.some((x) => x[0] === grp[0])) groups.push([...grp]);
    } else groups.push([g.name]);
  }
  const placedSet = new Set<string>();
  const wired = new Set<string>();
  const byName = new Map(order.map((p) => [p.name, p]));
  const isSource = (s: string) => ex.inputs.includes(s as InputId) || placedSet.has(s);

  for (const grp of groups) {
    const actions: GuideAction[] = [];
    for (const name of grp) {
      const p = byName.get(name)!;
      actions.push({ place: p.type, name, at: { x: p.x, y: p.y } });
      placedSet.add(name);
    }
    const wires: string[] = [];
    for (const p of order) {
      if (!placedSet.has(p.name)) continue;
      p.sources.forEach((src, i) => {
        const key = `${p.name}:${i}`;
        if (wired.has(key) || !isSource(src)) return;
        if (!grp.includes(p.name) && !grp.includes(src)) return;
        wired.add(key);
        actions.push({ wire: { from: src, to: p.name, pin: pinOf(i) } });
        wires.push(`${labelOf(src)} → «${labelOf(p.name)}»`);
      });
    }
    const single = grp.length === 1;
    const first = byName.get(grp[0])!;
    const title = single
      ? `${labelOf(grp[0])} — ${TYPE_NAME[first.type]}`
      : grp.map(labelOf).join(', ');
    const body = grp
      .map((name) => {
        const note = spec.notes[name];
        const text = note ? note[1] : `Ставим ${TYPE_NAME[byName.get(name)!.type]}.`;
        return single ? text : `**${labelOf(name)}.** ${text}`;
      })
      .join('\n\n');
    const blurbs = [...new Set(grp.map((n) => TYPE_BLURB[byName.get(n)!.type]))].join(' ');
    steps.push({
      title,
      do: actions,
      text: `${body}\n\n${wires.length ? `**Подключено:** ${wires.join('; ')}. ` : ''}${blurbs}`.trim(),
    });
  }

  // --- выходы
  const outActions: GuideAction[] = [];
  const outWires: string[] = [];
  for (const o of ex.outputs) {
    const src = outs[o];
    if (src === undefined) continue;
    const from = resolve(src);
    outActions.push({ wire: { from, to: o, pin: 'in0' } });
    outWires.push(`${labelOf(from)} → ${o}`);
  }
  steps.push({
    title: ex.outputs.length > 1 ? `Выходы ${ex.outputs.join(', ')}` : `Выход ${ex.outputs[0]}`,
    do: outActions,
    text:
      (spec.out ??
        'Остаётся снять результат: провод от последнего элемента ведёт к выходу схемы. Схема построена полностью.') +
      `\n\n**Подключено:** ${outWires.join('; ')}.`,
  });

  steps.push(...verificationSteps(ex, spec.rows));
  steps.push(outroStep(ex, spec.outro));

  return { steps };
}

/** Разбор упражнения «из блоков»: части — это блоки и шины из эталонного решения BlockSolution */
export interface BlockGuideSpec {
  idea: string;
  parts: readonly {
    title: string;
    text: string;
    /** какие экземпляры поставить (id из решения) */
    instances: readonly string[];
    /** какие шины провести (номера в busWires решения) */
    wires: readonly number[];
  }[];
  rows?: Record<number, string>;
  outro?: string;
}

export function buildBlockGuide(ex: Exercise, sol: BlockSolution, spec: BlockGuideSpec): Guide {
  const steps: GuideStep[] = [introStep(ex, spec.idea)];
  for (const part of spec.parts) {
    const actions: GuideAction[] = [
      ...part.instances.map((id): GuideAction => {
        const inst = sol.instances.find((i) => i.id === id)!;
        return { block: { id, blockId: inst.blockId, x: inst.x, y: inst.y } };
      }),
      ...part.wires.map((i): GuideAction => {
        const w = sol.busWires[i];
        return { bus: { id: w.id, from: w.from, to: w.to } };
      }),
    ];
    steps.push({ title: part.title, text: part.text, do: actions });
  }
  steps.push(...verificationSteps(ex, spec.rows));
  steps.push(outroStep(ex, spec.outro));
  return { steps };
}
