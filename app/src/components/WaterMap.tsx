import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import { useStore } from '../lib/store'
import type { WaterSample } from '../lib/waterTable'
import { empty, waterContours, waterHexes, waterPoints, WATER_COLORS, WATER_LEVEL_LABELS } from '../lib/waterSurface'

export type WaterMode = 'stations' | 'hexbin' | 'contour'
const nationalCenter: [number, number] = [114, -1.5]

export function WaterMap({ points, mode, outlines, focus }: {
  points: WaterSample[]; mode: WaterMode; outlines: boolean; focus: string
}) {
  const t = useT()
  const basemap = useStore((s) => s.basemap)
  const container = useRef<HTMLDivElement>(null)
  const ref = useRef<maplibregl.Map | null>(null)
  const camera = useRef<{ center: maplibregl.LngLatLike; zoom: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState(0)
  const [surface, setSurface] = useState({ count: 0, zoom: 0 })

  useEffect(() => {
    initMaplibre()
    const map = new maplibregl.Map({
      container: container.current!, style: styleFor(basemap), ...(camera.current ?? { center: nationalCenter, zoom: 4.25 }),
      attributionControl: { compact: true }, cooperativeGestures: true, renderWorldCopies: false, dragRotate: false,
    })
    ref.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    if (!camera.current) map.fitBounds([[94, -11], [142, 6]], { padding: 28, duration: 0 })
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    map.once('load', () => {
      map.addSource('water-khg', { type: 'vector', url: pm('national/khg_outlines.pmtiles') })
      map.addSource('water-surface', { type: 'geojson', data: empty })
      map.addLayer({ id: 'water-surface', type: 'fill', source: 'water-surface',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.85, 'fill-outline-color': 'rgba(255,255,255,0.25)' } })
      map.addLayer({ id: 'water-khg', type: 'line', source: 'water-khg', 'source-layer': 'khg',
        paint: { 'line-color': basemap === 'satellite' ? '#f5f5f4' : '#52615b', 'line-width': 1, 'line-opacity': 0.65 } })
      map.addSource('water-points', { type: 'geojson', data: empty })
      map.addLayer({ id: 'water-points', type: 'circle', source: 'water-points',
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 11, 6], 'circle-stroke-width': 1.1, 'circle-stroke-color': '#fff' } })
      setReady(true)
    })
    map.on('moveend', () => setView((v) => v + 1))
    map.on('mousemove', (event) => {
      if (!map.getLayer('water-points')) return
      const feature = map.queryRenderedFeatures(event.point, { layers: ['water-points', 'water-surface'] })
        .find((f) => typeof f.properties.level === 'number')
      if (!feature) { popup.remove(); return }
      const { level, count, dry } = feature.properties
      const label = count == null ? t('Weekly station median') : `${t('Median of reporting stations')} (${count})`
      const detail = typeof dry === 'number' ? ` · ${dry}/${count} ${t('below −40 cm')}` : ''
      popup.setLngLat(event.lngLat).setText(`${label} · ${Math.round(level)} cm${detail}`).addTo(map)
    })
    map.getCanvas().addEventListener('mouseleave', () => popup.remove())
    return () => {
      camera.current = { center: map.getCenter(), zoom: map.getZoom() }
      setReady(false); ref.current = null; popup.remove(); map.remove()
    }
  }, [basemap, t])

  useEffect(() => {
    const map = ref.current
    if (!ready || !map?.getLayer('water-khg')) return
    map.setLayoutProperty('water-khg', 'visibility', outlines ? 'visible' : 'none')
  }, [ready, outlines])
  useEffect(() => {
    const map = ref.current
    if (!ready || !focus || !map || !points.length) return
    const bounds = new maplibregl.LngLatBounds()
    for (const point of points) bounds.extend([point.lon, point.lat])
    map.fitBounds(bounds, { padding: 55, maxZoom: 9, duration: 400 })
    // Week changes should keep the current map extent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus])

  useEffect(() => {
    const map = ref.current
    if (!ready || !map?.getSource('water-points')) return
    void map.getSource<maplibregl.GeoJSONSource>('water-points')!.setData(waterPoints(mode === 'hexbin' ? [] : points))
  }, [ready, mode, points])
  useEffect(() => {
    const map = ref.current
    const source = map?.getSource<maplibregl.GeoJSONSource>('water-surface')
    const bounds = map?.getBounds()
    if (!map || !ready || !source || !bounds) return
    const zoom = map.getZoom()
    const data = mode === 'hexbin' ? waterHexes(points, Math.max(3, Math.min(140, 45 * 2 ** (5 - Math.floor(zoom)))))
      : mode === 'contour' && zoom >= 6 ? waterContours(points, [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
        : empty
    void source.setData(data)
    setSurface({ count: data.features.length, zoom })
  }, [ready, view, mode, points])

  return (
    <div className="card overflow-hidden">
      <div ref={container} className="h-[clamp(22rem,52vh,37rem)] w-full" aria-label={t('Weekly water-table map')} aria-busy={!ready} />
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {WATER_LEVEL_LABELS.map((label, i) => <span key={label} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: WATER_COLORS[i] }} />{t(label)}</span>)}
        </div>
        {mode === 'hexbin' && <p className="muted text-xs">{t('Each hexagon shows the median of reporting stations inside it. Zoom in for smaller cells.')}</p>}
        {mode === 'contour' && <p className="muted text-xs" aria-live="polite">
          {t('Contours estimate water levels between nearby stations. Shading is limited to locations bracketed by at least three stations within 25 km. Dots are measurements.')}
          {' '}{surface.zoom < 6 ? t('Zoom in to see local contours.') : surface.count === 0 ? t('No area in this view has enough nearby stations for contours.') : ''}
        </p>}
      </div>
    </div>
  )
}
