import { Component, input } from '@angular/core';
import { Bit, InputId, TableRow, inputsForRow } from './circuit.model';

@Component({
  selector: 'app-truth-table',
  styles: `
    .tt-scroll {
      overflow: auto;
      max-height: 26rem;
    }
    .tt {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
    .tt th {
      position: sticky;
      top: 0;
      background: hsl(var(--card));
      text-align: center;
      padding: 0.5rem 0.625rem;
      color: hsl(var(--muted-foreground));
      font-weight: 500;
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-bottom: 1px solid hsl(var(--border));
      white-space: nowrap;
    }
    .tt td {
      text-align: center;
      padding: 0.4375rem 0.625rem;
      border-top: 1px solid hsl(var(--border));
      white-space: nowrap;
    }
    .tt tbody tr:first-child td {
      border-top: none;
    }
    .tt tr.current {
      background: hsl(var(--accent) / 0.6);
    }
    .tt tr.current td:first-child {
      box-shadow: inset 3px 0 0 0 hsl(var(--primary));
    }
    .tt .input-col {
      font-weight: 500;
    }
    .tt th.sep,
    .tt td.sep {
      border-left: 1px dashed hsl(var(--border));
    }
    .tt .target {
      color: hsl(var(--muted-foreground));
      font-weight: 600;
    }
    .tt .actual {
      font-weight: 700;
      font-size: 0.9375rem;
    }
    .tt .actual.ok {
      color: hsl(var(--success));
    }
    .tt .actual.bad {
      color: hsl(var(--destructive));
    }
    .tt .actual.na {
      color: hsl(var(--muted-foreground));
      font-weight: 400;
    }
    .mark {
      width: 2rem;
    }
    .ok-mark {
      color: hsl(var(--success));
      font-weight: 700;
    }
    .bad-mark {
      color: hsl(var(--destructive));
      font-weight: 700;
    }
    .na-mark {
      color: hsl(var(--muted-foreground) / 0.5);
    }
  `,
  template: `
    <div class="tt-scroll">
      <table class="tt">
        <thead>
          <tr>
            @for (label of labels(); track $index) {
              <th>{{ label }}</th>
            }
            @for (o of outputs(); track o) {
              <th class="sep">Цель {{ o }}</th>
            }
            @for (o of outputs(); track o) {
              <th>Схема {{ o }}</th>
            }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr [class.current]="$index === currentRow()">
              @for (bit of bits($index); track $index) {
                <td class="input-col">{{ bit }}</td>
              }
              @for (t of row.targets; track $index) {
                <td class="sep target">{{ t }}</td>
              }
              @for (a of row.actuals; track $index) {
                <td
                  class="actual"
                  [class.ok]="a === row.targets[$index]"
                  [class.bad]="a !== undefined && a !== row.targets[$index]"
                  [class.na]="a === undefined"
                >
                  {{ a === undefined ? '—' : a }}
                </td>
              }
              <td class="mark">
                @if (row.actuals[0] === undefined) {
                  <span class="na-mark">·</span>
                } @else if (row.ok) {
                  <span class="ok-mark">✓</span>
                } @else {
                  <span class="bad-mark">✕</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class TruthTable {
  readonly rows = input.required<TableRow[]>();
  readonly currentRow = input.required<number>();
  readonly inputIds = input.required<readonly InputId[]>();
  readonly labels = input<readonly string[]>([]);
  readonly outputs = input<readonly string[]>(['Y']);

  protected bits(row: number): Bit[] {
    const state = inputsForRow(this.inputIds(), row);
    return this.inputIds().map((id) => state[id]);
  }
}
