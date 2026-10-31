import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Manifest } from '../lib/data'
import { initMaplibre, maplibregl, pm, styleFor } from '../lib/map'
import { useStore } from '../lib/store'

export type MapMode = 'sat' | 'relief' | 'depth' | 'days' | 'units' | 'balance'
const SEQ = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b']

/** A non-interactive map of one KHG for the compare view. The map exists only while it is on screen (browsers allow about 16 WebGL contexts). */
export function MiniMap({ mf, dem, mode, attr, domain, height = 230 }: { mf: Manifest; dem: string; mode: MapMode; attr: string; domain: [number, number] | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [note, setNote] = useState('')
  const basemap = useStore((s) => s.basemap)
  const nav = useNavigate()

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '150px' })
    if (host.current) io.observe(host.current)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !el.current) return
    initMaplibre()
    const sat = basemap === 'satellite'
    const code = mf.code
    const map = new maplibregl.Map({ container: el.current, style: styleFor(basemap), bounds: [[mf.bounds[0], mf.bounds[1]], [mf.bounds[2], mf.bounds[3]]], fitBoundsOptions: { padding: 12 }, interactive: false, attributionControl: false })
    const vec = (id: string, d: string | null) => mf.vector.find((v) => v.id === id && (d == null ? v.dem == null : v.dem === d))
    const ramp = (a: string, [lo, hi]: [number, number]) => ['interpolate', ['linear'], ['coalesce', ['get', a], lo], ...SEQ.flatMap((c, i) => [lo + ((hi - lo) * i) / 4, c])] as any
    map.on('load', () => {
      let msg = ''
      const raster = (id: string, file: string, maxzoom: number | undefined, opacity: number, nearest = false) => {
        map.addSource(id, { type: 'raster', url: pm(`khg/${code}/${file}`), tileSize: 256, ...(maxzoom ? { maxzoom } : {}) })
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, ...(nearest ? { 'raster-resampling': 'nearest' as const } : {}) } })
      }
      if (mode === 'relief') {
        const r = mf.raster.find((x) => x.dem === dem)
        r ? raster('relief', r.file, r.max_zoom, 0.85) : (msg = 'not available for this DEM')
      } else if (mode === 'depth' || mode === 'days') {
        const g = mf.groundwater.find((x) => x.dem === dem)?.rasters.find((x) => x.id === (mode === 'depth' ? 'season_mean_depth' : 'days_deeper_40cm'))
        g ? raster('gw', g.file, undefined, 0.85, true) : (msg = 'no groundwater model run')
      } else if (mode === 'units' || mode === 'balance') {
        const v = vec(mode === 'units' ? 'subkhg_units' : 'neraca_units', dem)
        if (v && domain) {
          map.addSource('u', { type: 'vector', url: pm(`khg/${code}/${v.file}`) })
          map.addLayer({ id: 'u', type: 'fill', source: 'u', 'source-layer': v.id, paint: { 'fill-color': ramp(attr, domain), 'fill-opacity': 0.8, 'fill-outline-color': sat ? '#fff' : '#333' } })
        } else msg = 'not available for this DEM'
      }
      const b = vec('khg', null)
      if (b) { map.addSource('b', { type: 'vector', url: pm(`khg/${code}/${b.file}`) }); map.addLayer({ id: 'b', type: 'line', source: 'b', 'source-layer': 'khg', paint: { 'line-color': sat ? '#ffd23f' : '#1c1c1c', 'line-width': 1.8 } }) }
      setNote(msg)
    })
    return () => { map.remove() }
  }, [visible, mf, dem, mode, attr, domain?.[0], domain?.[1], basemap])

  return (
    <div ref={host} className="card relative cursor-pointer overflow-hidden" style={{ height }} onClick={() => nav(`/khg/${mf.code}`)} title={mf.name}>
      <div ref={el} className="h-full w-full" />
      {note && <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-0.5 text-xs text-white">{note}</div>}
    </div>
  )
}
