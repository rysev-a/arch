import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';
import { ConfirmService } from './confirm.service';

describe('окно подтверждения', () => {
  let f: ComponentFixture<ConfirmDialog>;
  let service: ConfirmService;
  const el = () => f.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as
      HTMLButtonElement | undefined;

  beforeEach(() => {
    f = TestBed.createComponent(ConfirmDialog);
    service = TestBed.inject(ConfirmService);
    f.detectChanges();
  });

  it('пока вопроса нет, в окне пусто', () => {
    expect(el().querySelector('.dialog-title')).toBeNull();
    expect(el().querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });

  it('показывает заголовок, пояснение и обе кнопки; «Подтвердить» отвечает «да»', async () => {
    const answer = service.ask({
      title: 'Точно?',
      description: 'Это нельзя отменить.',
      confirmText: 'Да, стереть',
    });
    f.detectChanges();
    expect(el().querySelector('dialog')!.hasAttribute('open')).toBe(true);
    expect(el().querySelector('.dialog-title')!.textContent).toBe('Точно?');
    expect(el().querySelector('.dialog-description')!.textContent).toBe('Это нельзя отменить.');
    expect(button('Отмена')).toBeTruthy();
    button('Да, стереть')!.click();
    expect(await answer).toBe(true);
    f.detectChanges();
    expect(el().querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });

  it('«Отмена» и Esc отвечают «нет»', async () => {
    const first = service.ask({ title: 'A', description: 'a' });
    f.detectChanges();
    button('Отмена')!.click();
    expect(await first).toBe(false);
    f.detectChanges();

    const second = service.ask({ title: 'B', description: 'b' });
    f.detectChanges();
    el()
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await second).toBe(false);
  });

  it('опасное действие — красная кнопка; у уведомления только одна кнопка', async () => {
    const danger = service.ask({
      title: 'Стереть?',
      description: 'x',
      destructive: true,
      confirmText: 'Стереть',
    });
    f.detectChanges();
    expect(button('Стереть')!.classList.contains('btn-destructive')).toBe(true);
    button('Стереть')!.click();
    await danger;
    f.detectChanges();

    const info = service.notify('Готово', 'Всё сохранено');
    f.detectChanges();
    expect(button('Отмена')).toBeUndefined();
    button('Понятно')!.click();
    await info;
  });

  it('новый вопрос поверх старого: прежний считается отменённым', async () => {
    const old = service.ask({ title: 'Старый', description: '' });
    f.detectChanges();
    const next = service.ask({ title: 'Новый', description: '' });
    expect(await old).toBe(false);
    f.detectChanges();
    expect(el().querySelector('.dialog-title')!.textContent).toBe('Новый');
    button('Подтвердить')!.click();
    expect(await next).toBe(true);
  });
});
