import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { progressVersion } from '../../nav/progress';
import { ProgressPanel } from '../../progress/progress-panel';
import { CHAPTERS, PARTS, chapterProgress } from './chapters';

/** Главная: все главы курса со сводкой прогресса */
@Component({
  selector: 'app-chapters-page',
  imports: [RouterLink, ProgressPanel],
  templateUrl: './chapters.page.html',
  styleUrl: './chapters.page.css',
})
export class ChaptersPage {
  protected readonly parts = computed(() => {
    progressVersion();
    return PARTS.map((part) => ({
      ...part,
      chapters: CHAPTERS.filter((c) => c.part === part.id).map((c) => {
        const p = chapterProgress(c);
        return {
          chapter: c,
          done: p.done,
          total: p.items.length,
          percent: p.items.length ? Math.round((p.done / p.items.length) * 100) : 0,
          resumeId: p.items[p.resume]?.id ?? c.exercises[0].id,
          started: p.done > 0,
        };
      }),
    }));
  });
}
