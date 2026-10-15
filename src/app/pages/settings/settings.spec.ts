import { TestBed } from '@angular/core/testing';
import { SettingsPage } from './settings.page';
import { SettingsService } from '../../settings/settings.service';

describe('страница настроек', () => {
  beforeEach(() => localStorage.clear());

  it('автоподстановка связей по умолчанию выключена, переключатель её включает и сохраняет', () => {
    const f = TestBed.createComponent(SettingsPage);
    f.detectChanges();
    const settings = TestBed.inject(SettingsService);
    const sw = (f.nativeElement as HTMLElement).querySelector('[role="switch"]') as HTMLElement;
    expect(settings.autoWire()).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');

    sw.click();
    f.detectChanges();
    TestBed.tick();
    expect(settings.autoWire()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(localStorage.getItem('processor-settings-v1')!)).toMatchObject({
      autoWire: true,
      autoWireRadius: 56,
    });
  });

  it('сохранённая настройка восстанавливается', () => {
    localStorage.setItem('processor-settings-v1', JSON.stringify({ autoWire: true }));
    expect(TestBed.inject(SettingsService).autoWire()).toBe(true);
  });

  it('ползунок радиуса виден только при включённой автоподстановке и меняет радиус', () => {
    const f = TestBed.createComponent(SettingsPage);
    const settings = TestBed.inject(SettingsService);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="range"]')).toBeNull();

    settings.autoWire.set(true);
    f.detectChanges();
    const range = el.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range).not.toBeNull();
    expect(+range.value).toBe(56);

    range.value = '80';
    range.dispatchEvent(new Event('input'));
    f.detectChanges();
    TestBed.tick();
    expect(settings.autoWireRadius()).toBe(80);
    expect(JSON.parse(localStorage.getItem('processor-settings-v1')!).autoWireRadius).toBe(80);
  });

  it('сохранённый радиус ограничивается допустимыми границами', () => {
    localStorage.setItem('processor-settings-v1', JSON.stringify({ autoWireRadius: 5000 }));
    expect(TestBed.inject(SettingsService).autoWireRadius()).toBe(108);
  });

  it('на странице настроек есть управление прогрессом: сохранить, загрузить, сбросить', () => {
    const f = TestBed.createComponent(SettingsPage);
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ваш прогресс');
    expect(text).toContain('Сохранить в файл');
    expect(text).toContain('Загрузить из файла');
    expect(text).toContain('Сбросить прогресс');
  });
});
