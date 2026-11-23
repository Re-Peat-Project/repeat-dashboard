// KHG table: every KHG with every field of the prioritisation. Filter, sort, page, drag on a column's histogram to keep a range;
// sparklines of the fire series. Scores and types are the pipeline's (the file values), not the live weights.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as d3 from 'd3'
import { Download, RotateCcw } from 'lucide-react'
import { Seg } from '@/components/Seg'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { loadWeeklyWater, waterRegions } from '@/lib/waterTable'
import {
  confChar, confName, css, DIM_TIP, DIMS, esc, FIELD_SRC, fmt, fx as fx0, IND, IV_COL, IV_ORDER, IV_SHORT, loadPriority, loadSeriesAll, pc, t, tipAttr,
  TYPE_LABEL, TYPE_NOTE, TYPE_ORDER, TYPE_RULE, type PD,
} from '@/priority/core'
import '@/priority/table.css'

const fx = (v: number | null | undefined, nd = 2) => (v == null || !isFinite(v) ? t('n/a') : fx0(v, nd))
type Fmt = (v: number) => string
const EXTRA_IND: Record<string, [string, string, Fmt]> = {
  n_desa_target: ['Target villages', 'Bluebook target villages in the KHG.', (v) => fmt(v, 0)],
  n_dmpg: ['DMPG villages', 'Desa Mandiri Peduli Gambut villages in the KHG (SiTMAT portal).', (v) => fmt(v, 0)],
  n_tma_stations: ['Water-table loggers', 'SiTMAT water-table loggers in the KHG.', (v) => fmt(v, 0)],
  priority_ha: ['Damaged peat (SKEG 2024), ha', "Peat in KLH's damage map SKEG 2024 (the PPEG priority area), hectares.", (v) => fmt(v, 0)],
  c_holders: ['Licence holders', "Distinct licence holders on the KHG's peat (business licences 2025).", (v) => fmt(v, 0)],
  c_contested: ['Contested peat', 'Share of the peat where claims conflict: a licence on land released for communities (PPTPKH) or social forestry, or forest estate on PPTPKH land. Part of tenure complexity.', (v) => pc(v)],
  depth_known_share: ['Peat depth known', 'Share of the peat with a depth class in the BBSDLP map.', (v) => pc(v)],
  lc_known_share: ['Land cover known', "Share of the peat with a class in KLH's land cover 2022.", (v) => pc(v)],
  u_burned_now: ['Burned this year', "Share of the KHG's peat burned this year (KLHK burnt area 2026, to date).", (v) => pc(v, 2)],
}
const EXTRA = Object.keys(EXTRA_IND)
const indMeta = (k: string): [string, string, Fmt] => IND[k] || EXTRA_IND[k] || [k, '', (v: number) => fmt(v, 2)]
const DIMKEY: Record<string, string> = { urgency: 'u', stake: 's', complexity: 'c', feasibility: 'f', people: 'p' }
const fieldSrc = (k: string) => FIELD_SRC[k] || ['', '']
const YB = d3.range(2015, 2027), YH = d3.range(2012, 2027)

type Col = { k: string; g: string; label: string; tip?: string; v: (j: number) => any; f?: (v: any) => string; num?: boolean; asc?: boolean; txt?: boolean; html?: (j: number) => string
  color?: string; bar01?: boolean; spark?: (j: number) => (number | null)[]; sc?: string; signedSpark?: boolean; lo?: number; hi?: number; all?: number[]; min?: number; max?: number }
type R = { burned: (number | null)[][]; hs: (number | null)[][]; now_m: (number | null)[][]; water: (number | null)[][] }

