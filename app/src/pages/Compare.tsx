import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mean } from 'd3-array'
import { DataTable, type Col } from '../components/DataTable'
import { LineChart, type Series } from '../components/LineChart'
import { MiniMap, type MapMode } from '../components/MiniMap'
import { loadCatalog, loadManifest, readJson, readTable, type CatalogEntry, type Manifest } from '../lib/data'
import { useT } from '../lib/i18n'
import type { ScoringData } from '../lib/scoring'

const DEM_COLOR: Record<string, string> = { lidar: 'var(--s1)', deltadtm: 'var(--s2)', demnas: 'var(--s3)' }
const DEMS = ['lidar', 'deltadtm', 'demnas']
type Panel = 'balance' | 'groundwater' | 'fire' | 'maps'
type KhgData = { cat: CatalogEntry; mf: Manifest; units: any[]; balUnits: any[]; balance: Series[]; depth: Series[]; fire: { medium: Map<number, number>; high: Map<number, number> }; deficit: number | null }

const ymDate = (ym: number) => new Date(Math.floor(ym / 100), (ym % 100) - 1, 15)

export default function Compare() {
  const t = useT()
  const [cat, setCat] = useState<CatalogEntry[]>([])
  const [D, setD] = useState<ScoringData | null>(null)
  const [data, setData] = useState<Record<string, KhgData>>({})
  const [dem, setDem] = useState('deltadtm')
  const [panel, setPanel] = useState<Panel>('maps')
  const [order, setOrder] = useState<'name' | 'area'>('name')
  const [off, setOff] = useState<Set<string>>(new Set())
  const [perArea, setPerArea] = useState(true)
  const [mapMode, setMapMode] = useState<MapMode>('sat')
  const [mapAttr, setMapAttr] = useState('u_wb_mean')

  useEffect(() => { loadCatalog().then(setCat); readJson<ScoringData>('national/scoring.json').then(setD) }, [])
  const info = (id: string) => {
    if (!D) return { peat: null as number | null, area: null as number | null }
    const i = D.khg.id.indexOf(id)
    return i < 0 ? { peat: null, area: null } : { peat: D.khg.peat[i], area: D.khg.area[i] }
  }

  // everything this view needs, per KHG and DEM (tables are cached by the loader)
  useEffect(() => {
    if (!cat.length) return
    let live = true
    Promise.all(cat.map(async (c) => {
      const mf = await loadManifest(c.code)
      const tb = (id: string, d: string | null) => mf.tables.find((x) => x.id === id && x.dem === d)
      const rd = async (f?: { file: string }) => (f ? readTable(`khg/${c.code}/${f.file}`) : [])
      const gw = mf.groundwater.find((g) => g.dem === dem)
      const [bal, series, pts, def, units, balUnits] = await Promise.all([rd(tb('balance_monthly', dem)), rd(gw?.files.find((f) => f.id === 'model_series')), rd(mf.points[0]), rd(tb('deficit_khg', null)), rd(tb('subkhg_priority', dem)), rd(tb('balance_unit', dem))])
      const byMonth = new Map<string, number[]>()
      for (const r of bal as any[]) { const a = byMonth.get(r.month) ?? []; a.push(r.WB_mm); byMonth.set(r.month, a) }
      const balance: Series[] = byMonth.size ? [{ name: t('Monthly water balance (mm)'), color: 'var(--s1)', points: [...byMonth].sort().map(([k, v]) => ({ x: new Date(`${k}-15`), y: mean(v) as number })) }] : []
      const depth: Series[] = (series as any[]).length ? [
        { name: 'All free cells', color: 'var(--s7)', points: (series as any[]).map((r) => ({ x: new Date(r.date), y: r.mean_depth_cm })) },
        { name: 'Open land', color: 'var(--s3)', points: (series as any[]).map((r) => ({ x: new Date(r.date), y: r.unmanaged_mean_depth_cm })) }] : []
      const fire = { medium: new Map<number, number>(), high: new Map<number, number>() }
      for (const p of pts as any[]) if (p.conf === 'medium' || p.conf === 'high') fire[p.conf as 'medium' | 'high'].set(p.ym, (fire[p.conf as 'medium' | 'high'].get(p.ym) ?? 0) + 1)
      return [c.code, { cat: c, mf, units: units as any[], balUnits: balUnits as any[], balance, depth, fire, deficit: (def as any[])[0]?.deficit_mm ?? null } as KhgData] as const
    })).then((e) => { if (live) setData(Object.fromEntries(e)) })
    return () => { live = false }
  }, [cat, dem, t])

  const list = useMemo(() => {
    const l = cat.filter((c) => !off.has(c.code))
    const key = (c: CatalogEntry) => (order === 'name' ? c.name : -(info(c.khg_id).area ?? 0))
    return [...l].sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0 })
  }, [cat, off, order, D])

  const rows = useMemo(() => cat.map((c) => {
    const d = data[c.code], i = info(c.khg_id), gw = d?.mf.groundwater.find((g) => g.dem === dem)
    const m = gw?.station_scores?.all?.model
    return { code: c.code, nama: c.name.replace(/^KHG /, ''), province: c.province ?? '', peat: i.peat, area: i.area, dems: c.dems.join(' · '),
      stations: m?.n ?? null, bias: m?.bias_cm ?? null, rmse: m?.rmse_cm ?? null, deficit: d?.deficit ?? null, run: gw ? 1 : 0 }
  }), [cat, data, dem, D])

  const fmt = (d: number) => (v: number | null) => (v == null ? '–' : v.toFixed(d))
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'nama', label: t('KHG') }, { key: 'province', label: t('Province') },
    { key: 'peat', label: t('Peat (km²)'), align: 'right', fmt: (v) => (v == null ? '–' : Math.round(v).toLocaleString()) },
    { key: 'area', label: t('Area (km²)'), align: 'right', fmt: (v) => (v == null ? '–' : Math.round(v).toLocaleString()) },
    { key: 'dems', label: t('DEM') },
    { key: 'deficit', label: t('Station-based deficit'), unit: 'mm', align: 'right', fmt: fmt(0) },
    { key: 'stations', label: t('Model stations'), align: 'right', fmt: (v) => (v == null ? '–' : String(v)) },
    { key: 'bias', label: t('Bias (cm)'), align: 'right', fmt: fmt(1) }, { key: 'rmse', label: t('RMSE (cm)'), align: 'right', fmt: fmt(1) },
  ]

  // shared scales so the panels are comparable
  const ext = (get: (d: KhgData) => number[]): [number, number] | undefined => {
    const v = list.flatMap((c) => (data[c.code] ? get(data[c.code]) : [])).filter(Number.isFinite)
    return v.length ? [Math.min(0, Math.min(...v)), Math.max(...v)] : undefined
  }
  const fireSeries = (d: KhgData, area: number | null): Series[] => (['medium', 'high'] as const).map((conf) => {
    const k = perArea && area ? 100 / area : 1
    return { name: t(`${conf} confidence`), color: conf === 'high' ? 'var(--s8)' : 'var(--s7)', points: [...d.fire[conf]].sort((a, b) => a[0] - b[0]).map(([ym, n]) => ({ x: ymDate(ym), y: n * k })) }
  })
  // one colour domain for all KHG, so the maps are comparable
  const mapDomain = useMemo<[number, number] | null>(() => {
    if (mapMode !== 'units' && mapMode !== 'balance') return null
    const v = list.flatMap((c) => { const d = data[c.code]; return d ? (mapMode === 'units' ? d.units : d.balUnits).map((r) => r[mapAttr]) : [] }).filter((x) => typeof x === 'number' && Number.isFinite(x))
    return v.length ? [Math.min(...v), Math.max(...v)] : null
  }, [list, data, mapMode, mapAttr])
  const unitAttrs: [string, string][] = mapMode === 'units' ? [['u_deficit', 'Water deficit'], ['u_wb_mean', 'Mean water balance (mm)'], ['u_deficit_months', 'Deficit months']]
    : [['u_wb_mean', 'Mean water balance (mm)'], ['u_deficit_months', 'Deficit months']]
  const balDom = useMemo(() => ext((d) => d.balance[0]?.points.map((p) => p.y) ?? []), [list, data])
  const depthDom = useMemo(() => ext((d) => d.depth.flatMap((s) => s.points.map((p) => p.y))), [list, data])
  const fireDom = useMemo(() => ext((d) => fireSeries(d, info(d.cat.khg_id).area).flatMap((s) => s.points.map((p) => p.y))), [list, data, perArea, D])
  const xDom = (series: (d: KhgData) => Series[]): [Date, Date] | undefined => {
    const x = list.flatMap((c) => (data[c.code] ? series(data[c.code]).flatMap((s) => s.points.map((p) => +p.x)) : []))
    return x.length ? [new Date(Math.min(...x)), new Date(Math.max(...x))] : undefined
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="card p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div className="text-base font-semibold">{t('Compare KHG')}</div>
          <div className="flex items-center gap-1"><span className="muted text-xs">{t('DEM')}</span>
            {DEMS.map((d) => <button key={d} className="btn text-xs" aria-pressed={dem === d} onClick={() => setDem(d)}><i className="chip" style={{ background: DEM_COLOR[d] }} />{d}</button>)}</div>
          <div className="flex items-center gap-1"><span className="muted text-xs">{t('Sort by')}</span>
            {([['area', 'Area (km²)'], ['name', 'KHG']] as const).map(([k, l]) => <button key={k} className="btn text-xs" aria-pressed={order === k} onClick={() => setOrder(k)}>{t(l)}</button>)}</div>
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {cat.map((c) => <button key={c.code} className="btn text-xs" aria-pressed={!off.has(c.code)} onClick={() => setOff((s) => { const n = new Set(s); n.has(c.code) ? n.delete(c.code) : n.add(c.code); return n })}>{c.name.replace(/^KHG Sungai /, '').replace(/^KHG /, '')}</button>)}
        </div>
        <DataTable rows={rows} cols={cols} rowKey="code" searchKeys={['nama', 'province']} limit={50} initialSort={{ key: 'nama', dir: 1 }} />
        <div className="muted mt-1 text-xs">{t('Model results are in development.')}</div>
      </div>

      <div className="flex flex-wrap gap-1">
        {([['maps', 'Maps'], ['balance', 'Climatic balance'], ['groundwater', 'Groundwater model'], ['fire', 'Fire']] as const).map(([k, l]) =>
          <button key={k} className="btn" aria-pressed={panel === k} onClick={() => setPanel(k)}>{t(l)}</button>)}
        {panel === 'fire' && <button className="btn ml-auto text-xs" aria-pressed={perArea} onClick={() => setPerArea(!perArea)}>{t('per 100 km² of KHG')}</button>}
        {panel === 'groundwater' && <span className="muted ml-auto self-center text-xs">{t('Groundwater model')}: {t('in development')}</span>}
      </div>

      {panel === 'maps' ? (
        <div className="flex flex-col gap-2">
          <div className="card flex flex-wrap items-center gap-2 p-2">
            <span className="muted text-xs">{t('Layer')}</span>
            <select className="card px-2 py-1" value={mapMode} onChange={(e) => { const m = e.target.value as MapMode; setMapMode(m); setMapAttr('u_wb_mean') }}>
              {([['sat', 'Satellite image only'], ['relief', 'DEM relief'], ['depth', 'Groundwater model: mean depth, dry season'], ['days', 'Groundwater model: days deeper than 40 cm'], ['units', 'Sub-KHG units'], ['balance', 'Climatic balance per sub-KHG']] as const).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
            {(mapMode === 'units' || mapMode === 'balance') && <select className="card px-2 py-1" value={mapAttr} onChange={(e) => setMapAttr(e.target.value)}>{unitAttrs.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>}
            <MapLegend mode={mapMode} domain={mapDomain} t={t} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((c) => { const d = data[c.code]; return (
              <div key={c.code}><div className="mb-0.5 flex items-center justify-between px-1 text-sm"><span className="truncate font-medium" title={c.name}>{c.name.replace(/^KHG /, '')}</span>
                <Link className="muted text-xs underline" to={`/khg/${c.code}`}>{t('Open profile')}</Link></div>
                {d ? <MiniMap mf={d.mf} dem={dem} mode={mapMode} attr={mapAttr} domain={mapDomain} /> : <div className="card muted p-3 text-sm">{t('Loading')}…</div>}</div>) })}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((c) => {
            const d = data[c.code]
            const title = c.name.replace(/^KHG /, '')
            const link = <Link className="muted text-xs underline" to={`/khg/${c.code}`}>{t('Open profile')}</Link>
            if (!d) return <div key={c.code} className="card muted p-3 text-sm">{title}: {t('Loading')}…</div>
            const series = panel === 'balance' ? d.balance : panel === 'groundwater' ? d.depth : fireSeries(d, info(c.khg_id).area)
            if (!series.length || !series[0].points.length) return <div key={c.code} className="card p-3 text-sm"><div className="font-medium">{title}</div><div className="muted">{t('Not available for this DEM')}</div></div>
            const gw = d.mf.groundwater.find((g) => g.dem === dem)?.station_scores?.all?.model
            return (
              <div key={c.code}>
                <LineChart title={title} series={series} compact height={150} sync
                  yDomain={panel === 'balance' ? balDom : panel === 'groundwater' ? depthDom : fireDom}
                  xDomain={xDom((x) => (panel === 'balance' ? x.balance : panel === 'groundwater' ? x.depth : fireSeries(x, null)))}
                  fmt={(v) => (panel === 'fire' && perArea ? v.toFixed(2) : v.toFixed(panel === 'balance' ? 0 : 1))} zeroBase={panel !== 'balance'} />
                <div className="muted flex items-center justify-between px-1 pt-0.5 text-xs">
                  <span>{panel === 'groundwater' && gw ? (gw.bias_cm != null ? `${gw.n} ${t('stations')} · ${t('Bias (cm)')} ${gw.bias_cm.toFixed(1)}` : `${gw.n} ${t('stations')}: ${t('not testable, too few stations')}`) : ''}</span>{link}
                </div>
              </div>)
          })}
        </div>
      )}
    </div>
  )
}

const SEQ = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b']
const FIELD = ['#ebf4fa', '#add0e8', '#68a4d0', '#3475af', '#184880', '#082352']

function MapLegend({ mode, domain, t }: { mode: MapMode; domain: [number, number] | null; t: (s: string) => string }) {
  const bar = (colors: string[], lo: string, hi: string, label: string) => (
    <div className="ml-auto flex items-center gap-2 text-xs"><span className="muted">{label}</span><span>{lo}</span>
      <span className="h-2.5 w-40 rounded" style={{ background: `linear-gradient(to right, ${colors.join(',')})` }} /><span>{hi}</span></div>)
  if (mode === 'depth') return bar(FIELD, '0', '100 cm', t('Mean depth'))
  if (mode === 'days') return bar(FIELD, '0', t('season length'), t('Days deeper than 40 cm'))
  if (mode === 'units' || mode === 'balance') return domain ? bar(SEQ, domain[0].toPrecision(3), domain[1].toPrecision(3), t('Same scale for every KHG')) : null
  if (mode === 'relief') return <span className="muted ml-auto text-xs">{t('Height tint is scaled to each KHG')}</span>
  return null
}
