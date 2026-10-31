import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { extent, mean, median } from 'd3-array'
import { DataTable, type Col } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { FIELD, LegendCard, RampLegend, SEQ, Swatch, TERRAIN } from '../components/Legend'
import { MonthYearHeat } from '../components/MonthYearHeat'
import { LandStatus, type LandRow } from '../components/LandStatus'
import { LineChart, type Series } from '../components/LineChart'
import { loadCatalog, loadManifest, readTable, type CatalogEntry, type Manifest } from '../lib/data'
import { contextCounts, inPeriod, monthDate, type Hotspot } from '../lib/investigation'
import { labelOf, useT } from '../lib/i18n'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import { useStore } from '../lib/store'

type Mode = 'fire' | 'water' | 'land' | 'action'
type Field = 'licence' | 'forest' | 'village' | 'dmpg'
const MODES: [Mode, string][] = [['fire', 'Fire'], ['water', 'Water'], ['land', 'Land & accountability'], ['action', 'Interventions']]
// layers switched on when a mode opens; every layer stays available in the layer panel
const PRESET: Record<Mode, string[]> = {
  fire: ['khg', 'burn', 'hotspots'], water: ['khg', 'canals', 'neraca_units', 'hotspots'],
  land: ['khg', 'forest', 'licences', 'target_villages', 'dmpg', 'hotspots'], action: ['khg', 'canal_segments', 'sekat_proposed', 'sekat_existing', 'hotspots'],
}
const DEM_COLOR: Record<string, string> = { lidar: '#2a78d6', deltadtm: '#eb6834', demnas: '#1baf7a',
  demnas_full: '#8a5cd6', lidar_full: '#c9a21a', worlddem_full: '#d6479a', brgmcontour_full: '#6b7280' }   // categorical slots 1-3 fixed per DEM; the team runs have their own
const GROUPS = ['boundary', 'hydrology', 'interventions', 'land', 'fire', 'ranking', 'neraca']
const GROUP_LABEL: Record<string, string> = { boundary: 'Boundary', hydrology: 'Hydrology', interventions: 'Interventions', land: 'Land status', fire: 'Fire', ranking: 'Sub-KHG units', neraca: 'Neraca air' }
const UNIT_ATTRS = [['u_deficit', 'Water deficit'], ['u_wb_mean', 'Mean water balance (mm)'], ['u_deficit_months', 'Deficit months'], ['wb_dry_mm', 'Dry-season balance (mm)']]
const FIELDS: [Field, string][] = [['licence', 'Licence area'], ['forest', 'Forest area'], ['village', 'Target village'], ['dmpg', 'DMPG village']]

