import { Component, input, output } from '@angular/core';

export interface DashItem {
  title: string;
  solved: boolean;
}

/**
 * Тонкая полоса прогресса из длинных чёрточек: одно упражнение — одна чёрточка.
 * Без цифр и галочек: решённые залиты зелёным, текущая обведена. Чёрточки кликабельны.
 */
@Component({
  selector: 'app-dash-progress',
  template: `
    <div class="dashes" role="group" aria-label="Упражнения главы">
      @for (it of items(); track $index; let i = $index) {
        <button
          type="button"
          class="dash"
          [class.current]="i === current()"
          [class.solved]="it.solved"
          [title]="i + 1 + '. ' + it.title + (it.solved ? ' — решено' : '')"
          [attr.aria-label]="i + 1 + '. ' + it.title + (it.solved ? ' — решено' : '')"
          [attr.aria-current]="i === current() ? 'step' : null"
          (click)="pick.emit(i)"
        ></button>
      }
    </div>
  `,
  styles: `
    .dashes {
      display: flex;
      gap: 0.3125rem;
    }
    .dash {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      height: 1.125rem;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
    }
    /* сама чёрточка тонкая, а нажимать можно по всей высоте кнопки */
    .dash::before {
      content: '';
      position: absolute;
      inset: 50% 0 auto 0;
      height: 3px;
      margin-top: -1.5px;
      border-radius: 9999px;
      background: hsl(var(--muted-foreground) / 0.3);
      transition:
        background-color 0.2s ease,
        height 0.15s ease,
        margin-top 0.15s ease,
        box-shadow 0.15s ease;
    }
    .dash:hover::before {
      background: hsl(var(--muted-foreground) / 0.6);
    }
    .dash.solved::before {
      background: hsl(var(--success));
    }
    .dash.current::before {
      height: 5px;
      margin-top: -2.5px;
      background: hsl(var(--primary));
      box-shadow: 0 0 0 2px hsl(var(--primary) / 0.18);
    }
    .dash.current.solved::before {
      background: hsl(var(--success));
      box-shadow: 0 0 0 2px hsl(var(--success) / 0.25);
    }
    .dash:focus-visible {
      outline: none;
    }
    .dash:focus-visible::before {
      box-shadow: 0 0 0 2px hsl(var(--ring));
    }
  `,
})
export class DashProgress {
  readonly items = input.required<readonly DashItem[]>();
  readonly current = input.required<number>();
  readonly pick = output<number>();
}
