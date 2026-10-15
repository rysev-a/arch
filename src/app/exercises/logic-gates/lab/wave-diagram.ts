import { Component, input, output } from '@angular/core';
import { WAVE, Wave } from './wave';

/** Временная диаграмма: история сигналов в упражнениях с защёлками и регистрами */
@Component({
  selector: 'app-wave-diagram',
  template: `
    <div class="card">
      <div class="card-header board-header">
        <div>
          <h3 class="card-title">Временная диаграмма</h3>
          <p class="card-description">
            История сигналов: каждый столбец — одно изменение. Пунктир — значение пока не определено
          </p>
        </div>
        <button type="button" class="btn btn-outline btn-sm" (click)="clear.emit()">
          Очистить
        </button>
      </div>
      <div class="card-content">
        <svg
          class="wave"
          [attr.viewBox]="'0 0 ' + WAVE.width + ' ' + wave().height"
          role="img"
          aria-label="Временная диаграмма сигналов"
        >
          @for (x of wave().cols; track $index) {
            <line class="wave-grid" [attr.x1]="x" [attr.x2]="x" y1="0" [attr.y2]="wave().height" />
          }
          @if (wave().cols.length > 0) {
            <rect
              class="wave-now"
              [attr.x]="wave().lastX"
              y="0"
              [attr.width]="WAVE.step"
              [attr.height]="wave().height"
            />
          }
          @for (r of wave().rows; track r.label) {
            <g [class]="'wave-row ' + r.kind">
              <text class="wave-label" x="0" [attr.y]="r.top + 18">{{ r.label }}</text>
              <path class="wave-x" [attr.d]="r.dx" />
              <path class="wave-line" [attr.d]="r.d" />
            </g>
          }
        </svg>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .board-header {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
    }
    .board-header > div:first-child {
      flex: 1 1 16rem;
      min-width: 0;
    }

    .wave {
      display: block;
      width: 100%;
      height: auto;
      max-height: 22rem;
    }
    .wave-grid {
      stroke: hsl(var(--border));
      stroke-width: 1;
      stroke-dasharray: 2 4;
    }
    .wave-now {
      fill: hsl(var(--primary) / 0.07);
    }
    .wave-label {
      fill: hsl(var(--muted-foreground));
      font-size: 12px;
      font-weight: 700;
    }
    .wave-line {
      fill: none;
      stroke: hsl(var(--muted-foreground));
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .wave-x {
      fill: none;
      stroke: hsl(var(--warning));
      stroke-width: 2;
      stroke-dasharray: 3 3;
    }
    .wave-row.clk .wave-line {
      stroke: hsl(var(--primary));
    }
    .wave-row.out .wave-line {
      stroke: hsl(var(--success));
    }
  `,
})
export class WaveDiagram {
  readonly wave = input.required<Wave>();
  readonly clear = output<void>();

  protected readonly WAVE = WAVE;
}
