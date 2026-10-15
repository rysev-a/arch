import { TestBed } from '@angular/core/testing';
import { HelpPage } from './help.page';
import { ASM_SLIDES, SCHEME_SLIDES } from './help-slides';

describe('страница «Как работать с проектом»', () => {
  function page() {
    const f = TestBed.createComponent(HelpPage);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const title = () => el.querySelector('.slide-title')!.textContent!.trim();
    return { f, el, title };
  }

  it('сначала слайды про схемы; для каждого есть иллюстрация', () => {
    const { f, el, title } = page();
    expect(title()).toBe(SCHEME_SLIDES[0].title);
    for (let i = 0; i < SCHEME_SLIDES.length; i++) {
      (el.querySelectorAll('.dots .dot')[i] as HTMLElement).click();
      f.detectChanges();
      expect(title()).toBe(SCHEME_SLIDES[i].title);
      expect(el.querySelector('.ill-wrap svg.ill'), SCHEME_SLIDES[i].id).not.toBeNull();
    }
  });

  it('второй раздел — ассемблер и процессоры, иллюстрации на месте', () => {
    const { f, el, title } = page();
    (el.querySelectorAll('.track')[1] as HTMLElement).click();
    f.detectChanges();
    expect(title()).toBe(ASM_SLIDES[0].title);
    for (let i = 0; i < ASM_SLIDES.length; i++) {
      (el.querySelectorAll('.dots .dot')[i] as HTMLElement).click();
      f.detectChanges();
      expect(title()).toBe(ASM_SLIDES[i].title);
      expect(el.querySelector('.ill-wrap svg.ill'), ASM_SLIDES[i].id).not.toBeNull();
    }
  });

  it('кнопки и стрелки на клавиатуре листают слайды', () => {
    const { f, el, title } = page();
    const buttons = el.querySelectorAll('.controls > button.btn-icon');
    (buttons[1] as HTMLElement).click(); // вперёд
    f.detectChanges();
    expect(title()).toBe(SCHEME_SLIDES[1].title);
    (el.querySelector('.stage') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    f.detectChanges();
    expect(title()).toBe(SCHEME_SLIDES[0].title);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('машинный код на слайде — настоящий вывод ассемблера', () => {
    const { f, el } = page();
    (el.querySelectorAll('.track')[1] as HTMLElement).click();
    f.detectChanges();
    (el.querySelectorAll('.dots .dot')[1] as HTMLElement).click();
    f.detectChanges();
    const text = el.querySelector('.ill-wrap')!.textContent!;
    expect(text).toContain('hlt');
    expect(text).toMatch(/[0-9A-F]{4}/);
  });
});