type Spec = { kind: 'fill' | 'line' | 'circle'; color: string; width?: number; opacity?: number }
const STYLE: Record<string, Spec> = {
  khg: { kind: 'line', color: '#1c1c1c', width: 2 }, canals: { kind: 'line', color: '#0b6b8a', width: 0.9 }, rivers: { kind: 'line', color: '#2a78d6', width: 1.6 },
  canal_segments: { kind: 'line', color: '#0b6b8a', width: 1.2 }, blocks: { kind: 'circle', color: '#7a3e00', width: 2.5 }, brgm_infra: { kind: 'circle', color: '#6250d6', width: 3 },
  sekat_proposed: { kind: 'circle', color: '#e34948', width: 5 }, sekat_existing: { kind: 'circle', color: '#52514e', width: 3 }, neraca_stations: { kind: 'circle', color: '#008300', width: 4 },
  feg: { kind: 'fill', color: '#1baf7a', opacity: 0.25 }, licences: { kind: 'fill', color: '#eda100', opacity: 0.3 }, target_villages: { kind: 'fill', color: '#e87ba4', opacity: 0.3 },
  forest: { kind: 'fill', color: '#008300', opacity: 0.3 }, dmpg: { kind: 'fill', color: '#6250d6', opacity: 0.25 }, burn: { kind: 'fill', color: '#e34948', opacity: 0.45 },
}
// hover popup: which attributes to show per layer (label, key, format)
const n0 = (v: any) => Math.round(+v).toLocaleString()
const n1 = (v: any) => (+v).toFixed(1)
const n2 = (v: any) => (+v).toFixed(2)
const POP: Record<string, [string, string, ((v: any) => string)?][]> = {
  subkhg_units: [['Unit', 'unit_id'], ['Area (km²)', 'area_km2', n0], ['Water deficit', 'u_deficit', n1], ['Mean water balance (mm)', 'u_wb_mean', n0], ['Deficit months', 'u_deficit_months', n1], ['Blocks present', 'n_sekat_ada'], ['Blocks needed', 'n_sekat_perlu']],
  neraca_units: [['Unit', 'unit_id'], ['Mean water balance (mm)', 'u_wb_mean', n0], ['Deficit months', 'u_deficit_months', n1], ['Dry-season balance (mm)', 'wb_dry_mm', n0], ['Rain minus ET (mm)', 'p_minus_et_mean_mm', n0]],
  neraca_stations: [['Station', 'station_id'], ['Days', 'n_days'], ['Depth at end (cm)', 'depth_end_cm', n1], ['Share of days deeper than 40 cm', 'share_deeper_40cm', n2]],
  canals: [['Class', 'KET_KANAL'], ['Code', 'KODE_KANAL'], ['Length (km)', 'Length__KM', n2]],
  canal_segments: [['Class', 'canal_class'], ['Depth (m)', 'depth_m', n1], ['Width (m)', 'width_m', n1], ['Length (m)', 'length_m', n0], ['Need score', 'need_score', n2], ['Need rank', 'need_rank'], ['Peat class', 'peat_class']],
  sekat_proposed: [['Type', 'sekat_type'], ['Benefit rank', 'benefit_rank'], ['Gain (m²)', 'gain_m2', n0], ['Chainage (m)', 'chainage_m', n0], ['Land level (m)', 'z_land_m', n2], ['Canal', 'canal_id']],
  sekat_existing: [['Gate', 'has_gate'], ['Crest (m)', 'crest_elev_m', n2], ['Canal', 'canal_id'], ['Chainage (m)', 'chainage_m', n0]],
  blocks: [['Type', 'Tipe'], ['Kind', 'Jenis'], ['Material', 'Bahan'], ['Year', 'Tahun'], ['Activity', 'Kegiatan'], ['Village', 'DESA_2023']],
  brgm_infra: [['Type', 'Tipe'], ['Kind', 'Jenis'], ['Material', 'Bahan'], ['Year', 'Tahun'], ['Activity', 'Kegiatan'], ['Village', 'DESA_2023']],
  forest: [['Function', 'Fungsi_KWS']],
  feg: [['Function', 'FEG_KGHLTR'], ['Area (ha)', 'LUAS__HA', n0]],
  licences: [['Licence', 'IZIN_USAHA'], ['Activity', 'KEG_USAHA']],
  dmpg: [['Village', 'desa'], ['District', 'kecamatan'], ['Regency', 'kabupaten'], ['Unit', 'unit']],
  target_villages: [['Village', 'DESA_2023'], ['District', 'KEC_2023'], ['Regency', 'KABKO_2023']],
  hotspots: [['Confidence', 'conf'], ['Date', 'date'], ['FRP (MW)', 'frp', n1], ['Licence area', 'licence'], ['Forest area', 'forest'], ['Target village', 'village'], ['DMPG village', 'dmpg'], ['Years burned', 'burn_years']],
}
const esc = (v: any) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
function popupRows(id: string, props: Record<string, any>): [string, string][] {
  if (id === 'burn') {
    const years = Object.keys(props).filter((k) => /^BA_\d{4}$/.test(k) && props[k] != null && props[k] !== '' && props[k] !== 0 && props[k] !== '0').map((k) => k.slice(3))
    return [['Burn frequency', props.BURN_FREQ ?? ''], ['Years burned', years.join(', ')]]
  }
  const spec = POP[id]
  if (!spec) return Object.entries(props).filter(([, v]) => v != null && v !== '').slice(0, 5).map(([k, v]) => [k, String(v)])
  return spec.filter(([, k]) => props[k] != null && props[k] !== '' && props[k] !== 'null' && !(typeof props[k] === 'number' && Number.isNaN(props[k]))).map(([label, k, f]) => [label, f ? f(props[k]) : String(props[k])])
}
const num = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '-')
const fmt0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '-' : Math.round(v).toLocaleString())
const hasValues = (s: Series[]) => s.some((x) => x.points.length)
const FOREST: [string, string, string][] = [['cons', 'Conservation', '#6250d6'], ['hl', 'Protection forest', '#008300'], ['prod', 'Production forest', '#eda100'], ['hpk', 'Convertible production', '#e87ba4'], ['apl', 'Other land use', '#c9c8c0'], ['other', 'Water, undefined', '#9fb3c1']]
// times burned 2015-2026 (BURN_FREQ in the burnt-area layer), light to dark
const BURN: [string, string, string][] = [['1x Terbakar', '1×', '#fdcc8a'], ['2x Terbakar', '2×', '#fc8d59'], ['3x Terbakar', '3×', '#e34a33'], ['>3x Terbakar', '>3×', '#7f0000']]
const NONE = '__none'
const repeatBurn = (p: Hotspot) => String(p.burn_years ?? '').split(',').filter((y) => y.trim()).length > 1
const inField = (p: Hotspot, f: Field, v: string) => (v === NONE ? !p[f] : String(p[f] ?? '').split(' | ').includes(v))

