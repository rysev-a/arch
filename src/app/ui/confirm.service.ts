import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  description: string;
  /** Текст главной кнопки (по умолчанию «Подтвердить») */
  confirmText?: string;
  /** Текст кнопки отмены; null — кнопки отмены нет (окно-уведомление) */
  cancelText?: string | null;
  /** Опасное действие: главная кнопка красная */
  destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve(answer: boolean): void;
}

/**
 * Окно подтверждения вместо системного confirm()/alert(): `await confirm.ask({...})`.
 * Показывает его компонент ConfirmDialog, который лежит в корне приложения.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    // если уже открыто другое окно — прежнее считается отменённым
    this.request()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.request.set({
        ...options,
        resolve: (answer) => {
          this.request.set(null);
          resolve(answer);
        },
      });
    });
  }

  /** Окно с одной кнопкой: просто сообщить */
  async notify(title: string, description: string, buttonText = 'Понятно'): Promise<void> {
    await this.ask({ title, description, confirmText: buttonText, cancelText: null });
  }
}
