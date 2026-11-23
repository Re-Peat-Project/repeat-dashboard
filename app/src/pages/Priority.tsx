// National KHG prioritisation: map, types and rank shift on top; weights and the ranked list below (the layout of the
// prioritisation page). A row or a KHG on the map opens its profile.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as d3 from 'd3'
import { Download } from 'lucide-react'
import { Seg } from '@/components/Seg'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { dataUrl } from '@/lib/data'
import { initMaplibre, maplibregl } from '@/lib/map'
import { useStore } from '@/lib/store'
import {
  confChar, confName, css, defaultW, esc, finDims, fmt, fx, IND, IV_COL, IV_ORDER, IV_SHORT, IV_NOTE, loadGeo, loadPriority, parity, refW, t, tipAttr, TYPE_LABEL, TYPE_ORDER, TYPE_RULE, type PD,
} from '@/priority/core'
import { dimTip, finTip, indTip, ivBadge, ivTip, profBar, renderShift, typeTip, typeVar, type Ctx } from '@/priority/render'
import { firstSymbol, mapLabels, mutedStyle, prioQuery, readPrioQuery, restyleBase, usePrio, useScores } from '@/priority/state'

const NAT_BOUNDS: [[number, number], [number, number]] = [[94.5, -11.5], [141.8, 6.5]]
const ISL: [string, [[number, number], [number, number]]][] = [['All', NAT_BOUNDS], ['Sumatra', [[95, -6.5], [106.5, 6]]], ['Kalimantan', [[108, -4.5], [119.5, 4.5]]], ['Papua', [[130.5, -9.5], [141, 0.5]]]]

export function usePriorityData() {
  const [P, setP] = useState<PD | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { loadPriority().then(setP).catch((e) => setErr(String(e))) }, [])
  return { P, err }
}

