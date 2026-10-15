import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { assemble } from '../../asm/assembler';
import { ASM_SLIDES, HELP_TRACKS, HelpSlide, HelpTrack, SCHEME_SLIDES } from './help-slides';

/** Страница «Как работать с проектом»: анимированные слайды для схем и для ассемблера */
@Component({
  selector: 'app-help-page',
  templateUrl: './help.page.html',
  styleUrl: './help.page.css',
})
export class HelpPage {
  protected readonly tracks = HELP_TRACKS;
  protected readonly track = signal<HelpTrack>('scheme');
  protected readonly index = signal(0);

  /** слайды листаются сами, пока мышь или фокус не на сцене; у кого отключены анимации — не листаются */
  protected readonly playing = signal(!this.reducedMotion());
  protected readonly hovering = signal(false);

  protected readonly slides = computed<readonly HelpSlide[]>(() =>
    this.track() === 'scheme' ? SCHEME_SLIDES : ASM_SLIDES,
  );
  protected readonly slide = computed(() => this.slides()[this.index()]);

  /* ---------- данные для картинок ---------- */
  protected readonly tableRows = [
    [0, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 1],
  ];
  protected readonly sample = [
    '; Замените «H» на «J»',
    "li   r1, 'J'",
    'li   r2, 0x10',
    'sb   r1, 0(r2)',
    'hlt',
  ];
  /** машинный код настоящим ассемблером проекта, а не нарисованный на глаз */
  protected readonly sampleBytes = assemble(this.sample.join('\n')).lines.map((l) => ({
    text: l.text,
    hex: l.word.toString(16).toUpperCase().padStart(4, '0'),
  }));
  protected readonly disk = ['H', 'e', 'l', 'l', 'o'];
  protected readonly chips = [1, 2, 3, 4, 5, 6, 7, 8];

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      // таймер пересоздаётся при любом переходе, поэтому после ручного листания отсчёт идёт заново
      this.index();
      this.track();
      if (!this.playing() || this.hovering()) return;
      const id = setInterval(() => this.advance(), 9000);
      onCleanup(() => clearInterval(id));
    });
    this.destroyRef.onDestroy(() => this.hovering.set(true));
  }

  protected selectTrack(id: HelpTrack): void {
    if (this.track() === id) return;
    this.track.set(id);
    this.index.set(0);
  }

  protected go(i: number): void {
    this.index.set(Math.max(0, Math.min(this.slides().length - 1, i)));
  }

  protected prev(): void {
    this.go(this.index() - 1);
  }

  protected next(): void {
    this.go(this.index() + 1);
  }

  /** автолистание идёт по кругу */
  private advance(): void {
    this.index.set((this.index() + 1) % this.slides().length);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.prev();
    else if (event.key === 'Home') this.go(0);
    else if (event.key === 'End') this.go(this.slides().length - 1);
    else return;
    event.preventDefault();
  }

  private reducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
}
