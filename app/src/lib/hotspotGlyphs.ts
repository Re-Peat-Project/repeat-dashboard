import type { FeatureCollection, Point } from 'geojson'
import { inPeriod, type FireFilter } from './investigation'
import { maplibregl } from './map'

export type HotspotCell = { ix: number; iy: number; kind: string; ym: number; conf: string; n: number; peat: boolean }
type Cell = { ix: number; iy: number; high: number; medium: number }
const ID = 'hotspot-glyphs'
const CLUSTER = 'hotspot-glyph-clusters'
const CELL = 'hotspot-glyph-cells'
export const HOT_HIGH = '#d84542', HOT_MEDIUM = '#e69a37'

/** Monthly grid cells become weighted points. Filter before clustering so each ring
 * counts only detections from the selected dates, confidence and peat setting. */
export function hotspotCells(grid: HotspotCell[], fire: FireFilter, kind: string): FeatureCollection<Point> {
  const totals = new Map<string, Cell>()
  for (const r of grid) {
    if (!inPeriod(r, fire, kind) || !Number.isFinite(r.ix) || !Number.isFinite(r.iy) || r.n <= 0) continue
    const id = `${r.ix}/${r.iy}`
    const cell = totals.get(id) ?? { ix: r.ix, iy: r.iy, high: 0, medium: 0 }
    if (r.conf === 'high') cell.high += r.n
    else cell.medium += r.n
    totals.set(id, cell)
  }
  return { type: 'FeatureCollection', features: [...totals.values()].map(({ ix, iy, high, medium }) => ({
    type: 'Feature', properties: { high, medium, total: high + medium },
    geometry: { type: 'Point', coordinates: [94 + (ix + 0.5) * 0.1, -11.5 + (iy + 0.5) * 0.1] },
  })) }
}

export function addHotspotGlyphs(map: maplibregl.Map, t: (s: string) => string) {
  map.addSource(ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48,
    clusterMaxZoom: 9, clusterProperties: { high: ['+', ['get', 'high']], medium: ['+', ['get', 'medium']] } })
  map.addLayer({ id: CLUSTER, source: ID, type: 'circle', filter: ['has', 'point_count'], paint: { 'circle-radius': 16, 'circle-opacity': 0 } })
  map.addLayer({ id: CELL, source: ID, type: 'circle', filter: ['!', ['has', 'point_count']], paint: {
    'circle-color': ['case', ['>=', ['get', 'high'], ['get', 'medium']], HOT_HIGH, HOT_MEDIUM],
    'circle-radius': ['interpolate', ['linear'], ['get', 'total'], 1, 3, 50, 6, 250, 11],
    'circle-opacity': 0.84, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff',
  } })
  const source = map.getSource<maplibregl.GeoJSONSource>(ID)!
  const markers = new Map<number, maplibregl.Marker>()
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
  let visible = false, generation = 0, frame = 0, removed = false
  const describe = (high: number, medium: number) =>
    `${(high + medium).toLocaleString()} ${t('hotspot detections')} · ${high.toLocaleString()} ${t('high confidence')}, ${medium.toLocaleString()} ${t('medium confidence')}`
  const clear = () => { for (const m of markers.values()) m.remove(); markers.clear(); popup.remove() }
  const sync = () => {
    if (!visible || frame || removed) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!visible || removed || !map.getLayer(CLUSTER)) return
      const shown = new Set<number>()
      for (const f of map.queryRenderedFeatures({ layers: [CLUSTER] })) {
        if (f.geometry.type !== 'Point') continue
        const id = Number(f.properties.cluster_id)
        if (shown.has(id)) continue
        shown.add(id)
        if (markers.has(id)) continue
        const [lon, lat] = f.geometry.coordinates
        const high = Number(f.properties.high), medium = Number(f.properties.medium), total = high + medium
        if (!total) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'hotspot-glyph'
        const size = total >= 1000 ? 45 : total >= 100 ? 39 : 33
        el.style.setProperty('--glyph-size', `${size}px`)
        el.style.background = `conic-gradient(${HOT_HIGH} ${100 * high / total}%, ${HOT_MEDIUM} 0)`
        el.title = describe(high, medium)
        el.setAttribute('aria-label', el.title + ' · ' + t('Zoom to hotspots'))
        const caption = document.createElement('span')
        caption.textContent = Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(total)
        el.append(caption)
        el.onclick = (e) => {
          e.stopPropagation()
          void source.getClusterExpansionZoom(id).then((zoom) => {
            if (!removed) map.easeTo({ center: [lon, lat], zoom })
          }).catch(() => {})
        }
        markers.set(id, new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map))
      }
      for (const [id, marker] of markers) if (!shown.has(id)) { marker.remove(); markers.delete(id) }
    })
  }
  map.on('moveend', sync)
  map.on('idle', sync)
  map.on('mousemove', CELL, (e) => {
    const props = e.features?.[0]?.properties
    if (visible && props) popup.setLngLat(e.lngLat).setText(describe(Number(props.high), Number(props.medium))).addTo(map)
  })
  map.on('mouseleave', CELL, () => popup.remove())
  return {
    set(data: FeatureCollection<Point> | null) {
      const request = ++generation
      visible = false; clear()
      for (const layer of [CLUSTER, CELL]) map.setLayoutProperty(layer, 'visibility', data ? 'visible' : 'none')
      if (data) void source.setData(data).then(() => {
        if (generation !== request || removed) return
        visible = true
        sync()
      }).catch(() => {})
    },
    remove() { removed = true; cancelAnimationFrame(frame); clear() },
  }
}
