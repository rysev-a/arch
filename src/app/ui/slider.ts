import { Component, computed, input, model } from '@angular/core';

/** Ползунок в стиле shadcn Slider (на нативном input range — клавиатура и доступность бесплатно) */
@Component({
  selector: 'app-slider',
  template: `
    <input
      type="range"
      class="slider"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [style.--pct.%]="percent()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (input)="value.set(+$any($event.target).value)"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .slider {
      display: block;
      width: 100%;
      height: 1.25rem;
      margin: 0;
      background: transparent;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
    }
    .slider:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .slider:focus-visible {
      outline: none;
    }
    /* дорожка: слева от ползунка залита основным цветом */
    .slider::-webkit-slider-runnable-track {
      height: 0.5rem;
      border-radius: 9999px;
      background: linear-gradient(
        to right,
        hsl(var(--primary)) var(--pct, 0%),
        hsl(var(--secondary)) var(--pct, 0%)
      );
    }
    .slider::-moz-range-track {
      height: 0.5rem;
      border-radius: 9999px;
      background: hsl(var(--secondary));
    }
    .slider::-moz-range-progress {
      height: 0.5rem;
      border-radius: 9999px;
      background: hsl(var(--primary));
    }
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 1.25rem;
      height: 1.25rem;
      margin-top: -0.375rem;
      border: 2px solid hsl(var(--primary));
      border-radius: 9999px;
      background: hsl(var(--background));
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
      transition: box-shadow 0.15s ease;
    }
    .slider::-moz-range-thumb {
      width: 1rem;
      height: 1rem;
      border: 2px solid hsl(var(--primary));
      border-radius: 9999px;
      background: hsl(var(--background));
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    }
    .slider:focus-visible::-webkit-slider-thumb {
      box-shadow: 0 0 0 3px hsl(var(--ring) / 0.4);
    }
    .slider:focus-visible::-moz-range-thumb {
      box-shadow: 0 0 0 3px hsl(var(--ring) / 0.4);
    }
  `,
})
export class Slider {
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  /** Название для скринридеров */
  readonly label = input('');
  readonly disabled = input(false);

  protected readonly percent = computed(
    () => ((this.value() - this.min()) / (this.max() - this.min())) * 100,
  );
}
