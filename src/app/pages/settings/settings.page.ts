import { Component, inject } from '@angular/core';
import { Slider } from '../../ui/slider';
import { Switch } from '../../ui/switch';
import {
  AUTO_WIRE_RADIUS_MAX,
  AUTO_WIRE_RADIUS_MIN,
  SettingsService,
} from '../../settings/settings.service';

/** Страница настроек: переключатели в стиле shadcn */
@Component({
  selector: 'app-settings-page',
  imports: [Switch, Slider],
  template: `
    <div class="settings">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title page-title">Настройки</h2>
          <p class="card-description">
            Хранятся в этом браузере и применяются сразу. К прогрессу не относятся.
          </p>
        </div>
        <div class="card-content">
          <h3 class="group">Доска со схемами</h3>
          <div class="row">
            <div class="text">
              <label class="name" for="auto-wire">Автоподстановка связей</label>
              <p class="desc">
                Когда вы тащите элемент по доске, его входы и выходы, оказавшиеся рядом с контактами
                других элементов, соединяются с ними пунктирными проводами. Поставите элемент в это
                место — провода станут настоящими.
              </p>
            </div>
            <app-switch
              id="auto-wire"
              label="Автоподстановка связей"
              [checked]="settings.autoWire()"
              (checkedChange)="settings.autoWire.set($event)"
            />
          </div>
          @if (settings.autoWire()) {
            <div class="sub pop-in">
              <div class="sub-head">
                <label class="name" for="auto-wire-radius">Радиус автоподстановки</label>
                <span class="value">{{ settings.autoWireRadius() }}</span>
              </div>
              <p class="desc">
                Насколько близко должны оказаться контакты, чтобы появился пунктир: чем правее
                ползунок, тем дальше «достаёт» элемент. На доске действует радиус в 1,5 раза больше
                указанного.
              </p>
              <app-slider
                id="auto-wire-radius"
                label="Радиус автоподстановки"
                [min]="min"
                [max]="max"
                [step]="4"
                [value]="settings.autoWireRadius()"
                (valueChange)="settings.autoWireRadius.set($event)"
              />
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .settings {
      max-width: 44rem;
    }
    .page-title {
      font-size: 1.375rem;
    }
    .group {
      margin: 0 0 0.5rem;
      color: hsl(var(--muted-foreground));
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 0;
      border-top: 1px solid hsl(var(--border));
    }
    .name {
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .sub {
      padding: 0.75rem 0 0.25rem 1rem;
      border-top: 1px solid hsl(var(--border));
    }
    .sub-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .sub .desc {
      margin-bottom: 0.75rem;
    }
    .value {
      color: hsl(var(--muted-foreground));
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-size: 0.8125rem;
    }
    .desc {
      margin: 0.25rem 0 0;
      color: hsl(var(--muted-foreground));
      font-size: 0.8125rem;
      line-height: 1.5;
    }
  `,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);
  protected readonly min = AUTO_WIRE_RADIUS_MIN;
  protected readonly max = AUTO_WIRE_RADIUS_MAX;
}
