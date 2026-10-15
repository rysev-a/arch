import { signal } from '@angular/core';
import { Bit, InputId } from '../circuit.model';

/** Сколько держится высокий уровень такта по кнопке «Такт» */
const TICK_MS = 600;
/** Допустимые частоты автогенератора, Гц (полный период = высокий + низкий уровень) */
export const CLOCK_RATES = [0.5, 1, 2, 4] as const;

/** Что тактовому генератору нужно от упражнения */
export interface ClockHost {
  /** какой вход — тактовый (null — в упражнении такта нет) */
  clockId(): InputId | null;
  /** текущий уровень входа */
  level(id: InputId): Bit;
  /** выставить уровень входа (с пересчётом схемы) */
  setLevel(id: InputId, level: Bit): void;
}

/**
 * Такт для упражнений с защёлками и регистрами: один импульс по кнопке «Такт» и автогенератор
 * с выбором частоты. Считает фронты (0 → 1) с начала упражнения.
 */
export class ClockController {
  /** идёт импульс по кнопке «Такт» */
  readonly ticking = signal(false);
  /** работает автогенератор */
  readonly auto = signal(false);
  readonly rate = signal<number>(1);
  readonly rates = CLOCK_RATES;
  /** сколько раз «щёлкнул» такт (фронтов 0 → 1) с начала упражнения */
  readonly edges = signal(0);

  private pulseTimer: ReturnType<typeof setTimeout> | undefined;
  private autoTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly host: ClockHost) {}

  /** один полный период: CLK = 1 на время TICK_MS, затем снова 0; false — сейчас нельзя */
  tick(done?: () => void): boolean {
    const id = this.host.clockId();
    if (!id || this.ticking() || this.auto() || this.host.level(id) === 1) return false;
    this.ticking.set(true);
    this.host.setLevel(id, 1);
    this.pulseTimer = setTimeout(() => {
      this.host.setLevel(id, 0);
      this.ticking.set(false);
      done?.();
    }, TICK_MS);
    return true;
  }

  toggleAuto(): void {
    if (this.auto()) {
      this.stop();
      return;
    }
    const id = this.host.clockId();
    if (!id || this.ticking()) return;
    this.auto.set(true);
    this.startAutoTimer();
  }

  setRate(hz: number): void {
    this.rate.set(hz);
    if (this.auto()) this.startAutoTimer();
  }

  /** остановить автогенератор и импульс; такт возвращается в 0 */
  stop(): void {
    clearTimeout(this.pulseTimer);
    clearInterval(this.autoTimer);
    const wasRunning = this.auto() || this.ticking();
    this.auto.set(false);
    this.ticking.set(false);
    const id = this.host.clockId();
    if (wasRunning && id && this.host.level(id) === 1) this.host.setLevel(id, 0);
  }

  /** тактовый вход перешёл в 1 — ещё один фронт */
  countEdge(): void {
    this.edges.update((n) => n + 1);
  }

  resetEdges(): void {
    this.edges.set(0);
  }

  /** при уничтожении упражнения таймеры не должны остаться */
  dispose(): void {
    clearTimeout(this.pulseTimer);
    clearInterval(this.autoTimer);
  }

  private startAutoTimer(): void {
    clearInterval(this.autoTimer);
    const id = this.host.clockId();
    if (!id) return;
    // половина периода — высокий уровень, половина — низкий
    this.autoTimer = setInterval(
      () => this.host.setLevel(id, (this.host.level(id) ^ 1) as Bit),
      500 / this.rate(),
    );
  }
}
