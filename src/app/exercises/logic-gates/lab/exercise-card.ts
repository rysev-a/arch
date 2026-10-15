import { Component, input, model, output } from '@angular/core';
import { DashItem, DashProgress } from '../../../ui/dash-progress';
import { TableLayout } from '../../../settings/settings.service';

/** Карточка упражнения: название, условие, переключатель раскладки, стрелки и полоса прогресса */
@Component({
  selector: 'app-exercise-card',
  imports: [DashProgress],
  template: `
    <div class="card">
      <div class="card-header exercise-head">
        <div class="exercise-head-text">
          <h3 class="card-title">
            Упражнение {{ index() + 1 }} из {{ total() }} ·
            {{ title() }}
          </h3>
          <p class="card-description">{{ task() }}</p>
        </div>
        <div class="exercise-nav">
          <div class="layout-switch" role="group" aria-label="Где показывать таблицу истинности">
            <button
              type="button"
              class="lay-btn"
              [class.on]="tableLayout() === 'bottom'"
              [attr.aria-pressed]="tableLayout() === 'bottom'"
              (click)="tableLayout.set('bottom')"
              title="Таблица истинности под доской"
              aria-label="Таблица истинности под доской"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 15h18" />
                <rect x="4" y="16" width="16" height="4" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <button
              type="button"
              class="lay-btn"
              [class.on]="tableLayout() === 'right'"
              [attr.aria-pressed]="tableLayout() === 'right'"
              (click)="tableLayout.set('right')"
              title="Таблица истинности справа от доски"
              aria-label="Таблица истинности справа от доски"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
                <rect x="16" y="4" width="4" height="16" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            class="btn btn-outline btn-icon"
            (click)="prev.emit()"
            [disabled]="index() === 0"
            title="Предыдущее упражнение"
            aria-label="Предыдущее упражнение"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-outline btn-icon"
            [class.nudge]="nudge()"
            (click)="next.emit()"
            [disabled]="index() === total() - 1 && !nudge()"
            [title]="nextTitle()"
            [attr.aria-label]="nextTitle()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div class="card-content">
        <app-dash-progress [items]="items()" [current]="index()" (pick)="pick.emit($event)" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    /* ===================== Упражнение и степпер ===================== */
    .exercise-head {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    .exercise-head-text {
      min-width: 0;
    }
    .exercise-nav {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    /* переключатель положения таблицы — как кнопки раскладки в VS Code */
    .layout-switch {
      display: flex;
      padding: 2px;
      border: 1px solid hsl(var(--border));
      border-radius: calc(var(--radius) - 2px);
      background: hsl(var(--muted) / 0.4);
    }
    .lay-btn {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: none;
      border-radius: calc(var(--radius) - 4px);
      background: transparent;
      color: hsl(var(--muted-foreground));
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
    .lay-btn svg {
      width: 1.125rem;
      height: 1.125rem;
    }
    .lay-btn:hover {
      color: hsl(var(--foreground));
    }
    .lay-btn.on {
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
    }
    .lay-btn:focus-visible {
      outline: 2px solid hsl(var(--ring));
      outline-offset: 1px;
    }

    /* раздел пройден: стрелка «вправо» мигает и приглашает в следующий раздел */
    .nudge {
      border-color: hsl(var(--success));
      color: hsl(var(--success));
      animation: nudge-pulse 1.4s ease-in-out infinite;
    }
    .nudge svg {
      animation: nudge-arrow 1.4s ease-in-out infinite;
    }
    @keyframes nudge-pulse {
      0%,
      100% {
        box-shadow: 0 0 0 0 hsl(var(--success) / 0.5);
        background: hsl(var(--success) / 0.1);
      }
      50% {
        box-shadow: 0 0 0 6px hsl(var(--success) / 0);
        background: hsl(var(--success) / 0.22);
      }
    }
    @keyframes nudge-arrow {
      0%,
      100% {
        opacity: 1;
        transform: translateX(0);
      }
      50% {
        opacity: 0.25;
        transform: translateX(2px);
      }
    }
    /* при «уменьшить анимацию» остаётся только плавное мигание прозрачности — без сдвига и расходящегося кольца */
    @media (prefers-reduced-motion: reduce) {
      .nudge {
        animation: none;
        background: hsl(var(--success) / 0.18);
      }
      .nudge svg {
        animation: nudge-fade 1.8s ease-in-out infinite;
      }
    }
    @keyframes nudge-fade {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.25;
      }
    }
  `,
})
export class ExerciseCard {
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  readonly title = input.required<string>();
  readonly task = input.required<string>();
  readonly items = input.required<readonly DashItem[]>();
  /** раздел пройден и мы на его последнем упражнении: стрелка «вправо» мигает */
  readonly nudge = input(false);
  readonly nextTitle = input('Следующее упражнение');
  readonly tableLayout = model<TableLayout>('right');
  readonly prev = output<void>();
  readonly next = output<void>();
  readonly pick = output<number>();
}
