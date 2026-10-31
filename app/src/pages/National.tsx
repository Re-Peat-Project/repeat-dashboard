import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { median } from 'd3-array'
import { DataTable, type Col } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { LegendCard, RampLegend } from '../components/Legend'
import { LineChart, type Series } from '../components/LineChart'
import { loadCatalog, readJson, readTable, type CatalogEntry } from '../lib/data'
import { useT } from '../lib/i18n'
import { inPeriod, monthDate } from '../lib/investigation'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import type { ScoringData } from '../lib/scoring'
import { useStore } from '../lib/store'

type Yearly = { khg_id: string; year: number; metric: string; value: number }
type Monthly = { khg_id: string; kind: string; ym: number; conf: string; peat: boolean; n: number }
type Grid = { kind: string; ym: number; conf: string; n: number; peat: boolean }

const HEAT = ['#e9e8e2', '#f6c8a6', '#eb6834', '#b42b28']   // none, low, mid, high
const DENSITY_MAX = 50   // hotspots per 100 km² of peat at the top of the colour scale

export default function National() {
  const t = useT()
  const nav = useNavigate()
  const { selected, select, basemap, fire } = useStore()
  const cam = useRef<{ center: maplibregl.LngLatLike; zoom: number } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [meta, setMeta] = useState<ScoringData['khg'] | null>(null)
  const [yearly, setYearly] = useState<Yearly[]>([])
  const [grid, setGrid] = useState<Grid[]>([])
  const [sit, setSit] = useState<any[]>([])
  const [stations, setStations] = useState<any[]>([])
  const [hotM, setHotM] = useState<Monthly[]>([])
  const [cat, setCat] = useState<CatalogEntry[]>([])
  const [by, setBy] = useState<'density' | 'count'>('density')

  useEffect(() => {
    readJson<ScoringData>('national/scoring.json').then((d) => setMeta(d.khg))
    readTable<Yearly>('national/yearly.parquet').then(setYearly)
    readTable<Grid>('national/hotspot_grid.parquet').then(setGrid)
    readTable('national/sitmat_daily.parquet').then(setSit)
    readTable('national/sitmat_stations.parquet').then(setStations)
    readTable<Monthly>('national/khg_hotspot_monthly.parquet').then(setHotM)
    loadCatalog().then(setCat)
  }, [])

  const years = useMemo(() => [...new Set(hotM.map((r) => Math.floor(r.ym / 100)))].sort((a, b) => b - a), [hotM])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of hotM) if (inPeriod(r, fire)) m.set(r.khg_id, (m.get(r.khg_id) ?? 0) + r.n)
    return m
  }, [hotM, fire])
  const built = useMemo(() => new Set(cat.map((c) => c.khg_id)), [cat])
  const rows = useMemo(() => meta ? meta.id.map((id, i) => {
    const n = counts.get(id) ?? 0, peat = meta.peat[i] ?? 0
    return { khg_id: id, nama: meta.name[i], province: meta.prov[i], island: meta.island[i], peat_km2: peat, n, density: peat > 0 ? (n / peat) * 100 : null, built: built.has(id) ? 1 : 0 }
  }) : [], [meta, counts, built])
  const value = (r: { n: number; density: number | null }) => (by === 'density' ? r.density : r.n)
  const top = useMemo(() => Math.max(1, by === 'density' ? DENSITY_MAX : Math.max(1, ...rows.map((r) => r.n)) ), [by, rows])

  // map
  useEffect(() => {
    initMaplibre()
    const sat = basemap === 'satellite'
    const map = new maplibregl.Map({ container: el.current!, style: styleFor(basemap), center: cam.current?.center ?? [114, -1.5], zoom: cam.current?.zoom ?? 4.2, attributionControl: { compact: true } })
    map.on('load', () => {
      map.addSource('khg', { type: 'vector', url: pm('national/khg_outlines.pmtiles'), promoteId: 'khg_id' })
      map.addLayer({ id: 'khg-fill', type: 'fill', source: 'khg', 'source-layer': 'khg', paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], HEAT[0]] as any,
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, sat ? 0.7 : 0.82] } })
      map.addLayer({ id: 'khg-line', type: 'line', source: 'khg', 'source-layer': 'khg', paint: { 'line-color': sat ? '#ffffff' : '#333', 'line-width': sat ? 0.6 : 0.4 } })
      map.addLayer({ id: 'khg-built', type: 'line', source: 'khg', 'source-layer': 'khg', filter: ['==', ['get', 'khg_id'], ''], paint: { 'line-color': sat ? '#ffd23f' : '#0d366b', 'line-width': 1.6 } })
      map.addLayer({ id: 'khg-sel', type: 'line', source: 'khg', 'source-layer': 'khg', filter: ['==', ['get', 'khg_id'], ''], paint: { 'line-color': '#eb6834', 'line-width': 3 } })
      setMapReady(true)
    })
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    let hov: string | null = null
    map.on('mousemove', 'khg-fill', (e) => {
      const f = e.features?.[0]; if (!f) return
      map.getCanvas().style.cursor = 'pointer'
      if (hov) map.setFeatureState({ source: 'khg', sourceLayer: 'khg', id: hov }, { hover: false })
      hov = String(f.id); map.setFeatureState({ source: 'khg', sourceLayer: 'khg', id: hov }, { hover: true })
      popup.setLngLat(e.lngLat).setHTML(`<b>${f.properties.nama}</b>`).addTo(map)
    })
    map.on('mouseleave', 'khg-fill', () => { map.getCanvas().style.cursor = ''; popup.remove(); if (hov) map.setFeatureState({ source: 'khg', sourceLayer: 'khg', id: hov }, { hover: false }); hov = null })
    map.on('click', 'khg-fill', (e) => { const f = e.features?.[0]; if (f) select(String(f.id)) })
    mapRef.current = map
    return () => { cam.current = { center: map.getCenter(), zoom: map.getZoom() }; setMapReady(false); map.remove() }
  }, [basemap])

  // colour by the filtered hotspots; the scale is fixed so years and months compare
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady || !rows.length) return
    const step = (v: number | null) => (v == null || v <= 0 ? HEAT[0] : v < top * 0.1 ? HEAT[1] : v < top * 0.4 ? HEAT[2] : HEAT[3])
    for (const r of rows) m.setFeatureState({ source: 'khg', sourceLayer: 'khg', id: r.khg_id }, { color: step(value(r)) })
  }, [rows, mapReady, by, top])
  useEffect(() => { const m = mapRef.current; if (m?.getLayer('khg-sel')) m.setFilter('khg-sel', ['==', ['get', 'khg_id'], selected ?? '']) }, [selected, mapReady])
  useEffect(() => { const m = mapRef.current; if (m?.getLayer('khg-built') && cat.length) m.setFilter('khg-built', ['in', ['get', 'khg_id'], ['literal', cat.map((c) => c.khg_id)]]) }, [cat, mapReady])

  const sel = rows.find((r) => r.khg_id === selected)
  const entry = cat.find((c) => c.khg_id === selected)
  const fmt0 = (v: number | null) => (v == null || Number.isNaN(v) ? '' : Math.round(v).toLocaleString())
  const scope = sel ? sel.nama.replace(/^KHG /, '') : t('Indonesia')
  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  const monthly = (kind: string): Series[] => (fire.high ? ['high'] : ['medium', 'high']).map((conf) => {
    const m = new Map<number, number>()
    const src: { kind: string; conf: string; ym: number; n: number; peat: boolean }[] = selected ? hotM.filter((g) => g.khg_id === selected) : grid
    for (const g of src) if (g.kind === kind && g.conf === conf && (!fire.peat || g.peat)) m.set(g.ym, (m.get(g.ym) ?? 0) + g.n)
    return { name: t(`${conf} confidence`), color: conf === 'high' ? 'var(--s8)' : 'var(--s7)', points: [...m].sort((a, b) => a[0] - b[0]).map(([ym, y]) => ({ x: monthDate(ym), y })) }
  })
  const stationSet = useMemo(() => (selected ? new Set(stations.filter((s) => s.khg === selected).map((s) => `${s.kind}/${s.station_id}`)) : null), [stations, selected])
  const sitmat = useMemo<Series[]>(() => ['community', 'concession'].map((kind) => {
    const d = new Map<string, number[]>()
    for (const r of sit) if ((!stationSet || stationSet.has(`${r.kind}/${r.station_id}`)) && r.kind === kind && r.flag == null && r.water_level_cm != null && !Number.isNaN(r.water_level_cm)) { const a = d.get(r.date) ?? []; a.push(r.water_level_cm); d.set(r.date, a) }
    return { name: t(kind), color: kind === 'community' ? 'var(--s5)' : 'var(--s6)', points: [...d].sort().map(([date, v]) => ({ x: new Date(date), y: median(v) as number })) }
  }), [sit, t, stationSet])
  const burned: Series[] = [{ name: sel?.nama ?? '', color: 'var(--s2)', points: yearly.filter((r) => r.khg_id === selected && r.metric === 'burned_peat_km2').sort((a, b) => a.year - b.year).map((r) => ({ x: new Date(r.year, 6, 1), y: r.value })) }]

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'nama', label: t('KHG') }, { key: 'province', label: t('Province') },
    { key: 'n', label: t('Hotspots'), align: 'right', fmt: fmt0 },
    { key: 'density', label: t('Hotspots'), unit: t('per 100 km² of peat'), align: 'right', fmt: (v) => (v == null ? '' : v.toFixed(1)) },
    { key: 'peat_km2', label: t('Peat (km²)'), align: 'right', fmt: fmt0 },
    { key: 'built', label: t('Investigation'), fmt: (v) => (v ? '●' : '') },
  ]

  return (
    <div className="flex flex-col gap-3 p-3">
      <FilterBar years={years.length ? years : [2026]} count={selected ? sel?.n ?? 0 : total} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="card relative overflow-hidden" style={{ height: 'calc(100vh - 230px)', minHeight: 460 }}>
            <div ref={el} className="h-full w-full" />
            <div className="absolute left-3 top-3 flex gap-1">
              <button className="btn text-xs" aria-pressed={by === 'density'} onClick={() => setBy('density')}>{t('Per 100 km² of peat')}</button>
              <button className="btn text-xs" aria-pressed={by === 'count'} onClick={() => setBy('count')}>{t('Hotspot count')}</button>
            </div>
            <LegendCard>
              <RampLegend title={by === 'density' ? t('Hotspots per 100 km² of peat') : t('Hotspots')} stops={HEAT} lo={0} hi={top} fmt={(v) => `${Math.round(v)}${v >= top ? '+' : ''}`} />
              <div className="flex items-center gap-1.5 text-xs"><i className="inline-block h-0 w-4 border-t-2" style={{ borderColor: basemap === 'satellite' ? '#ffd23f' : '#0d366b' }} />{t('Investigation available')}</div>
            </LegendCard>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="card p-3">
            {sel ? <>
              <div className="flex items-start gap-2">
                <div><div className="text-base font-semibold">{sel.nama}</div><div className="muted">{sel.province} · {sel.island}</div></div>
                <button className="btn ml-auto text-xs" onClick={() => select(null)}>×</button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-xl font-semibold">{fmt0(sel.n)}</div><div className="muted text-xs">{t('Hotspots')}</div></div>
                <div><div className="text-xl font-semibold">{sel.density == null ? '-' : sel.density.toFixed(1)}</div><div className="muted text-xs">{t('per 100 km² of peat')}</div></div>
                <div><div className="text-xl font-semibold">{fmt0(sel.peat_km2)}</div><div className="muted text-xs">{t('Peat (km²)')}</div></div>
              </div>
              {entry ? <button className="btn mt-3" onClick={() => nav(`/khg/${entry.code}`)}>{t('Investigate this KHG')} →</button>
                : <div className="muted mt-3 text-xs">{t('Detailed layers have not been built for this KHG.')}</div>}
            </> : <div className="muted text-sm">{t('Select a KHG to begin investigating')}</div>}
          </div>
          {sel && <LineChart title={`${t('Burned peat per year')} · ${scope}`} yLabel="km²" series={burned} zeroBase />}
          <LineChart title={`${t('Hotspots per month')} (VIIRS) · ${scope}`} series={monthly('viirs')} fmt={(v) => Math.round(v).toLocaleString()} zeroBase />
          {sel && !sitmat.some((s) => s.points.length) ? <div className="card muted p-3 text-sm">{t('Water level at SiTMAT stations')} · {scope}: {t('no stations inside this KHG')}</div>
            : <LineChart title={`${t('Water level at SiTMAT stations')} · ${scope}`} yLabel="cm" series={sitmat.filter((s) => s.points.length)} />}
        </div>
      </div>
      <div className="card p-3">
        <DataTable rows={rows} cols={cols} rowKey="khg_id" searchKeys={['nama', 'province', 'island']} selectedKey={selected} onRow={(r) => select(r.khg_id)} initialSort={{ key: by === 'density' ? 'density' : 'n', dir: -1 }} />
      </div>
    </div>
  )
}
