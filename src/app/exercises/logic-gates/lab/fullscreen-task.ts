import { Component, computed, input, model } from '@angular/core';
import { TruthTable } from '../truth-table';
import { TableRow } from '../circuit.model';
import { Exercise } from '../exercises';

/** Окошко справа внизу на доске во весь экран: условие и таблица истинности всегда перед глазами */
@Component({
  selector: 'app-fullscreen-task',
  imports: [TruthTable],
  template: `
    <aside class="fs-task pop-in" [class.collapsed]="!open()" aria-label="Задание">
      <div class="fs-task-head">
        <span class="fs-task-title">Задание</span>
        <span class="badge" [class.badge-success]="solved()" [class.badge-secondary]="!solved()">
          @if (isSteps()) {
            Шаг {{ currentStepNo() }} / {{ totalSteps() }}
          } @else {
            {{ matched() }} / {{ exercise().target.length }}
          }
        </span>
        <button
          type="button"
          class="fs-task-toggle"
          (click)="open.set(!open())"
          [attr.aria-expanded]="open()"
          [title]="open() ? 'Свернуть' : 'Развернуть'"
        >
          {{ open() ? '—' : '＋' }}
        </button>
      </div>
      @if (open()) {
        <p class="fs-task-text">{{ exercise().task }}</p>
        @if (tableRows().length > 0) {
          <div class="fs-task-table">
            <app-truth-table
              [rows]="tableRows()"
              [currentRow]="currentRow()"
              [inputIds]="exercise().inputs"
              [labels]="exercise().labels ?? exercise().inputs"
              [outputs]="exercise().outputs"
            />
          </div>
        }
      }
    </aside>
  `,
  styles: `
    /* окно позиционируется относительно доски (она fixed), сам компонент в вёрстке места не занимает */
    :host {
      display: contents;
    }

    .fs-task {
      position: absolute;
      right: 1rem;
      bottom: 1rem;
      z-index: 20;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(22rem, calc(100vw - 2rem));
      max-height: min(60vh, 28rem);
      padding: 0.75rem 0.875rem;
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      background: hsl(var(--popover));
      color: hsl(var(--popover-foreground));
      box-shadow: 0 10px 32px rgb(0 0 0 / 0.2);
    }
    :host-context(html.dark) .fs-task {
      border-color: hsl(0 0% 100% / 0.16);
      box-shadow:
        0 0 0 1px hsl(0 0% 100% / 0.05),
        inset 0 1px 0 hsl(0 0% 100% / 0.1),
        0 12px 32px rgb(0 0 0 / 0.45);
    }
    .fs-task.collapsed {
      width: auto;
    }
    .fs-task-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .fs-task-title {
      flex: 1;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .fs-task-toggle {
      width: 1.5rem;
      height: 1.5rem;
      padding: 0;
      border: none;
      border-radius: calc(var(--radius) - 4px);
      background: transparent;
      color: hsl(var(--muted-foreground));
      cursor: pointer;
    }
    .fs-task-toggle:hover {
      background: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    .fs-task-text {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.45;
    }
    .fs-task-table {
      min-height: 0;
      overflow: auto;
    }
  `,
})
export class FullscreenTask {
  readonly exercise = input.required<Exercise>();
  readonly solved = input(false);
  readonly matched = input(0);
  readonly passedSteps = input(0);
  readonly tableRows = input<TableRow[]>([]);
  readonly currentRow = input(0);
  /** окошко развёрнуто (иначе свёрнуто в плашку) */
  readonly open = model(true);

  protected readonly isSteps = computed(() => this.exercise().mode === 'steps');
  protected readonly totalSteps = computed(() => this.exercise().steps?.length ?? 0);
  protected readonly currentStepNo = computed(() =>
    Math.min(this.passedSteps() + 1, this.totalSteps()),
  );
}
