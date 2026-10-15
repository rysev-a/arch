import { Component, ElementRef, HostListener, inject, input, model } from '@angular/core';

/** Кнопка «Подсказка» и всплывающее окно рядом с ней: закрывается крестиком, Esc или щелчком мимо */
@Component({
  selector: 'app-hint-popover',
  template: `
    <button
      type="button"
      class="btn btn-sm"
      [class.btn-default]="open()"
      [class.btn-outline]="!open()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      (click)="open.set(!open())"
    >
      Подсказка
    </button>
    @if (open()) {
      <div class="pop pop-in" role="dialog" aria-label="Подсказка">
        <div class="pop-head">
          <svg
            class="bulb"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z"
            />
          </svg>
          <span class="pop-title">Подсказка</span>
          <button
            type="button"
            class="pop-close"
            (click)="open.set(false)"
            aria-label="Закрыть подсказку"
            title="Закрыть (Esc)"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p class="pop-text">{{ text() }}</p>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }
    .pop {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      z-index: 40;
      width: min(22rem, calc(100vw - 2rem));
      padding: 0.75rem 0.875rem;
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      background: hsl(var(--popover));
      color: hsl(var(--popover-foreground));
      box-shadow: 0 10px 28px rgb(0 0 0 / 0.22);
      text-align: left;
    }
    :host-context(html.dark) .pop {
      border-color: hsl(0 0% 100% / 0.16);
      box-shadow:
        0 0 0 1px hsl(0 0% 100% / 0.05),
        inset 0 1px 0 hsl(0 0% 100% / 0.1),
        0 12px 32px rgb(0 0 0 / 0.45);
    }
    .pop-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }
    .bulb {
      flex: none;
      color: hsl(var(--warning));
    }
    .pop-title {
      flex: 1;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .pop-close {
      display: grid;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      padding: 0;
      border: none;
      border-radius: calc(var(--radius) - 4px);
      background: transparent;
      color: hsl(var(--muted-foreground));
      cursor: pointer;
    }
    .pop-close:hover {
      background: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    .pop-close:focus-visible {
      outline: 2px solid hsl(var(--ring));
    }
    .pop-text {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.5;
    }
  `,
})
export class HintPopover {
  readonly open = model(false);
  readonly text = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('document:pointerdown', ['$event'])
  protected onOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    if (this.open()) this.open.set(false);
  }
}
