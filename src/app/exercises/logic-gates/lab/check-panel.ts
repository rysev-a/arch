import { Component, computed, input } from '@angular/core';
import { TruthTable } from '../truth-table';
import { InputId, InputState, NodeValue, TableRow } from '../circuit.model';
import { Exercise, ExerciseStep } from '../exercises';

/** Проверка решения: таблица истинности или сценарий по шагам (для защёлок и регистров) */
@Component({
  selector: 'app-check-panel',
  imports: [TruthTable],
  template: `
    <div class="card">
      @if (isSteps()) {
        <div class="card-header board-header">
          <div>
            <h3 class="card-title">Сценарий проверки</h3>
            <p class="card-description">
              Выполняйте шаги по порядку: устанавливайте тумблеры и добивайтесь нужных значений на
              выходах
            </p>
          </div>
          <span class="badge" [class.badge-success]="solved()" [class.badge-secondary]="!solved()">
            Шаг {{ currentStepNo() }} / {{ totalSteps() }}
          </span>
        </div>
        <div class="card-content steps-panel" [class.capped]="capHeight()">
          @for (st of exercise().steps; track $index; let i = $index) {
            <div
              class="step-item"
              [class.done]="i < passedSteps()"
              [class.active]="i === passedSteps()"
            >
              <span class="step-no">
                @if (i < passedSteps()) {
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <div class="step-body">
                <p class="step-text">{{ st.text }}</p>
                <div class="step-req">
                  @if (st.pulses && st.pulses > 1) {
                    <span class="req-chip pulses">тактов: {{ st.pulses }}</span>
                  }
                  @for (id of activeInputs(); track id) {
                    <span class="req-chip" [class.hit]="inputState()[id] === st.inputs[id]">
                      {{ inputLabel(id) }} = {{ st.inputs[id] }}
                    </span>
                  }
                  <span class="req-sep">→</span>
                  @for (o of activeOutputs(); track o) {
                    @if (st.expect[o] !== undefined) {
                      <span class="req-chip req-out" [class.hit]="valueAt()(o) === st.expect[o]">
                        {{ o }} = {{ st.expect[o] }}
                      </span>
                    }
                  }
                  @if (noExpectation(st)) {
                    <span class="req-chip req-out hit">выход пока не проверяется</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card-header board-header">
          <div>
            <h3
              class="card-title"
              title="Строка с подсветкой — текущее положение тумблеров на доске"
            >
              Таблица истинности
            </h3>
          </div>
          <span class="badge" [class.badge-success]="solved()" [class.badge-secondary]="!solved()">
            {{ matched() }} / {{ exercise().target.length }}
          </span>
        </div>
        <div class="card-content">
          <app-truth-table
            [rows]="tableRows()"
            [currentRow]="currentRow()"
            [inputIds]="activeInputs()"
            [labels]="labels()"
            [outputs]="activeOutputs()"
          />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .board-header {
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
    }
    .board-header > div:first-child {
      flex: 1 1 auto;
      min-width: 0;
    }
    /* справа от доски длинный сценарий прокручивается внутри карточки */
    .steps-panel.capped {
      max-height: 34rem;
      overflow-y: auto;
    }

    .steps-panel {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .step-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      border: 1px solid hsl(var(--border));
      border-radius: calc(var(--radius) - 2px);
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease,
        opacity 0.15s ease;
    }
    .step-item.done {
      opacity: 0.65;
      background: hsl(var(--success) / 0.06);
      border-color: hsl(var(--success) / 0.35);
    }
    .step-item.active {
      border-color: hsl(var(--primary) / 0.6);
      box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
    }

    .step-no {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 9999px;
      border: 1px solid hsl(var(--border));
      background: hsl(var(--secondary));
      color: hsl(var(--secondary-foreground));
      font-size: 0.8125rem;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 0.125rem;
    }
    .step-item.done .step-no {
      background: hsl(var(--success));
      border-color: hsl(var(--success));
      color: hsl(var(--success-foreground));
    }
    .step-no svg {
      width: 0.85rem;
      height: 0.85rem;
    }

    .step-body {
      min-width: 0;
    }
    .step-text {
      margin: 0 0 0.4rem;
      font-size: 0.875rem;
      line-height: 1.45;
    }
    .step-item.done .step-text {
      text-decoration: line-through;
      text-decoration-color: hsl(var(--muted-foreground) / 0.6);
    }

    .step-req {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
    }
    .req-chip {
      display: inline-flex;
      align-items: center;
      padding: 0.1rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid hsl(var(--border));
      background: hsl(var(--muted) / 0.5);
      color: hsl(var(--muted-foreground));
      font-size: 0.75rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background-color 0.15s ease;
    }
    .req-chip.hit {
      border-color: hsl(var(--success) / 0.6);
      background: hsl(var(--success) / 0.12);
      color: hsl(var(--success));
    }
    .req-chip.req-out {
      border-style: dashed;
    }
    .req-sep {
      color: hsl(var(--muted-foreground) / 0.6);
      font-size: 0.8125rem;
      padding: 0 0.15rem;
    }

    .req-chip.pulses {
      border-style: solid;
      color: hsl(var(--foreground));
    }
  `,
})
export class CheckPanel {
  readonly exercise = input.required<Exercise>();
  readonly inputState = input.required<InputState>();
  /** значение узла схемы (для проверки выходов в шагах) */
  readonly valueAt = input.required<(node: string) => NodeValue>();
  readonly passedSteps = input(0);
  readonly solved = input(false);
  readonly matched = input(0);
  readonly tableRows = input<TableRow[]>([]);
  readonly currentRow = input(0);
  /** карточка стоит справа от доски — длинный сценарий не растягивает её без конца */
  readonly capHeight = input(false);

  protected readonly isSteps = computed(() => this.exercise().mode === 'steps');
  protected readonly totalSteps = computed(() => this.exercise().steps?.length ?? 0);
  protected readonly currentStepNo = computed(() =>
    Math.min(this.passedSteps() + 1, this.totalSteps()),
  );
  protected readonly activeInputs = computed<readonly InputId[]>(() => this.exercise().inputs);
  protected readonly activeOutputs = computed<readonly string[]>(() => this.exercise().outputs);
  protected readonly labels = computed<readonly string[]>(
    () => this.exercise().labels ?? this.exercise().inputs,
  );

  /** подпись входа на доске (может отличаться от id: R, S, D, E…) */
  protected inputLabel(id: InputId): string {
    const ex = this.exercise();
    return ex.labels?.[ex.inputs.indexOf(id)] ?? id;
  }

  /** шаг без проверяемых выходов — только подготовка входов */
  protected noExpectation(step: ExerciseStep): boolean {
    return this.activeOutputs().every((o) => step.expect[o] === undefined);
  }
}
