import { Component, input, output } from '@angular/core';

/** «Схема работает!»: формула, объяснение и переход дальше (в том числе в следующий раздел) */
@Component({
  selector: 'app-success-alert',
  template: `
    <div class="alert alert-success pop-in" role="status">
      <span class="alert-icon">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="hsl(var(--success))"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <div class="alert-body">
        <p class="alert-title">
          @if (stepsMode()) {
            Схема работает как надо! Формула:
            <strong class="mono">{{ formula() }}</strong>
          } @else {
            Схема работает — {{ matched() }} из {{ total() }}! Формула:
            <strong class="mono">{{ formula() }}</strong>
          }
        </p>
        <p class="alert-description">{{ success() }}</p>
      </div>
      @if (hasNext()) {
        <button type="button" class="btn btn-default btn-sm alert-action" (click)="next.emit()">
          {{ nextIsChapter() ? 'Следующий раздел' : 'Следующее' }}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class SuccessAlert {
  readonly formula = input.required<string>();
  readonly success = input.required<string>();
  readonly stepsMode = input(false);
  readonly matched = input(0);
  readonly total = input(0);
  /** есть куда идти дальше: следующее упражнение или следующий раздел */
  readonly hasNext = input(false);
  readonly nextIsChapter = input(false);
  readonly next = output<void>();
}
