// Map of one KHG on the profile page: peat, burn counts, canals by class, this year's hotspots, the layers behind the scores and
// the land status, from the per-KHG archive of the prioritisation (khg_tiles/KHG.<code>.pmtiles, read where it is published);
// the DEM relief of the KHG workspace where one was built. Ported from the prioritisation page (initProfileMap and helpers).
import * as d3 from 'd3'
import { dataUrl } from '@/lib/data'
import { initMaplibre, maplibregl } from '@/lib/map'
import { useStore } from '@/lib/store'
import { css, esc, monf, t, type Profile } from './core'
import { ovColor, OVCLS } from './render'
import { firstSymbol, mapLabels, mutedStyle, restyleBase } from './state'

export const XL: Record<string, [string, string, [string | number, string, string][]]> = {
  depth: ['Peat depth', "Peat thickness classes (KLHK FEG, in KLH's PPEG analysis). Stake counts the share 3 m or deeper.", [[0, '< 1 m', '#f1e3c8'], [1, '1-2 m', '#dcb47a'], [2, '2-3 m', '#b98142'], [3, '3-5 m', '#8a5325'], [4, '5 m or more', '#4f2a10'], [9, 'No class', '#d9d4c7']]],
  dome: ['Peat dome', "Peat dome landform (BBSDLP, in KLH's PPEG analysis). Stake counts the share of the peat on a dome.", [[1, 'Peat dome', '#1f4e79']]],
  skeg: ['Damage (SKEG)', 'Peat damage status SKEG 2024 (KLH). Urgency counts the damaged share of the peat.', [[0, 'Not damaged', '#cfe3d4'], [1, 'Light', '#f2c57c'], [2, 'Moderate', '#e8863a'], [3, 'Heavy', '#c0392b'], [4, 'Very heavy', '#7b1c12']]],
  czone: ['Canal zones', 'Canal-influence zones (KLH, PPEG KET_KANAL). Urgency counts the canal-affected share; 20% or more means rewetting.', [['p', 'Primary canal zone', '#6fa8d6'], ['s', 'Secondary canal zone', '#a7cbe8'], ['t', 'Tertiary canal zone', '#d6e7f4']]],
  lc: ['Land cover 2022', 'KLH land cover 2022 (PL_2022). Open or degraded cover of 20% or more means revegetation.', [['forest', 'Forest', '#3f7d4e'], ['open', 'Open or degraded', '#e5c35c'], ['plantation', 'Plantation', '#a45ba0'], ['farm', 'Farmland', '#d99a6c'], ['settlement', 'Settlement', '#6d6d6d'], ['water', 'Water', '#8fb8d8']]],
  sf: ['Social forestry', 'Social forestry (village forest, community plantation, IPHPS) and PPTPKH land: claims counted in tenure complexity.', [['hd', 'Village forest (HD)', '#2a78d6'], ['htr', 'Community plantation (HTR)', '#5fa3cf'], ['iphps', 'IPHPS', '#93c1e6'], ['pptpkh', 'PPTPKH', '#c2307a']]],
  pop: ['People', 'People per km2, IHME Populace 2025 third quarter (40 m grid). The people dimension counts the people on the peat and within 10 km.', []],
}
export type MapState = {
  sat: boolean; layers: { peat: boolean; burn: boolean; p: boolean; s: boolean; t: boolean; now: boolean }
  now: { a: number; b: number; high: boolean }; x: { mode: string; river: boolean; road: boolean; brgm: boolean }
  ov: { mode: string; dmpg: boolean; vil: boolean }; dem: { file: string | null; maxzoom: number; opacity: number }; confHigh: boolean
}
export const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', SAT_CREDIT = 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
const X_LAYERS = ['p-x-depth', 'p-x-dome', 'p-x-dome-line', 'p-x-skeg', 'p-x-czone', 'p-x-lc', 'p-x-sf', 'p-x-sf-line', 'p-x-pptpkh', 'p-x-lake', 'p-x-river', 'p-x-road', 'p-x-brgm']
const TILE_LAYERS = [...X_LAYERS, 'p-peat', 'p-burn', 'p-outline', 'p-canal-t', 'p-canal-s', 'p-canal-p', 'p-ov-forest', 'p-ov-feg', 'p-ov-lic', 'p-ov-lic-line', 'p-ov-ring', 'p-ov-vil', 'p-ov-vil-f', 'p-ov-dmpg', 'p-ov-dmpg-line']
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const xMatch = (layer: string): any => ['match', ['get', 'c'], ...XL[layer][2].flatMap(([c, , col]) => [c, col]), '#999']
const ovMatch = (layer: string): any => ['match', ['get', 'c'], ...OVCLS[layer].flatMap(([c]) => [c, ovColor(layer, c)]), ovColor(layer, 'none')]
let POPIDX: any = null, popReq: Promise<any> | null = null
export const popIndex = (base: string) => (popReq ??= fetch(base + 'pop/index.json').then((r) => (r.ok ? r.json() : null)).then((j) => (POPIDX = j)).catch(() => null))
export const popIdx = () => POPIDX

