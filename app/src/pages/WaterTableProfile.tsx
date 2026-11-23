import { useEffect, useMemo, useRef, useState } from 'react'
import { Seg } from '../components/Seg'
import { WaterMap, type WaterMode } from '../components/WaterMap'
import { readJson } from '../lib/data'
import { useT } from '../lib/i18n'
import type { ScoringData } from '../lib/scoring'
import { useStore } from '../lib/store'
import { DRY_LEVEL, loadWeeklyWater, waterRegions, weekEnd, type WaterData } from '../lib/waterTable'
import { waterColor, WATER_COLORS, WATER_LEVEL_LABELS } from '../lib/waterSurface'

export default function WaterTableProfile() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const [data, setData] = useState<WaterData | null>(null)
  const [error, setError] = useState(false)
  const [names, setNames] = useState(new Map<string, string>())
  const [week, setWeek] = useState<number | null>(null)
  const [kind, setKind] = useState('all')
  const [mode, setMode] = useState<WaterMode>('hexbin')
  const [outlines, setOutlines] = useState(true)
  const [level, setLevel] = useState<'adm1' | 'khg'>('adm1')
  const [focus, setFocus] = useState('')
  const [query, setQuery] = useState('')
  const [metric, setMetric] = useState<'level' | 'dry'>('level')
  const heatmap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadWeeklyWater().then(setData, () => setError(true))
    readJson<ScoringData>('national/scoring.json').then(({ khg }) => setNames(new Map(khg.id.map((id, i) => [id, khg.name[i]])))).catch(() => {})
  }, [])
  const weeks = data?.weeks ?? []
  const current = week ?? (data ? Math.max(0, data.weeks.findLastIndex((w) => weekEnd(w) <= data.through)) : 0)
  useEffect(() => {
    const wrapper = heatmap.current
    const active = wrapper?.querySelector('th[data-current]')
    const label = wrapper?.querySelector('th')
    if (!wrapper || !active || !label) return
    const viewport = wrapper.getBoundingClientRect()
    const column = active.getBoundingClientRect()
    const left = viewport.left + label.getBoundingClientRect().width
    const right = viewport.left + wrapper.clientWidth
    if (column.right > right) wrapper.scrollLeft += column.right - right + 4
    else if (column.left < left) wrapper.scrollLeft -= left - column.left + 4
  }, [data, current, level])
  const regions = useMemo(() => data ? waterRegions(data, level, kind) : [], [data, level, kind])
  const chosen = regions.find((r) => r.id === focus)
  const points = useMemo(() => (data?.stations ?? []).flatMap((s) => {
    const v = s.levels[current]
    return v != null && (kind === 'all' || s.kind === kind) && (!focus || s[level] === focus)
      ? [{ lon: s.lon, lat: s.lat, level: v }] : []
  }), [data, current, kind, focus, level])

  const date = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const fraction = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
  const name = (id: string) => (names.get(id) ?? id).replace(/^KHG /, '')
  const statValue = (s: (typeof regions)[number]['weeks'][number]) => s ? metric === 'level' ? s.level : -s.dry / s.count : Infinity
  const rows = regions.filter((r) => name(r.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => statValue(a.weeks[current]) - statValue(b.weeks[current]) || name(a.id).localeCompare(name(b.id)))

  if (error) return <p role="alert" className="card p-4">{t('Could not load the SiTMAT observations.')}</p>
  if (!data) return <p role="status" className="card p-4">{t('Loading SiTMAT observations…')}</p>
  if (!weeks.length) return <p className="card p-4">{t('No observations available')}</p>
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="water-table-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="water-table-title" className="text-xl font-semibold tracking-tight">{t('Water Table Profile')}</h2>
        <p className="muted text-xs">SiTMAT · {t('to {d}').replace('{d}', data.through)}</p>
      </div>
      <div className="card flex flex-wrap items-end gap-x-4 gap-y-2 p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="muted">{t('Observation week')}</span>
          <select className="btn h-7" value={current} onChange={(e) => setWeek(Number(e.target.value))}>
            {weeks.map((w, i) => <option key={w} value={i}>{date.format(new Date(w))} – {date.format(new Date(weekEnd(w)))}{weekEnd(w) > data.through ? ` (${t('partial week')})` : ''}</option>)}
          </select>
        </label>
        <div className="space-y-1"><p className="muted text-xs">{t('Station type')}</p>
          <Seg value={kind} onChange={(v) => { setKind(v); setFocus('') }} items={[
            { v: 'all', label: t('All stations') }, { v: 'community', label: t('Community') }, { v: 'concession', label: t('Concession') },
          ]} />
        </div>
        <div className="space-y-1"><p className="muted text-xs">{t('Map display')}</p>
          <Seg value={mode} onChange={setMode} items={[
            { v: 'stations', label: t('Stations') }, { v: 'hexbin', label: t('Hexbin') }, { v: 'contour', label: t('Contour') },
          ]} />
        </div>
        <label className="flex h-7 items-center gap-1.5 text-xs"><input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} />{t('KHG boundaries')}</label>
      </div>
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 text-sm">
        <strong>{chosen ? name(chosen.id) : t('Indonesia')}</strong>
        <span><b className="tabular-nums">{points.length.toLocaleString(lang)}</b> {t('reporting stations')}</span>
        <span><b className="tabular-nums">{points.filter((p) => p.level < DRY_LEVEL).length.toLocaleString(lang)}</b> {t('below −40 cm')}</span>
        {focus && <button className="btn text-xs" onClick={() => setFocus('')}>{t('Clear region')}</button>}
      </div>
      <WaterMap points={points} mode={mode} outlines={outlines} focus={focus} />
      <section className="card space-y-3 p-3" aria-labelledby="region-week-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="region-week-title" className="font-semibold">{t('Water levels by region and week')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input className="card px-2 py-1 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search region')} aria-label={t('Search region')} />
            <Seg value={level} onChange={(v) => { setLevel(v); setFocus(''); setQuery('') }} items={[
              { v: 'adm1', label: t('Province') }, { v: 'khg', label: t('KHG') },
            ]} />
            <Seg value={metric} onChange={setMetric} items={[
              { v: 'level', label: t('Median level') }, { v: 'dry', label: t('Share below −40 cm') },
            ]} />
          </div>
        </div>
        <p className="muted text-xs">{t('Each station counts once per week, using its median unflagged reading. Select a cell to show that region and week on the map. Grey cells have no readings.')}</p>
        {metric === 'dry' ? <div className="flex flex-wrap items-center gap-x-2 text-xs muted">
          <span>0%</span><span className="h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg,#fff1cd,#bb552c)' }} /><span>100%</span>
        </div> : <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {WATER_LEVEL_LABELS.map((label, i) =>
            <span key={label} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: WATER_COLORS[i] }} />{t(label)}</span>)}
        </div>}
        <div ref={heatmap} className="relative max-h-[30rem] overflow-auto" tabIndex={0} aria-label={t('Water levels by region and week')}>
          <table className="w-full min-w-max border-separate border-spacing-[2px] text-xs">
            <thead className="sticky top-0 z-20 bg-card"><tr><th scope="col" className="sticky left-0 z-30 bg-card p-1 text-left">{t('Region')}</th>
              {weeks.map((w, i) => <th key={w} scope="col" data-current={i === current ? '' : undefined} className={i === current ? 'px-1 text-foreground' : 'px-1 font-normal muted'}>{date.format(new Date(w))}</th>)}
            </tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 max-w-48 bg-card px-2 py-1 text-left font-medium">
                <button type="button" className="text-left hover:underline" aria-pressed={focus === r.id} onClick={() => setFocus(focus === r.id ? '' : r.id)}>{name(r.id)}</button>
              </th>
              {r.weeks.map((s, i) => {
                if (!s) return <td key={i} className="h-6 rounded-sm bg-muted"><span className="sr-only">{t('No observations available')}</span></td>
                const value = metric === 'level' ? `${Math.round(s.level)} cm` : fraction.format(s.dry / s.count)
                const detail = `${name(r.id)} · ${date.format(new Date(weeks[i]))} · ${value} · ${s.count} ${t('reporting stations')}`
                const color = metric === 'level' ? waterColor(s.level) : `color-mix(in srgb,#bb552c ${s.dry / s.count * 100}%,#fff1cd)`
                return <td key={i} className="p-0"><button type="button" aria-label={detail} title={detail}
                  aria-pressed={i === current && focus === r.id} className="block h-6 w-full rounded-sm border-2 border-transparent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-foreground"
                  style={{ background: color }} onClick={() => { setFocus(r.id); setWeek(i) }} /></td>
              })}
            </tr>)}</tbody>
          </table>
          {!rows.length && <p className="p-2 muted">{t('No matching regions')}</p>}
        </div>
      </section>
    </section>
  )
}
