import { Component, input, model } from '@angular/core';

/** Переключатель в стиле shadcn Switch */
@Component({
  selector: 'app-switch',
  template: `
    <button
      type="button"
      role="switch"
      class="switch"
      [class.on]="checked()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
    >
      <span class="thumb"></span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .switch {
      position: relative;
      display: inline-flex;
      flex: none;
      align-items: center;
      width: 2.25rem;
      height: 1.25rem;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 9999px;
      background: hsl(var(--input));
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .switch.on {
      background: hsl(var(--primary));
    }
    .switch:focus-visible {
      outline: 2px solid hsl(var(--ring));
      outline-offset: 2px;
    }
    .switch:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .thumb {
      display: block;
      width: 1rem;
      height: 1rem;
      border-radius: 9999px;
      background: hsl(var(--background));
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
      transform: translateX(0);
      transition: transform 0.15s ease;
      pointer-events: none;
    }
    .switch.on .thumb {
      transform: translateX(1rem);
    }
    :host-context(html.dark) .switch:not(.on) {
      background: hsl(var(--muted-foreground) / 0.35);
    }
  `,
})
export class Switch {
  readonly checked = model(false);
  /** Название для скринридеров */
  readonly label = input('');
  readonly disabled = input(false);
}
