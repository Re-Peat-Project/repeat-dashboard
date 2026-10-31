import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { median, mean } from 'd3-array'
import { PMTiles } from 'pmtiles'
import { LineChart, type Series } from '../components/LineChart'
import { dataUrl, loadCatalog, loadManifest, readJson, readTable, type CatalogEntry, type Manifest } from '../lib/data'
import { labelOf, useT } from '../lib/i18n'
import { contextCounts, inPeriod, monthDate, type FireFilter, type Hotspot } from '../lib/investigation'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import { useStore } from '../lib/store'
import type { ScoringData } from '../lib/scoring'

type Monthly = { khg_id: string; kind: string; ym: number; conf: string; peat: boolean; n: number }
type Yearly = { khg_id: string; year: number; metric: string; value: number }
type Mode = 'fire' | 'water' | 'land' | 'action'
const modes: [Mode, string, string][] = [['fire', 'Fire investigation', '01'], ['water', 'Water conditions', '02'], ['land', 'Land & communities', '03'], ['action', 'Interventions', '04']]
const colors: Record<string, string> = { burn: '#e34948', licences: '#eda100', feg: '#1baf7a', dmpg: '#6250d6', target_villages: '#e87ba4', canals: '#2a78d6', canal_segments: '#2a78d6', sekat_proposed: '#eb6834', blocks: '#6250d6', sekat_existing: '#1baf7a', rivers: '#2a78d6', brgm_infra: '#6250d6', khg: '#394849', neraca_units: '#2a78d6' }
const presets: Record<Mode, string[]> = { fire: ['khg', 'burn', 'hotspots'], water: ['khg', 'canals', 'neraca_units', 'hotspots'], land: ['khg', 'licences', 'target_villages', 'dmpg', 'hotspots'], action: ['khg', 'canal_segments', 'sekat_proposed', 'sekat_existing', 'hotspots'] }
const fmt = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const cleanName = (s: string) => s.replace(/^KHG\s*/, '').replaceAll('Sungai ', '')

