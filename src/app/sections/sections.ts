import { Exercise } from '../exercises/logic-gates/exercises';
import { EXERCISES } from '../exercises/logic-gates/exercises';
import { MUX_EXERCISES } from '../exercises/logic-gates/exercises-mux';
import { LATCHES_EXERCISES } from '../exercises/logic-gates/exercises-latches';
import { ADDERS_EXERCISES } from '../exercises/logic-gates/exercises-adders';
import { REGISTERS_EXERCISES } from '../exercises/logic-gates/exercises-registers';
import { ALU_EXERCISES } from '../exercises/logic-gates/exercises-alu';
import { MEMORY_EXERCISES } from '../exercises/logic-gates/exercises-memory';
import { DECODER_EXERCISES } from '../exercises/logic-gates/exercises-decoder';
import { CPU_EXERCISES } from '../exercises/logic-gates/exercises-cpu';
import { TASKS as ASM_TASKS } from '../asm/tasks';
import { RV_TASKS } from '../riscv/rv-tasks';
import { REAL_TASKS } from '../riscv/rv-real-tasks';

export interface Section {
  slug: string;
  title: string;
  description: string;
  progressKey: string;
  exercises: readonly Exercise[];
}

/** Разделы, доступные сейчас */
export const SECTIONS: readonly Section[] = [
  {
    slug: 'simple-circuits',
    title: 'Простые схемы',
    description: 'Логические элементы и таблицы истинности: от провода до мультиплексора',
    progressKey: 'simple',
    exercises: EXERCISES,
  },
  {
    slug: 'mux',
    title: 'Мультиплексоры',
    description: 'Выбор и распределение сигналов: мультиплексоры, дешифраторы, шифраторы, шины',
    progressKey: 'mux',
    exercises: MUX_EXERCISES,
  },
  {
    slug: 'latches',
    title: 'Защёлки',
    description: 'Первая память на вентилях: SR- и D-защёлки, регистр, ячейка памяти',
    progressKey: 'latches',
    exercises: LATCHES_EXERCISES,
  },
  {
    slug: 'adders',
    title: 'Сумматоры',
    description: 'Сложение битов: полусумматор и полный сумматор',
    progressKey: 'adders',
    exercises: ADDERS_EXERCISES,
  },
  {
    slug: 'registers',
    title: 'Регистры и такт',
    description:
      'Триггер по фронту, регистры, сдвиг, счётчики и аккумулятор — под управлением такта',
    progressKey: 'registers',
    exercises: REGISTERS_EXERCISES,
  },
  {
    slug: 'alu',
    title: 'АЛУ',
    description: 'Арифметика и логика по выбору операции: двухбитное АЛУ, флаги и условия перехода',
    progressKey: 'alu',
    exercises: ALU_EXERCISES,
  },
  {
    slug: 'memory',
    title: 'Память',
    description: 'ПЗУ, карта адресов, ячейки из защёлок, ОЗУ и синхронная память на триггерах',
    progressKey: 'memory',
    exercises: MEMORY_EXERCISES,
  },
  {
    slug: 'decoder',
    title: 'Декодер команд',
    description: 'Из кода команды — в сигналы управления: условия, следующий адрес и фазы такта',
    progressKey: 'decoder',
    exercises: DECODER_EXERCISES,
  },
  {
    slug: 'cpu',
    title: 'Процессор из блоков',
    description: 'Ваши схемы как блоки с интерфейсами: шины, заглянуть внутрь и собрать процессор',
    progressKey: 'cpu',
    exercises: CPU_EXERCISES,
  },
];

export function sectionBySlug(slug: string): Section {
  const section = SECTIONS.find((s) => s.slug === slug);
  if (!section) throw new Error(`Нет раздела «${slug}»`);
  return section;
}

/** Разделы в планах — видны в навигации, но пока недоступны */
export const ROADMAP: readonly { title: string; description: string }[] = [];

export interface ExtraPage {
  slug: string;
  title: string;
  /** Где страница хранит прогресс (localStorage) */
  storageKey: string;
  tasks: readonly { id: string; title: string }[];
}

/** Страницы вне схем: ассемблер Мини-8, RISC-V на учебной плате и реальная сборка */
export const EXTRA_PAGES: readonly ExtraPage[] = [
  { slug: 'asm', title: 'Ассемблер', storageKey: 'processor-asm-v1', tasks: ASM_TASKS },
  { slug: 'riscv', title: 'RISC-V', storageKey: 'processor-riscv-v1', tasks: RV_TASKS },
  {
    slug: 'real',
    title: 'Реальная сборка',
    storageKey: 'processor-riscv-real-v1',
    tasks: REAL_TASKS,
  },
];
