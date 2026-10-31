import { useMemo, useState } from 'react'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Hotspot } from '../lib/investigation'

const RAMP = ['#f6f0e8', '#fdcc8a', '#fc8d59', '#e34a33', '#7f0000']

/** Hotspots per month and year: the seasons and the bad years at a glance. Click a cell to select that month. */
export function MonthYearHeat({ points, high, peat, year, start, end, onPick, title }: { points: Hotspot[]; high: boolean; peat: boolean; year: number; start: number; end: number; onPick: (year: number, month: number) => void; title: string }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const [tip, setTip] = useState<string | null>(null)
  const { cells, years, max } = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of points) if ((high ? p.conf === 'high' : p.conf === 'high' || p.conf === 'medium') && (!peat || p.peat)) m.set(p.ym, (m.get(p.ym) ?? 0) + 1)
    const ys = [...new Set(points.map((p) => Math.floor(p.ym / 100)))].sort((a, b) => a - b)
    return { cells: m, years: ys, max: Math.max(1, ...m.values()) }
  }, [points, high, peat])
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: 'narrow' }).format(new Date(2026, i, 1)))
  const cw = 22, ch = 14, l = 34, tpad = 14
  const color = (n: number) => (n <= 0 ? 'var(--line)' : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(Math.sqrt(n / max) * (RAMP.length - 1.001)))])
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between"><div className="font-medium">{title}</div><span className="muted text-xs">{tip ?? t('Click a cell to select the month')}</span></div>
      <svg width="100%" viewBox={`0 0 ${l + cw * 12} ${tpad + ch * years.length + 4}`} role="img" aria-label={title} className="mt-1 block">
        {months.map((m, i) => <text key={i} x={l + cw * i + cw / 2} y={10} textAnchor="middle" fontSize="9" fill="var(--muted)">{m}</text>)}
        {years.map((y, r) => <g key={y}>
          <text x={l - 4} y={tpad + ch * r + ch - 3} textAnchor="end" fontSize="9" fill={y === year ? 'var(--ink)' : 'var(--muted)'} fontWeight={y === year ? 700 : 400}>{y}</text>
          {months.map((_, i) => { const n = cells.get(y * 100 + i + 1) ?? 0, on = y === year && i + 1 >= start && i + 1 <= end && (start !== 1 || end !== 12)
            return <rect key={i} x={l + cw * i + 1} y={tpad + ch * r + 1} width={cw - 2} height={ch - 2} rx={2} fill={color(n)} stroke={on ? 'var(--ink)' : 'none'} strokeWidth={1.5} style={{ cursor: 'pointer' }}
              onClick={() => onPick(y, i + 1)} onMouseEnter={() => setTip(`${new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, i, 1))} ${y}: ${n.toLocaleString()}`)} onMouseLeave={() => setTip(null)}><title>{`${y}-${String(i + 1).padStart(2, '0')}: ${n}`}</title></rect> })}
        </g>)}
      </svg>
    </div>
  )
}
