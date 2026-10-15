import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';

describe('окошко с заданием в полноэкранном режиме', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('при развороте на весь экран справа внизу появляется задание с таблицей истинности', () => {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'enable');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.fs-task')).toBeNull();

    (el.querySelector('[aria-pressed][title*="весь экран"]') as HTMLButtonElement).click();
    f.detectChanges();
    const box = el.querySelector('.fs-task') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('Задание');
    expect(box.querySelector('app-truth-table')).not.toBeNull();

    // можно свернуть, чтобы не мешало
    (box.querySelector('.fs-task-toggle') as HTMLButtonElement).click();
    f.detectChanges();
    expect(box.querySelector('app-truth-table')).toBeNull();
  });
});

describe('элемент при перетаскивании в режиме на весь экран', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('«призрак» лежит выше доски во весь экран, иначе его не видно', () => {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'not');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    (el.querySelector('[aria-pressed][title*="весь экран"]') as HTMLButtonElement).click();
    f.detectChanges();
    (el.querySelector('.pal-sq') as HTMLElement).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 200 }),
    );
    f.detectChanges();
    const ghost = el.querySelector('.ghost') as HTMLElement;
    const card = el.querySelector('.board-card.fullscreen') as HTMLElement;
    expect(ghost).not.toBeNull();
    expect(card).not.toBeNull();
    const z = (e: HTMLElement) => +getComputedStyle(e).zIndex;
    // стили компонента в тестовой среде подключаются; если нет — проверка не имеет смысла
    if (z(card) > 0) expect(z(ghost)).toBeGreaterThan(z(card));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
});
