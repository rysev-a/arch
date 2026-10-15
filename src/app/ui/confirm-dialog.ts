import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from './confirm.service';

/**
 * Модальное окно подтверждения в стиле shadcn «Alert Dialog»: затемнение, карточка по центру,
 * заголовок, пояснение и две кнопки. На нативном <dialog>: фокус остаётся внутри окна,
 * Esc закрывает как «Отмена», страница под окном недоступна.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  protected readonly service = inject(ConfirmService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  private readonly sync = effect(() => {
    const req = this.service.request();
    const el = this.dialog()?.nativeElement;
    if (!el) return;
    if (req && !el.open) {
      // showModal есть не везде (например, в тестовом окружении): тогда просто открываем
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      // кнопки рисуются уже после открытия окна: фокус ставим на первую («Отмена» — безопасный выбор)
      setTimeout(() => el.querySelector('button')?.focus());
    } else if (!req && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  });

  protected answer(value: boolean): void {
    this.service.request()?.resolve(value);
  }

  /** Esc: закрытие без выбора — это «Отмена» */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.answer(false);
  }
}
