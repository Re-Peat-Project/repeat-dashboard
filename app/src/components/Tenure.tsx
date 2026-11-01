import { useEffect, useMemo, useState } from 'react'
import { LineChart, type Series } from './LineChart'
import { readTable, readJson } from '../lib/data'
import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'

type Area = { khg_id: string; khg: string; tenure: string; sub: string; dmpg: boolean; area_km2: number; peat_km2: number; burned_peat_km2: number }
type Hot = { khg_id: string; tenure: string; sub: string; dmpg: boolean; year: number; conf: string; n: number }
type Win = { window_end: string; last_2026: string }
export type TenureData = { area: Area[]; hot: Hot[]; win: Win | null }

const PAST = [2015, 2025] as const          // comparison years: the same calendar window of each
const TENURE: Record<string, { label: string; color: string }> = {
  licence: { label: 'Business licence', color: 'var(--s2)' },
  forest: { label: 'Forest area, no licence', color: 'var(--s6)' },
  other_land: { label: 'Other land', color: 'var(--s1)' },
}
const SUB: Record<string, string> = { sawit: 'Oil palm', tambang: 'Mining', pphtr: 'Plantation forest (PPHTR)', pbph: 'Forest concession (PBPH)', conservation: 'Conservation', protection: 'Protection forest', production: 'Production forest', convertible: 'Convertible production', other: 'Other land' }

export function useTenure(): TenureData | null {
  const [d, setD] = useState<TenureData | null>(null)
  useEffect(() => {
    Promise.all([readTable<Area>('national/tenure_area.parquet'), readTable<Hot>('national/tenure_hotspots.parquet'), readJson<Win>('national/tenure_window.json').catch(() => null)])
      .then(([area, hot, win]) => setD({ area, hot, win })).catch(() => setD(null))
  }, [])
  return d
}

export type Group = { key: string; label: string; color: string; tenure: string; peat: number; burned: number; hs26: number; hsPast: number; r26: number; rPast: number; ratio: number | null; few: boolean; yearly: Map<number, number> }

/** Hotspots per 100 km² of peat by tenure class (optionally by detail class and DMPG village land), pooled over the chosen KHG. */
export function groups(d: TenureData, khg: string[] | null, high: boolean, detail: boolean, split: boolean): Group[] {
  const pick = (r: { khg_id: string }) => !khg || khg.includes(r.khg_id)
  const keyOf = (r: { tenure: string; sub: string; dmpg: boolean }) => `${r.tenure}${detail ? `:${r.sub}` : ''}${split ? (r.dmpg ? ':dmpg' : ':other') : ''}`
  const m = new Map<string, Group>()
  const get = (r: { tenure: string; sub: string; dmpg: boolean }) => {
    const key = keyOf(r)
    if (!m.has(key)) {
      const base = detail ? SUB[r.sub] ?? r.sub : TENURE[r.tenure].label
      m.set(key, { key, tenure: r.tenure, color: TENURE[r.tenure].color, label: `${base}${split ? (r.dmpg ? ' · DMPG village' : ' · outside DMPG') : ''}`, peat: 0, burned: 0, hs26: 0, hsPast: 0, r26: 0, rPast: 0, ratio: null, few: false, yearly: new Map() })
    }
    return m.get(key)!
  }
  for (const r of d.area) if (pick(r)) { const g = get(r); g.peat += r.peat_km2; g.burned += r.burned_peat_km2 }
  const counts = new Map<string, Map<number, number>>()
  for (const r of d.hot) if (pick(r) && (!high || r.conf === 'high')) {
    const g = get(r)
    const c = counts.get(g.key) ?? new Map<number, number>()
    c.set(r.year, (c.get(r.year) ?? 0) + r.n)
    counts.set(g.key, c)
  }
  const nPast = PAST[1] - PAST[0] + 1
  for (const g of m.values()) {
    const c = counts.get(g.key) ?? new Map<number, number>()
    g.hs26 = c.get(2026) ?? 0
    for (let y = PAST[0]; y <= PAST[1]; y++) g.hsPast += (c.get(y) ?? 0) / nPast
    for (const [y, n] of c) if (g.peat > 0) g.yearly.set(y, (100 * n) / g.peat)
    g.r26 = g.peat > 0 ? (100 * g.hs26) / g.peat : 0
    g.rPast = g.peat > 0 ? (100 * g.hsPast) / g.peat : 0
    g.ratio = g.rPast > 0 ? g.r26 / g.rPast : null
    g.few = g.peat < 5 || g.hs26 + g.hsPast * nPast < 20
  }
  const order = Object.keys(TENURE)
  return [...m.values()].filter((g) => g.peat > 0).sort((a, b) => order.indexOf(a.tenure) - order.indexOf(b.tenure) || b.peat - a.peat)
}