export class ProfileMap {
  m: maplibregl.Map; ready = false; pr: Profile | null = null; popOk = false; private tileK = ''
  private queue: (() => void)[] = []
  private base: string; private demCode: string | null
  constructor(container: HTMLElement, base: string, demCode: string | null) {
    this.base = base; this.demCode = demCode
    initMaplibre()
    this.m = new maplibregl.Map({ container, style: mutedStyle(), center: [110, -1], zoom: 5, attributionControl: false, cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, renderWorldCopies: false })
    const m = this.m
    m.addControl(new maplibregl.AttributionControl({ compact: true })); m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left'); m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.on('load', () => this.init())
  }
  private tilesUrl(k: string) { return `pmtiles://${this.base}${k}.pmtiles` }
  private init() {
    const m = this.m, before = firstSymbol(m)
    m.addSource('p-now', { type: 'geojson', data: EMPTY })
    m.addSource('tiles', { type: 'vector', url: this.tilesUrl(this.pr?.lay.k ?? 'KHG.none'), minzoom: 6, maxzoom: 15 }); this.tileK = this.pr?.lay.k ?? ''
    m.addSource('sat', { type: 'raster', tiles: [SAT_URL], tileSize: 256, minzoom: 0, maxzoom: 17, attribution: SAT_CREDIT })
    m.addLayer({ id: 'p-sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }, before)
    const none: any = ['==', ['get', 'k'], '']
    const vt = (id: string, sl: string, type: any, paint: any, layout?: any) => m.addLayer({ id, type, source: 'tiles', 'source-layer': sl, filter: none, ...(layout ? { layout } : {}), paint } as any, before)
    const hid = { visibility: 'none' }, w = (a: number, b: number): any => ['interpolate', ['linear'], ['zoom'], 7, a, 14, b]
    vt('p-peat', 'peat', 'fill', { 'fill-color': '#a58660', 'fill-opacity': 0.38 })
    vt('p-ov-forest', 'forest', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.55 }, hid); vt('p-ov-feg', 'feg', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.55 }, hid)
    vt('p-ov-lic', 'licence', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.38 }, hid); vt('p-ov-ring', 'ring', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.45 }, hid)
    vt('p-ov-lic-line', 'licence', 'line', { 'line-color': '#888', 'line-width': 1.3 }, hid)
    vt('p-ov-vil-f', 'village', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.02 }, hid); vt('p-ov-dmpg', 'dmpg', 'fill', { 'fill-color': '#888', 'fill-opacity': 0.3 }, hid)
    vt('p-ov-dmpg-line', 'dmpg', 'line', { 'line-color': '#6250d6', 'line-width': 1.2 }, hid)
    vt('p-ov-vil', 'village', 'line', { 'line-color': '#6250d6', 'line-width': 1.6, 'line-dasharray': [3, 2] }, hid)
    vt('p-x-depth', 'x_depth', 'fill', { 'fill-color': xMatch('depth'), 'fill-opacity': 0.85 }, hid)
    vt('p-x-skeg', 'x_skeg', 'fill', { 'fill-color': xMatch('skeg'), 'fill-opacity': 0.85 }, hid)
    vt('p-x-czone', 'x_czone', 'fill', { 'fill-color': xMatch('czone'), 'fill-opacity': 0.8 }, hid)
    vt('p-x-lc', 'x_lc', 'fill', { 'fill-color': xMatch('lc'), 'fill-opacity': 0.8 }, hid)
    vt('p-x-dome', 'x_dome', 'fill', { 'fill-color': '#1f4e79', 'fill-opacity': 0.35 }, hid); vt('p-x-dome-line', 'x_dome', 'line', { 'line-color': '#1f4e79', 'line-width': 1.4 }, hid)
    vt('p-x-sf', 'x_sf', 'fill', { 'fill-color': xMatch('sf'), 'fill-opacity': 0.45 }, hid); vt('p-x-sf-line', 'x_sf', 'line', { 'line-color': xMatch('sf'), 'line-width': 1.2 }, hid)
    vt('p-x-pptpkh', 'x_pptpkh', 'line', { 'line-color': '#c2307a', 'line-width': 1.6 }, hid)
    m.addSource('pop', { type: 'image', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] })
    m.addLayer({ id: 'p-x-pop', type: 'raster', source: 'pop', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest' } }, before)
    vt('p-burn', 'burn', 'fill', { 'fill-color': '#555', 'fill-opacity': 0.9 })
    vt('p-canal-t', 'canal_t', 'line', { 'line-color': '#1baf7a', 'line-width': w(0.3, 1), 'line-opacity': 0.55 }, { 'line-join': 'round' })
    vt('p-canal-s', 'canal_s', 'line', { 'line-color': '#1baf7a', 'line-width': w(0.6, 1.8), 'line-opacity': 0.85 }, { 'line-join': 'round' })
    vt('p-canal-p', 'canal_p', 'line', { 'line-color': '#1baf7a', 'line-width': w(1, 3) }, { 'line-join': 'round' })
    vt('p-x-lake', 'x_lake', 'fill', { 'fill-color': '#8fb8d8', 'fill-opacity': 0.9 }, hid)
    vt('p-x-river', 'x_river', 'line', { 'line-color': '#2f6db3', 'line-width': w(1, 3) }, { visibility: 'none', 'line-join': 'round' })
    vt('p-x-road', 'x_road', 'line', { 'line-color': '#5c5a54', 'line-width': w(0.5, 2) }, { visibility: 'none', 'line-join': 'round' })
    vt('p-x-brgm', 'x_brgm', 'circle', { 'circle-radius': w(1.4, 4), 'circle-color': '#d1495b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.5 }, hid)
    vt('p-outline', 'outline', 'line', { 'line-color': '#000', 'line-width': 1.6 })
    m.addLayer({ id: 'p-now-m', type: 'circle', source: 'p-now', filter: ['==', ['get', 'h'], 0], paint: { 'circle-radius': w(2, 4.5), 'circle-color': '#eb6834', 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.8 } })
    m.addLayer({ id: 'p-now-h', type: 'circle', source: 'p-now', filter: ['==', ['get', 'h'], 1], paint: { 'circle-radius': w(3, 6.5), 'circle-color': '#eb6834', 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.8 } })
    // hover help: the TipLayer reads data-tip from the canvas
    const cv = m.getCanvas(), tipAt = (html: string) => { cv.dataset.tip = html }
    const lab = (layer: string, c: string) => t((OVCLS[layer].find((a) => a[0] === c) || [0, ''])[1] as string)
    const xl = (layer: string, c: unknown) => t((XL[layer][2].find((a) => String(a[0]) === String(c)) || [0, ''])[1] as string)
    const hover: [string, (p: any) => string][] = [
      ['p-now-h', (p) => `<b>${t('Hotspot, {m}', { m: monf(p.m) })}</b><br><span>${t('{c} confidence · {p}', { c: t(p.h ? 'high' : 'medium'), p: t(p.p ? 'on peat' : 'off peat') })}</span>`], ['p-now-m', (p) => `<b>${t('Hotspot, {m}', { m: monf(p.m) })}</b><br><span>${t('{c} confidence · {p}', { c: t(p.h ? 'high' : 'medium'), p: t(p.p ? 'on peat' : 'off peat') })}</span>`],
      ['p-ov-forest', (p) => `<b>${lab('forest', p.c)}</b>`], ['p-ov-feg', (p) => `<b>${lab('feg', p.c)}</b>`], ['p-ov-ring', (p) => `<b>${lab('ring', p.c)}</b>`],
      ['p-ov-lic', (p) => `<b>${lab('licence', p.c)}</b>`],   // licence holders are not named in this dashboard
      ['p-ov-vil-f', (p) => `<b>${esc(p.n)}</b><br><span>${t('Target village')}</span>`], ['p-ov-dmpg', (p) => `<b>${esc(p.n)}</b><br><span>${esc(p.p)} · ${esc(p.s)}</span>`],
      ...(['depth', 'skeg', 'czone', 'lc', 'sf'] as const).map((l) => [`p-x-${l}`, (p: any) => `<b>${xl(l, p.c)}</b><br><span>${t(XL[l][0])}</span>`] as [string, (p: any) => string]),
      ['p-x-dome', () => `<b>${t('Peat dome')}</b>`], ['p-x-brgm', (p) => `<b>${t('BRGM structure')}</b>${p.j ? '<br><span>' + esc(p.j) + '</span>' : ''}`],
    ]
    m.on('mousemove', (e) => {
      const ids = hover.map((h) => h[0]).filter((id) => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none')
      const f = m.queryRenderedFeatures(e.point, { layers: ids })[0]
      if (!f) { delete cv.dataset.tip; cv.style.cursor = ''; return }
      const h = hover.find((x) => x[0] === f.layer.id); cv.style.cursor = f.layer.id.startsWith('p-now') ? 'pointer' : ''; if (h) tipAt(h[1](f.properties))
    })
    m.on('mouseout', () => { delete cv.dataset.tip })
    mapLabels(m, useStore.getState().lang)
    this.ready = true; this.theme()
    const q = this.queue; this.queue = []; q.forEach((f) => f())
  }
  /** Run now if the map has loaded, else once it has. */
  whenReady(f: () => void) { if (this.ready) f(); else this.queue.push(f) }
  theme() {
    const m = this.m; if (!this.ready) return
    restyleBase(m); mapLabels(m, useStore.getState().lang)
    const on = css('--now'), sf = css('--surface')
    { const br = d3.interpolateRgb(css('--burn0'), css('--burn1')); m.setPaintProperty('p-burn', 'fill-color', ['match', ['get', 'n'], 1, br(0), 2, br(0.35), 3, br(0.7), br(1)]) }
    for (const id of ['p-canal-p', 'p-canal-s', 'p-canal-t']) m.setPaintProperty(id, 'line-color', css('--canal'))
    m.setPaintProperty('p-outline', 'line-color', css('--ink')); m.setPaintProperty('p-peat', 'fill-color', css('--peat'))
    m.setPaintProperty('p-ov-forest', 'fill-color', ovMatch('forest')); m.setPaintProperty('p-ov-feg', 'fill-color', ovMatch('feg'))
    m.setPaintProperty('p-ov-lic', 'fill-color', ovMatch('licence')); m.setPaintProperty('p-ov-ring', 'fill-color', ovMatch('ring')); m.setPaintProperty('p-ov-lic-line', 'line-color', ovMatch('licence'))
    m.setPaintProperty('p-ov-vil', 'line-color', ovColor('village', 'in')); m.setPaintProperty('p-ov-vil-f', 'fill-color', ovColor('village', 'in')); m.setPaintProperty('p-ov-dmpg', 'fill-color', ovColor('dmpg', 'in')); m.setPaintProperty('p-ov-dmpg-line', 'line-color', ovColor('dmpg', 'in'))
    for (const id of ['p-now-h', 'p-now-m']) { m.setPaintProperty(id, 'circle-color', ['case', ['==', ['get', 'p'], 1], on, 'rgba(0,0,0,0)']); m.setPaintProperty(id, 'circle-stroke-color', ['case', ['==', ['get', 'p'], 1], sf, on]); m.setPaintProperty(id, 'circle-stroke-width', ['case', ['==', ['get', 'p'], 1], 0.8, 1.4]) }
  }
  labels(lang: 'en' | 'id') { if (this.ready) mapLabels(this.m, lang) }
  /** Show one KHG: its tile archive, hotspot points and extent. */
  setProfile(pr: Profile) {
    this.pr = pr
    this.whenReady(() => {
      if (this.pr !== pr) return
      const m = this.m, k = pr.lay.k
      if (this.tileK !== k) { this.tileK = k; (m.getSource('tiles') as maplibregl.VectorTileSource).setUrl(this.tilesUrl(k)) }
      for (const id of TILE_LAYERS) m.setFilter(id, ['==', ['get', 'k'], k])
      ;(m.getSource('p-now') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: pr.lay.now.map((p) => ({ type: 'Feature', properties: { m: p[2], h: p[3], p: p[4] }, geometry: { type: 'Point', coordinates: [p[0], p[1]] } })) })
      popIndex(this.base).then((ix) => {
        if (!this.ready || this.pr !== pr) return
        const corners = ix?.corners?.[k]
        this.popOk = !!corners
        const source = m.getSource<maplibregl.ImageSource>('pop')
        if (corners) source?.updateImage({ url: `${this.base}pop/${k}.png`, coordinates: corners })
      })
      const b = pr.lay.bounds; if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 28, duration: 0, maxZoom: 14 })
    })
  }
  apply(s: MapState) {
    this.whenReady(() => {
      const m = this.m
      const vis = (ids: string[], on: boolean) => ids.forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))
      const xOn = s.x.mode !== 'off', high = s.now.high || s.confHigh
      vis(['p-sat'], s.sat); vis(['p-peat'], s.layers.peat && !xOn); vis(['p-burn'], s.layers.burn && !xOn); vis(['p-canal-p'], s.layers.p && !xOn); vis(['p-canal-s'], s.layers.s && !xOn); vis(['p-canal-t'], s.layers.t && !xOn)
      vis(['p-now-h'], s.layers.now && !xOn); vis(['p-now-m'], s.layers.now && !xOn && !high)
      const rng: any[] = [['>=', ['get', 'm'], s.now.a], ['<=', ['get', 'm'], s.now.b]]
      m.setFilter('p-now-m', ['all', ['==', ['get', 'h'], 0], ...rng] as any); m.setFilter('p-now-h', ['all', ['==', ['get', 'h'], 1], ...rng] as any)
      vis(['p-x-depth'], s.x.mode === 'depth'); vis(['p-x-dome', 'p-x-dome-line'], s.x.mode === 'dome'); vis(['p-x-skeg'], s.x.mode === 'skeg'); vis(['p-x-czone'], s.x.mode === 'czone')
      vis(['p-x-lc'], s.x.mode === 'lc'); vis(['p-x-sf', 'p-x-sf-line', 'p-x-pptpkh'], s.x.mode === 'sf'); vis(['p-x-pop'], s.x.mode === 'pop' && this.popOk)
      vis(['p-x-river', 'p-x-lake'], s.x.river); vis(['p-x-road'], s.x.road); vis(['p-x-brgm'], s.x.brgm)
      vis(['p-ov-forest'], s.ov.mode === 'forest'); vis(['p-ov-feg'], s.ov.mode === 'feg'); vis(['p-ov-lic', 'p-ov-lic-line'], s.ov.mode === 'licence'); vis(['p-ov-ring'], s.ov.mode === 'ring')
      vis(['p-ov-vil', 'p-ov-vil-f'], s.ov.vil); vis(['p-ov-dmpg', 'p-ov-dmpg-line'], s.ov.dmpg)
      // DEM relief of the KHG workspace, under the vector layers
      const want = s.dem.file && this.demCode ? `pmtiles://${dataUrl(`khg/${this.demCode}/${s.dem.file}`)}` : null
      if (m.getLayer('p-dem') && (m as any)._demUrl !== want) { m.removeLayer('p-dem'); m.removeSource('dem2') }
      if (want && !m.getLayer('p-dem')) {
        m.addSource('dem2', { type: 'raster', url: want, tileSize: 256, maxzoom: s.dem.maxzoom } as any)
        m.addLayer({ id: 'p-dem', type: 'raster', source: 'dem2', paint: { 'raster-opacity': s.dem.opacity } }, 'p-peat'); (m as any)._demUrl = want
      }
      if (m.getLayer('p-dem')) m.setPaintProperty('p-dem', 'raster-opacity', s.dem.opacity)
    })
  }
  fit(bb: number[]) { if (bb.every((x) => x != null)) this.m.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 40, duration: 700, maxZoom: 15 }) }
  resize() { this.m.resize() }
  remove() {
    this.ready = false
    this.queue = []
    this.m.remove()
  }
}