function makeCols(P: PD, S: R) {
  const M = P.meta.rule, row = (k: string) => (j: number) => P.row[j][k] ?? null
  const ind = (k: string): ((j: number) => number | null) | null => (P.ind[k] ? (j) => P.ind[k][j] : k in P.row[0] ? row(k) : null)
  const COLS: Col[] = [], col = (o: Col) => { COLS.push(o); return o }
  col({ k: 'ru337', g: 'khg', label: 'Rank in 337', tip: "Rank by urgency among KLH's 337 KHG (1 = most urgent).", v: (j) => P.ru337[j], f: (v) => fmt(v, 0), num: true, asc: true })
  col({ k: 'ru', g: 'khg', label: 'Rank', tip: 'Rank by urgency among all scored KHG.', v: (j) => P.ru[j], f: (v) => fmt(v, 0), num: true, asc: true })
  col({ k: 'type', g: 'khg', label: 'Type', tip: 'Type of action from the terciles of urgency, complexity and stake. The small number is the rank within the type.', v: (j) => P.type[j], txt: true,
    html: (j) => { const ty = P.type[j]; return ty ? `<span class="tyb" style="--c:var(--ty${ty})"${tipAttr(`<b>${ty} ${esc(t(TYPE_LABEL[ty]))}</b><br>${esc(t(TYPE_NOTE[ty]))}`)}>${ty}</span> <small style="display:inline">${P.rt[j] ?? ''}</small>` : `<span class="hint">${esc(t('not scored'))}</span>` } })
  col({ k: 'iv', g: 'khg', label: 'Intervention', tip: 'What the peat needs, from the canal-affected and the open or degraded shares of the peat.', v: (j) => P.iv[j], txt: true,
    html: (j) => { const v = P.iv[j]; return v ? `<span class="ivb" style="--c:${IV_COL[v]}">${esc(t(IV_SHORT[v]))}</span>` : '' } })
  col({ k: 'tim', g: 'khg', label: 'KLH team', tip: "KLH's team (Tim 1 to 6) for the KHG of the 337 list.", v: (j) => P.tim[j] || null, txt: true, f: (v) => esc(v || '') })
  col({ k: 'isl', g: 'khg', label: 'Island', v: (j) => P.isl[j], txt: true, f: (v) => esc((v || '').replace(/^Pulau /, '')) })
  col({ k: 'peat', g: 'khg', label: 'Peat km2', tip: 'KLH peat inside the KHG (PPEG 2026), km2.', v: (j) => P.peat[j], f: (v) => fmt(v, 0), num: true })
  col({ k: 'area', g: 'khg', label: 'KHG km2', tip: 'Area of the KHG, km2.', v: (j) => P.area[j], f: (v) => fmt(v, 0), num: true })
  col({ k: 'conf', g: 'khg', label: 'Data confidence', tip: 'High: canals are mapped, there is enough fire signal and enough peat. Medium: two of the three. Low: fewer.', v: (j) => P.conf[j], num: true, f: (v) => (v == null ? t('n/a') : confChar[v] + ' ' + t(confName[v])) })
  const dimArr: Record<string, (number | null)[]> = { urgency: P.u, stake: P.s, complexity: P.c, feasibility: P.f, people: P.p }
  for (const d of DIMS) { const key = d[2]; if (!dimArr[key] || !M.dims[key]) continue
    col({ k: 'd_' + key, g: 'scores', label: d[1], tip: DIM_TIP[d[0]], v: (j) => dimArr[key][j], f: (v) => fx(v, 2), num: true, color: `var(--dim-${d[0]})`, bar01: true }) }
  const GROUPS: [string, string][] = [['khg', 'KHG'], ['scores', 'Scores']]
  for (const [dim, spec] of Object.entries(M.dims)) {
    const lab = (DIMS.find((d) => d[2] === dim) || [0, dim])[1] as string; GROUPS.push([dim, lab])
    for (const k of Object.keys(spec)) { const g = ind(k); if (!g) continue; const m = indMeta(k)
      col({ k, g: dim, label: m[0], tip: `${t(m[1])}<br><span>${t('Weight {w}', { w: fmt(spec[k], 1) })}${M.dirs[k] === '-' ? ' · ' + t('Lower values raise the score.') : ''}</span>${fieldSrc(k)[0] ? '<br><span>' + t('Source') + ': ' + t(fieldSrc(k)[0]) + '</span>' : ''}`, v: g, f: m[2], num: true, color: `var(--dim-${DIMKEY[dim]})` }) }
  }
  GROUPS.push(['reported', 'Reported, not scored'])
  for (const k of [...M.reported, ...EXTRA]) { const g = ind(k); if (!g || COLS.some((c) => c.k === k)) continue; const m = indMeta(k)
    col({ k, g: 'reported', label: m[0], tip: t(m[1]) + (fieldSrc(k)[0] ? '<br><span>' + t('Source') + ': ' + t(fieldSrc(k)[0]) + '</span>' : ''), v: g, f: m[2], num: true }) }
  GROUPS.push(['trend', 'Trends'])
  col({ k: 'sp_burn', g: 'trend', label: 'Burned peat, 2015 to 2026', tip: "Share of the KHG's peat burned each year (KLHK burnt area). 2026 to date. Sorts by the 2015 to 2025 mean.",
    v: (j) => { const s = S.burned[j].slice(0, -1).filter((x) => x != null) as number[]; return s.length ? d3.mean(s) : null }, spark: (j) => S.burned[j], sc: '--hist', num: true, f: (v) => fx(v, 2) + '%' })
  col({ k: 'sp_hs', g: 'trend', label: 'Hotspots, 2012 to 2026', tip: 'VIIRS hotspots on peat per year. 2026 to date. Sorts by the total.', v: (j) => { const s = S.hs[j].filter((x) => x != null) as number[]; return s.length ? d3.sum(s) : null }, spark: (j) => S.hs[j], sc: '--hist', num: true, f: (v) => fmt(v, 0) })
  col({ k: 'sp_now', g: 'trend', label: 'Hotspots 2026 by month', tip: 'MODIS hotspots on peat this year by month, medium and high confidence. Sorts by the total.', v: (j) => { const s = S.now_m[j].filter((x) => x != null) as number[]; return s.length ? d3.sum(s) : null }, spark: (j) => S.now_m[j], sc: '--now', num: true, f: (v) => fmt(v, 0) })
  col({ k: 'sp_water', g: 'trend', label: 'Water-table change', tip: 'Weekly median change from each SiTMAT station’s first two measured weeks. Each point needs at least three stations with a baseline. Below the dashed line means the water table fell. Sorts by the latest available change.',
    v: (j) => S.water[j].findLast((x) => x != null) ?? null, spark: (j) => S.water[j], signedSpark: true, num: true, asc: true,
    f: (v) => v == null ? t('n/a') : `${v > 0 ? '+' : ''}${fmt(v, 1)} cm` })
  for (const c of COLS) if (c.num) {
    const v: number[] = []; for (let j = 0; j < P.n; j++) { const x = c.v(j); if (x != null && isFinite(x)) v.push(x) } v.sort((a, b) => a - b)
    c.lo = v.length ? v[0] : 0; c.hi = v.length ? (c.bar01 ? 1 : d3.quantile(v, 0.95) || v[v.length - 1]) : 1; c.all = v; c.min = v[0]; c.max = v[v.length - 1]
  }
  COLS.push({ k: 'name', g: '_', label: 'KHG', v: (j) => P.name[j], txt: true })
  return { COLS, GROUPS }
}

