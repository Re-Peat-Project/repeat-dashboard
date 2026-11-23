// The national KHG prioritisation: data (CSV tables written by pipeline/build_priority.py), labels, formats and the live scoring
// rule. The scoring is the rule of repeat-national-final, as on the prioritisation page; tests/priority.test.ts checks parity.
import * as d3 from 'd3'
import { dataUrl } from '@/lib/data'
import { dictionary } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { makeDefs } from './defs.gen.js'

// ---------------------------------------------------------------- language and formats
export const lang = () => useStore.getState().lang
export const t = (s: string, v?: Record<string, unknown>) => {
  let r = lang() === 'id' && dictionary[s] !== undefined ? dictionary[s] : s
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m))
  return r
}
export const loc = () => (lang() === 'id' ? 'id-ID' : 'en-GB')
const dsep = (s: string) => (lang() === 'id' ? s.replace('.', ',') : s)
export const fmt = (v: number | null | undefined, nd = 2): string => {
  if (v == null || !isFinite(v)) return t('n/a')
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString(lang() === 'id' ? 'id-ID' : 'en')
  let s = (+v).toFixed(nd)
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return dsep(s)
}
export const fx = (v: number, nd = 2) => dsep((+v).toFixed(nd))
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHF_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHF_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const monthsShort = () => (lang() === 'id' ? MONTHS_ID : MONTHS_EN)
export const mon = (i: number) => monthsShort()[i - 1]
export const monf = (i: number) => (lang() === 'id' ? MONTHF_ID : MONTHF_EN)[i - 1]
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
/** data-tip attribute with HTML content (rendered by the TipLayer). */
export const tipAttr = (h: string) => ' data-tip="' + String(h).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"'
export const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
export const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)

export const D = makeDefs({ t, fx, fmt })
export const { TYPE_ORDER, TYPE_LABEL, TYPE_NOTE, TYPE_RULE, DIMS, DIM_TIP, SCORE_NOTE, IND, IV_ORDER, IV_SHORT, IV_NOTE, IV_COL, FIELD_SRC, pc } = D
export const confChar = ['○', '◐', '●'], confName = ['low', 'medium', 'high']

// ---------------------------------------------------------------- data
type Num = number | null
export type RuleMeta = {
  written: string; version: number; cuts: Record<string, number[]>; fcut: number; pcut: number; min_peat: number; reported: string[]
  intervention: Record<string, { indicator: string; min: number }>; dims: Record<string, Record<string, number>>; dirs: Record<string, string>
  validation: any; sensitivity: any; types: any[]; run: any
}
export type PageMeta = { generated: string; period_now: string; baseline: string; n_khg: number; min_area: number; min_peat: number; hs_klh_to: string; hs_firms_from: string; n_full: number }
export type ExportItem = { file: string; desc: string; rows: number; cols: number; kb: number; src: string }
export type Meta = { rule: RuleMeta; page: PageMeta; exports: ExportItem[]; tiles: string }

const TEXT = new Set(['code', 'name', 'team', 'kab', 'tn_end', 'khg_code', 'island', 'provinces', 'klh_337_team', 'priority_reason', 'run_class', 'type', 'type_id', 'type_en', 'intervention',
  'layer', 'class', 'village', 'subdistrict', 'programme', 'scheme', 'tenure', 'sub', 'conf', 'series', 'cls'])
