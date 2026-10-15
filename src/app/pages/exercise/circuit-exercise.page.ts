import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CircuitLab } from '../../exercises/logic-gates/circuit-lab';
import { sectionBySlug } from '../../sections/sections';

/**
 * Упражнение со схемой: адрес `/<глава>/<упражнение>` (например, /mux/mux-2).
 * Дополнительно `?edit=1` ставит на доску ранее сохранённое решение — так блок
 * «заглядывает» в то место, где был собран.
 */
@Component({
  selector: 'app-circuit-exercise-page',
  imports: [CircuitLab],
  template: `<app-circuit-lab
    [section]="section()"
    [startExercise]="exercise()"
    [loadSaved]="loadSaved()"
  />`,
})
export class CircuitExercisePage {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly section = computed(() => sectionBySlug(this.route.snapshot.data['slug']));
  protected readonly exercise = computed(() => this.params().get('exercise'));
  protected readonly loadSaved = computed(() => this.query().get('edit') === '1');
}
