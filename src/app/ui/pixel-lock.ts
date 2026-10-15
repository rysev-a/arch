import { Component, computed, input } from '@angular/core';

/** Пиксельный замочек: закрытый красный, открытый — зелёный */
const CLOSED = [
  '..XXXXX..',
  '.XX...XX.',
  '.XX...XX.',
  '.XX...XX.',
  'XXXXXXXXX',
  'XXXXXXXXX',
  'XXXX.XXXX',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
];
const OPEN = [
  '..XXXXX..',
  '.XX...XX.',
  '.XX......',
  '.XX......',
  'XXXXXXXXX',
  'XXXXXXXXX',
  'XXXX.XXXX',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
];

@Component({
  selector: 'app-pixel-lock',
  template: `
    <svg
      viewBox="0 0 9 10"
      shape-rendering="crispEdges"
      [class.open]="open()"
      role="img"
      [attr.aria-label]="open() ? 'Открыто' : 'Закрыто'"
    >
      @for (p of pixels(); track p.key) {
        <rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: -0.12em;
      margin-right: 0.3em;
    }
    svg {
      width: 1.05em;
      height: 1.17em;
      fill: hsl(var(--destructive));
    }
    svg.open {
      fill: hsl(var(--success));
    }
  `,
})
export class PixelLock {
  readonly open = input(false);

  protected readonly pixels = computed(() => {
    const out: { key: string; x: number; y: number }[] = [];
    (this.open() ? OPEN : CLOSED).forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === 'X') out.push({ key: `${x}:${y}`, x, y });
      }),
    );
    return out;
  });
}
