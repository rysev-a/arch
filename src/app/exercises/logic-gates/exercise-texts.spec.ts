import { SECTIONS } from '../../sections/sections';

/**
 * Согласованность упражнений: обозначения сигналов в тексте совпадают с подписями на доске.
 * Раньше в условии были «A и B», а на схеме — «A и X»; такие расхождения ловит этот набор.
 */

/** Одиночная латинская заглавная буква — «имя сигнала» в тексте (не часть слова и не часть имени A1, nQ) */
const BARE_LETTER = /(?<![A-Za-zА-Яа-я0-9_-])[A-Z](?![A-Za-zА-Яа-я0-9_])/g;

const letters = (text: string): string[] => [...new Set(text.match(BARE_LETTER) ?? [])];

/** Подписи на доске: у упражнения они свои (D, E, CLK…) или совпадают с id входов; плюс выходы */
function shownNames(e: (typeof SECTIONS)[number]['exercises'][number]): Set<string> {
  return new Set<string>([...(e.labels ?? e.inputs), ...e.outputs]);
}

/** «A» допустимо, если на доске есть A0, A1… — так в тексте называют целую шину */
function isKnown(letter: string, names: Set<string>): boolean {
  if (names.has(letter)) return true;
  return [...names].some((n) => n.startsWith(letter) && /^\d+$/.test(n.slice(letter.length)));
}

/**
 * Проверенные вручную места, где в подсказке, формуле или разборе законно упоминается другой сигнал
 * (вход внутреннего элемента, чужое упражнение, общая формула де Моргана). Формат: раздел/упражнение:поле:буква.
 * Условие (`task`) строгое — исключений почти нет; новая буква в тексте = либо опечатка, либо запись сюда.
 */
const REVIEWED = new Set([
  'simple-circuits/inhibit:success:D', // «входе D-защёлки» — про другое упражнение
  'simple-circuits/inhibit:success:E',
  'mux/mux2-nor:hint:A', // общий закон де Моргана A·B
  'mux/mux2-nor:hint:B',
  'registers/clocked-latch:hint:E', // «роль разрешения E играет CLK»
  'registers/latch-low:hint:E', // E = НЕ-CLK — внутренний сигнал
  'registers/latch-low:formula:E',
  'registers/dff:hint:E',
  'registers/toggle:task:D', // D = НЕ-Q — вход внутри готового триггера
  'registers/toggle:hint:D',
  'registers/toggle:formula:D',
  'registers/shift4:hint:D', // D входов внутри триггеров
  'registers/accumulator:hint:D',
  'memory/protected-cell:formula:E', // we — внутренний сигнал, E в формуле — разрешение защёлки
]);

const FIELDS = ['task', 'hint', 'formula', 'success'] as const;

describe('упражнения: тексты и данные согласованы', () => {
  const all = SECTIONS.flatMap((s) => s.exercises.map((e) => ({ s, e })));

  it('во всех упражнениях есть что проверять', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('обозначения входов в тексте (A–F) совпадают с подписями на доске', () => {
    const bad: string[] = [];
    for (const { s, e } of all) {
      const names = shownNames(e);
      for (const field of FIELDS) {
        for (const l of letters(e[field])) {
          if (!'ABCDEF'.includes(l) || isKnown(l, names)) continue;
          if (REVIEWED.has(`${s.slug}/${e.id}:${field}:${l}`)) continue;
          bad.push(
            `${s.slug}/${e.id} (${field}): «${l}», а на доске ${[...names].join(', ')}\n    ${e[field]}`,
          );
        }
      }
    }
    expect(bad, 'Исправьте текст или, если упоминание законно, добавьте его в REVIEWED').toEqual(
      [],
    );
  });

  it('в условии любая буква-сигнал есть на доске (кроме проверенных)', () => {
    const bad: string[] = [];
    for (const { s, e } of all) {
      const names = shownNames(e);
      for (const l of letters(e.task)) {
        if (isKnown(l, names) || REVIEWED.has(`${s.slug}/${e.id}:task:${l}`)) continue;
        bad.push(`${s.slug}/${e.id}: «${l}» в условии, а на доске ${[...names].join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('подписи входов: столько же, сколько входов, и без повторов', () => {
    for (const { s, e } of all) {
      if (!e.labels) continue;
      expect(e.labels.length, `${s.slug}/${e.id}`).toBe(e.inputs.length);
      expect(new Set(e.labels).size, `${s.slug}/${e.id}: повтор в подписях`).toBe(e.labels.length);
    }
  });

  it('таблица цели: 2^входов строк, в каждой по значению на выход', () => {
    for (const { s, e } of all) {
      if (e.mode === 'steps') continue;
      expect(e.target.length, `${s.slug}/${e.id}`).toBe(2 ** e.inputs.length);
      for (const row of e.target) expect(row.length, `${s.slug}/${e.id}`).toBe(e.outputs.length);
    }
  });

  it('шаги сценария используют только входы и выходы упражнения', () => {
    for (const { s, e } of all) {
      for (const [i, st] of (e.steps ?? []).entries()) {
        for (const k of Object.keys(st.inputs)) {
          expect(
            e.inputs as readonly string[],
            `${s.slug}/${e.id} шаг ${i + 1}: вход ${k}`,
          ).toContain(k);
        }
        for (const k of Object.keys(st.expect)) {
          expect(e.outputs, `${s.slug}/${e.id} шаг ${i + 1}: выход ${k}`).toContain(k);
        }
      }
    }
  });

  it('id упражнений в разделе не повторяются, тексты не пустые', () => {
    for (const s of SECTIONS) {
      const ids = s.exercises.map((e) => e.id);
      expect(new Set(ids).size, `повтор id в ${s.slug}`).toBe(ids.length);
    }
    for (const { s, e } of all) {
      for (const f of ['title', ...FIELDS] as const) {
        expect(e[f].trim().length, `${s.slug}/${e.id}: пустое поле ${f}`).toBeGreaterThan(0);
      }
    }
  });

  it('имена выходов не совпадают с именами входов', () => {
    for (const { s, e } of all) {
      const inputs = new Set<string>(e.labels ?? e.inputs);
      for (const o of e.outputs) {
        expect(inputs.has(o), `${s.slug}/${e.id}: «${o}» и вход, и выход`).toBe(false);
      }
    }
  });
});
