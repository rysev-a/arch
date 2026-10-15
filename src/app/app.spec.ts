import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Как работает процессор');
  });

  it('кнопка прячет и возвращает левое меню и запоминает выбор', async () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const shell = el.querySelector('.app-shell') as HTMLElement;
    const btn = el.querySelector('.side-toggle') as HTMLButtonElement;
    expect(shell.classList.contains('no-side')).toBe(false);

    btn.click();
    fixture.detectChanges();
    expect(shell.classList.contains('no-side')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('processor-side-hidden')).toBe('1');

    btn.click();
    fixture.detectChanges();
    expect(shell.classList.contains('no-side')).toBe(false);
    expect(localStorage.getItem('processor-side-hidden')).toBe('0');
  });

  it('в шапке перед шестерёнкой есть значок справки со ссылкой на /help', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.header-actions a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/help', '/settings']);
  });
});
