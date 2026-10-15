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