const f0 = (v: number) => Math.round(v).toLocaleString()
const f1 = (v: number) => (v >= 100 ? f0(v) : v.toFixed(1))

/** One KHG, or the pooled profiled KHG when `khg` is null: rate bars (this year against the earlier mean), yearly lines. */
export function TenurePanel({ data, khg, scope }: { data: TenureData; khg: string[] | null; scope: string }) {
  const t = useT()
  const high = useStore((s) => s.fire.high)
  const [detail, setDetail] = useState(false)
  const [split, setSplit] = useState(false)
  const gs = useMemo(() => groups(data, khg, high, detail, split), [data, khg, high, detail, split])
  const top = Math.max(1e-9, ...gs.flatMap((g) => [g.r26, g.rPast]))
  const lines: Series[] = useMemo(() => gs.filter((g) => !g.few).map((g, i) => ({
    name: g.label, color: split || detail ? `var(--s${[2, 6, 1, 4, 5, 7, 8, 3][i % 8]})` : g.color, dash: split && g.key.endsWith(':other') ? '4 3' : undefined,
    points: [...g.yearly].sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ x: new Date(y, 6, 1), y: v })),
  })), [gs, split, detail])
  const end = data.win?.last_2026 ?? ''
  if (!gs.length) return null
  return (
    <div className="card p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="font-medium">{t('Fire by land tenure')} · {scope}</div>
        <label className="muted ml-auto text-xs"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> {t('Detail classes')}</label>
        <label className="muted text-xs"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> {t('Split by DMPG village land')}</label>
      </div>
      <div className="muted mb-2 text-xs">{t('Hotspots on peat per 100 km² of peat, 1 January to')} {end ? end.slice(5).replace('-', '/') : ''}: <b style={{ color: 'var(--ink)' }}>2026</b> {t('(bar) against the mean of 2015 to 2025 (tick)')} · {high ? t('high confidence') : t('medium + high confidence')}</div>
      <div className="flex flex-col gap-2 text-xs">
        {gs.map((g) => (
          <div key={g.key} style={{ opacity: g.few ? 0.55 : 1 }}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate" title={t(g.label)}><i className="chip" style={{ background: g.color }} />{t(g.label.split(' · ')[0])}{g.label.includes(' · ') ? <span className="muted"> · {t(g.label.split(' · ')[1])}</span> : null}</span>
              <span className="muted">{f0(g.peat)} km²</span>
              <span className="w-28 text-right">{f1(g.r26)} <span className="muted">/ {f1(g.rPast)}</span>{g.ratio != null && <b className="ml-1">×{g.ratio >= 10 ? Math.round(g.ratio) : g.ratio.toFixed(1)}</b>}</span>
            </div>
            <div className="relative mt-0.5 h-3 rounded" style={{ background: 'color-mix(in srgb, var(--ink) 7%, transparent)' }} title={`2026: ${f0(g.hs26)} ${t('hotspots')} · ${t('mean 2015 to 2025')}: ${f1(g.hsPast)}`}>
              <i className="absolute left-0 top-0 h-full rounded" style={{ width: `${(100 * g.r26) / top}%`, background: g.color }} />
              <i className="absolute top-[-2px] h-[16px] w-[2px]" style={{ left: `${(100 * g.rPast) / top}%`, background: 'var(--ink)' }} />
            </div>
          </div>
        ))}
      </div>
      {gs.some((g) => g.few) && <div className="muted mt-1 text-xs">{t('Faded rows have few detections or little peat; read with care.')}</div>}
      {lines.length > 0 && <div className="mt-3"><LineChart title={`${t('Hotspots per 100 km² of peat per year')} (${t('same calendar window')})`} series={lines} zeroBase yLabel="/100 km²" fmt={f1} xDomain={[new Date(2011, 6, 1), new Date(2026, 6, 1)]} /></div>}
      <p className="muted mt-2 text-xs">{t('Each point of the KHG takes one class, in this order: business licence, forest area without a licence, other land. DMPG village land can fall in any class. A comparison of rates is an association; it does not show the cause of a fire or who is responsible.')}</p>
    </div>
  )
}