const NUMERIC_CONF = new Set(['khg_profile'])     // in the profile table `conf` is the data-confidence level 0-2
function parse(text: string, table: string): Record<string, any>[] {
  return d3.csvParse(text, (r) => {
    const o: Record<string, any> = {}
    for (const k in r) {
      const v = r[k] as string
      if (TEXT.has(k) && !(k === 'conf' && NUMERIC_CONF.has(table))) o[k] = v === '' ? null : v
      else o[k] = v === '' ? null : v === 'True' ? 1 : v === 'False' ? 0 : +v
    }
    return o
  })
}
const cache = new Map<string, Promise<any>>()
function once<T>(key: string, f: () => Promise<T>): Promise<T> { if (!cache.has(key)) cache.set(key, f()); return cache.get(key) as Promise<T> }
const csv = (name: string) => once(name, async () => { const r = await fetch(dataUrl(`priority/${name}.csv`)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return parse(await r.text(), name) })
const json = <T,>(name: string) => once(name, async () => { const r = await fetch(dataUrl(`priority/${name}`)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json() as Promise<T> })

/** Arrays per KHG (index j), in the order of final_khg.csv: the scores of the rule and the profile fields. */
export type PD = {
  n: number; id: string[]; name: string[]; prov: string[]; isl: string[]; kab: (string | null)[]
  type: (string | null)[]; u: Num[]; s: Num[]; c: Num[]; f: Num[]; p: Num[]; ru: Num[]; ru337: Num[]; rt: Num[]; st: Num[]
  lowf: number[]; hix: number[]; k337: number[]; k362: number[]; small: number[]; wk: number[]; pool: number[]; scored: number[]; peat: Num[]; area: Num[]
  tim: string[]; iv: (string | null)[]; team: string[]; conf: number[]; ref_rank: Num[]; n1h: Num[]; n1hn: Num[]
  ind: Record<string, Num[]>; row: Record<string, any>[]; idx: Map<string, number>; meta: Meta
}
let PD_: PD | null = null
export const pd = () => PD_ as PD
export async function loadPriority(): Promise<PD> {
  if (PD_) return PD_
  const [rows, meta, id] = await Promise.all([csv('khg_profile'), json<Meta>('priority_meta.json'), json<Record<string, string>>('i18n_id.json')])
  for (const k in id) if (dictionary[k] === undefined) dictionary[k] = id[k]
  PD_ = buildPD(rows, meta)
  return PD_
}
export const parseCsv = parse
export function buildPD(rows: Record<string, any>[], meta: Meta): PD {
  const col = (k: string) => rows.map((r) => r[k] ?? null)
  const flag = (k: string) => rows.map((r) => (r[k] ? 1 : 0))
  const R = meta.rule
  const inds = [...Object.values(R.dims).flatMap((d) => Object.keys(d)), ...R.reported].filter((k) => k in rows[0])
  return {
    n: rows.length, id: col('code'), name: col('name'), prov: rows.map((r) => r.provinces ?? ''), isl: rows.map((r) => r.island ?? ''), kab: col('kab'),
    type: col('type'), u: col('urgency'), s: col('stake'), c: col('complexity'), f: col('feasibility'), p: col('people'),
    ru: col('rank_urgency'), ru337: col('rank_urgency_337'), rt: col('rank_in_type'), st: col('type_stability'),
    lowf: flag('flag_low_feasibility'), hix: flag('flag_high_exposure'), k337: flag('klh_337'), k362: flag('klh_priority_362'), small: flag('small'), wk: flag('whole_khg'),
    pool: flag('in_pool'), scored: rows.map((r) => (r.type ? 1 : 0)), peat: col('peat_km2'), area: col('area'),
    tim: rows.map((r) => r.klh_337_team ?? ''), iv: col('intervention'), team: rows.map((r) => r.team ?? ''), conf: rows.map((r) => r.conf ?? 0),
    ref_rank: col('ref_rank'), n1h: col('n1h'), n1hn: col('n1hn'),
    ind: Object.fromEntries(inds.map((k) => [k, col(k)])), row: rows, idx: new Map(rows.map((r, j) => [r.code as string, j])), meta,
  }
}
export const loadGeo = () => json<GeoJSON.FeatureCollection>('khg_geo.json')

// ---------------------------------------------------------------- per-KHG detail (profile page)
export type Profile = {
  code: string; j: number
  burned: [number, number][]; hs: [number, number][]; now_m: [number, number, number][]; hm: [number, number, number, number][]
  deficit: [number, number][]; rain: [number, number][]; lc: [string, number][]
  ov: { s: Record<string, any[][]>; v: any[][]; whole: boolean } | null
  tn: { end: string | null; a: any[][]; h: any[][] } | null
  lay: { k: string; bounds: [number, number, number, number] | null; now_total: number; now: [number, number, number, number, number][] }
}
const group = (rows: Record<string, any>[]) => d3.group(rows, (r) => r.code as string)
const detail = () => once('detail', async () => {
  const [series, land, vil, ta, th, pts] = await Promise.all(['khg_series', 'khg_landstatus', 'khg_dmpg_villages', 'khg_tenure_area', 'khg_tenure_hotspots', 'khg_hotspots_now'].map(csv))
  return { series: group(series), land: group(land), vil: group(vil), ta: group(ta), th: group(th), pts: group(pts) }
})
const profCache = new Map<string, Profile>()
export async function loadProfile(code: string): Promise<Profile | null> {
  const P = await loadPriority(), j = P.idx.get(code)
  if (j === undefined) return null
  if (profCache.has(code)) return profCache.get(code)!
  const Dt = await detail(), r = P.row[j]
  const s = Dt.series.get(code) ?? []
  const ser = (name: string) => s.filter((x) => x.series === name)
  const land = Dt.land.get(code) ?? []
  const ovS: Record<string, any[][]> = {}
  for (const x of land) (ovS[x.layer] ??= []).push([x.class, x.area_km2, x.peat_km2, x.burned_peat_km2, x.hs_now_peat, ...(x.layer.startsWith('licence_') ? [x.lindung_km2, x.forest_protected_km2] : [])])
  const prof: Profile = {
    code, j,
    burned: ser('burned').map((x) => [x.x, x.y]), hs: ser('hs').map((x) => [x.x, x.y]), now_m: ser('now_m').map((x) => [x.x, x.y, x.y2]),
    hm: ser('hm').map((x) => [x.x, x.m, x.y, x.y2]), deficit: ser('deficit').map((x) => [x.x, x.y]), rain: ser('rain').map((x) => [x.x, x.y]),
    lc: ser('lc').map((x) => [x.cls, x.y]),
    ov: r.ov ? { s: ovS, whole: !!r.ov_whole, v: (Dt.vil.get(code) ?? []).map((v) => [v.village, v.subdistrict, v.programme ?? '', v.scheme ?? '', v.area_km2, v.peat_km2, v.burned_peat_km2, v.hs_now_peat, [v.west, v.south, v.east, v.north]]) } : null,
    tn: Dt.ta.get(code) ? { end: r.tn_end, a: Dt.ta.get(code)!.map((x) => [x.tenure, x.sub, x.dmpg, x.peat_km2, x.burned_peat_km2]), h: (Dt.th.get(code) ?? []).map((x) => [x.tenure, x.sub, x.dmpg, x.year, x.conf, x.n]) } : null,
    lay: { k: 'KHG.' + code, bounds: r.west == null ? null : [r.west, r.south, r.east, r.north], now_total: r.now_total ?? 0, now: (Dt.pts.get(code) ?? []).map((p) => [p.lon, p.lat, p.month, p.high, p.peat]) },
  }
  profCache.set(code, prof)
  return prof
}

// ---------------------------------------------------------------- live scoring: the rule of repeat-national-final
export type Weights = Record<string, number>
export type ScoreOpts = { missing: 'skip' | 'median'; conf: 'mh' | 'h' }
export type FC = {
  u: Num[]; s: Num[]; c: Num[]; f: Num[]; p: Num[]; type: (string | null)[]; cuts: Record<string, [number, number]>; fcut: number | null; pcut: number | null
  ru: Num[]; ru337: Num[]; rt: Num[]; lowf: number[]; hix: number[]
}
export const finDims = (P: PD) => DIMS.filter((d) => P.meta.rule.dims[d[2]])
export function refW(P: PD): Weights { const w: Weights = {}; for (const [, , dn] of finDims(P)) for (const k in P.meta.rule.dims[dn]) w[k] = P.meta.rule.dims[dn][k]; return w }

export function defaultW(P: PD): Weights {
  return { ...refW(P), u_fire_freq: 0.5, u_hotspot_now: 2.5 }
}
const qs = (sorted: number[], p: number) => (sorted.length ? d3.quantileSorted(sorted, p)! : NaN)
const indVals = (P: PD, k: string, o: ScoreOpts) => (k === 'u_hotspot_now' && o.conf === 'h' ? P.n1h : P.ind[k])
const weightedPercentile = (sorted: number[], value: number, weight: number) => weight * (d3.bisectLeft(sorted, value) + d3.bisectRight(sorted, value)) / 2 / sorted.length

/** Contributions to urgency relative to the middle of the national reference pool. */
export function urgencyDrivers(P: PD, j: number, w: Weights, o: ScoreOpts) {
  let total = 0
  const parts = Object.keys(P.meta.rule.dims.urgency).flatMap((key) => {
    const values = indVals(P, key, o), weight = w[key]
    if (!values || !(weight > 0)) return []
    const direction = P.meta.rule.dirs?.[key] === '-' ? -1 : 1
    const sorted = values.flatMap((v, i) => P.pool[i] && v != null ? [direction * v] : []).sort(d3.ascending)
    const value = values[j]
    if (!sorted.length || (value == null && o.missing === 'skip')) return []
    total += weight
    if (value == null) return []
    return [{ key, value, part: weightedPercentile(sorted, direction * value, weight) - 0.5 * weight }]
  })
  return parts.sort((a, b) => Math.abs(b.part) - Math.abs(a.part)).map(({ key, value, part }) => ({ key, value, points: 100 * part / total }))
}

export function finCompute(P: PD, w: Weights, o: ScoreOpts): FC {
  const n = P.n, out: Record<string, Num[]> = {}, dirs = P.meta.rule.dirs || {}
  for (const [key, , dn] of finDims(P)) {
    const num = new Float64Array(n), den = new Float64Array(n)
    for (const k in P.meta.rule.dims[dn]) {
      const wk = w[k]; if (!(wk > 0) || !P.ind[k]) continue
      const sg = dirs[k] === '-' ? -1 : 1, x = indVals(P, k, o)
      const ref: number[] = []; for (let j = 0; j < n; j++) if (P.pool[j] && x[j] != null) ref.push(sg * (x[j] as number)); ref.sort(d3.ascending); if (!ref.length) continue
      for (let j = 0; j < n; j++) {
        if (x[j] == null) { if (o.missing === 'median') { num[j] += wk * 0.5; den[j] += wk } continue }
        const v = sg * (x[j] as number); num[j] += weightedPercentile(ref, v, wk); den[j] += wk
      }
    }
    out[key] = Array.from({ length: n }, (_, j) => (P.scored[j] && den[j] > 0 ? num[j] / den[j] : null))
  }
  const poolS = (key: string) => { const a: number[] = []; for (let j = 0; j < n; j++) if (P.pool[j] && out[key][j] != null) a.push(out[key][j] as number); return a.sort(d3.ascending) }
  const cuts: Record<string, [number, number]> = {}; for (const k of ['u', 'c', 's']) { const a = poolS(k); cuts[k] = [qs(a, 1 / 3), qs(a, 2 / 3)] }
  const fcut = out.f ? qs(poolS('f'), 1 / 3) : null, pcut = out.p ? qs(poolS('p'), 2 / 3) : null
  const type: (string | null)[] = new Array(n).fill(null)
  for (let j = 0; j < n; j++) {
    const u = out.u[j], c = out.c[j], s = out.s[j]; if (!P.scored[j] || u == null) continue
    if (u >= cuts.u[1]) type[j] = c == null || c < cuts.c[1] ? 'A' : 'B'; else if (u >= cuts.u[0]) type[j] = 'C'; else type[j] = s != null && s >= cuts.s[1] ? 'D' : 'E'
  }
  const rankBy = (keep: (j: number) => boolean) => {
    const idx: number[] = []; for (let j = 0; j < n; j++) if (out.u[j] != null && keep(j)) idx.push(j); const r: Num[] = new Array(n).fill(null)
    const srt = idx.map((j) => out.u[j] as number).sort((a, b) => b - a)
    for (const j of idx) { let lo = 0, hi = srt.length; while (lo < hi) { const m = (lo + hi) >> 1; if (srt[m] > (out.u[j] as number)) lo = m + 1; else hi = m } r[j] = lo + 1 }
    return r
  }
  const ru = rankBy(() => true), ru337 = rankBy((j) => !!P.k337[j])
  const rt: Num[] = new Array(n).fill(null)
  for (const ty of TYPE_ORDER) {
    const idx: number[] = []; for (let j = 0; j < n; j++) if (type[j] === ty) idx.push(j); const key = (j: number) => (out.u[j] as number) + 1e-6 * (out.s[j] ?? 0)
    idx.sort((a, b) => key(b) - key(a)); let prev: number | null = null, pr = 0; idx.forEach((j, k) => { const v = key(j); if (v !== prev) { pr = k + 1; prev = v } rt[j] = pr })
  }
  const lowf = out.f ? out.f.map((v, j) => (P.scored[j] && v != null && v < (fcut as number) ? 1 : 0)) : P.lowf
  const hix = out.p ? out.p.map((v, j) => (P.scored[j] && v != null && v >= (pcut as number) ? 1 : 0)) : new Array(n).fill(0)
  return { u: out.u, s: out.s, c: out.c, f: out.f, p: out.p, type, cuts, fcut, pcut, ru, ru337, rt, lowf, hix }
}
/** Rows whose type and urgency rank differ from the pipeline's (0 at the pre-registered weights). */
export function parity(P: PD) {
  const r0 = finCompute(P, refW(P), { missing: 'skip', conf: 'mh' }); let bad = 0
  for (let j = 0; j < P.n; j++) if ((r0.type[j] || null) !== (P.type[j] || null) || (r0.ru[j] ?? null) !== (P.ru[j] ?? null)) bad++
  return { n: P.n, bad }
}

/** Every KHG's series rows (khg_series.csv) by code, for the KHG table's sparklines. */
export const loadSeriesAll = () => once('seriesAll', async () => group(await csv('khg_series')))
