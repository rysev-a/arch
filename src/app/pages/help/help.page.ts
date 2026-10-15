import { Component, computed, signal } from '@angular/core';
import { assemble } from '../../asm/assembler';
import { ASM_SLIDES, HELP_TRACKS, HelpSlide, HelpTrack, SCHEME_SLIDES } from './help-slides';

/** Страница «Как работать с проектом»: анимированные слайды для схем и для ассемблера, один под другим */
@Component({
  selector: 'app-help-page',
  templateUrl: './help.page.html',
  styleUrl: './help.page.css',
})
export class HelpPage {
  protected readonly tracks = HELP_TRACKS;
  protected readonly track = signal<HelpTrack>('scheme');

  protected readonly slides = computed<readonly HelpSlide[]>(() =>
    this.track() === 'scheme' ? SCHEME_SLIDES : ASM_SLIDES,
  );

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

  protected selectTrack(id: HelpTrack): void {
    this.track.set(id);
  }
}
