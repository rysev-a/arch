import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { progressVersion } from '../../nav/progress';
import { confirmMarkChapter, markChapterSolved } from '../../progress/mark-solved';
import { chapterBySlug, chapterProgress } from '../chapters/chapters';

/** Страница главы: описание и список упражнений со статусами; у каждого упражнения своя ссылка */
@Component({
  selector: 'app-chapter-page',
  imports: [RouterLink],
  templateUrl: './chapter.page.html',
  styleUrl: './chapter.page.css',
})
export class ChapterPage {
  private readonly data = inject(ActivatedRoute).snapshot.data;

  protected readonly chapter = computed(() => chapterBySlug(this.data['slug'])!);
  protected readonly progress = computed(() => {
    progressVersion();
    return chapterProgress(this.chapter());
  });
  protected readonly percent = computed(() => {
    const p = this.progress();
    return p.items.length ? Math.round((p.done / p.items.length) * 100) : 0;
  });
  protected readonly resumeId = computed(
    () => this.progress().items[this.progress().resume]?.id ?? this.chapter().exercises[0].id,
  );
  protected readonly started = computed(() => this.progress().done > 0);

  /** Кто уже знает тему, засчитывает всю главу разом */
  protected markAll(): void {
    const c = this.chapter();
    if (!confirmMarkChapter(c.title, c.exercises.length)) return;
    markChapterSolved(c);
  }

  protected statusLabel(s: 'solved' | 'current' | 'todo'): string {
    return s === 'solved' ? 'решено' : s === 'current' ? 'продолжить здесь' : 'не решено';
  }
}