/** Dot plot over the profiled KHG: this year's rate divided by the 2015-2025 mean (same calendar window), one dot per tenure class, log scale. */
export function TenureAcross({ data, names, onPick }: { data: TenureData; names: Map<string, string>; onPick?: (khgId: string) => void }) {
  const t = useT()
  const high = useStore((s) => s.fire.high)
  const rows = useMemo(() => [...new Set(data.area.map((r) => r.khg_id))].map((id) => {
    const gs = groups(data, [id], high, false, false)
    return { id, name: names.get(id) ?? id, gs: Object.fromEntries(gs.map((g) => [g.tenure, g])) as Record<string, Group> }
  }).sort((a, b) => (b.gs.forest?.ratio ?? 0) - (a.gs.forest?.ratio ?? 0)), [data, high, names])
  const TICKS = [0.1, 0.25, 0.5, 1, 2, 4, 10]
  const lo = Math.log10(0.1), hi = Math.log10(10)
  const X = (r: number) => 3 + ((Math.log10(Math.min(10, Math.max(0.1, r))) - lo) / (hi - lo)) * 94
  return (
    <div className="card p-3">
      <div className="mb-1 font-medium">{t('2026 against earlier years, by land tenure')}</div>
      <div className="muted mb-2 flex flex-wrap gap-x-3 text-xs">{Object.entries(TENURE).map(([k, v]) => <span key={k}><i className="chip" style={{ background: v.color }} />{t(v.label)}</span>)}
        <span>{t('Ratio of the 2026 rate to the 2015 to 2025 mean, same calendar window; 1 = as in earlier years. Hollow dots: few detections. Dots at the ends of the axis are beyond it.')}</span></div>
      <div className="grid gap-y-0.5 text-xs" style={{ gridTemplateColumns: 'minmax(8rem,14rem) 1fr' }}>
        {rows.map((r) => (
          <div key={r.id} className="contents">
            <button className="truncate text-left hover:underline" onClick={() => onPick?.(r.id)} title={r.name}>{r.name.replace(/^KHG /, '')}</button>
            <svg viewBox="0 0 100 10" className="h-4 w-full" preserveAspectRatio="none" aria-hidden>
              {TICKS.map((v) => <line key={v} x1={X(v)} x2={X(v)} y1={0} y2={10} stroke="var(--ink)" strokeOpacity={v === 1 ? 0.55 : 0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
              {Object.entries(TENURE).map(([k, v]) => { const g = r.gs[k]; return g && g.ratio != null ? <ellipse key={k} cx={X(g.ratio)} cy={5} rx={1.1} ry={3.6} fill={g.few ? 'var(--surface)' : v.color} stroke={v.color} strokeWidth={1} vectorEffect="non-scaling-stroke"><title>{`${t(v.label)}: ×${g.ratio.toFixed(2)} (${f1(g.r26)} / ${f1(g.rPast)} ${t('per 100 km²')}, ${f0(g.peat)} km²)`}</title></ellipse> : null })}
            </svg>
          </div>
        ))}
        <span /><div className="muted relative h-4">{TICKS.map((v) => <span key={v} className="absolute -translate-x-1/2" style={{ left: `${X(v)}%` }}>{v === 0.1 ? '≤' : v === 10 ? '≥' : '×'}{v}</span>)}</div>
      </div>
    </div>
  )
}