export default function Khg() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const t = useT()
  const lang = useStore((s) => s.lang)
  const basemap = useStore((s) => s.basemap)
  const fire = useStore((s) => s.fire)
  const setFire = useStore((s) => s.setFire)
  const mode = (MODES.some(([m]) => m === sp.get('m')) ? sp.get('m') : 'fire') as Mode
  const cam = useRef<{ code: string; center: maplibregl.LngLatLike; zoom: number } | null>(null)
  const sat = basemap === 'satellite'
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const [mf, setMf] = useState<Manifest | null>(null)
  const [err, setErr] = useState('')
  const [dem, setDem] = useState('')
  const [visible, setVisible] = useState<Set<string>>(new Set(PRESET[mode]))
  const [raster, setRaster] = useState('none')          // 'relief', 'none', or a groundwater field id; the satellite image shows by default
  const [opacity, setOpacity] = useState(0.7)
  const [unitBy, setUnitBy] = useState('u_deficit')
  const [burnView, setBurnView] = useState<'year' | 'history' | 'repeat'>('year')
  const [points, setPoints] = useState<Hotspot[]>([])
  const [ctxReady, setCtxReady] = useState(false)
  const [field, setField] = useState<Field>('licence')
  const [ctxValue, setCtxValue] = useState<string | null>(null)
  const [picked, setPicked] = useState<Hotspot | null>(null)
  const [units, setUnits] = useState<any[]>([])
  const [balance, setBalance] = useState<any[]>([])
  const [series, setSeries] = useState<any[]>([])
  const [scores, setScores] = useState<any[]>([])
  const [water, setWater] = useState<any[]>([])
  const [deficit, setDeficit] = useState<any[]>([])
  const [deficitStats, setDeficitStats] = useState<any[]>([])
  const [yearly, setYearly] = useState<any[]>([])
  const [land, setLand] = useState<(LandRow & { khg_id: string })[]>([])
  const [cat, setCat] = useState<CatalogEntry[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => { loadCatalog().then(setCat); readTable('national/yearly.parquet').then(setYearly); readTable<any>('national/land_summary.parquet').then(setLand) }, [])
  useEffect(() => {
    setMf(null); setErr(''); setPoints([]); setCtxReady(false); setCtxValue(null); setPicked(null); setWater([]); setDeficit([]); setDeficitStats([])
    loadManifest(code).then((m) => {
      setMf(m); setDem((d) => (m.dems.includes(d) ? d : m.dems.includes('lidar') ? 'lidar' : m.dems[0]))
      const src = m.points.find((x) => x.id === 'hotspots')
      readTable<Hotspot>(`khg/${code}/investigation/hotspots.parquet`).then((p) => { setPoints(p); setCtxReady(true) })
        .catch(() => { if (src) readTable<Hotspot>(`khg/${code}/${src.file}`).then(setPoints) })
      for (const [id, set] of [['sitmat_daily', setWater], ['deficit_series', setDeficit], ['deficit_khg', setDeficitStats]] as const) {
        const f = m.tables.find((x) => x.id === id)
        if (f) readTable(`khg/${code}/${f.file}`).then(set)
      }
    }).catch((e) => setErr(String(e)))
  }, [code])

  const gw = mf?.groundwater.find((g) => g.dem === dem)
  useEffect(() => {
    if (!mf || !dem) return
    const tb = (id: string) => mf.tables.find((x) => x.id === id && x.dem === dem)
    const load = (id: string, set: (r: any[]) => void) => { const f = tb(id); f ? readTable(`khg/${code}/${f.file}`).then(set) : set([]) }
    load('subkhg_priority', setUnits); load('balance_monthly', setBalance)
    const f = (id: string) => gw?.files.find((x) => x.id === id)
    const ms = f('model_series'); ms ? readTable(`khg/${code}/${ms.file}`).then(setSeries) : setSeries([])
    const sc = f('station_scores'); sc ? readTable(`khg/${code}/${sc.file}`).then(setScores) : setScores([])
  }, [mf, dem, gw, code])

  // hotspots: the period filter, then the area picked in the ledger
  const period = useMemo(() => points.filter((p) => inPeriod(p, fire)), [points, fire])
  const filtered = useMemo(() => (ctxValue ? period.filter((p) => inField(p, field, ctxValue)) : period), [period, ctxValue, field])
  const years = useMemo(() => [...new Set(points.map((p) => Math.floor(p.ym / 100)))].sort((a, b) => b - a), [points])
  useEffect(() => { if (years.length && !years.includes(fire.year)) setFire({ year: years[0] }) }, [years])
  useEffect(() => { setCtxValue(null); setPicked(null) }, [fire, field])

  // map: create once per KHG
  useEffect(() => {
    if (!mf) return
    initMaplibre()
    const keep = cam.current?.code === code ? cam.current : null   // keep the view when only the basemap changes
    const map = new maplibregl.Map({ container: el.current!, style: styleFor(basemap), ...(keep ? { center: keep.center, zoom: keep.zoom } : { bounds: [[mf.bounds[0], mf.bounds[1]], [mf.bounds[2], mf.bounds[3]]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 30 } }), attributionControl: { compact: true } })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.on('load', () => setReady(true))
    mapRef.current = map
    return () => { cam.current = { code, center: map.getCenter(), zoom: map.getZoom() }; marker.current?.remove(); marker.current = null; setReady(false); map.remove() }
  }, [mf, basemap])

  const unitRange = (rows: any[], k: string): [number, number] => { const e = extent(rows, (r) => r[k]) as [number, number]; return e[0] == null || e[0] === e[1] ? [0, 1] : e }
  const rampExpr = (attr: string, [lo, hi]: [number, number]) => ['interpolate', ['linear'], ['coalesce', ['get', attr], lo], ...SEQ.flatMap((c, i) => [lo + ((hi - lo) * i) / 4, c])] as any
  const range = useMemo(() => unitRange(units, unitBy), [units, unitBy])

  // sync our layers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !mf) return
    for (const l of map.getStyle().layers) if (l.id.startsWith('x-')) map.removeLayer(l.id)
    for (const id of Object.keys(map.getStyle().sources)) if (id.startsWith('x-')) map.removeSource(id)
    const add = (id: string, src: any, layer: any) => { map.addSource(`x-${id}`, src); map.addLayer({ id: `x-${id}`, source: `x-${id}`, ...layer }) }
    if (raster === 'relief') {
      const r = mf.raster.find((x) => x.dem === dem)
      if (r) add('relief', { type: 'raster', url: pm(`khg/${code}/${r.file}`), tileSize: 256, maxzoom: r.max_zoom }, { type: 'raster', paint: { 'raster-opacity': opacity } })
    } else if (raster !== 'none' && gw) {
      const r = gw.rasters.find((x) => x.id === raster)
      if (r) add('gw', { type: 'raster', url: pm(`khg/${code}/${r.file}`), tileSize: 256 }, { type: 'raster', paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest' } })
    }
    const order = ['fill', 'line', 'circle']
    const vs = mf.vector.filter((v) => (v.dem == null || v.dem === dem) && visible.has(v.id)).sort((a, b) => order.indexOf((STYLE[a.id]?.kind ?? 'fill')) - order.indexOf((STYLE[b.id]?.kind ?? 'fill')))
    for (const v of vs) {
      const src = { type: 'vector', url: pm(`khg/${code}/${v.file}`) }
      const sl = v.id
      if (v.id === 'subkhg_units' || v.id === 'neraca_units') {
        add(v.id, src, { type: 'fill', 'source-layer': sl, paint: { 'fill-color': rampExpr(unitBy, range), 'fill-opacity': sat ? 0.5 : 0.75, 'fill-outline-color': sat ? '#ffffff' : '#333' } })
      } else if (v.id === 'canals') {
        add(v.id, src, { type: 'line', 'source-layer': sl, paint: { 'line-color': sat ? '#4fd1ff' : '#0b6b8a', 'line-width': ['match', ['get', 'KET_KANAL'], 'Kanal Primer', 2.2, 'Kanal Sekunder', 1.3, 0.7] } })
      } else if (v.id === 'burn') {
        const filter = burnView === 'year' ? ['>', ['to-number', ['get', `BA_${fire.year}`], 0], 0] : burnView === 'repeat' ? ['!=', ['get', 'BURN_FREQ'], BURN[0][0]] : undefined
        const graded = ['match', ['get', 'BURN_FREQ'], ...BURN.flatMap(([k, , c]) => [k, c]), BURN[0][2]]
        add(v.id, src, { type: 'fill', 'source-layer': sl, ...(filter ? { filter } : {}), paint: { 'fill-color': burnView === 'year' ? '#e34948' : graded, 'fill-opacity': burnView === 'year' ? 0.45 : 0.62, 'fill-outline-color': burnView === 'year' ? '#e34948' : graded } })
      } else if (v.id === 'forest') {
        const m = ['match', ['get', 'cls'], ...FOREST.flatMap(([k, , c]) => [k, c]), '#9fb3c1']
        add(v.id, src, { type: 'fill', 'source-layer': sl, paint: { 'fill-color': m, 'fill-opacity': sat ? 0.42 : 0.5, 'fill-outline-color': m } })
      } else {
        const s0 = STYLE[v.id] ?? { kind: 'fill' as const, color: '#888', opacity: 0.3 }
        const s = sat && v.id === 'khg' ? { ...s0, color: '#ffd23f' } : sat && v.id === 'canal_segments' ? { ...s0, color: '#4fd1ff' } : sat && v.id === 'rivers' ? { ...s0, color: '#7fb6ff' } : s0
        const paint = s.kind === 'fill' ? { 'fill-color': s.color, 'fill-opacity': s.opacity ?? 0.3, 'fill-outline-color': s.color }
          : s.kind === 'line' ? { 'line-color': s.color, 'line-width': s.width ?? 1 } : { 'circle-color': s.color, 'circle-radius': s.width ?? 3, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 }
        add(v.id, src, { type: s.kind, 'source-layer': sl, paint })
      }
    }
    if (visible.has('hotspots') && filtered.length) {
      const feats = filtered.map((p, i) => ({ type: 'Feature', properties: { i, conf: p.conf, date: p.date ?? '', frp: p.frp, licence: p.licence ?? '', forest: p.forest ?? '', village: p.village ?? '', dmpg: p.dmpg ?? '', burn_years: p.burn_years ?? '' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))
      add('hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } }, { type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2.5, 13, 6], 'circle-color': ['match', ['get', 'conf'], 'high', '#e34948', '#6250d6'], 'circle-opacity': 0.9, 'circle-stroke-width': 0.8, 'circle-stroke-color': '#fff' } })
    }
  }, [mf, dem, visible, raster, opacity, unitBy, range, burnView, fire.year, filtered, ready, gw, code, sat])

  // hover popup: attributes of the features under the cursor, top layer first; click picks a hotspot
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !mf) return
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '300px', offset: 8 })
    const label = (id: string) => id === 'hotspots' ? t('Hotspots') : (() => { const v = mf.vector.find((x) => x.id === id); return v ? labelOf(v.label, lang) : id })()
    const layers = () => map.getStyle().layers.filter((l) => l.id.startsWith('x-') && l.type !== 'raster').map((l) => l.id)
    const move = (e: maplibregl.MapMouseEvent) => {
      const ids = layers()
      const fs = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : []
      if (!fs.length) { popup.remove(); map.getCanvas().style.cursor = ''; return }
      map.getCanvas().style.cursor = 'pointer'
      const seen = new Set<string>(), parts: string[] = []
      for (const f of [...fs].sort((a, b) => (b.layer.id === 'x-hotspots' ? 1 : 0) - (a.layer.id === 'x-hotspots' ? 1 : 0))) {
        const id = f.layer.id.slice(2)
        if (seen.has(id) || seen.size >= 3) continue
        seen.add(id)
        const rows = popupRows(id, f.properties)
        parts.push(`<div style="margin-bottom:4px"><b>${esc(label(id))}</b>${rows.map(([k, v]) => `<div style="display:flex;gap:8px;justify-content:space-between"><span class="muted">${esc(t(k))}</span><span>${esc(v)}</span></div>`).join('')}</div>`)
      }
      popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px">${parts.join('')}</div>`).addTo(map)
    }
    const click = (e: maplibregl.MapMouseEvent) => {
      if (!map.getLayer('x-hotspots')) return
      const f = map.queryRenderedFeatures(e.point, { layers: ['x-hotspots'] })[0]
      marker.current?.remove()
      if (!f) { setPicked(null); return }
      const p = filtered[f.properties.i]
      setPicked(p ?? null)
      if (p) marker.current = new maplibregl.Marker({ color: '#eb6834' }).setLngLat([p.lon, p.lat]).addTo(map)
    }
    map.on('mousemove', move); map.on('click', click)
    map.on('mouseout', () => popup.remove())
    return () => { map.off('mousemove', move); map.off('click', click); popup.remove() }
  }, [ready, mf, lang, t, filtered])

  const toggle = (id: string) => setVisible((v) => { const n = new Set(v); n.has(id) ? n.delete(id) : n.add(id); return n })
  const chooseMode = (m: Mode) => { setSp({ m }, { replace: true }); setVisible(new Set(PRESET[m])); setCtxValue(null) }
  const fitTo = (rows: Hotspot[]) => {
    const map = mapRef.current
    if (!map || !rows.length) return
    const b = new maplibregl.LngLatBounds([rows[0].lon, rows[0].lat], [rows[0].lon, rows[0].lat])
    for (const p of rows) b.extend([p.lon, p.lat])
    map.fitBounds(b, { padding: 70, maxZoom: 13 })
  }
  const pickArea = (v: string | null) => { setCtxValue(v); if (v) fitTo(period.filter((p) => inField(p, field, v))) }
  const focusPoint = (p: Hotspot) => {
    const map = mapRef.current; if (!map) return
    setPicked(p); map.flyTo({ center: [p.lon, p.lat], zoom: 13 }); marker.current?.remove(); marker.current = new maplibregl.Marker({ color: '#eb6834' }).setLngLat([p.lon, p.lat]).addTo(map)
  }
  const exportCsv = () => {
    const fields: (keyof Hotspot)[] = ['lon', 'lat', 'date', 'ym', 'conf', 'peat', 'kind', 'frp', 'licence', 'forest', 'village', 'dmpg', 'burn_years']
    const csv = [fields.join(','), ...filtered.map((p) => fields.map((k) => `"${String(p[k] ?? '').replaceAll('"', '""')}"`).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${code}-${fire.year}-hotspots.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // ---- time series (all follow the fire filter) ----
  const kind = 'viirs'
  const monthSeries = useMemo<Series[]>(() => (fire.high ? ['high'] : ['medium', 'high']).map((conf) => {
    const src = points.filter((p) => p.kind === kind && Math.floor(p.ym / 100) === fire.year && p.conf === conf && (!fire.peat || p.peat) && (!ctxValue || inField(p, field, ctxValue)))
    const last = Math.max(0, ...points.filter((p) => p.kind === kind && Math.floor(p.ym / 100) === fire.year).map((p) => p.ym % 100))
    const m = new Map<number, number>(Array.from({ length: last }, (_, i) => [fire.year * 100 + i + 1, 0]))
    for (const p of src) m.set(p.ym, (m.get(p.ym) ?? 0) + 1)
    return { name: t(`${conf} confidence`), color: conf === 'high' ? 'var(--s8)' : 'var(--s7)', points: [...m].sort((a, b) => a[0] - b[0]).map(([ym, y]) => ({ x: monthDate(ym), y })) }
  }), [points, fire, kind, t, ctxValue, field])
  const khgId = cat.find((c) => c.code === code)?.khg_id
  const burned: Series[] = [{ name: t('Burned peat per year'), color: 'var(--s2)', points: yearly.filter((r) => r.khg_id === khgId && r.metric === 'burned_peat_km2').sort((a, b) => a.year - b.year).map((r) => ({ x: new Date(r.year, 6, 1), y: r.value })) }]
  const yearDom: [Date, Date] = [new Date(fire.year, 0, 1), new Date(fire.year, 11, 31)]
  const inYear = (d: Date) => d.getFullYear() === fire.year
  const sel: [Date, Date] = [new Date(fire.year, fire.start - 1, 1), new Date(fire.year, fire.end, 0)]
  const clickMonth = (d: Date) => setFire({ year: d.getFullYear(), start: d.getMonth() + 1, end: d.getMonth() + 1 })

  const wbSeries = useMemo<Series[]>(() => {
    const m = new Map<string, number[]>()
    for (const r of balance) { if (r.WB_mm == null) continue; const a = m.get(r.month) ?? []; a.push(r.WB_mm); m.set(r.month, a) }
    return [{ name: t('Climatic balance'), color: 'var(--s1)', points: [...m].sort().map(([k, v]) => ({ x: new Date(`${k}-15`), y: mean(v) as number })).filter((p) => inYear(p.x)) }]
  }, [balance, t, fire.year])
  const stationSeries = useMemo<Series[]>(() => ['community', 'concession'].map((k) => {
    const d = new Map<string, number[]>()
    for (const r of water) if (r.kind === k && r.flag == null && r.water_level_cm != null && !Number.isNaN(r.water_level_cm)) { const a = d.get(r.date) ?? []; a.push(r.water_level_cm); d.set(r.date, a) }
    return { name: t(k), color: k === 'community' ? 'var(--s5)' : 'var(--s6)', points: [...d].sort().map(([date, v]) => ({ x: new Date(date), y: median(v) as number })).filter((p) => inYear(p.x)) }
  }).filter((s) => s.points.length), [water, t, fire.year])
  const deficitSeries: Series[] = [{ name: t('Observed mean depth'), color: 'var(--s7)', points: deficit.filter((r) => r.obs_mean_cm != null).map((r) => ({ x: new Date(r.date), y: r.obs_mean_cm })).filter((p) => inYear(p.x)) }]
  const modelDepth: Series[] = [{ name: t('Open land'), color: 'var(--s3)', points: series.map((r) => ({ x: new Date(r.date), y: r.unmanaged_mean_depth_cm })).filter((p) => inYear(p.x)) }]
  const gwWater: Series[] = [{ name: t('Rain'), color: 'var(--s1)', points: series.map((r) => ({ x: new Date(r.date), y: r.P_mm })).filter((p) => inYear(p.x)) }, { name: t('Evapotranspiration'), color: 'var(--s2)', points: series.map((r) => ({ x: new Date(r.date), y: r.ET_mm })).filter((p) => inYear(p.x)) }]

  // ---- ledger ----
  const ledger = useMemo(() => {
    const total = period.length
    const rows = contextCounts(period, field).map(([label, n]) => ({ label, n, share: total ? (n / total) * 100 : 0, repeat: period.filter((p) => inField(p, field, label) && repeatBurn(p)).length }))
    const outside = period.filter((p) => inField(p, field, NONE))
    if (outside.length) rows.push({ label: NONE, n: outside.length, share: total ? (outside.length / total) * 100 : 0, repeat: outside.filter(repeatBurn).length })
    return rows
  }, [period, field])
  const ledgerCols: Col<(typeof ledger)[number]>[] = [
    { key: 'label', label: t(FIELDS.find((f) => f[0] === field)![1]), fmt: (v) => (v === NONE ? t('Outside mapped areas') : String(v)) },
    { key: 'n', label: t('Hotspots'), align: 'right', fmt: fmt0 },
    { key: 'share', label: t('Share'), unit: '%', align: 'right', fmt: (v) => v.toFixed(0) },
    { key: 'repeat', label: t('Repeat burns'), align: 'right', fmt: fmt0 },
  ]

  if (err) return <div className="p-6">{err}</div>
  if (!mf) return <div className="p-6 muted">{t('Loading')}…</div>
  const stats = gw?.station_scores?.all?.model
  const rasterRec = mf.raster.find((r) => r.dem === dem)
  const gwRaster = gw?.rasters.find((r) => r.id === raster)
  const rasterOpts = [['none', t('Satellite image only')], ['relief', t('DEM relief')], ...(gw ? gw.rasters.map((r) => [r.id, labelOf(r.label, lang)]) : [])]
  const missingDem = mf.missing.filter((m) => m.dem === dem)
  const unitsShown = visible.has('subkhg_units') || visible.has('neraca_units')
  const polyLayers = mf.vector.filter((v) => visible.has(v.id) && ['licences', 'feg', 'target_villages', 'dmpg'].includes(v.id))
  const Empty = ({ title }: { title: string }) => <div className="card muted p-3 text-sm">{title}: {t('No observations available')}</div>
  const chart = (title: string, s: Series[], o: { y?: string; fmt?: (v: number) => string; zero?: boolean; h?: number } = {}) => hasValues(s)
    ? <LineChart title={title} series={s} yLabel={o.y} fmt={o.fmt} zeroBase={o.zero} height={o.h} xDomain={yearDom} sync selectedRange={sel} onDateSelect={clickMonth} /> : <Empty title={title} />

  const layerPanel = (
    <details open className="card p-3">
      <summary className="cursor-pointer font-medium">{t('Layers')}</summary>
      <div className="mt-2 mb-2 flex items-center gap-2">
        <select className="card flex-1 px-2 py-1" value={raster} onChange={(e) => setRaster(e.target.value)} aria-label={t('Map layer')}>{rasterOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="muted text-xs">{t('Opacity')} <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>
      </div>
      {gw && raster !== 'relief' && raster !== 'none' && <div className="muted mb-2 text-xs">{t('Groundwater model')}: {t(gw.stage)} · {gw.res_m} m · {gw.season}</div>}
      {GROUPS.map((g) => { const vs = mf.vector.filter((v) => v.group === g && (v.dem == null || v.dem === dem)); if (!vs.length && g !== 'fire') return null
        return <div key={g} className="mb-2"><div className="muted text-xs uppercase">{t(GROUP_LABEL[g])}</div>
          {vs.map((v) => <label key={v.id} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={visible.has(v.id)} onChange={() => toggle(v.id)} />
            <i className="chip" style={{ background: STYLE[v.id]?.color ?? 'var(--s1)' }} />{labelOf(v.label, lang)}<span className="muted ml-auto text-xs">{v.features ?? ''}</span></label>)}
          {g === 'fire' && points.length > 0 && <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={visible.has('hotspots')} onChange={() => toggle('hotspots')} /><i className="chip" style={{ background: 'var(--s8)', borderRadius: '50%' }} />{t('Hotspots')}<span className="muted ml-auto text-xs">{filtered.length.toLocaleString()}</span></label>}
        </div> })}
      {units.length > 0 && <div className="flex items-center gap-2 text-xs"><span className="muted">{t('Colour units by')}</span>
        <select className="card px-1" value={unitBy} onChange={(e) => setUnitBy(e.target.value)}>{UNIT_ATTRS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></div>}
      {missingDem.length > 0 && <div className="muted mt-2 text-xs">{t('Not available for this DEM')}: {missingDem.map((m) => m.id).join(', ')}</div>}
    </details>
  )

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-lg font-semibold">{mf.name}</div><div className="muted">{mf.province}</div>
        <div className="ml-auto flex items-center gap-1">
          <span className="muted text-xs">{t('DEM')}</span>
          {mf.dems.map((d) => <button key={d} className="btn" aria-pressed={dem === d} onClick={() => setDem(d)}><i className="chip" style={{ background: DEM_COLOR[d] }} />{mf.dem_labels?.[d] ? labelOf(mf.dem_labels[d], lang) : d}</button>)}
          <button className="btn ml-2" onClick={exportCsv} disabled={!filtered.length}>{t('Export selection')} ↓</button>
        </div>
      </div>
      <FilterBar years={years.length ? years : [fire.year]} count={filtered.length}>
        {ctxValue && <button className="btn text-xs" onClick={() => pickArea(null)}>{ctxValue === NONE ? t('Outside mapped areas') : ctxValue} ×</button>}
      </FilterBar>
      <div className="flex gap-1" role="tablist">
        {MODES.map(([m, l]) => <button key={m} role="tab" className="btn" aria-pressed={mode === m} onClick={() => chooseMode(m)}>{t(l)}</button>)}
        <button className="btn ml-auto text-xs" onClick={() => nav('/')}>← {t('Indonesia')}</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="card relative overflow-hidden" style={{ height: 'calc(100vh - 470px)', minHeight: 420 }}>
            <div ref={el} className="h-full w-full" data-ready={ready} />
            {visible.has('burn') && <div className="absolute left-3 top-3 flex gap-1">
              {(['year', 'history', 'repeat'] as const).map((v) => <button key={v} className="btn text-xs" aria-pressed={burnView === v} onClick={() => setBurnView(v)}>{v === 'year' ? fire.year : t(v === 'history' ? 'All years' : 'Repeat burns')}</button>)}
            </div>}
            <LegendCard>
              {visible.has('hotspots') && <><Swatch color="#e34948" round>{t('high confidence')}</Swatch>{!fire.high && <Swatch color="#6250d6" round>{t('medium confidence')}</Swatch>}</>}
              {visible.has('burn') && (burnView === 'year' ? <Swatch color="#e34948" opacity={0.45}>{t('Burn footprint')} · {fire.year}</Swatch>
                : <><div className="text-xs font-medium">{t('Times burned')} · 2015–2026</div><div className="flex gap-1">{BURN.filter(([k]) => burnView === 'history' || k !== BURN[0][0]).map(([k, l, c]) => <span key={k} className="flex items-center gap-1 text-xs"><i className="chip" style={{ background: c, marginRight: 0 }} />{l}</span>)}</div></>)}
              {visible.has('forest') && <><div className="text-xs font-medium">{t('Forest area function')}</div><div className="grid grid-cols-2 gap-x-2">{FOREST.map(([k, l, c]) => <Swatch key={k} color={c} opacity={0.7}>{t(l)}</Swatch>)}</div></>}
              {polyLayers.map((v) => <Swatch key={v.id} color={STYLE[v.id].color} opacity={0.6}>{labelOf(v.label, lang)}</Swatch>)}
              {unitsShown && <RampLegend title={t(UNIT_ATTRS.find((a) => a[0] === unitBy)![1])} stops={SEQ} lo={range[0]} hi={range[1]} />}
              {raster === 'relief' && rasterRec && <RampLegend title={`${t('Elevation (m)')} · ${dem}`} stops={TERRAIN} lo={rasterRec.z_range[0]} hi={rasterRec.z_range[1]} fmt={(v) => v.toFixed(1)} note={t('Shaded relief; colour shows elevation')} />}
              {gwRaster && <RampLegend title={labelOf(gwRaster.label, lang)} stops={FIELD} lo={gwRaster.range[0]} hi={gwRaster.range[1]} fmt={(v) => String(Math.round(v))} note={`${t('Groundwater model')} · ${t('in development')}`} />}
            </LegendCard>
          </div>
          {rasterRec && <div className="muted -mt-2 text-xs">{dem}: {rasterRec.res_m.toFixed(1)} m {t('cells')} · {rasterRec.zoom_capped ? `tiles to zoom ${rasterRec.max_zoom} (native ${rasterRec.native_zoom})` : `tiles to zoom ${rasterRec.max_zoom}`}{rasterRec.note ? ` · ${rasterRec.note}` : ''}</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {chart(`${t('Hotspots per month')} · ${fire.year}`, monthSeries, { fmt: (v) => String(Math.round(v)), zero: true, h: 150 })}
            <LineChart title={t('Burned peat per year')} yLabel="km²" series={burned} zeroBase height={150} selectedRange={[new Date(fire.year, 0, 1), new Date(fire.year, 11, 31)]} onDateSelect={(d) => setFire({ year: d.getFullYear(), start: 1, end: 12 })} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
          {picked && <div className="card p-3 text-sm">
            <div className="flex items-center"><b>{picked.date || `${picked.ym} · ${t('Month only')}`}</b><button className="btn ml-auto text-xs" onClick={() => { setPicked(null); marker.current?.remove() }} aria-label={t('Clear selection')}>×</button></div>
            <div className="muted text-xs">{picked.lat.toFixed(5)}, {picked.lon.toFixed(5)} · {t(`${picked.conf} confidence`)} · FRP {num(picked.frp, 1)} MW</div>
            {(['forest', 'licence', 'village', 'dmpg', 'burn_years'] as const).map((k) => <div key={k} className="mt-1"><div className="muted text-xs">{t(({ forest: 'Forest area', licence: 'Licence area', village: 'Target village', dmpg: 'DMPG village', burn_years: 'Years burned' })[k])}</div><div>{picked[k] || t(ctxReady ? 'No intersection in supplied layer' : 'Context data not built')}</div></div>)}
          </div>}

          {mode === 'fire' && <>
            <div className="card grid grid-cols-3 gap-2 p-3 text-center">
              <div><div className="text-xl font-semibold">{fmt0(filtered.length)}</div><div className="muted text-xs">{t('hotspot detections')}</div></div>
              <div><div className="text-xl font-semibold">{fmt0(filtered.filter(repeatBurn).length)}</div><div className="muted text-xs">{t('in repeat-burn areas')}</div></div>
              <div><div className="text-xl font-semibold">{fmt0(filtered.reduce((a, p) => a + (p.frp ?? 0), 0))}</div><div className="muted text-xs">FRP (MW)</div></div>
            </div>
            <MonthYearHeat title={t('Hotspots per month and year')} points={points} high={fire.high} peat={fire.peat} year={fire.year} start={fire.start} end={fire.end} onPick={(y, m) => setFire({ year: y, start: m, end: m })} />
            <p className="muted px-1 text-xs">{t('Detections are satellite observations, not individual fire events.')}</p>
            <details className="card p-3"><summary className="cursor-pointer font-medium">{t('Detection register')} <span className="muted text-xs">{filtered.length.toLocaleString()}</span></summary>
              <div className="mt-2 max-h-[300px] overflow-auto text-xs">{filtered.slice().sort((a, b) => b.ym - a.ym || (b.frp ?? 0) - (a.frp ?? 0)).slice(0, 100).map((p, i) =>
                <button key={i} className="flex w-full justify-between py-0.5 text-left hover:underline" onClick={() => focusPoint(p)}><span>{p.date || `${p.ym} · ${t('Month only')}`} <span className="muted">{p.lat.toFixed(3)}, {p.lon.toFixed(3)}</span></span><span>{num(p.frp, 1)} MW</span></button>)}</div>
              {filtered.length > 100 && <p className="muted mt-1 text-xs">{t('Showing 100 detections. Export for the full selection.')}</p>}</details>
          </>}

          {mode === 'water' && <>
            {chart(t('Climatic balance'), wbSeries, { y: 'mm', fmt: (v) => v.toFixed(0) })}
            {deficitStats.map((s, i) => <div key={i} className="card p-3 text-xs" title={s.method}><span className="muted">{t('Station-based deficit')}</span> <b className="text-base">{fmt0(s.deficit_mm)} mm</b>
              <div className="muted">{s.period_start} → {s.period_end} · {fmt0(s.deficit_mm_low)}–{fmt0(s.deficit_mm_high)} mm · {s.n_stations} {t('stations')}</div></div>)}
            {hasValues(stationSeries) ? chart(`${t('Water level at SiTMAT stations')} · ${fire.year}`, stationSeries, { y: 'cm' }) : <Empty title={t('Water level at SiTMAT stations')} />}
            {chart(t('Observed mean depth'), deficitSeries, { y: 'cm' })}
            <div className="card p-3 text-xs"><b>{t('Groundwater model')}</b> · {t(gw?.stage ?? 'in development')}<br />
              {gw ? <span className="muted">{gw.run} · {gw.res_m} m · {gw.rain} / {gw.et} · {gw.season}</span> : <span className="muted">{t('Not available for this DEM')}</span>}
              {stats && (stats.bias_cm != null ? <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
                <div><b>{stats.n}</b><div className="muted text-xs">{t('stations')}</div></div>
                <div><b>{num(stats.spearman, 2)}</b><div className="muted text-xs">{t('Rank correlation')}</div></div>
                <div><b>{num(stats.bias_cm, 1)}</b><div className="muted text-xs">{t('Bias (cm)')}</div></div>
                <div><b>{num(stats.rmse_cm, 1)}</b><div className="muted text-xs">{t('RMSE (cm)')}</div></div></div>
                : <div className="muted mt-2 text-xs">{stats.n} {t('stations')}: {t('not testable, too few stations')}</div>)}</div>
            {gw && hasValues(modelDepth) && chart(t('Mean water-table depth (cm)'), modelDepth, { y: 'cm' })}
            {gw && hasValues(gwWater) && chart(t('Rain and evapotranspiration (mm/day)'), gwWater)}
            {scores.length > 0 && <details className="card p-3 text-xs"><summary className="cursor-pointer font-medium">{t('Station scores')}</summary>
              <table className="mt-1 w-full"><thead><tr><th className="text-left">station</th><th className="text-right">obs (cm)</th><th className="text-right">sim (cm)</th><th className="pl-2 text-left">flag</th></tr></thead>
                <tbody>{scores.map((s) => <tr key={s.station_id}><td>{String(s.station_id).split(':').pop()}</td><td className="text-right">{num(s.obs_cm, 1)}</td><td className="text-right">{num(s.sim_cm, 1)}</td><td className="pl-2">{s.flag ?? ''}</td></tr>)}</tbody></table></details>}
          </>}

          {mode === 'land' && <LandStatus rows={land.filter((r) => r.khg_id === khgId)} />}
          {mode === 'land' && <div className="card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="font-medium">{t('Where do detections fall?')}</div>
              <select className="card ml-auto px-1" value={field} onChange={(e) => setField(e.target.value as Field)} aria-label={t('Intersect with')}>{FIELDS.map(([f, l]) => <option key={f} value={f}>{t(l)}</option>)}</select>
            </div>
            {!ctxReady ? <p className="muted text-xs">{t('Context data not built')}</p>
              : <DataTable rows={ledger} cols={ledgerCols} rowKey="label" searchKeys={['label']} placeholder={t('Search')} selectedKey={ctxValue} onRow={(r) => pickArea(ctxValue === r.label ? null : r.label)} initialSort={{ key: 'n', dir: -1 }} />}
            <p className="muted mt-2 text-xs">{t('Spatial overlap does not establish responsibility. Overlapping areas may count the same detection.')}</p>
            <p className="muted text-xs">{t('Village coverage: target and DMPG villages only. Holder names follow the data export settings.')}</p>
          </div>}

          {mode === 'action' && <div className="card p-3 text-sm">
            <div className="mb-1 font-medium">{t('Interventions')}</div>
            <p className="muted mb-2 text-xs">{t('Proposed interventions are design outputs, not completed works.')}</p>
            {mf.vector.filter((v) => (v.group === 'interventions' || v.id === 'canal_segments') && (v.dem == null || v.dem === dem)).map((v) => <label key={v.id} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={visible.has(v.id)} onChange={() => toggle(v.id)} />
              <i className="chip" style={{ background: STYLE[v.id]?.color }} />{labelOf(v.label, lang)}<b className="ml-auto">{fmt0(v.features)}</b></label>)}
            <p className="muted mt-2 text-xs">{t('Hover a block or canal on the map to see its design attributes.')}</p>
          </div>}

          {layerPanel}
        </div>
      </div>
    </div>
  )
}
