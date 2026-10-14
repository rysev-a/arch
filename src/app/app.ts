import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { runDemoIfRequested } from './demo';
import { SideNav } from './nav/side-nav';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SideNav],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  /** На узком экране список разделов прячется и открывается кнопкой в шапке */
  protected readonly menuOpen = signal(false);

  protected readonly theme = signal<'light' | 'dark'>(this.initialTheme());

  constructor() {
    runDemoIfRequested();
  }

  private initialTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('processor-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // localStorage может быть недоступен — остаёмся в тёмной теме
    }
    return 'dark';
  }

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    const el = document.documentElement;
    el.classList.remove('light', 'dark');
    el.classList.add(next);
    try {
      localStorage.setItem('processor-theme', next);
    } catch {
      // игнорируем — тема просто не сохранится
    }
  }
}
