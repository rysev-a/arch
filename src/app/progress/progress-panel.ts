import { Component, inject, signal } from '@angular/core';
import { ConfirmService } from '../ui/confirm.service';
import { touchProgress } from '../nav/progress';
import { exportProgress, importProgress, progressFileName, resetProgress } from './progress-io';

/** «Ваш прогресс»: сохранить в файл, загрузить из файла, сбросить */
@Component({
  selector: 'app-progress-panel',
  template: `
    <section class="card panel">
      <div class="card-header">
        <h3 class="card-title">Ваш прогресс</h3>
        <p class="card-description">
          Прогресс хранится только в этом браузере: у учебника нет учётных записей и сервера.
          Сохраните его в файл — и сможете вернуть после очистки данных или на другом устройстве.
        </p>
      </div>
      <div class="card-content">
        <div class="buttons">
          <button type="button" class="btn btn-default btn-sm" (click)="save()">
            Сохранить в файл
          </button>
          <button type="button" class="btn btn-outline btn-sm" (click)="picker.click()">
            Загрузить из файла
          </button>
          <button type="button" class="btn btn-outline btn-sm" (click)="reset()">
            Сбросить прогресс
          </button>
          <input
            #picker
            type="file"
            accept="application/json,.json"
            hidden
            (change)="load($event)"
          />
        </div>
        @if (message(); as m) {
          <p class="msg pop-in" [class.bad]="!m.ok" role="status">{{ m.text }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .msg {
      margin: 0.75rem 0 0;
      font-size: 0.8125rem;
      color: hsl(var(--success));
    }
    .msg.bad {
      color: hsl(var(--destructive));
    }
  `,
})
export class ProgressPanel {
  private readonly dialogs = inject(ConfirmService);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected save(): void {
    const json = JSON.stringify(exportProgress(), null, 1);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = progressFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message.set({ ok: true, text: `Файл «${a.download}» сохранён.` });
  }

  protected async load(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // чтобы тот же файл можно было выбрать снова
    if (!file) return;
    const result = importProgress(await file.text());
    this.message.set({ ok: result.ok, text: result.message });
    if (result.ok) touchProgress();
  }

  protected async reset(): Promise<void> {
    const sure = await this.dialogs.ask({
      title: 'Стереть весь прогресс?',
      description:
        'Решённые упражнения и сохранённые в браузере схемы и программы будут удалены. ' +
        'Если прогресс ещё нужен, сначала сохраните его в файл.',
      confirmText: 'Стереть',
      cancelText: 'Отмена',
      destructive: true,
    });
    if (!sure) return;
    const n = resetProgress();
    touchProgress();
    this.message.set({
      ok: true,
      text: n ? `Прогресс сброшен (записей: ${n}).` : 'Сбрасывать нечего.',
    });
  }
}
