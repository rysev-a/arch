import { TestBed } from '@angular/core/testing';
import { HelpPage } from './help.page';
import { ASM_SLIDES, SCHEME_SLIDES } from './help-slides';

describe('страница «Как работать с проектом»', () => {
  function page() {
    const f = TestBed.createComponent(HelpPage);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const titles = () => [...el.querySelectorAll('.slide-title')].map((t) => t.textContent!.trim());
    return { f, el, titles };
  }

  it('две вкладки; сначала все слайды про схемы — один под другим, с иллюстрациями', () => {
    const { el, titles } = page();
    expect([...el.querySelectorAll('.track-title')].map((t) => t.textContent!.trim())).toEqual([
      'Со схемами',
      'С ассемблером и процессорами',
    ]);
    expect(titles()).toEqual(SCHEME_SLIDES.map((s) => s.title));
    expect(el.querySelectorAll('.stage svg.ill').length).toBe(SCHEME_SLIDES.length);
    // слайд-шоу нет: ни кнопок листания, ни точек
    expect(el.querySelector('.dots')).toBeNull();
    expect(el.querySelector('.controls')).toBeNull();
  });

  it('вторая вкладка — ассемблер и процессоры, тоже все слайды сразу', () => {
    const { f, el, titles } = page();
    (el.querySelectorAll('.track')[1] as HTMLElement).click();
    f.detectChanges();
    expect(titles()).toEqual(ASM_SLIDES.map((s) => s.title));
    expect(el.querySelectorAll('.stage svg.ill').length).toBe(ASM_SLIDES.length);
  });

  it('машинный код на слайде — настоящий вывод ассемблера', () => {
    const { f, el } = page();
    (el.querySelectorAll('.track')[1] as HTMLElement).click();
    f.detectChanges();
    const bytes = el.querySelector('[data-slide="bytes"]')!.textContent!;
    expect(bytes).toContain('hlt');
    expect(bytes).toMatch(/[0-9A-F]{4}/);
  });
});
