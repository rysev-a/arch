import { Component, input, output } from '@angular/core';

/** Иконки на доске: «очистить доску» и «развернуть на весь экран» */
@Component({
  selector: 'app-board-tools',
  template: `
    <button
      type="button"
      class="tool-btn"
      (click)="clear.emit()"
      title="Очистить доску"
      aria-label="Очистить доску"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"
        />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </svg>
    </button>
    <button
      type="button"
      class="tool-btn fs-toggle"
      (click)="toggleFullscreen.emit()"
      [title]="fullscreen() ? 'Свернуть (Esc)' : 'Развернуть доску на весь экран'"
      [attr.aria-label]="fullscreen() ? 'Свернуть доску' : 'Развернуть доску на весь экран'"
      [attr.aria-pressed]="fullscreen()"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        @if (fullscreen()) {
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        } @else {
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        }
      </svg>
    </button>
  `,
  styles: `
    :host {
      display: flex;
      gap: 0.375rem;
    }
    .tool-btn {
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

    .board-tools {
      position: absolute;
      top: var(--bt);
      right: var(--br);
      z-index: 3;
      display: flex;
      gap: 0.375rem;
    }
    .tool-btn {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 1px solid hsl(var(--border));
      border-radius: calc(var(--radius) - 2px);
      background: hsl(var(--card) / 0.96);
      color: hsl(var(--foreground));
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.14);
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .tool-btn:hover {
      background: hsl(var(--accent));
    }
    .tool-btn:focus-visible {
      outline: 2px solid hsl(var(--ring));
      outline-offset: 2px;
    }
    .tool-btn svg {
      width: 1rem;
      height: 1rem;
    }

    :host-context(html.dark) .tool-btn {
      border-color: hsl(0 0% 100% / 0.16);
      box-shadow:
        0 0 0 1px hsl(0 0% 100% / 0.04),
        inset 0 1px 0 hsl(0 0% 100% / 0.08),
        0 8px 20px rgb(0 0 0 / 0.4);
    }
  `,
})
export class BoardTools {
  readonly fullscreen = input(false);
  readonly clear = output<void>();
  readonly toggleFullscreen = output<void>();
}
