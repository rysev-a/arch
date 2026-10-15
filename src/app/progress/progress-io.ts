/**
 * Сохранение и перенос прогресса. Всё хранится в localStorage браузера; чтобы не потерять его
 * при очистке данных или переезде на другое устройство, прогресс можно выгрузить в файл и загрузить обратно.
 */

/** Какие ключи localStorage считаются прогрессом (тема оформления не входит) */
const KEY_PREFIXES = [
  'processor-progress-v2-', // решённые упражнения со схемами
  'processor-solution-v1-', // сохранённые схемы учеников (из них собираются блоки)
  'processor-asm-v1', // ассемблер «Мини-8»
  'processor-riscv-v1', // RISC-V на учебной плате
  'processor-riscv-real-v1', // реальная сборка
];

const MAX_BYTES = 5_000_000;

export interface ProgressFile {
  app: 'processor';
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
}

/** Минимум, который нужен от хранилища: подойдёт и localStorage, и заглушка в тестах */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isProgressKey = (key: string): boolean => KEY_PREFIXES.some((p) => key.startsWith(p));

const parse = (raw: string | null): unknown => {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
};

export function exportProgress(storage: KeyValueStorage = localStorage): ProgressFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const value = key ? storage.getItem(key) : null;
    if (key && value !== null && isProgressKey(key)) data[key] = value;
  }
  return { app: 'processor', version: 1, exportedAt: new Date().toISOString(), data };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  /** сколько записей добавлено или дополнено */
  changed: number;
}

const fail = (message: string): ImportResult => ({ ok: false, message, changed: 0 });

/** Дополняет имеющееся: решённое объединяется, ваши тексты программ не затираются */
export function importProgress(
  text: string,
  storage: KeyValueStorage = localStorage,
): ImportResult {
  if (text.length > MAX_BYTES) return fail('Файл слишком большой для файла с прогрессом.');
  const file = parse(text) as Partial<ProgressFile> | null;
  if (
    !file ||
    file.app !== 'processor' ||
    file.version !== 1 ||
    typeof file.data !== 'object' ||
    !file.data
  ) {
    return fail('Это не файл с прогрессом из этого учебника.');
  }

  let changed = 0;
  for (const [key, raw] of Object.entries(file.data)) {
    if (!isProgressKey(key) || typeof raw !== 'string') continue; // чужие ключи игнорируем
    const incoming = parse(raw);
    if (incoming === null || typeof incoming !== 'object') continue;
    const current = parse(storage.getItem(key)) as Record<string, unknown> | null;

    let merged: unknown = incoming;
    if (current && typeof current === 'object') {
      if (key.startsWith('processor-solution-v1-')) {
        continue; // своя схема уже есть — не трогаем
      }
      const inc = incoming as Record<string, unknown>;
      const solved = new Set<unknown>([
        ...(Array.isArray(current['solved']) ? current['solved'] : []),
        ...(Array.isArray(inc['solved']) ? inc['solved'] : []),
      ]);
      merged = {
        ...inc,
        ...current, // что уже есть в браузере — важнее (текущее упражнение, свои тексты программ)
        solved: [...solved],
        ...(inc['codes'] || current['codes']
          ? { codes: { ...(inc['codes'] as object), ...(current['codes'] as object) } }
          : {}),
      };
    }
    const next = JSON.stringify(merged);
    if (next !== storage.getItem(key)) {
      storage.setItem(key, next);
      changed++;
    }
  }
  return {
    ok: true,
    changed,
    message:
      changed > 0
        ? `Прогресс загружен: обновлено записей — ${changed}.`
        : 'В файле нет ничего нового: ваш прогресс уже включает его.',
  };
}

export function resetProgress(storage: KeyValueStorage = localStorage): number {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isProgressKey(key)) keys.push(key);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys.length;
}

export const progressFileName = (date = new Date()): string =>
  `processor-progress-${date.toISOString().slice(0, 10)}.json`;