type State = { q: string; scope: string; isl: string; type: Set<string>; iv: Set<string>; flag: string; rng: Record<string, [number, number]>; sk: string; sd: number; page: number; ps: number | 'all'; groups: Set<string> }
const DEFAULT_GROUPS = ['khg', 'scores', 'urgency', 'trend']
const fresh = (): State => ({ q: '', scope: '337', isl: '', type: new Set(), iv: new Set(), flag: '', rng: {}, sk: 'ru337', sd: 1, page: 0, ps: 50, groups: new Set(DEFAULT_GROUPS) })

function spark(vals: (number | null)[], colorVar: string, w = 96, h = 22, area = true, signed = false) {
  const v = vals.map((x) => (x == null ? null : +x)); const n = v.length; if (!n || v.every((x) => x == null)) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`
  const values = v.filter((x): x is number => x != null)
  const mx = Math.max(signed ? 1 : 1e-9, ...values.map((x) => signed ? Math.abs(x) : x))
  const min = signed ? -mx : 0
  const X = (i: number) => 1 + (i * (w - 2)) / Math.max(1, n - 1), Y = (x: number) => h - 2 - ((x - min) / (mx - min)) * (h - 4)
  let d = '', a = ''; v.forEach((x, i) => { if (x == null) return; d += (d && (!signed || v[i - 1] != null) ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1) })
  const pts = v.map((x, i) => (x == null ? null : [X(i), Y(x)])).filter(Boolean) as number[][]
  if (area && pts.length > 1) a = `<path d="M${pts[0][0]},${h - 1}L${pts.map((p) => p.join(',')).join('L')}L${pts[pts.length - 1][0]},${h - 1}Z" fill="${css(colorVar)}" opacity=".15"/>`
  const last = pts[pts.length - 1]
  const zero = signed ? `<path d="M1,${Y(0)}H${w - 1}" stroke="${css('--muted')}" stroke-dasharray="2 2" opacity=".55"/>` : ''
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${zero}${a}<path d="${d}" fill="none" stroke="${css(colorVar)}" stroke-width="1.3"/><circle cx="${last[0]}" cy="${last[1]}" r="1.8" fill="${css(colorVar)}"/></svg>`
}

