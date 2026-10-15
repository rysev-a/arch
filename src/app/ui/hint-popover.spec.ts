import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HintPopover } from './hint-popover';

@Component({
  imports: [HintPopover],
  template: `
    <app-hint-popover [(open)]="open" text="Попробуйте инвертор" />
    <button id="elsewhere" type="button">другое место</button>
  `,
})
class Host {
  readonly open = signal(false);
}

describe('подсказка во всплывающем окне', () => {
  function host() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const pop = () => el.querySelector('.pop');
    const toggle = () => el.querySelector('app-hint-popover > button') as HTMLButtonElement;
    return { f, el, pop, toggle };
  }

  it('кнопка открывает окно рядом с собой с текстом подсказки', () => {
    const { f, pop, toggle } = host();
    expect(pop()).toBeNull();
    toggle().click();
    f.detectChanges();
    expect(pop()!.textContent).toContain('Попробуйте инвертор');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('закрывается крестиком, Esc и щелчком в другом месте', () => {
    const { f, el, pop, toggle } = host();
    const reopen = () => {
      if (!pop()) toggle().click();
      f.detectChanges();
    };

    reopen();
    (el.querySelector('.pop-close') as HTMLButtonElement).click();
    f.detectChanges();
    expect(pop()).toBeNull();

    reopen();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(pop()).toBeNull();

    reopen();
    (el.querySelector('#elsewhere') as HTMLElement).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    f.detectChanges();
    expect(pop()).toBeNull();

    // щелчок внутри самого окна его не закрывает
    reopen();
    pop()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    f.detectChanges();
    expect(pop()).not.toBeNull();
  });
});
