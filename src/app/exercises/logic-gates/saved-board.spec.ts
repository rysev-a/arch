import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';

const ev = (type: string, init: MouseEventInit = {}): Event =>
  new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

describe('решённое упражнение сохраняет схему на доске', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab(exercise: string) {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', exercise);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('.board-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    return { f, el };
  }

  it('решили упражнение без блока («Первый сигнал») — схема уходит в localStorage', () => {
    const { f, el } = lab('wire');
    const pinA = el.querySelector('.input-node .pin-hit') as Element;
    const pinY = el.querySelector('.out-node .pin-hit') as Element;
    pinA.dispatchEvent(ev('pointerdown', { button: 0, clientX: 100, clientY: 80 }));
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: 100, clientY: 80 }));
    f.detectChanges();
    pinY.dispatchEvent(ev('pointerdown', { button: 0, clientX: 780, clientY: 200 }));
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: 780, clientY: 200 }));
    f.detectChanges();
    TestBed.tick();
    f.detectChanges();

    const raw = localStorage.getItem('processor-solution-v1-simple-wire');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).wires.length).toBe(1);
  });

  it('открываем решённое упражнение заново — схема на месте, успех показан сразу', () => {
    localStorage.setItem(
      'processor-progress-v2-simple',
      JSON.stringify({ solved: [0], current: 0 }),
    );
    localStorage.setItem(
      'processor-solution-v1-simple-wire',
      JSON.stringify({
        gates: [],
        wires: [{ id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'Y', pin: 'in0' } }],
      }),
    );
    const { el } = lab('wire');
    expect(el.querySelectorAll('.board-svg .wire').length).toBe(1);
    expect(el.querySelector('.alert-success')).not.toBeNull();
  });

  it('нерешённое упражнение открывается с чистой доской, даже если схема когда-то сохранялась', () => {
    localStorage.setItem(
      'processor-solution-v1-simple-wire',
      JSON.stringify({
        gates: [],
        wires: [{ id: 'w1', from: { node: 'A', pin: 'out' }, to: { node: 'Y', pin: 'in0' } }],
      }),
    );
    const { el } = lab('wire');
    expect(el.querySelectorAll('.board-svg .wire').length).toBe(0);
  });
});
