import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { BASE, dataUrl } from './data'

let ready = false
/** MapLibre 6 needs its worker served separately (copied to public/maplibre by scripts/copy-maplibre-worker.mjs). */
export function initMaplibre() {
  if (ready) return
  ready = true
  maplibregl.setWorkerUrl(new URL(`${BASE}maplibre/maplibre-gl-worker.mjs`, location.href).href)
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
}

export type Basemap = 'satellite' | 'light'
const LIGHT = 'https://tiles.openfreemap.org/styles/positron'
// Esri World Imagery with the place-name reference layer on top (same imagery source as the existing national dashboard)
const SATELLITE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    sat: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    ref: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'ref', type: 'raster', source: 'ref', paint: { 'raster-opacity': 0.85 } }],
}
export const styleFor = (b: Basemap): string | maplibregl.StyleSpecification => (b === 'light' ? LIGHT : SATELLITE)
export const pm = (path: string) => `pmtiles://${dataUrl(path)}`
export { maplibregl }

/** Fit to [west, south, east, north] */
export const fit = (map: maplibregl.Map, b: [number, number, number, number], padding = 40) =>
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration: 600 })
