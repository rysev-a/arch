import { Injectable, signal } from '@angular/core';

/** Режим авто переживает переход между упражнениями и главами: «следующее упражнение» тоже идёт в авто */
@Injectable({ providedIn: 'root' })
export class GuideSession {
  readonly auto = signal(false);
}
