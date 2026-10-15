import { Component, input, output } from '@angular/core';

/** Кнопки масштаба и «Вернуть вид» в углу доски */
@Component({
  selector: 'app-view-controls',
  template: `
    <div class="vc" role="group" aria-label="Масштаб доски">
      <button
        type="button"
        class="vc-btn"
        (click)="zoomOut.emit()"
        title="Уменьшить (Ctrl + колесо)"
        aria-label="Уменьшить масштаб"
      >
        −
      </button>
      <button
        type="button"
        class="vc-pct"
        (click)="resetZoom.emit()"
        title="Масштаб 100 %"
        aria-label="Сбросить масштаб"
      >
        {{ percent() }}%
      </button>
      <button
        type="button"
        class="vc-btn"
        (click)="zoomIn.emit()"
        title="Увеличить (Ctrl + колесо)"
        aria-label="Увеличить масштаб"
      >
        +
      </button>
      @if (changed()) {
        <button
          type="button"
          class="vc-btn vc-reset"
          (click)="reset.emit()"
          title="Вернуть доску на место и масштаб 100 %"
          aria-label="Вернуть вид"
        >
          ⌖
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      z-index: 2;
    }
    .vc {
      display: flex;
      align-items: stretch;
      overflow: hidden;
      border: 1px solid hsl(var(--border));
      border-radius: calc(var(--radius) - 2px);
      background: hsl(var(--card) / 0.92);
      backdrop-filter: blur(4px);
    }
    button {
      border: none;
      background: transparent;
      color: hsl(var(--foreground));
      font: inherit;
      font-size: 0.8125rem;
      cursor: pointer;
    }
    button:hover {
      background: hsl(var(--accent));
    }
    button:focus-visible {
      outline: 2px solid hsl(var(--ring));
      outline-offset: -2px;
    }
    .vc-btn {
      width: 1.75rem;
      font-size: 1rem;
      line-height: 1;
    }
    .vc-pct {
      min-width: 3.25rem;
      padding: 0.25rem 0.375rem;
      font-variant-numeric: tabular-nums;
      color: hsl(var(--muted-foreground));
      border-inline: 1px solid hsl(var(--border));
    }
    .vc-reset {
      border-left: 1px solid hsl(var(--border));
    }
  `,
})
export class ViewControls {
  /** текущий масштаб (1 = 100 %) */
  readonly zoom = input(1);
  /** вид отличается от исходного — показать «вернуть» */
  readonly changed = input(false);

  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly resetZoom = output<void>();
  readonly reset = output<void>();

  protected percent(): number {
    return Math.round(this.zoom() * 100);
  }
}
