import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { ProgressPanel } from './progress-panel';
import {
  KeyValueStorage,
  exportProgress,
  importProgress,
  progressFileName,
  resetProgress,
} from './progress-io';

class FakeStorage implements KeyValueStorage {
  private readonly m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

const filled = (): FakeStorage => {
  const s = new FakeStorage();
  s.setItem('processor-progress-v2-mux', JSON.stringify({ solved: [0, 1, 2], current: 2 }));
  s.setItem('processor-solution-v1-mux-mux4', JSON.stringify({ gates: [], wires: [] }));
  s.setItem(
    'processor-asm-v1',
    JSON.stringify({ codes: { upper: 'hlt' }, solved: ['upper'], current: 1 }),
  );
  s.setItem('processor-theme', 'dark'); // не прогресс
  s.setItem('чужой-ключ', '{"x":1}');
  return s;
};

describe('сохранение прогресса в файл', () => {
  it('выгружает только прогресс: тема и чужие ключи не попадают в файл', () => {
    const file = exportProgress(filled());
    expect(file.app).toBe('processor');
    expect(Object.keys(file.data).sort()).toEqual([
      'processor-asm-v1',
      'processor-progress-v2-mux',
      'processor-solution-v1-mux-mux4',
    ]);
  });

  it('выгрузка и загрузка в пустой браузер возвращают то же самое', () => {
    const src = filled();
    const target = new FakeStorage();
    const r = importProgress(JSON.stringify(exportProgress(src)), target);
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(3);
    expect(exportProgress(target).data).toEqual(exportProgress(src).data);
    expect(target.getItem('processor-theme')).toBeNull();
  });

  it('загрузка дополняет: решённое объединяется, свои тексты и текущее упражнение остаются', () => {
    const file = JSON.stringify(exportProgress(filled()));
    const mine = new FakeStorage();
    mine.setItem('processor-progress-v2-mux', JSON.stringify({ solved: [5], current: 7 }));
    mine.setItem(
      'processor-asm-v1',
      JSON.stringify({ codes: { upper: 'мой код', sort: 'ещё' }, solved: ['sort'], current: 3 }),
    );
    const r = importProgress(file, mine);
    expect(r.ok).toBe(true);
    const mux = JSON.parse(mine.getItem('processor-progress-v2-mux')!);
    expect(mux.solved.sort()).toEqual([0, 1, 2, 5]);
    expect(mux.current).toBe(7);
    const asm = JSON.parse(mine.getItem('processor-asm-v1')!);
    expect(asm.solved.sort()).toEqual(['sort', 'upper']);
    expect(asm.codes).toEqual({ upper: 'мой код', sort: 'ещё' });
    expect(asm.current).toBe(3);
  });

  it('повторная загрузка того же файла ничего не меняет', () => {
    const file = JSON.stringify(exportProgress(filled()));
    const target = new FakeStorage();
    importProgress(file, target);
    const again = importProgress(file, target);
    expect(again.ok).toBe(true);
    expect(again.changed).toBe(0);
  });

  it('чужие и испорченные файлы отклоняются, постороннее не записывается', () => {
    const target = new FakeStorage();
    expect(importProgress('это не json', target).ok).toBe(false);
    expect(importProgress('{"app":"other","version":1,"data":{}}', target).ok).toBe(false);
    expect(importProgress('{"app":"processor","version":2,"data":{}}', target).ok).toBe(false);
    const sneaky = JSON.stringify({
      app: 'processor',
      version: 1,
      exportedAt: '',
      data: { 'processor-theme': '"light"', evil: '{"a":1}', 'processor-asm-v1': 'не json' },
    });
    const r = importProgress(sneaky, target);
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(0);
    expect(target.length).toBe(0);
  });

  it('сброс стирает только прогресс', () => {
    const s = filled();
    expect(resetProgress(s)).toBe(3);
    expect(s.getItem('processor-theme')).toBe('dark');
    expect(s.getItem('чужой-ключ')).not.toBeNull();
    expect(exportProgress(s).data).toEqual({});
  });

  it('имя файла содержит дату', () => {
    expect(progressFileName(new Date('2026-10-15T10:00:00Z'))).toBe(
      'processor-progress-2026-10-15.json',
    );
  });
});

describe('панель «Ваш прогресс»', () => {
  let f: ComponentFixture<ProgressPanel>;
  beforeEach(() => {
    localStorage.clear();
    f = TestBed.createComponent(ProgressPanel);
    f.detectChanges();
  });

  it('загрузка файла возвращает прогресс в браузер', async () => {
    const el = f.nativeElement as HTMLElement;
    const text = JSON.stringify(exportProgress(filled()));
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([text], 'p.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();
    expect(localStorage.getItem('processor-progress-v2-mux')).not.toBeNull();
    expect(el.textContent).toContain('Прогресс загружен');
    localStorage.clear();
  });

  it('сброс спрашивает подтверждение', () => {
    localStorage.setItem('processor-progress-v2-mux', '{"solved":[1],"current":0}');
    const el = f.nativeElement as HTMLElement;
    const reset = [...el.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Сбросить'),
    )!;
    const orig = window.confirm;
    window.confirm = () => false;
    reset.click();
    expect(localStorage.getItem('processor-progress-v2-mux')).not.toBeNull();
    window.confirm = () => true;
    reset.click();
    f.detectChanges();
    expect(localStorage.getItem('processor-progress-v2-mux')).toBeNull();
    window.confirm = orig;
  });
});