export default function Priority() {
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const { lang, theme } = useStore()
  const selected = usePrio((s) => s.sel)
  const { P, err } = usePriorityData()
  const st = usePrio()
  const S = useScores(P)
  const [ready, setReady] = useState(false)
  // read the query once, then write it back on every change
  useEffect(() => { if (P && !ready) { readPrioQuery(P, q); setReady(true) } }, [P, ready, q])
  useEffect(() => { if (ready && P) { const s = prioQuery(P); if (s !== q.toString()) setQ(s, { replace: true }) } }, [ready, P, st.w, st.missing, st.conf, st.colour, st.only337, st.isl, q, setQ])
  const [tf, setTf] = useState({ type: '', iv: '', flag: '', q: '', k: 'ru', dir: 1 })
  const open = (code: string) => nav(`/khg/${code}${q.toString() ? '?' + q.toString() : ''}`)
  if (err) return <div className="p-6 muted">{err}</div>
  if (!P || !S || !ready) return <div className="p-6 muted">{t('Loading')}…</div>
  const C: Ctx = { P, FC: S.FC, FC0: S.FC0, w: S.w, atRef: S.atRef }
  return (
    <div className="pz mx-auto max-w-[1680px] px-3 pb-10 md:px-5" data-lang={lang} data-theme-key={theme}>
      <Head C={C} />
      <div className="card final">
        <div className="final-top">
          <NatMap C={C} sel={selected} onOpen={open} />
          <div className="final-sum">
            <TypesTable C={C} tf={tf} setTf={setTf} />
            <Shift C={C} sel={selected} onOpen={open} tf={tf} />
          </div>
        </div>
        <div className="final-main">
          <Weights C={C} />
          <List C={C} tf={tf} setTf={setTf} sel={selected} onOpen={open} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- header: title, presets, export
function Head({ C }: { C: Ctx }) {
  const P = C.P, M = P.meta, st = usePrio()
  const r = refW(P), ks = Object.keys(r)
  const presets: [string, Record<string, number>, string][] = [
    ['Dashboard defaults', defaultW(P), t('The starting weights for this dashboard.')],
    ['Pre-registered rule', r, t('The weights written down on {d}, before any result: the reference for every comparison.', { d: M.rule.written })],
    ['Equal weights', Object.fromEntries(ks.map((k) => [k, 1])), t('Every indicator weight 1.')],
    ['Fire history only', Object.fromEntries(ks.map((k) => [k, M.rule.dims.urgency[k] !== undefined ? (k === 'u_fire_freq' ? 1 : 0) : r[k]])), t('Urgency from the burned share of peat per year alone, as a check: the other dimensions keep their weights.')],
  ]
  const cur = presets.find(([, w]) => Object.keys(w).every((k) => Math.abs(w[k] - (C.w[k] ?? 0)) < 1e-9))?.[0] ?? ''
  const par = useMemo(() => parity(P), [P])
  const date = M.page.period_now ? new Date(M.page.period_now).toLocaleDateString(useStore.getState().lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 py-3" data-parity={`${par.n}:${par.bad}`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight">{t('KHG priority')}</h1>
        <p className="hint mt-0.5 max-w-[900px]" style={{ fontSize: 13 }}>
          {t('{n} KHG, hotspots to {date}.', { n: M.page.n_khg, date })}{' '}
          {t('Five dimensions per KHG, each from its indicators; the type of action from urgency, complexity and stake. Rule v{v} written {d}. Hover any label for what it means.', { v: M.rule.version, d: M.rule.written })}{' '}
          <b style={{ fontWeight: 500 }}>{t('Weights are provisional and not yet agreed with the team.')}</b>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg items={presets.map(([v, , tip]) => ({ v, label: t(v), tip }))} value={cur} onChange={(v) => st.set({ w: { ...presets.find((p) => p[0] === v)![1] } })} />
        <ExportDialog C={C} />
      </div>
    </div>
  )
}

function ExportDialog({ C }: { C: Ctx }) {
  const P = C.P
  const current = () => {
    const ks = Object.keys(refW(P)), dd = finDims(P)
    const head = ['khg_code', 'khg_name', 'provinces', 'island', 'klh_337', 'type', 'rank_urgency', 'rank_urgency_337', 'rank_in_type', ...dd.map((d) => d[2]), 'intervention', 'flag_low_feasibility', 'flag_high_exposure', 'type_at_rule', ...ks, ...ks.map((k) => 'w_' + k)]
    const rows = d3.range(P.n).filter((j) => C.FC.type[j]).map((j) => ['KHG.' + P.id[j], P.name[j], P.prov[j], P.isl[j], P.k337[j], C.FC.type[j], C.FC.ru[j], C.FC.ru337[j], C.FC.rt[j], ...dd.map((d) => { const v = (C.FC as any)[d[0]][j]; return v == null ? '' : +v.toFixed(4) }), P.iv[j] || '', C.FC.lowf[j], C.FC.hix[j], C.FC0.type[j], ...ks.map((k) => P.ind[k]?.[j] ?? ''), ...ks.map((k) => C.w[k])])
    const text = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = 'khg_priority_current_view.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500)
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="h-7"><Download className="size-3.5" />{t('Export data')}</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('Export data')}</DialogTitle>
          <DialogDescription>{t('Files as written by the pipeline; the date of each is under its name. Areas in km2 or ha as named in each column; shares are 0 to 1. The KLH layers behind them are for team use only.')}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border text-sm">
          <li className="flex items-center justify-between gap-4 py-2">
            <div><b>khg_priority_current_view.csv</b> <small className="muted">{t('the list as shown')}</small><br /><span className="muted">{t('The KHG in the list now, with your filters and weights: scores, type, ranks, flags, the type at the pre-registered weights, every indicator and the weights used.')}</span></div>
            <Button size="sm" variant="outline" onClick={current}>{t('Download')}</Button>
          </li>
          {[{ file: 'khg_profile.csv', desc: 'One row per KHG: scores, type, ranks, flags, every indicator and the profile fields of this dashboard.', rows: P.n, cols: Object.keys(P.row[0]).length, kb: 0, src: 'data/priority/khg_profile.csv', dir: '' }, ...P.meta.exports.map((d) => ({ ...d, dir: 'exports/' }))].map((d) => (
            <li key={d.file} className="flex items-center justify-between gap-4 py-2">
              <div><b>{d.file}</b> <small className="muted">{fmt(d.rows, 0)} {t('rows')} · {fmt(d.cols, 0)} {t('columns')}{d.kb ? ` · ${d.kb >= 1024 ? fx(d.kb / 1024, 1) + ' MB' : fmt(Math.max(1, Math.round(d.kb)), 0) + ' kB'}` : ''}</small><br /><span className="muted">{t(d.desc)}</span><br /><small className="muted font-mono text-[11px]">{d.src}</small></div>
              <Button size="sm" variant="outline" asChild><a href={dataUrl(`priority/${d.dir}${d.file}`)} download>{t('Download')}</a></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- national map, coloured by type, intervention or a dimension
function colourOf(C: Ctx, j: number, colour: string, only337: boolean, isl: string[]) {
  const P = C.P
  if (!C.FC.type[j]) return null
  if (only337 && !P.k337[j]) return null; if (isl.length && !isl.includes(P.isl[j])) return null
  if (colour === 'type') return css('--ty' + C.FC.type[j])
  if (colour === 'iv') return P.iv[j] ? IV_COL[P.iv[j] as string] : null
  const v = (C.FC as any)[colour][j]; return v == null ? null : d3.interpolateRgb(css('--ramp0'), css('--ramp1'))(v)
}
function NatMap({ C, sel, onOpen }: { C: Ctx; sel: string | null; onOpen: (c: string) => void }) {
  const P = C.P, st = usePrio(), { lang, theme } = useStore()
  const el = useRef<HTMLDivElement>(null), mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [lay, setLay] = useState({ fill: true, team: true, labels: true })
  const Cref = useRef(C); Cref.current = C
  useEffect(() => {
    initMaplibre()
    const m = new maplibregl.Map({ container: el.current!, style: mutedStyle(), bounds: NAT_BOUNDS, fitBoundsOptions: { padding: 14 }, attributionControl: false, cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, renderWorldCopies: false })
    m.addControl(new maplibregl.AttributionControl({ compact: true })); m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left'); m.touchZoomRotate.disableRotation()
    mapRef.current = m
    m.on('load', async () => {
      const geo = await loadGeo()
      for (const f of geo.features) (f.properties as any).team = P.team[P.idx.get((f.properties as any).code) ?? -1] ? 1 : 0
      m.addSource('khg', { type: 'geojson', data: geo, promoteId: 'code' })
      const before = firstSymbol(m), none: any = ['coalesce', ['feature-state', 'c'], css('--none')]
      m.addLayer({ id: 'khg-fill', type: 'fill', source: 'khg', paint: { 'fill-color': none, 'fill-opacity': 0.9 } }, before)
      m.addLayer({ id: 'khg-line', type: 'line', source: 'khg', paint: { 'line-color': none, 'line-width': 1 } }, before)
      m.addLayer({ id: 'khg-team', type: 'line', source: 'khg', filter: ['==', ['get', 'team'], 1], paint: { 'line-color': css('--ink'), 'line-width': 1.6 } }, before)
      m.addLayer({ id: 'khg-sel', type: 'line', source: 'khg', paint: { 'line-color': css('--now'), 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0] } }, before)
      mapLabels(m, useStore.getState().lang); setReady(true); m.resize()
    })
    m.on('mousemove', 'khg-fill', (e) => { const f = e.features?.[0]; if (!f) return; const j = P.idx.get(f.properties.code); m.getCanvas().style.cursor = 'pointer'; m.getCanvas().dataset.tip = j === undefined ? '' : finTip(Cref.current, j) })
    m.on('mouseleave', 'khg-fill', () => { m.getCanvas().style.cursor = ''; delete m.getCanvas().dataset.tip })
    m.on('click', 'khg-fill', (e) => { const f = e.features?.[0]; if (f) onOpen(f.properties.code) })
    const ro = new ResizeObserver(() => m.resize()); ro.observe(el.current!)
    return () => { ro.disconnect(); m.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    for (let j = 0; j < P.n; j++) m.setFeatureState({ source: 'khg', id: P.id[j] }, { c: colourOf(C, j, st.colour, st.only337, st.isl) || css('--none'), sel: P.id[j] === sel })
  }, [ready, C, st.colour, st.only337, st.isl, sel, theme, P])
  useEffect(() => { const m = mapRef.current; if (!m || !ready) return; restyleBase(m); mapLabels(m, useStore.getState().lang); m.setPaintProperty('khg-team', 'line-color', css('--ink')); m.setPaintProperty('khg-sel', 'line-color', css('--now')) }, [theme, ready])
  useEffect(() => { const m = mapRef.current; if (m && ready) mapLabels(m, lang) }, [lang, ready])
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const v = (id: string, on: boolean) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    v('khg-fill', lay.fill); v('khg-team', lay.team)
    for (const l of m.getStyle().layers) if (l.type === 'symbol') m.setLayoutProperty(l.id, 'visibility', lay.labels ? 'visible' : 'none')
  }, [lay, ready])
  const g = <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{t('grey: not scored or filtered out · outlined: team')}</span>
  const legend = st.colour === 'type'
    ? TYPE_ORDER.map((ty) => <span key={ty} className="hasTip" data-tip={typeTip(ty)}><i className="sw" style={{ background: `var(--ty${ty})`, marginRight: 5 }} />{ty} {t(TYPE_LABEL[ty])}</span>)
    : st.colour === 'iv' ? IV_ORDER.map((v) => <span key={v} className="hasTip" data-tip={ivTip(P, v)}><i className="sw" style={{ background: IV_COL[v], marginRight: 5 }} />{t(IV_SHORT[v])}</span>)
      : [<span key="d" className="hasTip" data-tip={dimTip(C, st.colour)}>{t(finDims(P).find((d) => d[0] === st.colour)![1])}</span>, <span key="0">0</span>, <span key="r" className="ramp" style={{ background: `linear-gradient(90deg,${css('--ramp0')},${css('--ramp1')})` }} />, <span key="1">1</span>]
  const tg = (k: keyof typeof lay, label: string, icon: React.ReactNode, tip: string) => (
    <span className={'tg' + (lay[k] ? '' : ' off')} data-tip={t(tip)} onClick={() => setLay({ ...lay, [k]: !lay[k] })}>{icon}{t(label)}</span>
  )
  return (
    <div className="final-map">
      <div className="flex flex-col" style={{ flex: 1 }}>
        <div className="card-h"><h3 style={{ margin: 0 }}>{t('Map')}</h3>
          <Seg items={ISL.map(([n]) => ({ v: n, label: t(n) }))} value="" onChange={(n) => mapRef.current?.fitBounds(ISL.find((x) => x[0] === n)![1], { padding: 16, duration: 600 })} tip={t('Zoom to an island.')} />
        </div>
        <div className="map-tools">
          <span className="lab" data-tip={t('Colour the KHG by their type or by one dimension score.')}>{t('Colour by')}</span>
          <Seg items={[{ v: 'type', label: t('Type'), tip: t('Type of action.') }, { v: 'iv', label: t('Intervention'), tip: ivTip(P, 'rewetting and revegetation') }, ...finDims(P).map((d) => ({ v: d[0], label: t(d[1]), tip: dimTip(C, d[0]) }))]} value={st.colour} onChange={(v) => st.set({ colour: v })} />
          {tg('fill', 'KHG colour', <i className="poly" style={{ background: 'var(--ramp1)' }} />, 'Colour of each KHG by type or score. Off leaves only the outlines.')}
          {tg('team', 'Team KHG outline', <i style={{ background: 'var(--ink)', height: 2 }} />, 'Dark outline around the KHG selected by the team.')}
          {tg('labels', 'Place names', <i className="poly" style={{ background: 'var(--muted)' }} />, 'Basemap place names.')}
        </div>
        <div ref={el} className="pmap" style={{ flex: '1 1 auto', minHeight: 460, borderRadius: 10, overflow: 'hidden', background: 'var(--none)', position: 'relative' }} role="img" aria-label={t('Map of KHG coloured by type')} />
        <div className="map-legend" id="map-legend">{legend}{g}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- types summary and rank shift
type TF = { type: string; iv: string; flag: string; q: string; k: string; dir: number }
function visible(C: Ctx, j: number) { const s = usePrio.getState(); return !!C.FC.type[j] && (!s.only337 || !!C.P.k337[j]) && (!s.isl.length || s.isl.includes(C.P.isl[j])) }
function TypesTable({ C, tf, setTf }: { C: Ctx; tf: TF; setTf: (f: TF) => void }) {
  const P = C.P, FC = C.FC; usePrio()
  const agg: Record<string, { n: number; peat: number; lowf: number; hix: number; moved: number }> = {}
  for (const ty of TYPE_ORDER) agg[ty] = { n: 0, peat: 0, lowf: 0, hix: 0, moved: 0 }
  for (let j = 0; j < P.n; j++) { if (!visible(C, j)) continue; const a = agg[FC.type[j] as string]; a.n++; a.peat += P.peat[j] || 0; a.lowf += FC.lowf[j]; a.hix += FC.hix[j]; if (C.FC0.type[j] !== FC.type[j]) a.moved++ }
  const mx = { n: d3.max(TYPE_ORDER, (ty) => agg[ty].n) || 1, peat: d3.max(TYPE_ORDER, (ty) => agg[ty].peat) || 1 }
  const chg = !C.atRef
  const th = (l: string, tip: string) => <th dangerouslySetInnerHTML={{ __html: `<span class="hasTip"${tipAttr(tip)}>${esc(l)}</span>` }} />
  return (
    <div>
      <h3 className="hasTip" data-tip={t('The five types of action. Click a type to filter the list.')}>{t('Types')}</h3>
      <table className="ftypes"><thead><tr>
        {th(t('Type'), t('The five types of action. Click a type to filter the list.'))}{th(t('KHG'), t('KHG of the type, after the 337 and island filters.'))}{th(t('Peat') + ' km2', t('KLH peat (PPEG 2026) of the KHG of the type.'))}
        {th(t('Low feasibility'), dimTip(C, 'f'))}{FC.p ? th(t('High exposure'), dimTip(C, 'p')) : null}{chg ? th(t('Moved in'), t('KHG whose type differs from the type at the pre-registered weights.')) : null}
      </tr></thead><tbody>
        {TYPE_ORDER.map((ty) => { const a = agg[ty]; return (
          <tr key={ty} className={tf.type === ty ? 'on' : ''} data-ty={ty} data-tip={typeTip(ty)} onClick={() => setTf({ ...tf, type: tf.type === ty ? '' : ty })}>
            <td><span className="tyb" style={{ ['--c' as any]: typeVar(ty) }}>{ty}</span> {t(TYPE_LABEL[ty])}</td>
            <td><span className="hb" style={{ width: (54 * a.n / mx.n).toFixed(0) + 'px', background: typeVar(ty) }} />{fmt(a.n, 0)}</td>
            <td><span className="hb" style={{ width: (54 * a.peat / mx.peat).toFixed(0) + 'px', background: typeVar(ty) }} />{fmt(a.peat, 0)}</td>
            <td className="num">{fmt(a.lowf, 0)}</td>{FC.p ? <td className="num">{fmt(a.hix, 0)}</td> : null}{chg ? <td className="num">{fmt(a.moved, 0)}</td> : null}
          </tr>) })}
      </tbody></table>
    </div>
  )
}
function Shift({ C, sel, onOpen, tf }: { C: Ctx; sel: string | null; onOpen: (c: string) => void; tf: TF }) {
  const ref = useRef<SVGSVGElement>(null), st = usePrio(), { lang, theme } = useStore()
  const idx = useMemo(() => d3.range(C.P.n).filter((j) => visible(C, j)), [C, st.only337, st.isl])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) renderShift(ref.current, C, idx, st.only337, sel, onOpen, 15) }, [C, idx, st.only337, sel, onOpen, lang, tf, theme])
  useEffect(() => { const ro = new ResizeObserver(() => ref.current && renderShift(ref.current, C, idx, st.only337, sel, onOpen, 15)); if (ref.current) ro.observe(ref.current); return () => ro.disconnect() }, [C, idx, st.only337, sel, onOpen])
  return <div className="final-val"><h3 className="hasTip" data-tip={t('Rank at the pre-registered weights on the left, at your weights on the right. Dark lines moved 3 places or more. Orange: the selected KHG.')}>{t('Rank shift')}</h3><svg id="fshift" ref={ref} role="img" aria-label={t('Rank at the pre-registered weights against rank at your weights')} /></div>
}

// ---------------------------------------------------------------- weights
function Weights({ C }: { C: Ctx }) {
  const P = C.P, st = usePrio(), r = refW(P)
  return (
    <aside id="final-w" aria-label={t('Weights')}>
      <h2 className="hasTip" data-tip={t('Each dimension is the weighted mean of its indicators. Move a slider and the scores, types, list and map update. The types come from terciles within each dimension, so only the weights inside a dimension matter. The pre-registered weights are the reference; changes are shown against them.')}>{t('Weights')}</h2>
      {finDims(P).map(([key, lab, dn]) => (
        <div className="fw-g" key={key}>
          <div className="gs hasTip" data-tip={dimTip(C, key)}><span className="sw" style={{ background: `var(--dim-${key})` }} />{t(lab)}</div>
          {Object.keys(P.meta.rule.dims[dn]).map((k) => (
            <div className="sl" key={k}>
              <label className="hasTip" data-tip={indTip(P, k) + `<br><span>${t('Pre-registered weight {w}.', { w: fmt(r[k], 1) })}</span>`}>{t((IND[k] || [k])[0])}</label>
              <Slider min={0} max={4} step={0.5} value={[C.w[k]]} onValueChange={([v]) => st.set({ w: { ...C.w, [k]: v } })} className="my-1.5 [&_[data-slot=slider-range]]:bg-[var(--c)] [&_[data-slot=slider-thumb]]:size-3.5" style={{ ['--c' as any]: `var(--dim-${key})` }} aria-label={t((IND[k] || [k])[0])} />
              <output>{fmt(C.w[k], 1)}</output>
            </div>
          ))}
        </div>
      ))}
      <Button variant="outline" size="sm" className="mt-3 w-full" data-tip={t('Back to the dashboard defaults.')} onClick={() => st.set({ w: defaultW(P) })}>{t('Reset weights')}</Button>
      {P.meta.rule.reported.length ? <p className="hint fw-rep" data-tip={P.meta.rule.reported.map((k) => indTip(P, k)).join('<br><br>')}>{t('Reported, not scored: {x}', { x: P.meta.rule.reported.map((k) => t((IND[k] || [k])[0])).join(', ') })}</p> : null}
    </aside>
  )
}

// ---------------------------------------------------------------- the ranked list
function List({ C, tf, setTf, sel, onOpen }: { C: Ctx; tf: TF; setTf: (f: TF) => void; sel: string | null; onOpen: (c: string) => void }) {
  const P = C.P, FC = C.FC, st = usePrio(), chg = !C.atRef
  const isl = useMemo(() => [...new Set(P.isl)].filter(Boolean).sort(), [P])
  const rk = (j: number) => (st.only337 ? FC.ru337[j] : FC.ru[j]), rk0 = (j: number) => (st.only337 ? C.FC0.ru337[j] : C.FC0.ru[j])
  const qq = tf.q.trim().toLowerCase()
  const idx: number[] = []
  for (let j = 0; j < P.n; j++) {
    if (!visible(C, j)) continue; if (tf.type && FC.type[j] !== tf.type) continue; if (tf.iv && P.iv[j] !== tf.iv) continue
    if (tf.flag === 'lowf' && !FC.lowf[j]) continue; if (tf.flag === 'hix' && !FC.hix[j]) continue; if (tf.flag === 'moved' && C.FC0.type[j] === FC.type[j]) continue
    if (qq && !(P.name[j].toLowerCase().includes(qq) || P.id[j].toLowerCase().includes(qq) || (P.prov[j] || '').toLowerCase().includes(qq))) continue
    idx.push(j)
  }
  const key: Record<string, (j: number) => number | string> = {
    ru: (j) => rk(j) ?? 1e9, ty: (j) => TYPE_ORDER.indexOf(FC.type[j] as string) * 1000 + (FC.rt[j] as number), u: (j) => -(FC.u[j] ?? -1), s: (j) => -(FC.s[j] ?? -1), c: (j) => -(FC.c[j] ?? -1), f: (j) => -(FC.f[j] ?? -1), p: (j) => -((FC.p || [])[j] ?? -1),
    iv: (j) => IV_ORDER.indexOf(P.iv[j] as string) * 1000 + (rk(j) ?? 0), mv: (j) => -(((rk0(j) ?? 0) as number) - ((rk(j) ?? 0) as number)), peat: (j) => -(P.peat[j] ?? 0), nm: (j) => P.name[j],
  }
  const kf = key[tf.k] || key.ru
  idx.sort((a, b) => { const x = kf(a), y = kf(b); return (x < y ? -1 : x > y ? 1 : 0) * tf.dir || a - b })
  const sortBy = (k: string) => setTf({ ...tf, k, dir: tf.k === k ? -tf.dir : 1 })
  const pct = (m: string) => Math.round((P.meta.rule.intervention?.[m]?.min ?? 0.2) * 100)
  const HT: Record<string, string> = {
    ru: t('Rank by urgency (1 = most urgent), among KLH\'s 337 or among all scored KHG. Click any header to sort.'),
    mv: t('Change in rank against the pre-registered weights: places gained (▲) or lost (▼). A small letter shows the earlier type when it changed. All dots: the weights are as pre-registered.'),
    nm: t('KHG: peat hydrological unit, the unit of analysis. Click a row to open its profile; the small text is the province and any flags.') + '<br>' + t('● high ◐ medium ○ low data confidence · ◆ team KHG'),
    ty: t('Type of action from the terciles of urgency, complexity and stake; the small number is the rank within the type.') + '<br>' + TYPE_ORDER.map((ty) => `${ty} ${esc(t(TYPE_LABEL[ty]))}: ${esc(t(TYPE_RULE[ty]))}`).join('<br>'),
    iv: ivTip(P, 'rewetting and revegetation') + '<br>' + IV_ORDER.map((v) => `${esc(t(IV_SHORT[v]))}: ${esc(t(IV_NOTE[v], { a: pct('rewetting'), b: pct('revegetation') }))}`).join('<br>'),
    peat: t('KLH peat inside the KHG (PPEG 2026), km2.'),
  }
  const th = (k: string, l: string, cls = '') => <th key={k} className={cls + (tf.k === k ? ' on' : '')} data-tip={HT[k] || ''} onClick={() => sortBy(k)}>{t(l)}{tf.k === k ? (tf.dir > 0 ? ' ▾' : ' ▴') : ''}</th>
  const flags = (j: number) => [P.wk[j] ? t('no KLH peat: whole KHG used') : '', P.small[j] ? t('small peat area') : '', FC.lowf[j] ? t('low feasibility') : '', FC.hix[j] ? t('high exposure') : ''].filter(Boolean)
  const flagTip = (j: number) => [P.wk[j] ? t("KLH's peat map shows no peat in this KHG, although it is a peat hydrological unit and the Global Peatland Map shows peat. It is scored with the whole KHG as the peat extent, against the larger KHG, and is less reliable.") : '', P.small[j] ? t('Small peat area: less than {m} km2 of KLH peat, scored against the larger KHG and less reliable.', { m: P.meta.rule.min_peat }) : '', FC.lowf[j] ? t('Low feasibility: lowest third of the KHG on feasibility. The type is kept; plan for harder rewetting.') : '', FC.hix[j] ? t('High exposure: highest third on people. The type is kept; more people are affected by fire and haze.') : ''].filter(Boolean).join('<br>') || t('Click to open the profile.')
  const rowRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => { rowRef.current?.scrollIntoView({ block: 'nearest' }) }, [])
  return (
    <div className="final-list">
      <div className="final-ctl">
        <div className="flex flex-wrap items-center gap-2">
          <Seg items={[{ v: '337', label: t('KLH 337'), tip: t("KLH's work list of 337 KHG (Tim GIS, September 2026).") }, { v: 'all', label: t('All scored KHG'), tip: t('Every KHG with at least {m} km2 of KLH peat, plus the 337 with less.', { m: P.meta.rule.min_peat }) }]} value={st.only337 ? '337' : 'all'} onChange={(v) => st.set({ only337: v === '337' })} />
          <Seg multi items={isl.map((x) => ({ v: x, label: x.replace(/^Pulau /, '') }))} value={st.isl} onChange={(v: string[]) => st.set({ isl: v })} tip={t('Island filter: click one or more.')} />
          <Seg items={[{ v: 'mh', label: t('Medium + high'), tip: t("This year's hotspots: medium and high confidence.") }, { v: 'h', label: t('High only'), tip: t("This year's hotspots: high confidence only.") }]} value={st.conf} onChange={(v) => st.set({ conf: v })} tip={t("Hotspot confidence (this year's hotspots).")} />
          <Seg items={[{ v: 'skip', label: t('Ignore'), tip: t('A KHG without a value (e.g. no canals mapped) is scored on the indicators it has.') }, { v: 'median', label: t('Average'), tip: t('A KHG without a value is given the middle (median) rank for it.') }]} value={st.missing} onChange={(v) => st.set({ missing: v })} tip={t('Missing values, e.g. no canals mapped: ignore them or use the average.')} />
          <Seg items={[{ v: 'all', label: t('All') }, { v: 'lowf', label: t('Low feasibility'), tip: dimTip(C, 'f') }, ...(FC.p ? [{ v: 'hix', label: t('High exposure'), tip: dimTip(C, 'p') }] : []), ...(chg ? [{ v: 'moved', label: t('Type changed'), tip: t('KHG whose type differs from the type at the pre-registered weights.') }] : [])]} value={tf.flag || 'all'} onChange={(v) => setTf({ ...tf, flag: v === 'all' ? '' : v })} />
          <Input type="search" placeholder={t('Search KHG or province')} value={tf.q} onChange={(e) => setTf({ ...tf, q: e.target.value })} className="h-7 w-52 text-xs" />
          {tf.type || tf.iv ? <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setTf({ ...tf, type: '', iv: '' })}>{[tf.type ? t('Type {ty}', { ty: tf.type }) : '', tf.iv ? t(IV_SHORT[tf.iv]) : ''].filter(Boolean).join(' · ')} · {t('clear')}</Button> : null}
        </div>
        <span className="hint">{t('{n} KHG', { n: idx.length })}</span>
      </div>
      <div id="final-table" className="tablewrap">
        <table className="ftab"><thead><tr>
          {th('ru', st.only337 ? 'Rank in 337' : 'Rank', 'num')}{th('mv', 'Change', 'num')}{th('nm', 'KHG')}{th('ty', 'Type')}{th('iv', 'Intervention')}
          <th className="phead">{finDims(P).map(([k, lab]) => <span key={k} className={'pchip' + (tf.k === k ? ' on' : '')} data-tip={dimTip(C, k) + '<br><span>' + t('Click to sort by this dimension.') + '</span>'} onClick={(e) => { e.stopPropagation(); sortBy(k) }}><i style={{ background: `var(--dim-${k})` }} />{t(lab)}{tf.k === k ? (tf.dir > 0 ? ' ▾' : ' ▴') : ''}</span>)}</th>
          {th('peat', 'Peat km2', 'num')}
        </tr></thead><tbody>
          {idx.map((j) => {
            const d = ((rk0(j) ?? 0) as number) - ((rk(j) ?? 0) as number), ty0 = C.FC0.type[j] as string, isSel = P.id[j] === sel
            return (
              <tr key={P.id[j]} ref={isSel ? rowRef : undefined} data-id={P.id[j]} className={(isSel ? 'sel' : '') + (P.small[j] || P.wk[j] ? ' small' : '')} onClick={() => onOpen(P.id[j])}>
                <td className="num">{rk(j) ?? ''}</td>
                <td className="num dl" dangerouslySetInnerHTML={{ __html: (!chg ? '·' : d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '·') + (chg && ty0 !== FC.type[j] ? ` <span class="tyb sm" style="--c:${typeVar(ty0)}"${tipAttr(t('Type at the pre-registered weights: {ty}', { ty: ty0 + ' ' + t(TYPE_LABEL[ty0]) }))}>${ty0}</span>` : '') }} />
                <td data-tip={flagTip(j)} dangerouslySetInnerHTML={{ __html: `<span class="cdot"${tipAttr(t('Data confidence: {c}', { c: t(confName[P.conf[j]]) }) + '<br>' + t('High: canals are mapped, there is enough fire signal and enough peat. Medium: two of the three. Low: fewer.'))}>${confChar[P.conf[j]]}</span> ${esc(P.name[j])}${P.team[j] ? ` <span class="tdia"${tipAttr(t('Team KHG') + ': ' + esc(t(P.team[j])))}>◆</span>` : ''}<small>${esc(P.prov[j] || '')}${flags(j).map((x) => ' · ' + x).join('')}</small>` }} />
                <td dangerouslySetInnerHTML={{ __html: `<span class="tyb" style="--c:${typeVar(FC.type[j] as string)}"${tipAttr(typeTip(FC.type[j] as string))}>${FC.type[j]}</span><small>${FC.rt[j]}</small>` }} />
                <td dangerouslySetInnerHTML={{ __html: ivBadge(P, P.iv[j]) }} />
                <td dangerouslySetInnerHTML={{ __html: profBar(C, j) }} />
                <td className="num">{fmt(P.peat[j], 0)}</td>
              </tr>
            )
          })}
        </tbody></table>
      </div>
    </div>
  )
}