export default function Investigation() {
  const { code } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const lang = useStore(s => s.lang)
  const basemap = useStore(s => s.basemap)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [meta, setMeta] = useState<ScoringData['khg'] | null>(null)
  const [monthly, setMonthly] = useState<Monthly[]>([])
  const [yearly, setYearly] = useState<Yearly[]>([])
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [points, setPoints] = useState<Hotspot[]>([])
  const [water, setWater] = useState<any[]>([])
  const [balance, setBalance] = useState<any[]>([])
  const [deficit, setDeficit] = useState<any[]>([])
  const [deficitStats, setDeficitStats] = useState<any[]>([])
  const [model, setModel] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>('fire')
  const [filter, setFilter] = useState<FireFilter>({ year: 2026, start: 1, end: 12, high: true, peat: true })
  const [query, setQuery] = useState('')
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [dem, setDem] = useState('deltadtm')
  const [visible, setVisible] = useState(new Set(presets.fire))
  const [raster, setRaster] = useState('none')
  const [burnView, setBurnView] = useState<'year' | 'history' | 'repeat'>('year')
  const [selected, setSelected] = useState<Hotspot | null>(null)
  const [location, setLocation] = useState<{ title: string; rows: [string, string][] }[]>([])
  const [contextField, setContextField] = useState<'licence' | 'forest' | 'village' | 'dmpg'>('licence')
  const [contextValue, setContextValue] = useState<string | null>(null)
  const [contextReady, setContextReady] = useState(false)
  const [contextSources, setContextSources] = useState<Record<string, { available: boolean }>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const nationalBounds = useRef<[number, number, number, number] | null>(null)
  const gw = manifest?.groundwater.find(g => g.dem === dem)

  useEffect(() => {
    Promise.all([loadCatalog(), readJson<ScoringData>('national/scoring.json'), readTable<Monthly>('national/khg_hotspot_monthly.parquet'), readTable<Yearly>('national/yearly.parquet')])
      .then(([c, d, m, y]) => { setCatalog(c); setMeta(d.khg); setMonthly(m); setYearly(y) }).catch(e => setError(String(e)))
  }, [])
  useEffect(() => {
    let live = true
    setManifest(null); setPoints([]); setWater([]); setBalance([]); setDeficit([]); setDeficitStats([]); setModel([]); setSelected(null); setLocation([]); setContextValue(null); setContextReady(false); setError(''); setLoading(true)
    if (!code) { setLoading(false); return }
    loadManifest(code).then(async m => {
      if (!live) return
      setManifest(m); setDem(d => m.dems.includes(d) ? d : m.dems[0] ?? '')
      const path = `khg/${code}/`
      const source = m.points.find(p => p.id === 'hotspots')
      try {
        const info = await readJson<{ sources: Record<string, { available: boolean }> }>(`${path}investigation/sources.json`)
        const p = await readTable<Hotspot>(`${path}investigation/hotspots.parquet`)
        if (live) { setPoints(p); setContextReady(true); setContextSources(info.sources) }
      } catch {
        if (source) { const p = await readTable<Hotspot>(`${path}${source.file}`); if (live) setPoints(p) }
      }
      for (const [id, setter] of [['sitmat_daily', setWater], ['deficit_series', setDeficit], ['deficit_khg', setDeficitStats]] as const) {
        const file = m.tables.find(x => x.id === id)
        if (file) readTable(`${path}${file.file}`).then(r => { if (live) setter(r) }).catch(e => { if (live) setError(String(e)) })
      }
    }).catch(e => { if (live) setError(String(e)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [code])
  useEffect(() => {
    let live = true
    setBalance([]); setModel([])
    const f = manifest?.tables.find(x => x.id === 'balance_monthly' && x.dem === dem)
    if (f) readTable(`khg/${code}/${f.file}`).then(r => { if (live) setBalance(r) }).catch(e => { if (live) setError(String(e)) })
    const g = gw?.files.find(x => x.id === 'model_series')
    if (g) readTable(`khg/${code}/${g.file}`).then(r => { if (live) setModel(r) }).catch(e => { if (live) setError(String(e)) })
    return () => { live = false }
  }, [manifest, dem, code, gw])

  const periodPoints = useMemo(() => points.filter(p => inPeriod(p, filter)), [points, filter])
  const filtered = useMemo(() => contextValue ? periodPoints.filter(p => String(p[contextField] ?? '').split(' | ').includes(contextValue)) : periodPoints, [periodPoints, contextField, contextValue])
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const r of monthly) if (inPeriod(r, filter)) result.set(r.khg_id, (result.get(r.khg_id) ?? 0) + r.n)
    return result
  }, [monthly, filter])
  const rows = useMemo(() => meta ? meta.id.map((id, i) => ({ id, name: meta.name[i], province: meta.prov[i], peat: meta.peat[i], count: counts.get(id) ?? 0, built: catalog.find(c => c.khg_id === id) })).filter(r => `${r.name} ${r.province}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) : [], [meta, counts, catalog, query])
  const current = catalog.find(c => c.code === code)
  const summaryIndex = meta?.id.indexOf(summaryId ?? '') ?? -1
  const summaryName = summaryIndex >= 0 ? meta!.name[summaryIndex] : null
  const nationalTotal = [...counts.values()].reduce((a, b) => a + b, 0)
  const overlaps = useMemo(() => contextCounts(periodPoints, contextField), [periodPoints, contextField])
  const observedMonths = monthly.filter(r => (!code && !summaryId || r.khg_id === (code ? `KHG.${code}` : summaryId)) && Math.floor(r.ym / 100) === filter.year && r.kind === (filter.year === 2026 ? 'modis2026' : 'viirs')).map(r => r.ym % 100)

  useEffect(() => {
    if (code && !manifest) return
    initMaplibre()
    mapEl.current!.dataset.ready = 'false'
    const b = manifest?.bounds
    const map = new maplibregl.Map({ container: mapEl.current!, style: styleFor(basemap), ...(b ? { bounds: [[b[0], b[1]], [b[2], b[3]]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 55 } } : { center: [113, -1.7] as [number, number], zoom: 4.3 }), attributionControl: { compact: true } })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.on('idle', () => { if (mapEl.current) mapEl.current.dataset.ready = 'true' })
    let live = true
    map.on('load', () => {
      setReady(true)
      if (!code) new PMTiles(dataUrl('national/khg_outlines.pmtiles')).getHeader().then(h => {
        nationalBounds.current = [h.minLon, h.minLat, h.maxLon, h.maxLat]
        if (live) map.fitBounds([[h.minLon, h.minLat], [h.maxLon, h.maxLat]], { padding: 45, duration: 0 })
      }).catch(e => { if (live) setError(String(e)) })
    })
    return () => { live = false; marker.current?.remove(); marker.current = null; setReady(false); mapRef.current = null; map.remove() }
  }, [manifest, code, basemap])

  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    for (const l of m.getStyle().layers) if (l.id.startsWith('i-')) m.removeLayer(l.id)
    for (const s of Object.keys(m.getStyle().sources)) if (s.startsWith('i-')) m.removeSource(s)
    if (!code) {
      m.addSource('i-national', { type: 'vector', url: pm('national/khg_outlines.pmtiles'), promoteId: 'khg_id' })
      m.addLayer({ id: 'i-national-fill', type: 'fill', source: 'i-national', 'source-layer': 'khg', paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'count'], 0], 0, '#b6c8bf', 1, '#f6c8a6', 50, '#eb6834', 500, '#b42b28'], 'fill-opacity': 0.78 } })
      m.addLayer({ id: 'i-national-line', type: 'line', source: 'i-national', 'source-layer': 'khg', paint: { 'line-color': basemap === 'satellite' ? '#ffffff' : '#3d5d56', 'line-width': 0.5 } })
      m.addLayer({ id: 'i-national-selected', type: 'line', source: 'i-national', 'source-layer': 'khg', filter: ['==', ['get', 'khg_id'], summaryId ?? ''], paint: { 'line-color': '#eb6834', 'line-width': 3 } })
      for (const [id, count] of counts) m.setFeatureState({ source: 'i-national', sourceLayer: 'khg', id }, { count })
      return
    }
    if (!manifest) return
    if (raster !== 'none' && gw) {
      const r = gw.rasters.find(r => r.id === raster)
      if (r) { m.addSource('i-raster', { type: 'raster', url: pm(`khg/${code}/${r.file}`), tileSize: 256 }); m.addLayer({ id: 'i-raster', type: 'raster', source: 'i-raster', paint: { 'raster-opacity': 0.65, 'raster-resampling': 'nearest' } }) }
    }
    const vectors = manifest.vector.filter(v => (v.dem == null || v.dem === dem) && v.group !== 'ranking' && (visible.has(v.id) || v.group === 'land'))
    const kind = (v: typeof vectors[number]) => v.geometry?.includes('Point') ? 'circle' : ['khg', 'canals', 'rivers', 'canal_segments'].includes(v.id) ? 'line' : 'fill'
    vectors.sort((a, b) => ['fill', 'line', 'circle'].indexOf(kind(a)) - ['fill', 'line', 'circle'].indexOf(kind(b)))
    for (const v of vectors) {
      const id = `i-${v.id}`, type = kind(v), show = visible.has(v.id), color = colors[v.id] ?? '#2a78d6'
      m.addSource(id, { type: 'vector', url: pm(`khg/${code}/${v.file}`) })
      const paint = type === 'fill' ? { 'fill-color': color, 'fill-opacity': show ? (v.id === 'burn' ? 0.33 : 0.17) : 0.001, 'fill-outline-color': color }
        : type === 'line' ? { 'line-color': v.id === 'khg' && basemap === 'satellite' ? '#ffffff' : color, 'line-width': v.id === 'khg' ? 2 : 1.1 }
          : { 'circle-color': color, 'circle-radius': v.id === 'sekat_proposed' ? 5 : 3, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 }
      m.addLayer({ id, source: id, 'source-layer': v.id, type, paint, ...(v.id === 'burn' ? { filter: burnView === 'year' ? ['>', ['to-number', ['get', `BA_${filter.year}`], 0], 0] : burnView === 'repeat' ? ['>', ['to-number', ['get', 'BURN_FREQ'], 0], 1] : undefined } : {}) } as maplibregl.LayerSpecification)
    }
    if (visible.has('hotspots')) {
      m.addSource('i-hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: filtered.map((p, i) => ({ type: 'Feature', properties: { index: i, conf: p.conf }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) } })
      m.addLayer({ id: 'i-hotspots', type: 'circle', source: 'i-hotspots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2.5, 13, 6], 'circle-color': ['match', ['get', 'conf'], 'high', '#e34948', '#6250d6'], 'circle-opacity': 0.9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.8 } })
    }
  }, [ready, manifest, code, counts, filtered, visible, dem, raster, gw, basemap, burnView, filter.year, summaryId])

  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    const click = (e: maplibregl.MapMouseEvent) => {
      const layers = m.getStyle().layers.filter(l => l.id.startsWith('i-') && l.type !== 'raster').map(l => l.id)
      const fs = m.queryRenderedFeatures(e.point, { layers })
      if (!code) {
        const id = fs.find(f => f.layer.id === 'i-national-fill')?.properties.khg_id
        const c = catalog.find(c => c.khg_id === id)
        if (c) navigate(`/khg/${c.code}`)
        else if (id) { setSummaryId(String(id)); setQuery('') }
        return
      }
      const p = fs.find(f => f.layer.id === 'i-hotspots')
      setSelected(p ? filtered[p.properties.index] : null)
      const seen = new Set<string>()
      const details = fs.filter(f => f.layer.id !== 'i-hotspots' && f.layer.id !== 'i-khg').flatMap(f => {
        const id = f.layer.id.slice(2)
        if (seen.has(id)) return []
        seen.add(id)
        const spec = manifest?.vector.find(v => v.id === id)
        const props = Object.entries(f.properties).filter(([k, v]) => v != null && v !== '' && !['fid', 'OBJECTID', 'Shape_Area', 'Shape_Length'].includes(k)).slice(0, 12).map(([k, v]) => [k, String(v)] as [string, string])
        return [{ title: spec ? labelOf(spec.label, lang) : id, rows: props }]
      })
      setLocation(details)
      marker.current?.remove()
      marker.current = new maplibregl.Marker({ color: '#eb6834' }).setLngLat(p ? [filtered[p.properties.index].lon, filtered[p.properties.index].lat] : e.lngLat).addTo(m)
    }
    m.on('click', click)
    return () => { m.off('click', click) }
  }, [ready, filtered, catalog, code, navigate, manifest, lang, meta, t])

  const chooseMode = (next: Mode) => { setMode(next); setVisible(new Set(presets[next])); setRaster('none'); setContextValue(null) }
  const updateFilter = (patch: Partial<FireFilter>) => { setFilter(f => ({ ...f, ...patch })); setSelected(null); setLocation([]); setContextValue(null); marker.current?.remove() }
  const monthlySeries = useMemo<Series[]>(() => ['high', ...(filter.high ? [] : ['medium'])].map(conf => {
    const source = code ? points.filter(p => (!contextValue || String(p[contextField] ?? '').split(' | ').includes(contextValue)) && p.conf === conf && (!filter.peat || p.peat) && p.kind === (filter.year === 2026 ? 'modis2026' : 'viirs')) : monthly.filter(p => (!summaryId || p.khg_id === summaryId) && p.conf === conf && (!filter.peat || p.peat) && p.kind === (filter.year === 2026 ? 'modis2026' : 'viirs'))
    const lastMonth = Math.max(0, ...monthly.filter(p => Math.floor(p.ym / 100) === filter.year && p.kind === (filter.year === 2026 ? 'modis2026' : 'viirs')).map(p => p.ym % 100))
    const vals = new Map<number, number>(Array.from({ length: lastMonth }, (_, i) => [filter.year * 100 + i + 1, 0]))
    for (const p of source) if (Math.floor(p.ym / 100) === filter.year) vals.set(p.ym, (vals.get(p.ym) ?? 0) + ('n' in p ? Number(p.n) : 1))
    return { name: t(`${conf} confidence`), color: conf === 'high' ? 'var(--s8)' : 'var(--s7)', points: [...vals].sort((a, b) => a[0] - b[0]).map(([ym, y]) => ({ x: monthDate(ym), y })) }
  }), [code, points, monthly, filter, t, summaryId, contextField, contextValue])
  const history: Series[] = [{ name: t('Burned peat per year'), color: 'var(--s2)', points: yearly.filter(y => y.khg_id === (code ? `KHG.${code}` : summaryId) && y.metric === 'burned_peat_km2').sort((a, b) => a.year - b.year).map(y => ({ x: new Date(y.year, 6, 1), y: y.value })) }]
  const stationSeries: Series[] = ['community', 'concession'].map(kind => {
    const vals = new Map<string, number[]>()
    for (const r of water) if (r.kind === kind && r.flag == null && r.water_level_cm != null) { const a = vals.get(r.date) ?? []; a.push(r.water_level_cm); vals.set(r.date, a) }
    return { name: t(kind), color: kind === 'community' ? 'var(--s5)' : 'var(--s1)', points: [...vals].sort().map(([d, a]) => ({ x: new Date(d), y: median(a)! })) }
  }).filter(s => s.points.length)
  const balances = new Map<string, number[]>()
  for (const r of balance) if (r.WB_mm != null) { const a = balances.get(r.month) ?? []; a.push(r.WB_mm); balances.set(r.month, a) }
  const balanceSeries: Series[] = [{ name: t('Climatic balance'), color: 'var(--s1)', points: [...balances].sort().map(([d, a]) => ({ x: new Date(`${d}-15`), y: mean(a)! })) }]
  const deficitSeries: Series[] = [{ name: t('Observed mean depth'), color: 'var(--s7)', points: deficit.filter(r => r.obs_mean_cm != null).map(r => ({ x: new Date(r.date), y: r.obs_mean_cm })) }]
  const available = manifest?.vector.filter(v => (v.dem == null || v.dem === dem) && v.group !== 'ranking') ?? []
  const toggle = (id: string) => setVisible(old => { const n = new Set(old); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const focusPoint = (p: Hotspot) => { setSelected(p); setLocation([]); mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 13 }); marker.current?.remove(); if (mapRef.current) marker.current = new maplibregl.Marker({ color: '#eb6834' }).setLngLat([p.lon, p.lat]).addTo(mapRef.current) }
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, i, 1)))
  const exportSelection = () => {
    const fields: (keyof Hotspot)[] = ['lon', 'lat', 'date', 'ym', 'conf', 'peat', 'kind', 'frp', 'licence', 'forest', 'village', 'dmpg', 'burn_years']
    const csv = [fields.join(','), ...filtered.map(p => fields.map(k => `"${String(p[k] ?? '').replaceAll('"', '""')}"`).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${code}-${filter.year}-hotspots.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <main className="investigation">
    <aside className="investigation-rail" aria-label={t('Investigation views')}>
      <span className="rail-caption">{t('EXPLORE')}</span>
      {modes.map(([id, label, num]) => <button key={id} className="mode-button" aria-pressed={mode === id} onClick={() => chooseMode(id)}><span className="mode-number">{num}</span><span>{t(label)}</span><span className="mode-arrow">↗</span></button>)}
      <div className="rail-divider" />
      <label className="rail-caption" htmlFor="khg-search">{t('FIND A KHG')}</label>
      <input id="khg-search" className="search-input" placeholder={t('Name or province…')} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="list-heading"><span>{t('KHG')}</span><span>{t('Detections')}</span></div>
      <div className="khg-list">{rows.map(r => <button key={r.id} className={`khg-option ${r.id === (code ? `KHG.${code}` : summaryId) ? 'is-current' : ''}`} onClick={() => { if (r.built) navigate(`/khg/${r.built.code}`); else { setSummaryId(r.id); if (code) navigate('/'); } }}>
        <span className="khg-option-name">{cleanName(r.name)}<small>{r.province}{!r.built ? ` · ${t('Summary only')}` : ''}</small></span><span className="khg-count">{fmt(r.count)}</span>
        <span className="khg-magnitude" style={{ width: `${Math.min(100, r.count / Math.max(1, rows[0]?.count ?? 1) * 100)}%` }} />
      </button>)}</div>
      <div className="rail-foot">{t('Ordered by observed detections')}<br />{t('MODIS 2026 · VIIRS history')}</div>
    </aside>

    <section className="investigation-body">
      <div className="workspace-heading"><div><div className="eyebrow">{t('PEATLAND FIRE OBSERVATORY')}<span className="status-dot" />{filter.year}</div><h1>{code ? cleanName(manifest?.name ?? current?.name ?? code) : summaryName ? cleanName(summaryName) : t('Follow the fire.')}</h1><div className="workspace-subtitle">{code ? `${manifest?.province ?? ''} / ${code}` : summaryId ? `${meta?.prov[summaryIndex] ?? ''} / ${summaryId}` : t('Indonesia · Peat hydrological units')}</div></div><div className="scope-actions">{code && <Link to="/" onClick={() => setSummaryId(null)} className="text-action">← {t('Indonesia')}</Link>}{!code && summaryId && <button className="text-action" onClick={() => setSummaryId(null)}>← {t('Indonesia')}</button>}{code && <button className="btn" onClick={exportSelection}>{t('Export selection')} ↓</button>}</div></div>
      <div className="filter-strip">
        <label>{t('Year')}<select aria-label={t('Year')} value={filter.year} onChange={e => updateFilter({ year: +e.target.value })}>{Array.from({ length: 15 }, (_, i) => 2026 - i).map(y => <option key={y}>{y}</option>)}</select></label>
        <label>{t('From')}<select aria-label={t('From')} value={filter.start} onChange={e => updateFilter({ start: +e.target.value, end: Math.max(+e.target.value, filter.end) })}>{months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></label><span className="muted">→</span>
        <label>{t('To')}<select aria-label={t('To')} value={filter.end} onChange={e => updateFilter({ end: +e.target.value, start: Math.min(+e.target.value, filter.start) })}>{months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></label>
        <span className="filter-divider" />
        <label className="check-label"><input type="checkbox" checked={filter.high} onChange={e => updateFilter({ high: e.target.checked })} />{t('High only')}</label>
        <label className="check-label"><input type="checkbox" checked={filter.peat} onChange={e => updateFilter({ peat: e.target.checked })} />{t('Hotspots on peat')}</label>
        <span className="filter-source" title={t('Detections are satellite observations, not individual fire events.')}>{filter.year === 2026 ? 'MODIS' : 'VIIRS'} ⓘ</span>
      </div>
      {error && <div role="alert" className="data-alert">{error}<button onClick={() => setError('')} aria-label={t('Close')}>×</button></div>}
      <div className="analysis-grid">
        <div className="map-column">
          <div className="map-stage">
            <div ref={mapEl} className="investigation-map" aria-label={t('Interactive investigation map')} />
            <div className="map-label"><span className="status-dot" />{t(modes.find(m => m[0] === mode)![1])}</div>
            <div className="map-tools"><button className="map-tool" aria-pressed={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>{t('Layers')} <span>{layersOpen ? '−' : '+'}</span></button><button className="map-tool" onClick={() => { const b = manifest?.bounds ?? nationalBounds.current; if (b) mapRef.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50 }); else mapRef.current?.flyTo({ center: [113, -1.7], zoom: 4.3 }) }}>{t('Fit view')} ⤢</button></div>
            {code && visible.has('burn') && <div className="burn-switch" aria-label={t('Burn footprint')}>{(['year', 'history', 'repeat'] as const).map(v => <button key={v} aria-pressed={burnView === v} onClick={() => setBurnView(v)}>{v === 'year' ? filter.year : t(v === 'history' ? 'All years' : 'Repeat burns')}</button>)}</div>}
            {layersOpen && <div className="layer-popover"><strong>{t('Layers')}</strong>{code ? <>{available.map(v => <label key={v.id} title={v.source}><input type="checkbox" checked={visible.has(v.id)} onChange={() => toggle(v.id)} /><i className="chip" style={{ background: colors[v.id] }} />{labelOf(v.label, lang)}</label>)}<label><input type="checkbox" checked={visible.has('hotspots')} onChange={() => toggle('hotspots')} />{t('Hotspots')}</label></> : <p className="muted">{t('Choose a KHG to inspect local layers.')}</p>}</div>}
            <div className="map-legend">{!code ? <><span>{t('Detections')}</span><i style={{ background: '#b6c8bf' }} />0<i style={{ background: '#eb6834' }} />50<i style={{ background: '#b42b28' }} />500+</> : <>{visible.has('hotspots') && <><i style={{ background: 'var(--s8)', borderRadius: '100%' }} />{t('high confidence')}{!filter.high && <><i style={{ background: 'var(--s7)', borderRadius: '100%' }} />{t('medium confidence')}</>}</>}{visible.has('burn') && <><i style={{ background: 'var(--s8)', opacity: 0.4 }} />{t('Burn footprint')} · {burnView === 'year' ? filter.year : t(burnView === 'history' ? 'All years' : 'Repeat burns')}</>}</>}</div>
            <div className="map-hint">{t(code ? 'Click a hotspot or location to inspect' : 'Select a KHG to begin investigating')}</div>
          </div>
          <div className="timeline-strip"><div className="section-kicker">{t('TEMPORAL EVIDENCE')}<span>{months[filter.start - 1]} — {months[filter.end - 1]} {filter.year}</span></div><LineChart title={t('Hotspots per month')} series={monthlySeries} yLabel={t('Detections')} zeroBase height={155} sync selectedRange={[new Date(filter.year, filter.start - 1, 1), new Date(filter.year, filter.end, 0)]} onDateSelect={d => updateFilter({ start: d.getMonth() + 1, end: d.getMonth() + 1 })} /></div>
          {(code || summaryId) && <div className="context-caption">{t('KHG-wide context')}</div>}
          <div className="evidence-charts">
            {(code || summaryId) && <LineChart title={t('Burned peat per year')} series={history} yLabel="km²" zeroBase height={170} onDateSelect={d => updateFilter({ year: d.getFullYear(), start: 1, end: 12 })} />}
            {code && <LineChart title={t('Water level at SiTMAT stations')} series={stationSeries} yLabel="cm" height={170} sync />}
          </div>
        </div>

        <aside className="evidence-panel" aria-label={t('Evidence inspector')}>
          <div className="section-kicker">{t('EVIDENCE INSPECTOR')}<span>{code ? t('KHG') : t('Indonesia')}</span></div>
          <div className="detection-summary"><div className="big-number" aria-live="polite">{loading ? '…' : fmt(code ? filtered.length : summaryId ? counts.get(summaryId) ?? 0 : nationalTotal)}</div><div><strong>{t('hotspot detections')}</strong><small>{t(filter.high ? 'high confidence' : 'Medium + high')} · {t(filter.peat ? 'Hotspots on peat' : 'All hotspots')}</small></div></div>
          <p className="source-note">{t('Detections are satellite observations, not individual fire events.')}</p>
          {observedMonths.length > 0 && <p className="source-note">{t('Observed months')}: {months[Math.min(...observedMonths) - 1]}–{months[Math.max(...observedMonths) - 1]} {filter.year}</p>}
          {!code && summaryId && <p className="source-note">{t('Detailed layers have not been built for this KHG.')}</p>}
          {!code ? <><div className="inspector-rule" /><h2>{t('Start with a place')}</h2><p className="muted inspector-copy">{t('Choose a KHG on the map or in the list to connect fire, water and land context.')}</p><div className="coverage-stat"><b>{catalog.length}</b><span>{t('KHG with detailed layers')}</span></div><div className="source-block"><span className="eyebrow">{t('DATA COVERAGE')}</span><p>MODIS / KLH / FIRMS<br />VIIRS / FIRMS<br />SiTMAT / KLH</p><small>{t('GFW composite peat extent')}</small></div></> : <>
            {(selected || location.length > 0) && <section className="selected-evidence"><div className="section-kicker">{t('SELECTED LOCATION')}<button aria-label={t('Clear selection')} onClick={() => { setSelected(null); setLocation([]); marker.current?.remove() }}>×</button></div>
              {selected && <><h2>{selected.date || `${selected.ym} · ${t('Month only')}`}</h2><div className="coordinate">{selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</div><dl><dt>{t('Confidence')}</dt><dd>{t(`${selected.conf} confidence`)}</dd><dt>FRP (MW)</dt><dd>{fmt(selected.frp)}</dd><dt>{t('Peat')}</dt><dd>{t(selected.peat ? 'Yes' : 'No')}</dd></dl>{(['forest', 'licence', 'village', 'dmpg', 'burn_years'] as const).map(k => <div className="location-context" key={k}><small>{t(({ forest: 'Forest area', licence: 'Licence area', village: 'Target village', dmpg: 'DMPG village', burn_years: 'Years burned' })[k])}</small><span>{selected[k] || t(contextReady ? 'No intersection in supplied layer' : 'Context data not built')}</span></div>)}</>}
              {location.map((l, i) => <details key={i} open><summary>{l.title}</summary><dl>{l.rows.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}</dl></details>)}
            </section>}
            {(mode === 'fire' || mode === 'land') && <section className="context-section"><div className="inspector-rule" /><h2>{t('Where do detections fall?')}</h2><label className="context-selector">{t('Intersect with')}<select value={contextField} onChange={e => { setContextField(e.target.value as typeof contextField); setContextValue(null) }}><option value="licence">{t('Licence area')}</option><option value="forest">{t('Forest area')}</option><option value="village">{t('Target village')}</option><option value="dmpg">{t('DMPG village')}</option></select></label>
              {contextValue && <button className="context-clear" onClick={() => setContextValue(null)}>{t('Clear area filter')} ×</button>}
              {!contextReady ? <p className="source-note">{t('Context data not built')}</p> : contextSources[contextField]?.available === false ? <p className="source-note">{t('Layer unavailable')}</p> : overlaps.length === 0 ? <p className="source-note">{t('No intersection in supplied layer')}</p> : <div className="overlap-list">{overlaps.map(([label, n]) => <button key={label} aria-pressed={contextValue === label} onClick={() => setContextValue(contextValue === label ? null : label)}><span>{label}</span><b>{fmt(n)}</b><i style={{ width: `${n / Math.max(1, periodPoints.length) * 100}%` }} /></button>)}</div>}
              <p className="source-note">{t('Spatial overlap does not establish responsibility. Overlapping areas may count the same detection.')}</p><p className="source-note">{t('Village coverage: target and DMPG villages only. Holder names follow the data export settings.')}</p>
            </section>}
            {mode === 'water' && <section className="water-evidence"><div className="inspector-rule" /><h2>{t('Water conditions')}</h2><label className="context-selector">{t('DEM')}<select value={dem} onChange={e => { setDem(e.target.value); setRaster('none') }}>{manifest?.dems.map(d => <option key={d}>{d}</option>)}</select></label>
              <label className="context-selector">{t('Map layer')}<select value={raster} onChange={e => setRaster(e.target.value)}><option value="none">{t('Map')}</option>{gw?.rasters.map(r => <option key={r.id} value={r.id}>{labelOf(r.label, lang)}</option>)}</select></label>
              <LineChart title={t('Monthly water balance (mm)')} series={balanceSeries} yLabel="mm" sync />
              {deficitStats.map((s, i) => <div key={i} className="deficit-summary" title={s.method}><span>{t('Station-based deficit')}</span><strong>{fmt(s.deficit_mm)} <small>mm</small></strong><small>{s.period_start} → {s.period_end}</small><small>{fmt(s.deficit_mm_low)}–{fmt(s.deficit_mm_high)} mm · {s.n_stations} {t('stations')} · Sy {s.sy}</small><small>{s.evaporation_source} · {t('Hover for method')}</small></div>)}
              <LineChart title={t('Observed mean depth')} series={deficitSeries} yLabel="cm" sync />
              <div className="model-note">{t('Groundwater model')} · {t('in development')}<br />{gw ? `${gw.run} · ${gw.res_m} m` : t('Not available for this DEM')}</div>
              {model.length > 0 && <LineChart title={t('Mean water-table depth (cm)')} yLabel="cm" series={[{ name: t('Open land'), color: 'var(--s3)', points: model.map(r => ({ x: new Date(r.date), y: r.unmanaged_mean_depth_cm })) }]} sync />}
            </section>}
            {mode === 'action' && <section><div className="inspector-rule" /><h2>{t('Interventions')}</h2><label className="context-selector">{t('DEM')}<select value={dem} onChange={e => setDem(e.target.value)}>{manifest?.dems.map(d => <option key={d}>{d}</option>)}</select></label><p className="source-note">{t('Proposed interventions are design outputs, not completed works.')}</p>{available.filter(v => v.group === 'interventions' || v.id === 'canal_segments').map(v => <button key={v.id} className="intervention-row" aria-pressed={visible.has(v.id)} onClick={() => toggle(v.id)} title={v.source}><i className="chip" style={{ background: colors[v.id] }} /><span>{labelOf(v.label, lang)}</span><b>{fmt(v.features)}</b></button>)}<p className="source-note">{t('Click a block or canal on the map to inspect its design attributes.')}</p></section>}
            <details className="hotspot-register" open={mode === 'fire' && !selected}><summary>{t('Detection register')}<span>{fmt(filtered.length)}</span></summary><div className="register-list">{filtered.slice().sort((a, b) => b.ym - a.ym || (b.frp ?? 0) - (a.frp ?? 0)).slice(0, 100).map((p, i) => <button key={i} onClick={() => focusPoint(p)}><span><i className="fire-dot" />{p.date || `${p.ym} · ${t('Month only')}`}<small>{p.lat.toFixed(3)}, {p.lon.toFixed(3)}</small></span><span>{fmt(p.frp)}<small>MW</small></span></button>)}</div>{filtered.length > 100 && <p className="source-note">{t('Showing 100 detections. Export for the full selection.')}</p>}</details>
          </>}
        </aside>
      </div>
      <footer className="workspace-footer"><span>RE-PEAT / {t('Fire investigation')}</span><span>{t('GFW composite peat extent')} · {t('Source coverage varies by layer')}</span></footer>
    </section>
  </main>
}
