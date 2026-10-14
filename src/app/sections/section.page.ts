import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CircuitLab } from '../exercises/logic-gates/circuit-lab';
import { sectionBySlug } from './sections';

/**
 * Единая страница раздела: какой раздел показать, берётся из `data.slug` маршрута.
 * Ссылка вида `?ex=<id>&edit=1` открывает упражнение сразу с ранее сохранённым решением —
 * так блок «заглядывает» в то место, где он был собран.
 */
@Component({
  selector: 'app-section-page',
  imports: [CircuitLab],
  template: `<app-circuit-lab
    [section]="section()"
    [startExercise]="startExercise()"
    [loadSaved]="loadSaved()"
  />`,
})
export class SectionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly section = computed(() => sectionBySlug(this.data()['slug']));
  protected readonly startExercise = computed(() => this.query().get('ex'));
  protected readonly loadSaved = computed(() => this.query().get('edit') === '1');
}
