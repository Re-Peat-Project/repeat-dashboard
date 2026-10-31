import { useMemo } from 'react'
import { useT } from '../lib/i18n'

export type LandRow = { layer: string; class: string; label: string; peat_km2: number; burned_peat_km2: number; hs_now_peat: number }
const GROUPS: { layer: string; title: string; classes: [string, string, string][] }[] = [
  { layer: 'forest', title: 'Forest area function', classes: [['cons', 'Conservation', '#6250d6'], ['hl', 'Protection forest', '#008300'], ['prod', 'Production forest', '#eda100'], ['hpk', 'Convertible production', '#e87ba4'], ['apl', 'Other land use', '#c9c8c0'], ['other', 'Water, undefined', '#9fb3c1']] },
  { layer: 'feg', title: 'Peat function', classes: [['lindung', 'Protected function', '#008300'], ['budidaya', 'Cultivation function', '#eda100']] },
]
const ROWS: [keyof LandRow, string][] = [['peat_km2', 'Peat area'], ['burned_peat_km2', 'Burned peat'], ['hs_now_peat', 'Hotspots this year']]
const f0 = (v: number) => Math.round(v).toLocaleString()

/** Where the peat, the burned peat and this year's hotspots fall on each land-status layer: a segment wider in the lower bars than in the top bar means fire is over-represented in that class. */
export function LandStatus({ rows }: { rows: LandRow[] }) {
  const t = useT()
  const groups = useMemo(() => GROUPS.map((g) => {
    const rs = rows.filter((r) => r.layer === g.layer)
    const tot = ROWS.map(([k]) => rs.reduce((a, r) => a + (+r[k] || 0), 0))
    return { ...g, rs, tot }
  }).filter((g) => g.rs.length), [rows])
  if (!groups.length) return null
  return (
    <div className="card p-3">
      <div className="mb-1 font-medium">{t('Land status of the peat')}</div>
      {groups.map((g) => (
        <div key={g.layer} className="mb-3">
          <div className="muted text-xs">{t(g.title)}</div>
          <div className="mb-1 flex flex-wrap gap-x-3 text-xs">{g.classes.filter(([c]) => g.rs.some((r) => r.class === c && r.peat_km2 > 0)).map(([c, l, col]) => { const r = g.rs.find((x) => x.class === c)!
            return <span key={c}><i className="chip" style={{ background: col }} />{t(l)} <span className="muted">{g.tot[0] ? Math.round((100 * r.peat_km2) / g.tot[0]) : 0}%</span></span> })}</div>
          {ROWS.map(([k, l], j) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="muted w-28 shrink-0">{t(l)}</span>
              <div className="flex h-3.5 flex-1 gap-px overflow-hidden rounded">
                {g.classes.map(([c, cl, col]) => { const v = +(g.rs.find((r) => r.class === c)?.[k] ?? 0); return v > 0 && g.tot[j] ? <i key={c} style={{ width: `${(100 * v) / g.tot[j]}%`, background: col }} title={`${t(cl)}: ${k === 'hs_now_peat' ? f0(v) : `${f0(v)} km²`} (${Math.round((100 * v) / g.tot[j])}%)`} /> : null })}
              </div>
              <span className="w-16 shrink-0 text-right">{k === 'hs_now_peat' ? f0(g.tot[j]) : `${f0(g.tot[j])} km²`}</span>
            </div>
          ))}
        </div>
      ))}
      <p className="muted text-xs">{t('Burned peat: burned at least once in 2015 to 2025. Hotspots: MODIS this year on peat, medium and high confidence.')}</p>
    </div>
  )
}
