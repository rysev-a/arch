import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Breadcrumbs } from './nav/breadcrumbs';
import { runDemoIfRequested } from './demo';
import { SideNav } from './nav/side-nav';
import { ConfirmDialog } from './ui/confirm-dialog';
import { ConfirmService } from './ui/confirm.service';
import { SettingsService } from './settings/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, SideNav, Breadcrumbs, ConfirmDialog],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  /** На узком экране список разделов прячется и открывается кнопкой в шапке */
  protected readonly menuOpen = signal(false);

  /** Левое меню можно спрятать, чтобы освободить место: выбор запоминается */
  protected readonly sideHidden = signal(this.initialSideHidden());

  protected readonly theme = signal<'light' | 'dark'>(this.initialTheme());

  private readonly dialogs = inject(ConfirmService);
  /** настройки применяются с самого запуска (например, «всегда показывать анимации») */
  private readonly settings = inject(SettingsService);

  constructor() {
    runDemoIfRequested((title, text) => this.dialogs.notify(title, text));
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

  private initialSideHidden(): boolean {
    try {
      return localStorage.getItem('processor-side-hidden') === '1';
    } catch {
      return false;
    }
  }

  protected toggleSide(): void {
    const next = !this.sideHidden();
    this.sideHidden.set(next);
    try {
      localStorage.setItem('processor-side-hidden', next ? '1' : '0');
    } catch {
      // игнорируем — выбор просто не сохранится
    }
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
