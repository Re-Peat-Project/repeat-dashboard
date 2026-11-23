import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Col } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { LegendCard, RampLegend } from '../components/Legend'
import { FireTrends } from '../components/FireTrends'
import { Seg } from '../components/Seg'
import { loadCatalog, readJson, readTable, type CatalogEntry } from '../lib/data'
import { useT } from '../lib/i18n'
import { inPeriod, lastFireMonth, limitFireMonths } from '../lib/investigation'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import type { ScoringData } from '../lib/scoring'
import { useStore } from '../lib/store'
import { loadPriority } from '../priority/core'
import { addHotspotGlyphs, hotspotCells, HOT_HIGH, HOT_MEDIUM, type HotspotCell } from '../lib/hotspotGlyphs'

type Monthly = { khg_id: string; kind: string; ym: number; conf: string; peat: boolean; n: number }
type FireTiles = { hotspots?: { last: Record<string, string | null>; count: Record<string, number> }; burned?: { per_year: Record<string, number> } }

const HEAT = ['#e9e8e2', '#f6c8a6', '#eb6834', '#b42b28']   // none, low, mid, high
const DENSITY_MAX = 50   // hotspots per 100 km² of peat at the top of the colour scale

export default function National() {
  const t = useT()
  const nav = useNavigate()
  const { selected, select, basemap, setBasemap, fire: rawFire, setFire, lang } = useStore()
  const cam = useRef<{ center: maplibregl.LngLatLike; zoom: number } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const glyphs = useRef<ReturnType<typeof addHotspotGlyphs> | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [meta, setMeta] = useState<ScoringData['khg'] | null>(null)
  const [grid, setGrid] = useState<HotspotCell[]>([])
  const [hotM, setHotM] = useState<Monthly[]>([])
  const [cat, setCat] = useState<CatalogEntry[]>([])
  const [by, setBy] = useState<'density' | 'count'>('density')
  // national fire layers (build_national_fire_tiles.py): 2026 hotspot points and burned-area polygons, filtered like the page
  const [lay, setLay] = useState({ hot: 'glyphs', burn: false, khg: true })
  const [currentSensor, setCurrentSensor] = useState<'viirs' | 'modis'>('modis')
  const sensor = rawFire.year === 2026 ? currentSensor : 'viirs'
  const kind = sensor === 'modis' ? 'modis2026' : 'viirs'
  const sensorLabel = sensor === 'modis' ? 'MODIS' : 'VIIRS S-NPP'
  const [ft, setFt] = useState<FireTiles | null>(null)
  useEffect(() => { readJson<FireTiles>('national/fire_tiles.json').then(setFt).catch(() => setFt({})) }, [])
  const latestYm = useMemo(() => grid.reduce((max, row) => row.kind === kind ? Math.max(max, row.ym) : max, 0), [grid, kind])
  const lastMonth = lastFireMonth(rawFire.year, latestYm)
  const fire = useMemo(() => limitFireMonths(rawFire, lastMonth), [rawFire, lastMonth])

  useEffect(() => {
    readJson<ScoringData>('national/scoring.json').then((d) => setMeta(d.khg))
    readTable<HotspotCell>('national/hotspot_grid.parquet').then(setGrid)
    readTable<Monthly>('national/khg_hotspot_monthly.parquet').then(setHotM)
    loadCatalog().then(setCat)
  }, [])

  const years = useMemo(() => [...new Set(hotM.map((r) => Math.floor(r.ym / 100)))].sort((a, b) => b - a), [hotM])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of hotM) if (inPeriod(r, fire, kind)) m.set(r.khg_id, (m.get(r.khg_id) ?? 0) + r.n)
    return m
  }, [hotM, fire, kind])
  const rows = useMemo(() => meta ? meta.id.map((id, i) => {
    const n = counts.get(id) ?? 0, peat = meta.peat[i] ?? 0
    return { khg_id: id, nama: meta.name[i], province: meta.prov[i], island: meta.island[i], peat_km2: peat, n, density: peat > 0 ? (n / peat) * 100 : null }
  }) : [], [meta, counts])
  const value = (r: { n: number; density: number | null }) => (by === 'density' ? r.density : r.n)
  const top = useMemo(() => Math.max(1, by === 'density' ? DENSITY_MAX : Math.max(1, ...rows.map((r) => r.n)) ), [by, rows])

  // map
  const ft0 = useRef<FireTiles | null>(null); ft0.current = ft
  useEffect(() => {
    if (!ft) return
    initMaplibre()
    const sat = basemap === 'satellite'
    const map = new maplibregl.Map({ container: el.current!, style: styleFor(basemap), center: cam.current?.center ?? [114, -1.5], zoom: cam.current?.zoom ?? 4.2, attributionControl: { compact: true } })
    map.on('load', () => {
      map.addSource('khg', { type: 'vector', url: pm('national/khg_outlines.pmtiles'), promoteId: 'khg_id' })
      map.addLayer({ id: 'khg-fill', type: 'fill', source: 'khg', 'source-layer': 'khg', paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], HEAT[0]] as any,
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, sat ? 0.7 : 0.82] } })
      map.addLayer({ id: 'khg-line', type: 'line', source: 'khg', 'source-layer': 'khg', paint: { 'line-color': sat ? '#ffffff' : '#333', 'line-width': sat ? 0.6 : 0.4 } })
      if (ft0.current?.burned) {
        map.addSource('burn', { type: 'vector', url: pm('national/fire_burned.pmtiles') })
        map.addLayer({ id: 'burn', type: 'fill', source: 'burn', 'source-layer': 'burned', layout: { visibility: 'none' }, paint: { 'fill-color': sat ? '#ffb000' : '#3d2b1f', 'fill-opacity': sat ? 0.75 : 0.7 } })
      }
      map.addLayer({ id: 'khg-built', type: 'line', source: 'khg', 'source-layer': 'khg', filter: ['==', ['get', 'khg_id'], ''], paint: { 'line-color': sat ? '#ffd23f' : '#0d366b', 'line-width': 1.6 } })
      map.addLayer({ id: 'khg-sel', type: 'line', source: 'khg', 'source-layer': 'khg', filter: ['==', ['get', 'khg_id'], ''], paint: { 'line-color': '#eb6834', 'line-width': 3 } })
      if (ft0.current?.hotspots) {
        map.addSource('hot', { type: 'vector', url: pm('national/fire_hotspots_2026.pmtiles') })
        const r: any = ['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, 2.5, 12, 5]
        for (const sensor of ['viirs', 'modis']) map.addLayer({ id: 'hot-' + sensor, type: 'circle', source: 'hot', 'source-layer': sensor, layout: { visibility: 'none' },
          paint: { 'circle-radius': r, 'circle-color': ['case', ['==', ['get', 'h'], 1], HOT_HIGH, HOT_MEDIUM], 'circle-stroke-color': sat ? '#000' : '#fff', 'circle-stroke-width': 0.4, 'circle-opacity': 0.9 } })
      }
      glyphs.current = addHotspotGlyphs(map, t)
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
    return () => {
      cam.current = { center: map.getCenter(), zoom: map.getZoom() }
      glyphs.current?.remove(); glyphs.current = null
      setMapReady(false); map.remove()
    }
  }, [basemap, ft, t])

  // colour by the filtered hotspots; the scale is fixed so years and months compare
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady || !rows.length) return
    const step = (v: number | null) => (v == null || v <= 0 ? HEAT[0] : v < top * 0.1 ? HEAT[1] : v < top * 0.4 ? HEAT[2] : HEAT[3])
    for (const r of rows) m.setFeatureState({ source: 'khg', sourceLayer: 'khg', id: r.khg_id }, { color: step(value(r)) })
  }, [rows, mapReady, by, top])
  useEffect(() => { const m = mapRef.current; if (m?.getLayer('khg-sel')) m.setFilter('khg-sel', ['==', ['get', 'khg_id'], selected ?? '']) }, [selected, mapReady])
  useEffect(() => { const m = mapRef.current; if (m?.getLayer('khg-built') && cat.length) m.setFilter('khg-built', ['in', ['get', 'khg_id'], ['literal', cat.map((c) => c.khg_id)]]) }, [cat, mapReady])
  const pickFromTable = (id: string) => {
    select(id)
    loadPriority().then((p) => {
      const index = p.idx.get(id.replace(/^KHG\./, ''))
      if (index === undefined || useStore.getState().selected !== id) return
      const { west, south, east, north } = p.row[index]
      if ([west, south, east, north].every(Number.isFinite)) {
        mapRef.current?.fitBounds([west, south, east, north], { padding: 45, maxZoom: 11 })
      }
    }).catch(() => {})
  }

  // fire layers follow the year, months, confidence and peat filter of the page; hotspot points exist for 2026 only
  const hotYear = fire.year === 2026
  const display = lay.hot === 'points' && (!hotYear || !ft?.hotspots) ? 'glyphs' : lay.hot
  useEffect(() => {
    if (mapReady) glyphs.current?.set(display === 'glyphs' ? hotspotCells(grid, fire, kind) : null)
  }, [mapReady, display, grid, fire, kind])
  useEffect(() => {
    const m = mapRef.current; if (!m || !mapReady) return
    const vis = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none') }
    for (const id of ['khg-fill', 'khg-line', 'khg-built', 'khg-sel']) vis(id, lay.khg)
    vis('burn', lay.burn); if (m.getLayer('burn')) m.setFilter('burn', ['in', String(fire.year), ['get', 'y']] as any)
    for (const sn of ['viirs', 'modis']) {
      vis('hot-' + sn, display === 'points' && sensor === sn)
      if (m.getLayer('hot-' + sn)) m.setFilter('hot-' + sn, ['all', ['>=', ['get', 'm'], fire.start], ['<=', ['get', 'm'], fire.end], ['==', ['get', 's'], 0],
        ...(fire.high ? [['==', ['get', 'h'], 1]] : []), ...(fire.peat ? [['==', ['get', 'p'], 1]] : [])] as any)
    }
  }, [lay, fire, mapReady, display, sensor])
  const cutoff = ft?.hotspots?.last[sensor]
  const lastDate = cutoff ? new Date(cutoff).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

  const sel = rows.find((r) => r.khg_id === selected)
  const entry = cat.find((c) => c.khg_id === selected)
  const fmt0 = (v: number | null) => (v == null || Number.isNaN(v) ? '' : Math.round(v).toLocaleString())
  const scope = sel ? sel.nama.replace(/^KHG /, '') : t('Indonesia')
  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'nama', label: t('KHG') }, { key: 'province', label: t('Province') },
    { key: 'n', label: t('Hotspots'), align: 'right', fmt: fmt0 },
    { key: 'density', label: t('Density'), unit: t('per 100 km² of peat'), align: 'right', fmt: (v) => (v == null ? '' : v.toFixed(1)) },
    { key: 'peat_km2', label: t('Peat'), unit: 'km²', align: 'right', fmt: fmt0 },
  ]

  return (
    <section className="space-y-3" aria-labelledby="fire-map-title">
      <h2 id="fire-map-title" className="text-xl font-semibold tracking-tight">{t('Fire situation')}</h2>
      <FilterBar years={years.length ? years : [2026]} lastMonth={lastMonth} sensorLabel={sensorLabel} count={selected ? sel?.n ?? 0 : total}>
        {hotYear && <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('Hotspot sensor')}>
          <button className="btn text-xs" aria-pressed={sensor === 'modis'} onClick={() => setCurrentSensor('modis')}>MODIS</button>
          <button className="btn text-xs" aria-pressed={sensor === 'viirs'} onClick={() => setCurrentSensor('viirs')}>VIIRS S-NPP</button>
          {lastDate && <span className="muted px-1 text-xs">{t('to {d}').replace('{d}', lastDate)}</span>}
        </div>}
      </FilterBar>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
        <div className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border p-2.5">
            <div className="flex flex-wrap gap-1">
              <label className="inline-flex items-center gap-1.5 px-1 text-xs"><input type="checkbox" checked={lay.khg} onChange={(e) => setLay({ ...lay, khg: e.target.checked })} />{t('KHG boundaries')}</label>
              {lay.khg && <>
                <button className="btn text-xs" aria-pressed={by === 'density'} onClick={() => setBy('density')}>{t('Per 100 km² of peat')}</button>
                <button className="btn text-xs" aria-pressed={by === 'count'} onClick={() => setBy('count')}>{t('Hotspot count')}</button>
              </>}
            </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" role="group" aria-label={t('Layers')}>
                <label className="flex items-center gap-1.5">
                  {t('Hotspots')}
                  <select aria-label={t('Hotspot display')} className="btn" value={display} onChange={(e) => setLay({ ...lay, hot: e.target.value })}>
                    <option value="glyphs">{t('Clusters')}</option>
                    <option value="points" disabled={!hotYear || !ft?.hotspots}>{t('Individual points (2026)')}</option>
                    <option value="off">{t('Off')}</option>
                  </select>
                </label>
                {ft?.burned ? (
                  <label className="flex items-start gap-1.5" data-tip={t('KLHK burnt-area polygons of the selected year. Small polygons are thinned at low zoom for display.')}>
                    <input type="checkbox" className="mt-0.5" checked={lay.burn} onChange={(e) => setLay({ ...lay, burn: e.target.checked })} />
                    <span><i className="mr-1 inline-block h-2.5 w-3 rounded-sm align-middle" style={{ background: basemap === 'satellite' ? '#ffb000' : '#3d2b1f' }} />{t('Burned area {y}').replace('{y}', String(fire.year))}<br />
                      {fire.year === 2026 ? <span className="muted">{t('mapped to about mid-2026; incomplete as delivered')}</span> : fire.year === 2024 ? <span className="muted">{t('incomplete as delivered')}</span> : !ft.burned.per_year?.[String(fire.year)] ? <span className="muted">{t('no burned-area map for this year')}</span> : null}</span>
                  </label>
                ) : null}
              </div>
            <div className="flex items-center gap-2 text-xs muted sm:ml-auto">{t('Basemap')}
              <Seg items={[{ v: 'light', label: t('Map') }, { v: 'satellite', label: t('Satellite') }]} value={basemap} onChange={setBasemap} />
            </div>
          </div>
          <div className="relative h-[clamp(21rem,55vh,38rem)]">
            <div ref={el} className="h-full w-full" />
            {(lay.khg || display !== 'off') && <LegendCard>
              {lay.khg && <>
                <RampLegend title={by === 'density' ? t('Hotspots per 100 km² of peat') : t('Hotspots')} stops={HEAT} lo={0} hi={top} fmt={(v) => `${Math.round(v)}${v >= top ? '+' : ''}`} />
                <div className="flex items-center gap-1.5 text-xs"><i className="inline-block h-0 w-4 shrink-0 border-t-2" style={{ borderColor: basemap === 'satellite' ? '#ffd23f' : '#0d366b' }} />{t('Working view available')}</div>
              </>}
              {display !== 'off' && <div className="space-y-1 text-xs">
                <div className="flex flex-wrap gap-x-2">
                  <span><i className="mr-1 inline-block size-2 rounded-full" style={{ background: HOT_HIGH }} />{t('High confidence')}</span>
                  {!fire.high && <span><i className="mr-1 inline-block size-2 rounded-full" style={{ background: HOT_MEDIUM }} />{t('medium confidence')}</span>}
                </div>
                {display === 'glyphs' && <p className="muted">{t('Rings count detections in nearby grid cells. Click a ring to zoom.')}</p>}
              </div>}
            </LegendCard>}
          </div>
          {display === 'glyphs' && <p className="muted border-t border-border px-3 py-2 text-xs">{t('Clusters use the monthly grid, which can include likely static sources such as gas flares. Individual points exclude those sources.')}</p>}
        </div>
        <div className="relative min-w-0">
          <div className="card flex flex-col gap-3 p-3 xl:absolute xl:inset-0">
            {sel ? <div className="space-y-2 border-b border-border pb-3" aria-live="polite">
              <div className="flex items-start gap-2">
                <div><div className="text-base font-semibold">{sel.nama}</div><div className="muted">{sel.province} · {sel.island}</div></div>
                <button className="btn ml-auto text-xs" aria-label={t('Clear selection')} onClick={() => select(null)}>×</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><div className="text-xl font-semibold">{fmt0(sel.n)}</div><div className="muted text-xs">{t('Hotspots')}</div></div>
                <div><div className="text-xl font-semibold">{sel.density == null ? '-' : sel.density.toFixed(1)}</div><div className="muted text-xs">{t('per 100 km² of peat')}</div></div>
                <div><div className="text-xl font-semibold">{fmt0(sel.peat_km2)}</div><div className="muted text-xs">{t('Peat (km²)')}</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn text-sm" onClick={() => nav(`/khg/${sel.khg_id.replace(/^KHG\./, '')}`)}>{t('Open the KHG profile')} →</button>
                {entry ? <button className="btn text-sm" onClick={() => nav(`/workspace/${entry.code}`)}>{t('Open the working view of this KHG')}</button> : null}
              </div>
            </div> : null}
            <DataTable rows={rows} cols={cols} rowKey="khg_id" searchKeys={['nama', 'province', 'island', 'khg_id']} selectedKey={selected} onRow={(r) => pickFromTable(r.khg_id)} initialSort={{ key: 'density', dir: -1 }} limit={rows.length} fit />
          </div>
        </div>
      </div>
      <FireTrends data={grid} khgData={hotM} khg={selected} scope={scope} fire={fire} kind={kind} sensorLabel={sensorLabel}
        cutoff={cutoff} viirsCutoff={ft?.hotspots?.last.viirs} onMonth={(month) => setFire({ start: month, end: month })} />
    </section>
  )
}
