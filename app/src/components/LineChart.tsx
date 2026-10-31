import { useEffect, useMemo, useRef, useState } from 'react'
import { extent, bisector } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { area as d3area, line } from 'd3-shape'
import { timeFormat } from 'd3-time-format'
import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'

export type Series = { name: string; color: string; points: { x: Date; y: number }[]; dash?: string }

/** Lines with a crosshair tooltip, a legend for two or more series, and a table view. */
export function LineChart({ title, series, yLabel, height = 190, fmt = (v: number) => v.toFixed(1), zeroBase = false, yDomain, xDomain, sync = false, compact = false, selectedRange, onDateSelect, area = zeroBase }: {
  title: string; series: Series[]; yLabel?: string; height?: number; fmt?: (v: number) => string; zeroBase?: boolean
  yDomain?: [number, number]; xDomain?: [Date, Date]; sync?: boolean; compact?: boolean   // sync: crosshair follows the other synced charts
  selectedRange?: [Date, Date]; onDateSelect?: (date: Date) => void; area?: boolean   // area: light fill under each line, a peak label on a single series
}) {
  const hoverDate = useStore((s) => s.hoverDate)
  const setHoverDate = useStore((s) => s.setHoverDate)
  const ref = useRef<SVGSVGElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const t = useT()
  const [w, setW] = useState(480)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const observer = new ResizeObserver(() => { const s = getComputedStyle(el); setW(Math.max(180, el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight))) })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const m = { l: 48, r: 28, t: 20, b: 26 }
  const all = useMemo(() => series.flatMap((s) => s.points).filter(p => Number.isFinite(+p.x) && Number.isFinite(p.y)), [series])
  const dates = extent(all, p => p.x)
  const dom = (xDomain ?? (dates[0] ? dates : [new Date(2026, 0, 1), new Date(2026, 11, 31)])) as [Date, Date]
  const x = scaleTime().domain(dom).range([m.l, w - m.r])
  const ye = extent(all, (p) => p.y) as [number, number]
  const y = scaleLinear().domain(yDomain ?? [zeroBase ? Math.min(0, ye[0] ?? 0) : ye[0] ?? 0, ye[1] ?? 1]).nice().range([height - m.b, m.t])
  const path = line<{ x: Date; y: number }>().defined((p) => Number.isFinite(p.y)).x((p) => x(p.x)).y((p) => y(p.y))
  const areaPath = d3area<{ x: Date; y: number }>().defined((p) => Number.isFinite(p.y)).x((p) => x(p.x)).y0(y(Math.max(0, y.domain()[0]))).y1((p) => y(p.y))
  const peak = series.length === 1 && area ? series[0].points.reduce<{ x: Date; y: number } | null>((a, p) => (Number.isFinite(p.y) && (!a || p.y > a.y) ? p : a), null) : null
  const bis = bisector((p: { x: Date }) => p.x).center
  const first = series[0]?.points ?? []
  const at = hover != null ? x.invert(hover) : sync ? hoverDate : null
  const idx = at == null || !first.length || at < dom[0] || at > dom[1] ? null : Math.max(0, Math.min(first.length - 1, bis(first, at)))
  const fmtX = timeFormat('%Y-%m-%d')
  const span = +dom[1] - +dom[0]
  const tableDates = [...new Set(all.map(p => +p.x))].sort((a, b) => a - b)
  const tickFormat = timeFormat(span > 4e10 ? '%Y' : '%b %Y')
  const seenTicks = new Set<string>()
  const xTicks = x.ticks(Math.max(2, Math.floor(w / 110))).filter(d => { const label = tickFormat(d); if (seenTicks.has(label)) return false; seenTicks.add(label); return true })
  const atPoint = (s: Series) => {
    if (!at || !s.points.length || at < s.points[0].x || at > s.points[s.points.length - 1].x) return null
    const i = bisector((p: { x: Date }) => p.x).left(s.points, at)
    const a = s.points[Math.max(0, i - 1)], b = s.points[Math.min(i, s.points.length - 1)]
    const value = +b.x === +a.x ? a.y : a.y + (b.y - a.y) * ((+at - +a.x) / (+b.x - +a.x))
    return Number.isFinite(value) ? value : null
  }

  return (
    <div className={`card ${compact ? "p-2" : "p-3"}`} ref={container}>
      <div className="flex items-center justify-between gap-2">
        <div className={compact ? "truncate text-sm font-medium" : "font-medium"} title={title}>{title}</div>
        <button className="btn text-xs" aria-pressed={table} onClick={() => setTable(!table)}>{t(table ? 'Chart' : 'Table')}</button>
      </div>
      {series.length > 1 && (
        <div className="muted mt-1 flex flex-wrap gap-x-4 text-xs">{series.map((s) => <span key={s.name}><i className="chip" style={{ background: s.color }} />{s.name}</span>)}</div>
      )}
      {!all.length ? <div className="chart-empty" style={{ height }}>{t('No observations available')}</div> : table ? (
        <div className="mt-2 max-h-[190px] overflow-auto text-xs">
          <table className="w-full"><thead><tr><th className="text-left">date</th>{series.map((s) => <th key={s.name} className="text-right">{s.name}</th>)}</tr></thead>
            <tbody>{tableDates.map(d => <tr key={d}><td>{fmtX(new Date(d))}</td>{series.map(s => { const p = s.points.find(p => +p.x === d); return <td key={s.name} className="text-right">{p ? fmt(p.y) : '—'}</td> })}</tr>)}</tbody></table>
        </div>
      ) : (
        <svg ref={ref} role="img" aria-label={`${title}${yLabel ? ` (${yLabel})` : ''}`} width={w} height={height} className="mt-1 block" onClick={(e) => onDateSelect?.(x.invert(Math.max(m.l, Math.min(w - m.r, e.clientX - (ref.current?.getBoundingClientRect().left ?? 0)))))} onMouseLeave={() => { setHover(null); if (sync) setHoverDate(null) }}
          onMouseMove={(e) => { const px = Math.max(m.l, Math.min(w - m.r, e.clientX - (ref.current?.getBoundingClientRect().left ?? 0))); setHover(px); if (sync) setHoverDate(x.invert(px)) }}>
          {selectedRange && <rect x={Math.max(m.l, x(selectedRange[0]))} y={m.t} width={Math.max(0, Math.min(w - m.r, x(selectedRange[1])) - Math.max(m.l, x(selectedRange[0])))} height={height - m.b - m.t} fill="var(--s2)" opacity={0.08} />}
          {y.ticks(4).map((v) => <g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={m.l - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{v}</text></g>)}
          {xTicks.map((d) => <text key={+d} x={x(d)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{tickFormat(d)}</text>)}
          {yLabel && <text x={m.l} y={8} fontSize="10" fill="var(--muted)">{yLabel}</text>}
          {area && series.map((s) => <path key={`a-${s.name}`} d={areaPath(s.points) ?? ''} fill={s.color} opacity={0.12} />)}
          {series.map((s) => <path key={s.name} d={path(s.points) ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />)}
          {series.filter((s) => s.points.length > 1).map((s) => { const e = s.points[s.points.length - 1]; return Number.isFinite(e.y) && <circle key={`e-${s.name}`} cx={x(e.x)} cy={y(e.y)} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} /> })}
          {peak && peak.y > 0 && <text x={Math.max(m.l + 2, Math.min(w - m.r - 2, x(peak.x)))} y={y(peak.y) - 6} textAnchor={x(peak.x) > w - 60 ? 'end' : x(peak.x) < m.l + 30 ? 'start' : 'middle'} fontSize="11" fill="var(--muted)">{fmt(peak.y)}</text>}
          {series.filter(s => s.points.length === 1 && Number.isFinite(s.points[0].y)).map(s => <circle key={s.name} cx={x(s.points[0].x)} cy={y(s.points[0].y)} r={3} fill={s.color} />)}
          {idx != null && first[idx] && <g>
            <line x1={x(at!)} x2={x(at!)} y1={m.t} y2={height - m.b} stroke="var(--muted)" strokeDasharray="3 3" />
            {series.map(s => { const v = atPoint(s); return v != null && <circle key={s.name} cx={x(at!)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> })}
            <g transform={`translate(${Math.max(0, Math.min(x(at!) + 8, w - 150))},${m.t + 4})`}>
              <rect width="142" height={16 + series.length * 14} rx="4" fill="var(--surface)" stroke="var(--line)" />
              <text x="6" y="12" fontSize="10" fill="var(--muted)">{fmtX(at!)}</text>
              {series.map((s, i) => <text key={s.name} x="6" y={26 + i * 14} fontSize="11" fill="var(--ink)">{s.name}: {atPoint(s) != null ? fmt(atPoint(s)!) : '—'}</text>)}
            </g>
          </g>}
        </svg>
      )}
    </div>
  )
}
