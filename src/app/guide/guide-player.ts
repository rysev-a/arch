import { Component, computed, input, model, output } from '@angular/core';

interface Run {
  text: string;
  strong: boolean;
}

/**
 * Панель режима авто — как у аудиоплеера: «Назад», «Вперёд», шкала шагов,
 * а над ней всплывающее окно с объяснением текущего шага.
 */
@Component({
  selector: 'app-guide-player',
  templateUrl: './guide-player.html',
  styleUrl: './guide-player.css',
})
export class GuidePlayer {
  readonly title = input.required<string>();
  /** Абзацы разделены пустой строкой, **так** выделяется важное */
  readonly text = input.required<string>();
  /** номер текущего шага, с нуля */
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  /** строки журнала выполнения (для программ): что сделала каждая команда */
  readonly log = input<readonly string[]>([]);
  /** пока идёт такт, «Вперёд» недоступен */
  readonly busy = input(false);
  readonly solved = input(false);
  /** есть ли куда идти после последнего шага */
  readonly hasNextExercise = input(false);
  /** окно с объяснением развёрнуто */
  readonly open = model(true);

  readonly prev = output<void>();
  readonly next = output<void>();
  readonly goNext = output<void>();
  readonly jump = output<number>();
  readonly closed = output<void>();

  protected readonly paragraphs = computed<Run[][]>(() =>
    this.text()
      .split(/\n\n+/)
      .map((p) =>
        p
          .split('**')
          .map((text, i): Run => ({ text, strong: i % 2 === 1 }))
          .filter((r) => r.text !== ''),
      ),
  );

  protected readonly canPrev = computed(() => this.index() > 0);
  protected readonly last = computed(() => this.index() >= this.total() - 1);
  protected readonly canNext = computed(() =>
    this.last() ? this.hasNextExercise() : !this.busy(),
  );
  protected readonly percent = computed(() =>
    this.total() > 1 ? (this.index() / (this.total() - 1)) * 100 : 100,
  );

  protected onSlider(event: Event): void {
    this.jump.emit(+(event.target as HTMLInputElement).value);
  }
}
