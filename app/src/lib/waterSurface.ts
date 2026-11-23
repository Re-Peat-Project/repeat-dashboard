import { contours, median, polygonContains, polygonHull } from 'd3'
import type { FeatureCollection, Geometry, Point, Polygon } from 'geojson'
import { DRY_LEVEL, type WaterSample } from './waterTable'

export const WATER_COLORS = ['#287db8', '#347f71', '#cf842d', '#ad432d']
export const WATER_LEVEL_LABELS = ['Above ground', '0 to −40 cm', 'Below −40 to −80 cm', 'Below −80 cm']
export const waterColor = (level: number) => WATER_COLORS[level > 0 ? 0 : level >= DRY_LEVEL ? 1 : level >= -80 ? 2 : 3]
const X_KM = 111.32, Y_KM = 110.57 // near-equatorial distances for the Indonesia map
const ROOT3 = Math.sqrt(3)
const RADIUS = 25
export const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function waterPoints(points: WaterSample[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: points.map(({ lon, lat, level }) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { level, color: waterColor(level) },
  })) }
}

export function waterHexes(points: WaterSample[], radius: number): FeatureCollection<Polygon> {
  const bins = new Map<string, { q: number; r: number; levels: number[] }>()
  for (const p of points) {
    const x = p.lon * X_KM, y = p.lat * Y_KM
    const qf = (ROOT3 / 3 * x - y / 3) / radius, rf = 2 * y / (3 * radius), sf = -qf - rf
    let q = Math.round(qf), r = Math.round(rf)
    const s = Math.round(sf), dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf)
    if (dq > dr && dq > ds) q = -r - s
    else if (dr > ds) r = -q - s
    const key = `${q}/${r}`
    const bin = bins.get(key) ?? { q, r, levels: [] }
    bin.levels.push(p.level); bins.set(key, bin)
  }
  return { type: 'FeatureCollection', features: [...bins.values()].map(({ q, r, levels }) => {
    const cx = radius * ROOT3 * (q + r / 2), cy = 1.5 * radius * r
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = (60 * i - 30) * Math.PI / 180
      return [(cx + radius * Math.cos(a)) / X_KM, (cy + radius * Math.sin(a)) / Y_KM]
    })
    ring.push(ring[0])
    const level = median(levels)!
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {
      level, color: waterColor(level), count: levels.length, dry: levels.filter((v) => v < DRY_LEVEL).length,
    } }
  }) }
}

/** Draw contours only inside the hull of nearby station locations. Unsupported grid nodes
 * are masked, and disabling contour smoothing avoids extending them across the mask. */
export function waterContours(points: WaterSample[], bounds: [number, number, number, number]): FeatureCollection<Geometry> {
  const [west, south, east, north] = bounds
  const x0 = west * X_KM, y0 = south * Y_KM, width = (east - west) * X_KM, height = (north - south) * Y_KM
  const step = Math.max(1, width / 145, height / 105)
  const cols = Math.max(2, Math.ceil(width / step) + 1), rows = Math.max(2, Math.ceil(height / step) + 1)
  const bins = new Map<string, { xy: [number, number]; level: number }[]>()
  for (const p of points) {
    const xy: [number, number] = [p.lon * X_KM, p.lat * Y_KM]
    const key = `${Math.floor(xy[0] / RADIUS)}/${Math.floor(xy[1] / RADIUS)}`
    const list = bins.get(key) ?? []
    list.push({ xy, level: p.level }); bins.set(key, list)
  }
  const field = Array<number>(cols * rows).fill(NaN)
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = x0 + col * step, y = y0 + row * step
    const bx = Math.floor(x / RADIUS), by = Math.floor(y / RADIUS)
    const neighbors: [number, number][] = []
    let weights = 0, value = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const p of bins.get(`${bx + dx}/${by + dy}`) ?? []) {
        const distance = (x - p.xy[0]) ** 2 + (y - p.xy[1]) ** 2
        if (distance > RADIUS ** 2) continue
        const weight = 1 / Math.max(0.01, distance)
        neighbors.push(p.xy)
        weights += weight; value += weight * -p.level
      }
    }
    const hull = neighbors.length >= 3 ? polygonHull(neighbors) : null
    if (hull && polygonContains(hull, [x, y])) field[row * cols + col] = value / weights
  }
  return { type: 'FeatureCollection', features: contours().size([cols, rows]).smooth(false).thresholds([-1000, 0, 40, 80])(field)
    .map((shape, i) => ({ shape, color: WATER_COLORS[i] }))
    .filter(({ shape }) => shape.coordinates.length > 0)
    .map(({ shape, color }) => ({ type: 'Feature', properties: { color }, geometry: {
      type: 'MultiPolygon', coordinates: shape.coordinates.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [
        (x0 + (x - 0.5) * step) / X_KM, (y0 + (y - 0.5) * step) / Y_KM,
      ]))),
    } })) }
}
