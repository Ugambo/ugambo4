'use client';

import { useId, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export interface BarDatum {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 56 };

/** Rounds the axis maximum to a readable number (1, 2 or 5 times a power of ten). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/**
 * One series of bars by day. Single series: the title names it, so there is no
 * legend. Each bar has a hover/focus tooltip and the values are also in a table.
 */
export function BarChart({
  title,
  data,
  format,
  valueLabel,
  integer = false,
}: {
  title: string;
  data: BarDatum[];
  format: (v: number) => string;
  valueLabel: string;
  /** Counts: the axis only shows whole numbers. */
  integer?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(4, slot - 2); // 2px gap between bars
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // Whole-number series (counts) never get a fractional middle tick.
  const ticks = integer && max % 2 !== 0 ? [0, max] : [0, max / 2, max];
  const shortDate = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

  return (
    <figure className="chart" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="chart-title">
        {title}
      </figcaption>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="chart-grid" />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="chart-axis">
                {format(v)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * slot + 1;
            const h = Math.max(0, PAD.top + innerH - y(d.value));
            const r = Math.min(4, h / 2, barW / 2);
            const top = PAD.top + innerH - h;
            // Rounded data end (top), square at the baseline.
            const path =
              h <= 0
                ? ''
                : `M${x},${PAD.top + innerH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + innerH} Z`;
            return (
              <g
                key={d.date}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${formatDate(d.date)}: ${format(d.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {/* The hit area is the whole day slot, not just the painted bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                />
                {path && (
                  <path d={path} className={`chart-bar${hover === i ? ' chart-bar-hover' : ''}`} />
                )}
                {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="chart-axis">
                    {shortDate(d.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div
            className="chart-tooltip"
            role="status"
            style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%` }}
          >
            <strong>{format(data[hover].value)}</strong>
            <span>{formatDate(data[hover].date)}</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>{t('common.showTable')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('chart.date')}</th>
              <th className="num">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{formatDate(d.date)}</td>
                <td className="num">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