export default function KhgTable() {
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const { lang, theme } = useStore()
  const [P, setP] = useState<PD | null>(null)
  const [ser, setSer] = useState<R | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const S = useRef<State>(fresh())
  const [v, setV] = useState(0)
  const update = () => setV((x) => x + 1)
  const wrap = useRef<HTMLDivElement>(null), sum = useRef<HTMLDivElement>(null), chips = useRef<HTMLDivElement>(null), pagerTop = useRef<HTMLDivElement>(null), pagerBot = useRef<HTMLDivElement>(null)
  const idxRef = useRef<number[]>([])

  useEffect(() => {
    Promise.all([loadPriority(), loadSeriesAll(), loadWeeklyWater().catch(() => null)]).then(([p, all, water]) => {
      const pick = (code: string, s: string, xs: number[]) => { const m = new Map((all.get(code) ?? []).filter((r) => r.series === s).map((r) => [r.x as number, r.y as number])); return xs.map((x) => m.get(x) ?? null) }
      const changes = new Map(water ? waterRegions(water, 'khg').map((r) => [r.id.replace(/^KHG\./, ''), r.weeks.map((w) => w?.change ?? null)]) : [])
      setSer({ burned: p.id.map((c) => pick(c, 'burned', YB)), hs: p.id.map((c) => pick(c, 'hs', YH)), now_m: p.id.map((c) => pick(c, 'now_m', d3.range(1, 13))), water: p.id.map((c) => changes.get(c) ?? []) })
      setP(p)
    }).catch((e) => setErr(String(e)))
  }, [])
  const cg = useMemo(() => (P && ser ? makeCols(P, ser) : null), [P, ser, lang])   // eslint-disable-line react-hooks/exhaustive-deps

  // the query string: read once, then write on every change
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!cg || ready) return
    const h = q, s = S.current
    if (['337', 'team', '362', 'scored', 'all'].includes(h.get('s') ?? '')) s.scope = h.get('s')!
    if (h.get('i')) s.isl = h.get('i')!
    if (h.get('ty')) s.type = new Set(h.get('ty')!.split('').filter((x) => TYPE_ORDER.includes(x)))
    if (['lowf', 'hix', 'wk'].includes(h.get('f') ?? '')) s.flag = h.get('f')!
    if (h.get('k') && cg.COLS.some((c) => c.k === h.get('k'))) s.sk = h.get('k')!
    if (h.get('d') === '-1') s.sd = -1
    if (h.get('g')) { const g = h.get('g')!.split(',').filter((x) => cg.GROUPS.some((y) => y[0] === x)); if (g.length) s.groups = new Set(g) }
    setReady(true)
  }, [cg, ready, q])

  const P_ = P, C = cg
  const rowsFiltered = (except?: string) => {
    if (!P_ || !C) return []
    const s = S.current, qq = s.q.trim().toLowerCase(), out: number[] = []
    for (let j = 0; j < P_.n; j++) {
      if (s.scope === '337' && !P_.k337[j]) continue; if (s.scope === 'team' && !P_.team[j]) continue; if (s.scope === '362' && !P_.k362[j]) continue; if (s.scope === 'scored' && !P_.type[j]) continue
      if (s.isl && P_.isl[j] !== s.isl) continue; if (s.type.size && !s.type.has(P_.type[j] as string)) continue; if (s.iv.size && !s.iv.has(P_.iv[j] as string)) continue
      if (s.flag === 'lowf' && !P_.lowf[j]) continue; if (s.flag === 'hix' && !P_.hix[j]) continue; if (s.flag === 'wk' && !P_.wk[j]) continue
      if (qq && !(P_.name[j].toLowerCase().includes(qq) || P_.id[j].toLowerCase().includes(qq) || P_.prov[j].toLowerCase().includes(qq) || (P_.tim[j] || '').toLowerCase().includes(qq))) continue
      let ok = true
      for (const [k, [a, b]] of Object.entries(s.rng)) { if (k === except) continue; const c = C.COLS.find((c) => c.k === k)!; const x = c.v(j); if (x == null || x < a || x > b) { ok = false; break } }
      if (ok) out.push(j)
    }
    return out
  }

  // ---------------------------------------------------------------- table, summary, pager: drawn from the state
  useEffect(() => {
    if (!P_ || !C || !ready || !ser || !wrap.current) return
    const s = S.current, COLS = C.COLS, GROUPS = C.GROUPS
    const idx = rowsFiltered(); idxRef.current = idx
    const c0 = COLS.find((c) => c.k === s.sk) || COLS[0]
    const key = (j: number) => { const x = c0.v(j); return x == null || (typeof x === 'number' && !isFinite(x)) ? null : x }
    idx.sort((a, b) => { const x = key(a), y = key(b); if (x == null && y == null) return a - b; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * s.sd || a - b })
    const ps = s.ps === 'all' ? idx.length || 1 : s.ps, np = Math.max(1, Math.ceil(idx.length / ps)); s.page = Math.min(s.page, np - 1)
    const pageIdx = idx.slice(s.page * ps, s.page * ps + ps)
    const cols = COLS.filter((c) => s.groups.has(c.g))
    const grp: [string, number][] = []; for (const c of cols) { if (grp.length && grp[grp.length - 1][0] === c.g) grp[grp.length - 1][1]++; else grp.push([c.g, 1]) }
    const gl = (g: string) => esc(t((GROUPS.find((x) => x[0] === g) || [0, g])[1] as string))
    const firstOf = new Set<string>(); { let prev: string | null = null; for (const c of cols) { if (c.g !== prev) firstOf.add(c.k); prev = c.g } }
    const histSvg = (c: Col, idxOther: number[]) => {
      const W = 110, H = 26, B = 18, lo = c.min, hi = c.bar01 ? 1 : (c.max! > c.hi! * 3 ? c.hi : c.max); if (lo == null || hi == null || hi <= lo) return ''
      const bin = (x: number) => Math.max(0, Math.min(B - 1, Math.floor(((Math.min(x, hi) - lo) / (hi - lo)) * B)))
      const a = new Array(B).fill(0), b = new Array(B).fill(0)
      for (const x of c.all!) a[bin(x)]++; for (const j of idxOther) { const x = c.v(j); if (x != null && isFinite(x)) b[bin(x)]++ }
      const mx = Math.max(1, ...a), bw = W / B, r = s.rng[c.k]
      const fill = c.color && c.color.startsWith('var') ? css(c.color.slice(4, -1)) : css('--hist')
      return `<svg class="hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-k="${c.k}" data-lo="${lo}" data-hi="${hi}">`
        + a.map((n, i) => `<rect x="${i * bw + 0.5}" width="${bw - 1}" y="${H - 1 - (H - 2) * Math.sqrt(n / mx)}" height="${(H - 2) * Math.sqrt(n / mx)}" fill="${css('--grid')}"/>`).join('')
        + b.map((n, i) => (n ? `<rect x="${i * bw + 0.5}" width="${bw - 1}" y="${H - 1 - (H - 2) * Math.sqrt(n / mx)}" height="${(H - 2) * Math.sqrt(n / mx)}" fill="${fill}" opacity=".8"/>` : '')).join('')
        + (r ? `<rect x="${((Math.max(r[0], lo) - lo) / (hi - lo)) * W}" width="${Math.max(1, ((Math.min(r[1], hi) - Math.max(r[0], lo)) / (hi - lo)) * W)}" y="0" height="${H}" fill="${css('--ink')}" opacity=".08"/>` : '') + '</svg>'
    }
    const cell = (c: Col, j: number) => {
      if (c.spark) {
        const x = c.v(j)
        const color = c.signedSpark ? x < 0 ? '--s2' : '--s1' : c.sc!
        return `<td${tipAttr(`${esc(P_.name[j])}<br>${esc(t(c.label))}: ${esc(c.f!(x))}`)}>${c.signedSpark && x == null ? '–' : spark(c.spark(j), color, 96, 22, !c.signedSpark, c.signedSpark)}</td>`
      }
      if (c.html) return `<td class="l">${c.html(j)}</td>`
      const x = c.v(j)
      if (c.txt) return `<td class="l">${c.f ? c.f(x) : esc(x ?? '')}</td>`
      if (x == null || !isFinite(x)) return `<td class="na">${esc(t('n/a'))}</td>`
      const w = c.hi! > c.lo! ? Math.max(0, Math.min(1, (x - Math.min(0, c.lo!)) / (c.hi! - Math.min(0, c.lo!)))) : 0
      return `<td>${esc(c.f ? c.f(x) : fmt(x))}${c.k === 'conf' || c.k === 'ru' || c.k === 'ru337' ? '' : `<span class="cb"><i style="width:${(w * 100).toFixed(1)}%;--c:${c.color || 'var(--hist)'}"></i></span>`}</td>`
    }
    const head = `<thead><tr class="g"><th class="sticky"></th>${grp.map(([g, n]) => `<th colspan="${n}">${gl(g)}</th>`).join('')}</tr><tr class="h"><th class="sticky"><span class="lb${s.sk === 'name' ? ' on' : ''}" data-k="name">${esc(t('KHG'))}${s.sk === 'name' ? (s.sd > 0 ? ' ▴' : ' ▾') : ''}</span><small class="hint">${esc(t('● high ◐ medium ○ low data confidence · ◆ team KHG'))}</small></th>`
      + cols.map((c) => { const others = c.num ? rowsFiltered(c.k) : []; return `<th class="${firstOf.has(c.k) ? 'gstart' : ''}"><span class="lb${s.sk === c.k ? ' on' : ''}" data-k="${c.k}"${tipAttr(`<b>${esc(t(c.label))}</b>${c.tip ? '<br>' + t(c.tip) : ''}<br><span>${esc(t(c.num ? 'Click to sort. Drag on the histogram to filter a range.' : 'Click to sort.'))}</span>`)}>${esc(t(c.label))}${s.sk === c.k ? (s.sd > 0 ? ' ▴' : ' ▾') : ''}</span>${c.num && !c.spark && c.k !== 'ru' && c.k !== 'ru337' && c.k !== 'conf' ? histSvg(c, others) : ''}</th>` }).join('') + '</tr></thead>'
    const body = `<tbody>${pageIdx.map((j) => `<tr data-id="${P_.id[j]}"><td class="sticky l"${tipAttr(t('Open the profile of this KHG.'))}>${P_.conf[j] != null ? `<span style="color:var(--muted)">${confChar[P_.conf[j]]}</span> ` : ''}${esc(P_.name[j])}${P_.team[j] ? ` <span${tipAttr(t('Team KHG') + ': ' + esc(t(P_.team[j])))}>◆</span>` : ''}<small>${esc(P_.id[j])} · ${esc(P_.prov[j])}${P_.k337[j] ? '' : ' · ' + esc(t('not in the 337'))}${P_.wk[j] ? ' · ' + esc(t('whole KHG used')) : ''}</small></td>${cols.map((c) => cell(c, j)).join('')}</tr>`).join('')}</tbody>`
    wrap.current.innerHTML = `<table class="kt">${head}${body}</table>`
    wrap.current.querySelectorAll<SVGSVGElement>('svg.hist').forEach((svgEl) => {
      const k = svgEl.dataset.k!, lo = +svgEl.dataset.lo!, hi = +svgEl.dataset.hi!, W = 110, H = 26, x = d3.scaleLinear([0, W], [lo, hi])
      const br = d3.brushX().extent([[0, 0], [W, H]]).on('end', (ev: any) => {
        if (!ev.sourceEvent) return
        if (!ev.selection) delete s.rng[k]
        else { const [a, b] = (ev.selection as number[]).map(x); s.rng[k] = [a <= lo + 1e-12 ? -Infinity : a, b >= hi - 1e-12 ? Infinity : b] }
        s.page = 0; update()
      })
      d3.select(svgEl).append('g').attr('class', 'hbrush').call(br as any)
    })
    // summary tiles
    const peat = P_.peat, sumA = (arr: (number | null)[]) => d3.sum(idx, (j) => arr[j] || 0)
    const byY = (k: keyof R, ny: number) => d3.range(ny).map((i) => d3.sum(idx, (j) => (ser[k][j][i] || 0) * (k === 'burned' ? peat[j] || 0 : 1)))
    const burnKm = byY('burned', YB.length).map((x) => x / 100), hs = byY('hs', YH.length), nowm = d3.range(12).map((i) => d3.sum(idx, (j) => ser.now_m[j][i] || 0))
    const lastNow = nowm.reduce((a, x, i) => (x > 0 ? i : a), -1)
    const pop = P_.ind.pop_on_peat
    const k: [string, string, string][] = [[fmt(idx.length, 0), t('KHG shown'), ''], [fmt(sumA(peat), 0), t('km2 of peat'), ''], [fmt(pop ? sumA(pop) : 0, 0), t('people on the peat'), ''],
      [fmt(d3.sum(burnKm.slice(0, -1)), 0), t('km2 of peat burned, 2015 to 2025'), spark(burnKm, '--hist', 200, 26)],
      [fmt(d3.sum(hs), 0), t('VIIRS hotspots on peat, 2012 to 2026'), spark(hs, '--hist', 200, 26)],
      [fmt(d3.sum(nowm), 0), t('hotspots this year (MODIS)'), spark(nowm.slice(0, Math.max(1, lastNow + 1)), '--now', 200, 26)]]
    sum.current!.innerHTML = k.map(([a, l, sp]) => `<div class="kpi"><div class="v">${a}</div><div class="l">${esc(l)}</div>${sp}</div>`).join('')
    // range chips
    chips.current!.innerHTML = Object.entries(s.rng).map(([key2, [a, b]]) => { const c = COLS.find((c) => c.k === key2)!; const f = (z: number) => (isFinite(z) ? (c.f ? c.f(z) : fmt(z)) : z > 0 ? '∞' : '−∞'); return `<span class="rchip">${esc(t(c.label))}: ${esc(f(a))} – ${esc(f(b))}<button type="button" data-rk="${key2}" aria-label="${esc(t('Remove'))}">×</button></span>` }).join('')
    chips.current!.style.marginTop = Object.keys(s.rng).length ? '10px' : '0'
    // pager
    const n = idx.length, from = n ? s.page * ps + 1 : 0, to = Math.min(n, s.page * ps + ps)
    const pages: (number | '…')[] = []; for (let p = 0; p < np; p++) if (p < 2 || p > np - 3 || Math.abs(p - s.page) <= 2) pages.push(p); else if (pages[pages.length - 1] !== '…') pages.push('…')
    const btn = (attr: string, label: string, on: boolean, dis = false) => `<button type="button" ${attr} class="${on ? 'on' : ''}"${dis ? ' disabled' : ''}>${label}</button>`
    const ph = `<span class="hint">${esc(t('{a}–{b} of {n} KHG', { a: fmt(from, 0), b: fmt(to, 0), n: fmt(n, 0) }))}</span>
      <span class="seg">${([25, 50, 100, 'all'] as const).map((x) => btn(`data-ps="${x}"`, x === 'all' ? esc(t('All')) : String(x), s.ps === x)).join('')}</span>
      <span class="seg">${btn(`data-pg="${s.page - 1}"`, '‹', false, !s.page) + pages.map((p) => (p === '…' ? '<button type="button" disabled>…</button>' : btn(`data-pg="${p}"`, String(p + 1), p === s.page))).join('') + btn(`data-pg="${s.page + 1}"`, '›', false, s.page >= np - 1)}</span>`
    pagerTop.current!.innerHTML = ph; pagerBot.current!.innerHTML = ph
    // query
    const nq = new URLSearchParams({ s: s.scope }); if (s.isl) nq.set('i', s.isl); if (s.type.size) nq.set('ty', [...s.type].join('')); if (s.flag) nq.set('f', s.flag)
    nq.set('k', s.sk); nq.set('d', String(s.sd)); nq.set('g', [...s.groups].join(','))
    if (nq.toString() !== q.toString()) setQ(nq, { replace: true })
  }, [P_, C, ready, ser, v, lang, theme])   // eslint-disable-line react-hooks/exhaustive-deps

  // clicks inside the drawn table, chips and pager
  const onTable = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement, s = S.current
    const lb = el.closest<HTMLElement>('.lb'); if (lb && C) { const k = lb.dataset.k!; const c = C.COLS.find((c) => c.k === k); s.sd = s.sk === k ? -s.sd : c && c.num && !c.asc ? -1 : 1; s.sk = k; update(); return }
    if (el.closest('thead')) return
    const tr = el.closest<HTMLElement>('tbody tr'); if (tr && !(el.closest('[data-tip]') && el.closest('.tyb,.ivb'))) nav('/khg/' + tr.dataset.id)
  }
  const onPager = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b || b.disabled) return; const s = S.current
    if (b.dataset.ps) { s.ps = b.dataset.ps === 'all' ? 'all' : +b.dataset.ps; s.page = 0; update() }
    else if (b.dataset.pg) { s.page = +b.dataset.pg; update(); if (wrap.current) wrap.current.scrollTop = 0 }
  }
  const onChips = (e: React.MouseEvent) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-rk]'); if (b) { delete S.current.rng[b.dataset.rk!]; S.current.page = 0; update() } }
  const downloadCsv = () => {
    if (!P_ || !C) return
    const cols = C.COLS.filter((c) => !c.spark && c.k !== 'name'), qv = (x: unknown) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const head = ['khg_code', 'khg_name', 'provinces', 'klh_337', 'team_khg', ...cols.map((c) => c.k.replace(/^d_/, ''))]
    const lines = [head.join(',')].concat(idxRef.current.map((j) => ['KHG.' + P_.id[j], P_.name[j], P_.prov[j], P_.k337[j], P_.team[j], ...cols.map((c) => c.v(j))].map(qv).join(',')))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })); a.download = 'khg_table.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  if (err) return <div className="p-6 muted">{err}</div>
  if (!P_ || !C || !ready) return <div className="p-6 muted">{t('Loading')}…</div>
  const s = S.current, set = (p: Partial<State>) => { Object.assign(s, p, { page: 0 }); update() }
  const toggle = (set_: Set<string>, x: string) => { set_.has(x) ? set_.delete(x) : set_.add(x); s.page = 0; update() }
  const ISL = [...new Set(P_.isl)].filter(Boolean).sort()
  const M = P_.meta
  return (
    <div className="pz mx-auto max-w-[1680px] px-3 pb-10 md:px-5" data-lang={lang}>
      <div className="flex flex-wrap items-end justify-between gap-3 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">{t('KHG table')}</h1>
          <p className="hint mt-0.5" style={{ fontSize: 13 }}>{t("Every KHG with every field of the prioritisation: filter, sort, and drag on a column's histogram to keep a range. Click a row to open its profile.")}</p>
        </div>
        <Button variant="outline" size="sm" className="h-7" onClick={downloadCsv}><Download className="size-3.5" />{t('Download CSV')}</Button>
      </div>
      <main className="tp">
        <section className="card">
          <div className="tbar2">
            <label className="ctl"><span>{t('Search')}</span><Input type="search" className="h-7 min-w-[240px] text-xs" value={s.q} placeholder={t('KHG name, code, province or Tim')} onChange={(e) => set({ q: e.target.value })} /></label>
            <div className="ctl"><span>{t('Show')}</span><Seg items={[['337', 'KLH 337', "KLH's 337 priority KHG."], ['team', 'Team KHG', 'KHG chosen by the project team (main and reserve).'], ['362', 'PPEG 362', "The 362 priority KHG of KLH's PPEG analysis."], ['scored', 'All scored', 'Every KHG with a type.'], ['all', 'All 865', 'Every KHG.']].map(([v, l, tp]) => ({ v, label: t(l), tip: t(tp) }))} value={s.scope} onChange={(v) => set({ scope: v })} /></div>
            <div className="ctl"><span>{t('Island')}</span><Seg items={[{ v: 'all', label: t('All') }, ...ISL.map((i) => ({ v: i, label: i.replace(/^Pulau /, '') }))]} value={s.isl || 'all'} onChange={(v) => set({ isl: v === 'all' ? '' : v })} /></div>
            <div className="ctl"><span>{t('Type')}</span><Seg multi items={TYPE_ORDER.map((ty) => ({ v: ty, label: ty, tip: `<b>${ty} ${esc(t(TYPE_LABEL[ty]))}</b><br>${esc(t(TYPE_RULE[ty]))}` }))} value={[...s.type]} onChange={(v: string[]) => set({ type: new Set(v) })} /></div>
            <div className="ctl"><span>{t('Intervention')}</span><Seg multi items={IV_ORDER.map((x) => ({ v: x, label: t(IV_SHORT[x]) }))} value={[...s.iv]} onChange={(v: string[]) => set({ iv: new Set(v) })} /></div>
            <div className="ctl"><span>{t('Flag')}</span><Seg items={[{ v: 'all', label: t('All') }, { v: 'lowf', label: t('Low feasibility') }, { v: 'hix', label: t('High exposure') }, { v: 'wk', label: t('Whole KHG'), tip: t("No peat in KLH's peat map: scored with the whole KHG as peat.") }]} value={s.flag || 'all'} onChange={(v) => set({ flag: v === 'all' ? '' : v })} /></div>
            <div className="ctl"><span>{t('Columns')}</span><div className="groups">{C.GROUPS.map(([g, l]) => <button key={g} type="button" className={'gchip' + (s.groups.has(g) ? ' on' : '')} onClick={() => { toggle(s.groups, g); if (!s.groups.size) s.groups.add('khg') }}>{t(l)}</button>)}</div></div>
            <div className="ctl"><span>&nbsp;</span><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { S.current = fresh(); update() }}><RotateCcw className="size-3.5" />{t('Reset')}</Button></div>
          </div>
          <div className="rchips" ref={chips} onClick={onChips} />
        </section>
        <div className="sumrow" ref={sum} />
        <section className="card">
          <div className="pager" ref={pagerTop} onClick={onPager} />
          <div className="twrap" ref={wrap} onClick={onTable} />
          <div className="pager" ref={pagerBot} onClick={onPager} />
        </section>
        <p className="hint">{t("Scores and types from the prioritisation run of {r}; fire data to {d}. Histograms: grey is every KHG, colour is the KHG that pass the other filters. Sparklines share no scale: each shows the shape of one KHG's series.", { r: M.rule.run ?? '', d: M.page.period_now ?? '' })}</p>
      </main>
    </div>
  )
}
