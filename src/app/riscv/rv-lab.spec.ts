import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { RvLab } from './rv-lab';
import { REAL_TASKS } from './rv-real-tasks';
import { RV_TASKS } from './rv-tasks';

function render(mode?: string) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { data: mode ? { mode } : {} },
          queryParamMap: of(convertToParamMap({})),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(RvLab);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const title = (el: HTMLElement) => el.querySelector('.card-title')!.textContent!.trim();

describe('страница RISC-V', () => {
  beforeEach(() => localStorage.clear());

  it('учебная плата: задания этапа 3 и периферия', () => {
    const el = render();
    expect(title(el)).toBe(`Задание 1 из ${RV_TASKS.length} · ${RV_TASKS[0].title}`);
    expect(el.querySelectorAll('.step-chip').length).toBe(RV_TASKS.length);
    expect(el.textContent).toContain('Светодиоды');
    expect(el.textContent).not.toContain('Собрать у себя');
  });

  it('реальная сборка: свои задания, вывод программы и проект для скачивания', () => {
    const el = render('real');
    expect(title(el)).toBe(`Задание 1 из ${REAL_TASKS.length} · ${REAL_TASKS[0].title}`);
    expect(el.querySelectorAll('.step-chip').length).toBe(REAL_TASKS.length);
    expect(el.textContent).toContain('Вывод программы');
    expect(el.textContent).not.toContain('Светодиоды');
    expect(el.textContent).toContain('Собрать у себя на компьютере');
    expect(el.textContent).toContain('Скачать проект (.zip)');
    // файл program.s показан и содержит текст программы
    expect(el.querySelector('.file-view')!.textContent).toContain('_start');
  });

  it('заготовка сначала собирается и запускается без ошибок', () => {
    for (const mode of [undefined, 'real']) {
      TestBed.resetTestingModule();
      localStorage.clear();
      const el = render(mode);
      expect(el.querySelector('.rv-errors')).toBeNull();
    }
  });
});
