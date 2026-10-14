import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ROADMAP, SECTIONS } from './sections/sections';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly sections = SECTIONS;
  protected readonly roadmap = ROADMAP;

  protected readonly theme = signal<'light' | 'dark'>(this.initialTheme());

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
