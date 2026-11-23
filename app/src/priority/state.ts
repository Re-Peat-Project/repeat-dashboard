// State shared by the prioritisation, table and profile pages: the weights and filters of the live scoring.
// Kept in the URL query of each page (fw, fm, fc, fa, fi) so a view can be shared.
import { useMemo } from 'react'
import * as d3 from 'd3'
import { create } from 'zustand'
import * as maplibregl from 'maplibre-gl'
import { defaultW, finCompute, refW, type FC, type PD, type ScoreOpts, type Weights } from './core'
import positron from './basemap-positron.json'
import { isDark } from './core'

type S = {
  w: Weights | null; missing: ScoreOpts['missing']; conf: ScoreOpts['conf']; only337: boolean; isl: string[]; colour: string; sel: string | null
  set: (p: Partial<Omit<S, 'set'>>) => void
}
export const usePrio = create<S>((set) => ({ w: null, missing: 'skip', conf: 'mh', only337: true, isl: [], colour: 'type', sel: null, set: (p) => set(p) }))

/** Scores at the current weights (FC) and at the pre-registered weights (FC0). */
export function useScores(P: PD | null) {
  const { w, missing, conf } = usePrio()
  return useMemo(() => {
    if (!P) return null
    const r = refW(P), ww = w ?? defaultW(P)
    const FC: FC = finCompute(P, ww, { missing, conf }), FC0: FC = finCompute(P, r, { missing: 'skip', conf: 'mh' })
    const atRef = conf === 'mh' && missing === 'skip' && Object.keys(r).every((k) => Math.abs((ww[k] ?? 0) - r[k]) < 1e-9)
    return { FC, FC0, w: ww, atRef, P }
  }, [P, w, missing, conf])
}

/** Query string of the scoring state (only what differs from the defaults). */
export function prioQuery(P: PD | null) {
  const s = usePrio.getState(); if (!P) return ''
  const r = defaultW(P), q = new URLSearchParams()
  if (s.w) { const ks = Object.keys(r).filter((k) => Math.abs((s.w![k] ?? 0) - r[k]) > 1e-9); if (ks.length) q.set('fw', ks.map((k) => k + ':' + s.w![k]).join(',')) }
  if (s.missing !== 'skip') q.set('fm', s.missing)
  if (s.conf !== 'mh') q.set('fh', '1')
  if (s.colour !== 'type') q.set('fc', s.colour)
  if (!s.only337) q.set('fa', '1')
  if (s.isl.length) q.set('fi', s.isl.join(','))
  return q.toString()
}
export function readPrioQuery(P: PD, q: URLSearchParams) {
  const w = defaultW(P)
  if (q.get('fw')) for (const p of q.get('fw')!.split(',')) { const [k, v] = p.split(':'); if (k in w && isFinite(+v)) w[k] = +v }
  usePrio.getState().set({
    w, missing: q.get('fm') === 'median' ? 'median' : 'skip', conf: q.get('fh') === '1' ? 'h' : 'mh', only337: q.get('fa') !== '1',
    isl: q.get('fi') ? q.get('fi')!.split(',') : [], colour: ['type', 'iv', 'u', 's', 'c', 'f', 'p'].includes(q.get('fc') ?? '') ? q.get('fc')! : 'type',
  })
}

// ---------------------------------------------------------------- muted basemap (OpenFreeMap Positron), recoloured for the dark theme
const DROP = /^(building|aeroway.*|railway.*|highway-shield.*|road_shield.*|airport|road_pier|road_area_pier|tunnel_.*|highway_path|highway-name-path|highway-name-minor)$/
const COLOR_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color', 'text-color', 'text-halo-color']
function mapColors(v: any, fn: (c: string, p: string) => string, prop: string): any {
  if (typeof v === 'string' && /^(#|rgb|hsl)/.test(v)) return fn(v, prop)
  if (Array.isArray(v)) return v.map((x) => mapColors(x, fn, prop))
  if (v && typeof v === 'object') { const o: any = {}; for (const k in v) o[k] = mapColors(v[k], fn, prop); return o }
  return v
}
function darkColor(c: string, prop: string) { const h = d3.hsl(c); if (!isFinite(h.h)) h.h = 0; const text = prop === 'text-color'; const l = text ? 1 - h.l : 0.075 + 0.27 * (1 - h.l); return d3.hsl(h.h, h.s * 0.45, Math.min(0.95, l), h.opacity).formatRgb() }
const LIGHT = (() => { const s = JSON.parse(JSON.stringify(positron)); s.layers = s.layers.filter((l: any) => !DROP.test(l.id)); return s as maplibregl.StyleSpecification })()
const DARK = (() => { const s = JSON.parse(JSON.stringify(LIGHT)); for (const l of s.layers) for (const p of COLOR_PROPS) if (l.paint && l.paint[p] !== undefined) l.paint[p] = mapColors(l.paint[p], darkColor, p); return s as maplibregl.StyleSpecification })()
export const mutedStyle = () => (isDark() ? DARK : LIGHT)
export function restyleBase(map: maplibregl.Map) {
  const s = mutedStyle() as any
  for (const l of s.layers) { if (!map.getLayer(l.id) || !l.paint) continue; for (const p of COLOR_PROPS) if (l.paint[p] !== undefined) try { map.setPaintProperty(l.id, p as any, l.paint[p]) } catch { /* layer without it */ } }
}
export function mapLabels(map: maplibregl.Map, lang: 'en' | 'id') {
  if (!map || !map.isStyleLoaded()) return
  for (const l of map.getStyle().layers) if (l.type === 'symbol' && (l.layout as any)?.['text-field'] !== undefined && !l.id.startsWith('p-')) try { map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:' + lang], ['get', 'name']]) } catch { /* ok */ }
}
export const firstSymbol = (map: maplibregl.Map) => map.getStyle().layers.find((l) => l.type === 'symbol')?.id
