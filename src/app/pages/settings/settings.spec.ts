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
    expect(JSON.parse(localStorage.getItem('processor-settings-v1')!)).toEqual({ autoWire: true });
  });

  it('сохранённая настройка восстанавливается', () => {
    localStorage.setItem('processor-settings-v1', JSON.stringify({ autoWire: true }));
    expect(TestBed.inject(SettingsService).autoWire()).toBe(true);
  });
});
