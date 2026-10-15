import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CircuitLab } from './circuit-lab';
import { SECTIONS } from '../../sections/sections';

const ev = (type: string, init: MouseEventInit = {}): Event =>
  new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

describe('провод одним щелчком: щёлкнули по контакту — он тянется за мышью', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function lab() {
    const f = TestBed.createComponent(CircuitLab);
    f.componentRef.setInput(
      'section',
      SECTIONS.find((s) => s.slug === 'simple-circuits'),
    );
    f.componentRef.setInput('startExercise', 'wire'); // вход A → выход Y
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('.board-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440 }) as DOMRect;
    const pinA = el.querySelector('.input-node .pin-hit') as Element;
    const pinY = el.querySelector('.out-node .pin-hit') as Element;
    const wires = () => el.querySelectorAll('.board-svg .wire').length;
    const preview = () => el.querySelector('.wire-preview');
    const click = (target: Element, x = 100, y = 80) => {
      target.dispatchEvent(ev('pointerdown', { button: 0, clientX: x, clientY: y }));
      document.dispatchEvent(ev('pointerup', { button: 0, clientX: x, clientY: y }));
      f.detectChanges();
    };
    return { f, el, svg, pinA, pinY, wires, preview, click };
  }

  it('щелчок по контакту — провод тянется за мышью, щелчок по другому контакту — соединил', () => {
    const { f, pinA, pinY, wires, preview, click } = lab();
    expect(wires()).toBe(0);
    click(pinA);
    expect(preview()).not.toBeNull(); // провод уже тянется
    document.dispatchEvent(ev('pointermove', { clientX: 400, clientY: 150 }));
    f.detectChanges();
    expect(preview()).not.toBeNull();
    expect(wires()).toBe(0);

    click(pinY, 780, 200); // конец провода
    expect(wires()).toBe(1);
    expect(preview()).toBeNull();
  });

  it('щелчок в пустом месте отменяет провод и больше ничего не делает', () => {
    const { f, el, pinA, wires, preview, click } = lab();
    click(pinA);
    expect(preview()).not.toBeNull();
    const bg = el.querySelector('.board-bg') as Element;
    click(bg, 400, 300);
    expect(preview()).toBeNull();
    expect(wires()).toBe(0);
    // и доска при этом не поехала (пустое место обычно её двигает)
    document.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 300 }));
    f.detectChanges();
    expect(el.querySelector('.board-svg')!.getAttribute('viewBox')).toBe('0 0 880 440');
  });

  it('Esc и повторный щелчок по тому же контакту тоже отменяют', () => {
    const { f, pinA, wires, preview, click } = lab();
    click(pinA);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(preview()).toBeNull();

    click(pinA);
    expect(preview()).not.toBeNull();
    click(pinA);
    expect(preview()).toBeNull();
    expect(wires()).toBe(0);
  });

  it('прежний способ работает: зажать, протянуть и отпустить над другим контактом', () => {
    const { f, pinA, pinY, wires, preview } = lab();
    pinA.dispatchEvent(ev('pointerdown', { button: 0, clientX: 100, clientY: 80 }));
    document.dispatchEvent(ev('pointermove', { clientX: 500, clientY: 150 }));
    f.detectChanges();
    expect(preview()).not.toBeNull();
    (pinY.parentElement as Element).dispatchEvent(new MouseEvent('pointerenter'));
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: 780, clientY: 200 }));
    f.detectChanges();
    expect(wires()).toBe(1);
    expect(preview()).toBeNull();
  });

  it('протянули и отпустили в пустом месте — провод отменяется, как раньше', () => {
    const { f, pinA, wires, preview } = lab();
    pinA.dispatchEvent(ev('pointerdown', { button: 0, clientX: 100, clientY: 80 }));
    document.dispatchEvent(ev('pointermove', { clientX: 500, clientY: 300 }));
    document.dispatchEvent(ev('pointerup', { button: 0, clientX: 500, clientY: 300 }));
    f.detectChanges();
    expect(preview()).toBeNull();
    expect(wires()).toBe(0);
  });
});
