import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';
import { CHAPTERS } from '../../pages/chapters/chapters';

describe('раздел пройден: стрелка «вправо» мигает и ведёт в следующий раздел', () => {
  const section = SECTIONS.find((s) => s.slug === 'mux')!;
  const last = section.exercises[section.exercises.length - 1].id;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab(exercise: string, solved: number[]) {
    localStorage.setItem('processor-progress-v2-mux', JSON.stringify({ solved, current: 0 }));
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput('section', section);
    f.componentRef.setInput('startExercise', exercise);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const arrow = () =>
      el.querySelector('.exercise-nav > button:last-of-type') as HTMLButtonElement;
    return { f, el, arrow };
  }

  const all = section.exercises.map((_, i) => i);

  it('все решено и мы на последнем упражнении — стрелка мигает, доступна и ведёт в следующий раздел', () => {
    const { arrow } = lab(last, all);
    const a = arrow();
    expect(a.classList.contains('nudge')).toBe(true);
    expect(a.disabled).toBe(false);
    const nextChapter = CHAPTERS[CHAPTERS.findIndex((c) => c.slug === 'mux') + 1];
    expect(a.title).toContain(nextChapter.title);

    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    a.click();
    expect(nav).toHaveBeenCalledWith(['/', nextChapter.slug, nextChapter.exercises[0].id]);
  });

  it('раздел не пройден до конца — на последнем упражнении стрелка неактивна и не мигает', () => {
    const { arrow } = lab(last, all.slice(0, -1));
    expect(arrow().classList.contains('nudge')).toBe(false);
    expect(arrow().disabled).toBe(true);
  });

  it('в середине раздела стрелка обычная — ведёт на следующее упражнение', () => {
    const { arrow } = lab(section.exercises[1].id, all);
    expect(arrow().classList.contains('nudge')).toBe(false);
    expect(arrow().disabled).toBe(false);
  });
});
