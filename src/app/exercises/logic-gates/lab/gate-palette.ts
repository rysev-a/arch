import { Component, input, output } from '@angular/core';
import { PixelLock } from '../../../ui/pixel-lock';
import { GateType } from '../circuit.model';
import { gateBodyPath, gateBubbleCx, gateExtraArc } from '../gate-shapes';

/** Один квадратик панели: элемент, доступный в упражнении */
export interface PaletteGate {
  type: GateType;
  /** закрыт, пока не собран вручную в другом упражнении */
  locked: boolean;
  /** всплывающая подсказка: название или что нужно сделать, чтобы открыть */
  title: string;
  /** подпись для скринридеров */
  label: string;
}

/** Панель элементов на доске: небольшие квадратики с иконками; элемент берут и переносят на доску */
@Component({
  selector: 'app-gate-palette',
  imports: [PixelLock],
  host: {
    class: 'board-palette',
    role: 'toolbar',
    'aria-label': 'Элементы: перетащите на доску или кликните',
  },
  template: `
    @for (g of gates(); track g.type) {
      <button
        type="button"
        class="pal-sq"
        [class.locked]="g.locked"
        [title]="g.title"
        [attr.aria-label]="g.label"
        (pointerdown)="pick.emit({ event: $event, type: g.type })"
      >
        <svg viewBox="-12 0 96 48" class="pal-svg" aria-hidden="true" overflow="visible">
          @if (extraArc(g.type); as arc) {
            <path class="gate-extra" [attr.d]="arc" />
          }
          <path class="gate-body" [attr.d]="bodyPath(g.type)" />
          @if (bubbleCx(g.type); as cx) {
            <circle class="gate-bubble" [attr.cx]="cx" cy="24" r="5" />
          }
        </svg>
        @if (g.locked) {
          <app-pixel-lock class="pal-lock" />
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.375rem;
      padding: 0.375rem;
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      background: hsl(var(--card) / 0.96);
      box-shadow: 0 6px 18px rgb(0 0 0 / 0.16);
    }
    :host-context(html.dark) {
      border-color: hsl(0 0% 100% / 0.16);
      box-shadow:
        0 0 0 1px hsl(0 0% 100% / 0.04),
        inset 0 1px 0 hsl(0 0% 100% / 0.08),
        0 8px 20px rgb(0 0 0 / 0.4);
    }
    .pal-sq {
      position: relative;
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: 1px solid hsl(var(--border));
      border-radius: calc(var(--radius) - 3px);
      background: hsl(var(--background));
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease,
        transform 0.15s ease;
    }
    .pal-sq:hover {
      border-color: hsl(var(--primary) / 0.5);
      background: hsl(var(--accent));
      transform: translateY(-1px);
    }
    .pal-sq:active {
      cursor: grabbing;
      transform: none;
    }
    .pal-sq:focus-visible {
      outline: 2px solid hsl(var(--ring));
      outline-offset: 2px;
    }
    .pal-sq.locked {
      border-style: dashed;
      background: hsl(var(--muted) / 0.5);
      cursor: not-allowed;
    }
    .pal-sq.locked .pal-svg {
      opacity: 0.45;
    }
    .pal-sq.locked:hover {
      border-color: hsl(var(--border));
      background: hsl(var(--muted) / 0.5);
      transform: none;
    }
    .pal-svg {
      width: 1.875rem;
      height: 1.125rem;
    }
    .pal-lock {
      position: absolute;
      right: 0.125rem;
      bottom: 0.125rem;
      margin: 0;
      font-size: 0.6875rem;
    }
    .gate-extra {
      fill: none;
      stroke: hsl(var(--foreground) / 0.75);
      stroke-width: 1.8;
    }
    .gate-body {
      fill: hsl(var(--card));
      stroke: hsl(var(--foreground) / 0.75);
      stroke-width: 1.8;
    }
    .gate-bubble {
      fill: none;
      stroke: hsl(var(--foreground) / 0.75);
      stroke-width: 1.8;
    }
  `,
})
export class GatePalette {
  readonly gates = input.required<readonly PaletteGate[]>();
  /** взяли элемент: событие нужно доске, чтобы начать перенос */
  readonly pick = output<{ event: PointerEvent; type: GateType }>();

  protected bodyPath = gateBodyPath;
  protected bubbleCx = gateBubbleCx;
  protected extraArc = gateExtraArc;
}
