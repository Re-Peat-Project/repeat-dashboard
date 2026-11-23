// Detailed profile of one KHG: type and dimensions, key figures, the map of its data layers (and the DEM of its workspace where
// one was built), where it sits on each indicator, land status, fire by land tenure, time series and DMPG villages. Another
// KHG can be compared side by side.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronsUpDown, X } from 'lucide-react'
import { KhgDecisionBrief } from '@/components/KhgDecisionBrief'
import { RampLegend, TERRAIN } from '@/components/Legend'
import { Seg } from '@/components/Seg'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { loadCatalog, loadManifest, type Manifest } from '@/lib/data'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { confChar, confName, esc, fmt, loadProfile, mon, t, tipAttr, type PD, type Profile } from '@/priority/core'
import { popIdx, ProfileMap, XL, type MapState } from '@/priority/profileMap'
import {
  heatMap, landBar, landStatusHtml, lineChart, monthTable, ovColor, OVCLS, ovTable, profileFinalHtml, rankTiles, renderStrips, tenureHtml, villagesHtml, yearTable, type Ctx,
} from '@/priority/render'
import { prioQuery, readPrioQuery, usePrio, useScores } from '@/priority/state'
import { usePriorityData } from './Priority'

const shortName = (s: string) => s.replace(/Sungai /g, '')

export default function KhgProfile() {
  const { code = '' } = useParams()
  const [q, setQ] = useSearchParams()
  const nav = useNavigate()
  const { lang, theme } = useStore()
  const { P, err } = usePriorityData()
  const st = usePrio()
  const S = useScores(P)
  const [init, setInit] = useState(false)
  useEffect(() => {
    if (!P || init) return
    if (['fw', 'fm', 'fh', 'fc', 'fa', 'fi'].some((key) => q.has(key))) readPrioQuery(P, q)
    setInit(true)
  }, [P, init, q])
  const secondCode = q.get('k2')
  const cmp = secondCode && secondCode !== code && P?.idx.has(secondCode) ? secondCode : null
  const [pr, setPr] = useState<Profile | null>(null)
  const [prc, setPrc] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  useEffect(() => {
    if (!q.has('view') && !q.has('mode')) return
    const next = new URLSearchParams(q)
    next.delete('view')
    next.delete('mode')
    setQ(next, { replace: true })
  }, [q, setQ])
  useEffect(() => {
    if (!P?.idx.has(code)) return
    usePrio.getState().set({ sel: code })
  }, [P, code])
  useEffect(() => {
    if (!P?.idx.has(code)) return
    let active = true
    setProfileError(null)
    loadProfile(code)
      .then((primary) => { if (active) setPr(primary) })
      .catch(() => { if (active) setProfileError(code) })
    return () => { active = false }
  }, [P, code])
  useEffect(() => {
    if (!cmp) return
    let active = true
    setComparisonError(null)
    loadProfile(cmp)
      .then((secondary) => { if (active) setPrc(secondary) })
      .catch(() => { if (active) setComparisonError(cmp) })
    return () => { active = false }
  }, [cmp])
  const setComparison = (value: string | null) => {
    const next = new URLSearchParams(q)
    if (value) next.set('k2', value)
    else next.delete('k2')
    setQ(next)
  }
  const goto = (c: string) => {
    const next = new URLSearchParams(q)
    if (c === secondCode) next.set('k2', code)
    nav({ pathname: `/khg/${c}`, search: next.toString() })
  }
  if (err) return <div className="p-6 muted">{err}</div>
  if (!P || !S || !init) return <div className="p-6 muted">{t('Loading')}…</div>
  const j = P.idx.get(code)
  if (j === undefined) return <div className="pz mx-auto max-w-[1680px] p-6"><p>{t('No KHG with the code {c}.', { c: code })}</p><Link className="underline" to="/priority">{t('KHG prioritisation')}</Link></div>
  const C: Ctx = { P, FC: S.FC, FC0: S.FC0, w: S.w, atRef: S.atRef }
  const pq = prioQuery(P)
  const profile = pr?.code === code ? pr : null
  const other = prc?.code === cmp ? prc : null
  const jc = other ? P.idx.get(other.code) ?? null : null
  return (
    <div className="pz mx-auto max-w-[1680px] px-3 pb-12 md:px-5" data-k={code} data-lang={lang} data-theme-key={theme} data-conf={st.conf}>
      <div className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <Link to={`/priority${pq ? '?' + pq : ''}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" />{t('KHG prioritisation')}</Link>
          <h1 className="text-xl font-semibold leading-tight">{P.name[j]}</h1>
          <div className="chips">
            {[P.prov[j], 'KHG.' + code, P.kab[j], P.team[j] ? t('team ' + P.team[j]) : '', P.k337[j] ? (P.tim[j] ? t('KLH 337') + ' · ' + P.tim[j] : t('KLH 337')) : '', P.row[j].u_canal_primary == null && P.row[j].u_canal_secondary == null && P.row[j].u_canal_tertiary == null ? t('no canals mapped') : '', P.row[j].dmpg ? t('DMPG villages: {n}', { n: P.row[j].dmpg }) : '']
              .filter(Boolean).map((x) => <span key={x as string} className="chip">{x}</span>)}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <KhgPick P={P} value={code} onPick={goto} label={t('KHG')} />
          <KhgPick P={P} value={cmp} onPick={setComparison} label={t('Compare with')} clearable onClear={() => setComparison(null)} exclude={code} cmp />
        </div>
      </div>
      {cmp && !other && (comparisonError === cmp
        ? <p className="mb-3 muted" role="alert">{t('Could not load the comparison profile.')}</p>
        : <p className="mb-3 muted" role="status">{t('Loading comparison profile')}…</p>)}
      {profileError === code ? <p className="card" role="alert">{t('Could not load the KHG profile.')}</p>
        : !profile ? <p className="card muted" role="status">{t('Loading')}…</p>
          : <>
            <KhgDecisionBrief C={C} profile={profile} compare={!!other} options={{ missing: st.missing, conf: st.conf }} />
            <div className="card">
            {!other && <div className="pfinal" dangerouslySetInnerHTML={{ __html: profileFinalHtml(C, j) }} />}
            <Kpis C={C} j={j} jc={jc} conf={st.conf} pr={profile} prc={other} />
            <div id="khg-evidence-map" className="scroll-mt-28"><MapBlock key={code} P={P} pr={profile} prc={other} code={code} cmpName={jc != null ? P.name[jc] : null} confHigh={st.conf === 'h'} /></div>
            <Mid C={C} j={j} jc={jc} pr={profile} prc={other} conf={st.conf} />
            <details className="data"><summary>{t('Data table')}</summary>
              <div id="p-table" dangerouslySetInnerHTML={{ __html: yearTable(profile, other ? P.name[j] : null) + monthTable(profile, other ? P.name[j] : null) + (other && jc != null ? yearTable(other, P.name[jc]) + monthTable(other, P.name[jc]) : ovTable(profile)) }} />
            </details>
            </div>
          </>}
    </div>
  )
}
// ---------------------------------------------------------------- KHG pickers
function KhgPick({ P, value, onPick, label, clearable, onClear, cmp, exclude }: { P: PD; value: string | null; onPick: (c: string) => void; label: string; clearable?: boolean; onClear?: () => void; cmp?: boolean; exclude?: string }) {
  const [open, setOpen] = useState(false)
  const j = value ? P.idx.get(value) : undefined
  const groups = useMemo(() => {
    const team: number[] = [], ranked: number[] = [], rest: number[] = []
    for (let i = 0; i < P.n; i++) {
      if (P.id[i] !== exclude) (P.team[i] ? team : P.ru337[i] != null ? ranked : rest).push(i)
    }
    team.sort((a, b) => ((P.ru337[a] ?? 1e9) as number) - ((P.ru337[b] ?? 1e9) as number)); ranked.sort((a, b) => (P.ru337[a] as number) - (P.ru337[b] as number)); rest.sort((a, b) => P.name[a].localeCompare(P.name[b]))
    return [['Team KHG', team], ['KLH 337, by rank', ranked], ['Other KHG', rest]] as [string, number[]][]
  }, [P, exclude])
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {cmp ? <i className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: 'var(--cmp)' }} /> : null}{label}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-64 min-w-0 justify-between font-normal text-foreground" aria-label={label}><span className="truncate">{j !== undefined ? P.name[j] : t('None')}</span><ChevronsUpDown className="size-3.5 opacity-50" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[var(--radix-popover-content-available-width)] p-0" align="end">
          <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
            <CommandInput placeholder={t('KHG name, code or province')} />
            <CommandList>
              <CommandEmpty>{t('No KHG found')}</CommandEmpty>
              {groups.map(([g, ids]) => (
                <CommandGroup key={g} heading={t(g)}>
                  {ids.map((i) => (
                    <CommandItem key={P.id[i]} value={`${P.name[i]} ${P.id[i]} ${P.prov[i]}`} onSelect={() => { setOpen(false); onPick(P.id[i]) }}>
                      <Check className={cn('size-3.5', P.id[i] === value ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{P.name[i]}{P.team[i] ? ' ◆' : ''}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{P.ru337[i] ? '#' + P.ru337[i] : ''} {P.type[i] ?? ''}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && value ? <Button variant="ghost" size="icon" className="size-7" onClick={onClear} aria-label={t('Clear')}><X className="size-3.5" /></Button> : null}
    </div>
  )
}

// ---------------------------------------------------------------- key figures
function Kpis({ C, j, jc, conf, pr, prc }: { C: Ctx; j: number; jc: number | null; conf: string; pr: Profile | null; prc: Profile | null }) {
  const P = C.P, r = P.row[j], high = conf === 'h'
  const pool = useMemo(() => P.ref_rank.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0), [P])
  const hsTile = (i: number): [string, string] => {
    const x = P.row[i]
    if (x.hs_now == null) return [t('n/a'), t('Hotspots this year')]
    if (!high) return [fmt(x.hs_now, 0), x.rank_now ? t('Hotspots this year · #{a} by density, #{b} by count', { a: x.rank_now, b: x.rank_now_n }) : t('Hotspots this year')]
    const rk = (arr: (number | null)[]) => 1 + pool.filter((q) => (arr[q] ?? -1) > (arr[i] ?? -1)).length
    return [fmt(P.n1hn[i], 0), t('High-confidence hotspots this year · #{a} by density, #{b} by count', { a: rk(P.n1h), b: rk(P.n1hn) })]
  }
  // land status shares of the peat (from the land-status table of the profile)
  const ls = (p: Profile | null) => {
    if (!p?.ov) return null
    const fo = p.ov.s.forest || [], pt = fo.reduce((a, x) => a + (x[2] || 0), 0), la = (p.ov.s.licence_any || [[0, 0, 0, 0, 0, 0]])[0], dm = (p.ov.s.dmpg || [[0, 0, 0]])[0][2] || 0
    return { lic: pt ? Math.round((100 * (la[2] || 0)) / pt) : 0, licProt: la[5] || 0, licKm2: la[2] || 0, dm: pt ? Math.round((100 * dm) / pt) : 0 }
  }
  const L = ls(pr), Lc = ls(prc)
  const tiles: [string, string, string][] = [
    ...rankTiles(C, j).map((x, k) => [x[0], x[1], k === 0 ? t('Rank by urgency among KLH\'s 337 (or among all scored KHG for a KHG outside the 337). The arrow is the change against the pre-registered weights.') : t('Type of action from the terciles of urgency, complexity and stake.')] as [string, string, string]),
    [`${fmt(P.peat[j], 0)}<small>km2</small>`, r.peat_gfw != null ? t('Peat: {a}% of KHG (1 km map {b})', { a: Math.round(r.peat_gfw * 100), b: r.peat_gpm != null ? Math.round(r.peat_gpm * 100) + '%' : t('n/a') }) : t('Peat area'), t("Peat area inside the KHG, from KLH's peat land map (PPEG 2026). Below it: the peat share of the KHG, and the share in the 1 km Global Peatland Map.")],
    [...hsTile(j), t('MODIS hotspots on peat this year, medium and high confidence (high only when the filter is set). Ranks are by density (per km2 of peat) and by count.')],
    [r.tma_n ? `${Math.round(r.tma_deep * 100)}<small>${t('% of days')}</small>` : t('none'), r.tma_n ? t('Water table below 0.4 m ({n} stations)', { n: r.tma_n }) : t('Water table stations'), t('SiTMAT loggers inside the KHG, 2026 season: share of days with the water table deeper than 0.4 m.')],
    [`${confChar[P.conf[j]]}<small>${t(confName[P.conf[j]])}</small>`, t('Data confidence'), t('High: canals are mapped, there is enough fire signal and enough peat. Medium: two of the three. Low: fewer.')],
    ...(L ? [
      [`${L.lic}<small>%</small>`, t('Peat under a licence') + (L.licKm2 ? t(' · {n} km2 on protected function', { n: fmt(L.licProt, 0) }) : ''), t("Share of the KHG's peat inside any business licence of the 2025 layer. Overlapping licences count once. Below it: licensed area that lies on protected peat function.")],
      [`${L.dm}<small>%</small>`, t('Peat in DMPG villages') + (r.dmpg ? t(' · {n} villages, {a} km2 of village land', { n: r.dmpg, a: fmt(r.dmpg_km2, 0) }) : ''), t("Share of the KHG's peat inside a DMPG village of the SiTMAT layer. Below it: villages whose centre lies in the KHG and the village land inside it.")],
    ] as [string, string, string][] : []),
  ]
  const na = t('n/a')
  const cv = (i: number) => [...rankTiles(C, i).map((x) => x[0].replace(/<small>.*<\/small>/, '')), `${fmt(P.peat[i], 0)} km2`, hsTile(i)[0], P.row[i].tma_n ? Math.round(P.row[i].tma_deep * 100) + '%' : t('none'), `${confChar[P.conf[i]]} ${t(confName[P.conf[i]])}`,
    Lc ? Lc.lic + '%' : na, Lc ? Lc.dm + '%' : na]
  const cvals = jc != null ? cv(jc) : []
  return (
    <div className="kpis">
      {tiles.map(([v, l, tip], k) => (
        <div key={k} className="kpi" data-tip={tip}>
          <div className="v" dangerouslySetInnerHTML={{ __html: v }} /><div className="l">{l}</div>
          {jc != null ? <div className="c" title={P.name[jc]}><i /><span>{shortName(P.name[jc])}</span><b dangerouslySetInnerHTML={{ __html: cvals[k] }} /></div> : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- map with its layer tools
const LAYER_TOGGLES: [keyof MapState['layers'], string, string, string][] = [
  ['peat', 'Peat extent', '<i class="poly" style="background:var(--peat)"></i>', 'Peat extent used for the rates (KLH peat land map, PPEG 2026): the area that burned area and hotspots are divided by.'],
  ['burn', 'Burned, times', '<i class="poly" style="background:var(--burn1)"></i>', 'Burnt-area polygons by number of burns, 2015 to 2025. A stronger shade means burned more often.'],
  ['p', 'Primary canals', '<i style="background:var(--canal);height:4px"></i>', 'Primary canals (Kanal Primer) from the OSM-based layer.'],
  ['s', 'Secondary', '<i style="background:var(--canal);height:2px"></i>', 'Secondary canals (Kanal Sekunder).'],
  ['t', 'Tertiary', '<i style="background:var(--canal);height:1px;opacity:.6"></i>', 'Tertiary canals (Kanal Tersier).'],
  ['now', 'Hotspots this year ({n})', '<i class="dot" style="background:var(--now)"></i>', 'MODIS hotspots this year. Filled: on peat. Hollow: off peat. Large: high confidence.'],
]
const OV_TIP: Record<string, string> = { off: 'Hide the land-status layers.', forest: 'Forest area function 2023 (Kawasan Hutan, 1:250,000).', feg: 'Peat ecosystem function 2017 (FEG): protected or cultivation.', licence: 'Business licences, 2025 update.', ring: 'Licences and the land within 5 km of one but inside none: the zone the Bluebook 2026 calls Buffer 5 Kilometer.' }
function MapBlock({ P, pr, prc, code, cmpName, confHigh }: { P: PD; pr: Profile; prc: Profile | null; code: string; cmpName: string | null; confHigh: boolean }) {
  const { lang, theme } = useStore()
  const months = pr.now_m.map((m) => m[0]), lo = months.length ? Math.min(...months) : 1, hi = months.length ? Math.max(...months) : 12
  const [s, setS] = useState<MapState>({ sat: false, layers: { peat: true, burn: true, p: true, s: true, t: true, now: true }, now: { a: 1, b: 12, high: false }, x: { mode: 'off', river: false, road: false, brgm: false }, ov: { mode: 'off', dmpg: false, vil: false }, dem: { file: null, maxzoom: 14, opacity: 0.85 }, confHigh })
  const st: MapState = { ...s, confHigh, now: { ...s.now, a: Math.max(lo, Math.min(s.now.a, hi)), b: Math.min(hi, Math.max(s.now.b, lo)) } }
  const [mf, setMf] = useState<Manifest | null>(null)
  const [dem, setDem] = useState('off')
  useEffect(() => { setMf(null); setDem('off'); loadCatalog().then((c) => (c.some((x) => x.code === code) ? loadManifest(code).then(setMf) : null)).catch(() => {}) }, [code])
  const relief = mf?.raster.filter((r) => r.file.includes('relief')) ?? []
  const rr = relief.find((r) => r.dem === dem) ?? null
  st.dem = { file: rr?.file ?? null, maxzoom: rr?.max_zoom ?? 14, opacity: s.dem.opacity }
  const el1 = useRef<HTMLDivElement>(null), el2 = useRef<HTMLDivElement>(null), m1 = useRef<ProfileMap | null>(null), m2 = useRef<ProfileMap | null>(null)
  const base = P.meta.tiles
  useEffect(() => { m1.current = new ProfileMap(el1.current!, base, code); const ro = new ResizeObserver(() => m1.current?.resize()); ro.observe(el1.current!); return () => { ro.disconnect(); m1.current?.remove(); m1.current = null } }, [base, code])
  useEffect(() => {
    if (!prc) return
    m2.current = new ProfileMap(el2.current!, base, null); const ro = new ResizeObserver(() => m2.current?.resize()); ro.observe(el2.current!)
    return () => { ro.disconnect(); m2.current?.remove(); m2.current = null }
  }, [base, !!prc])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { m1.current?.setProfile(pr) }, [pr])
  useEffect(() => { if (prc) m2.current?.setProfile(prc); m1.current?.resize() }, [prc])
  const key = JSON.stringify(st)
  useEffect(() => { m1.current?.apply(st); m2.current?.apply({ ...st, dem: { ...st.dem, file: null } }) }, [key, prc])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { m1.current?.whenReady(() => m1.current!.theme()); m2.current?.whenReady(() => m2.current!.theme()) }, [theme])
  useEffect(() => { m1.current?.labels(lang); m2.current?.labels(lang) }, [lang])
  // the village table and others ask the map to zoom: a custom event keeps them decoupled
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail; setS((x) => ({ ...x, ov: { ...x.ov, dmpg: true } })); m1.current?.fit(d); el1.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }; addEventListener('khg-zoom', f); return () => removeEventListener('khg-zoom', f) }, [])
  const count = (p: Profile) => {
    const all = st.now.a <= lo && st.now.b >= hi, h = st.now.high || confHigh
    if (all && !h && p.lay.now_total) return String(p.lay.now_total)
    const n = p.lay.now.filter((x) => x[2] >= st.now.a && x[2] <= st.now.b && (!h || x[3])).length
    return !h && p.lay.now_total > p.lay.now.length ? '≥ ' + n : String(n)
  }
  const counts = count(pr) + (prc ? ' · ' + count(prc) : '')
  const xOn = st.x.mode !== 'off'
  const tg = (on: boolean, html: string, tip: string, click: () => void, muted = false) => <span className={cn('tg', !on && 'off', muted && 'muted')} data-tip={t(tip)} onClick={click} dangerouslySetInnerHTML={{ __html: html }} />
  const legend: React.ReactNode[] = []
  if (xOn) {
    if (st.x.mode === 'pop') { const pc = popIdx() || { classes: [1, 10, 100, 1000, 5000], colors: ['#fde9c9', '#f8c48a', '#ee8f50', '#cf5427', '#8c2a0e'] }; legend.push(<span key="pl" className="hint">{t('People per km2')}:</span>, ...pc.classes.map((c: number, i: number) => <span key={i}><span className="sw" style={{ background: pc.colors[i], marginRight: 4 }} />{i < pc.classes.length - 1 ? fmt(c, 0) + '–' + fmt(pc.classes[i + 1], 0) : '≥ ' + fmt(c, 0)}</span>)) }
    else XL[st.x.mode][2].forEach(([c, l, col]) => legend.push(<span key={String(c)}><span className="sw" style={{ background: col, marginRight: 4 }} />{t(l)}</span>))
  }
  if (st.ov.mode !== 'off' && pr.ov) { const layer = st.ov.mode, present = new Set((pr.ov.s[layer === 'licence' ? 'licence_any' : layer] ? (layer === 'licence' ? OVCLS.licence.filter(([c]) => pr.ov!.s['licence_' + c]).map(([c]) => c) : pr.ov.s[layer].map((r) => r[0])) : [])); OVCLS[layer].filter(([c]) => present.has(c)).forEach(([c, l]) => legend.push(<span key={'ov' + c}><span className="sw" style={{ background: ovColor(layer, c), marginRight: 4 }} />{t(l)}</span>)) }
  return (
    <div className="mt-3">
      <div className="map-tools" id="p-tools">
        <span className="lab">{t('Layers')}</span>
        {LAYER_TOGGLES.map(([k, l, ic, tip]) => <Fragment key={k}>{tg(st.layers[k], ic + esc(t(l, { n: counts })), tip, () => setS({ ...s, layers: { ...s.layers, [k]: !s.layers[k] } }), xOn)}</Fragment>)}
        {months.length ? (
          <span className="tgrp">
            <span className="lab">{t('Hotspots, month')}</span>
            <Slider className="w-40" min={lo} max={hi} step={1} value={[st.now.a, st.now.b]} onValueChange={([a, b]) => setS({ ...s, now: { ...s.now, a, b } })} data-tip={t('Drag the handles to choose the months shown on the map.')} />
            <span className="hint drl">{st.now.a === lo && st.now.b === hi ? mon(lo) + ' - ' + mon(hi) : st.now.a === st.now.b ? mon(st.now.a) : mon(st.now.a) + ' - ' + mon(st.now.b)}</span>
            <Seg items={[{ v: 'mh', label: t('Medium + high') }, { v: 'h', label: t('High only') }]} value={s.now.high ? 'h' : 'mh'} onChange={(v) => setS({ ...s, now: { ...s.now, high: v === 'h' } })} />
            <span className="lab ml-3">{t('Basemap')}</span>
            <Seg items={[{ v: 'map', label: t('Map'), tip: t('Street map, muted.') }, { v: 'sat', label: t('Satellite'), tip: t('Esri World Imagery. Resolution and date vary by place.') }]} value={s.sat ? 'sat' : 'map'} onChange={(v) => setS({ ...s, sat: v === 'sat' })} />
          </span>
        ) : null}
        <span className="tgrp">
          <span className="lab hasTip" data-tip={t('The layers the prioritisation is computed from, clipped to the KHG. One at a time; the legend is below the map. While one is shown, the fire and canal layers are hidden.')}>{t('Data behind the scores')}</span>
          <Seg items={[{ v: 'off', label: t('Off'), tip: t('Hide these layers.') }, ...Object.entries(XL).map(([k, v]) => ({ v: k, label: t(v[0]), tip: t(v[1]) }))]} value={s.x.mode} onChange={(v) => setS({ ...s, x: { ...s.x, mode: v } })} />
          {tg(s.x.river, '<i style="background:#2f6db3;height:3px"></i>' + esc(t('Rivers and lakes')), 'Large rivers (drawn with two banks in RBI) and lakes: water to fill the canals (feasibility).', () => setS({ ...s, x: { ...s.x, river: !s.x.river } }))}
          {tg(s.x.road, '<i style="background:#5c5a54;height:2px"></i>' + esc(t('Roads')), 'RBI roads, footpaths excluded: access to build blocks (feasibility).', () => setS({ ...s, x: { ...s.x, road: !s.x.road } }))}
          {tg(s.x.brgm, '<i class="dot" style="background:#d1495b"></i>' + esc(t('BRGM structures')), 'Canal blocks, wells and other BRGM structures. Reported, not scored.', () => setS({ ...s, x: { ...s.x, brgm: !s.x.brgm } }))}
        </span>
        {pr.ov ? (
          <span className="tgrp">
            <span className="lab">{t('Land status')}</span>
            <Seg items={[['off', 'Off'], ['forest', 'Forest area'], ['feg', 'Peat function'], ['licence', 'Licences'], ['ring', '5 km ring']].map(([v, l]) => ({ v, label: t(l), tip: t(OV_TIP[v]) }))} value={s.ov.mode} onChange={(v) => setS({ ...s, ov: { ...s.ov, mode: v } })} />
            {tg(s.ov.vil, `<i style="border-top:2px dashed ${ovColor('village', 'in')};height:0;background:none"></i>` + esc(t('Target villages')), 'Target villages of the 2026 Bluebook for peat ecosystem restoration. Hover for the village.', () => setS({ ...s, ov: { ...s.ov, vil: !s.ov.vil } }))}
            {tg(s.ov.dmpg, `<i class="poly" style="background:${ovColor('dmpg', 'in')};opacity:.5"></i>` + esc(t('DMPG villages')), 'DMPG villages of the SiTMAT portal (838 villages in all, with programme and scheme year). Hover for the village, programme and scheme.', () => setS({ ...s, ov: { ...s.ov, dmpg: !s.ov.dmpg } }))}
          </span>
        ) : null}
        {relief.length ? (
          <span className="tgrp">
            <span className="lab hasTip" data-tip={t('Shaded relief of the terrain models processed for this KHG (LiDAR where it covers the KHG, DeltaDTM and DEMNAS after correction). Colour shows elevation.')}>{t('DEM')}</span>
            <Seg items={[{ v: 'off', label: t('Off') }, ...relief.map((r) => ({ v: r.dem, label: mf?.dem_labels?.[r.dem]?.[lang] ?? r.dem }))]} value={dem} onChange={setDem} />
            {rr ? <><span className="hint">{t('Opacity')}</span><Slider className="w-28" min={0.2} max={1} step={0.05} value={[s.dem.opacity]} onValueChange={([o]) => setS({ ...s, dem: { ...s.dem, opacity: o } })} /></> : null}
          </span>
        ) : null}
      </div>
      <div className={cn('p-maps', prc && 'two')}>
        <div className="p-mapc">{prc ? <div className="mcap">{P.name[P.idx.get(code)!]}</div> : null}<div ref={el1} id="p-map" /></div>
        {prc ? <div className="p-mapc"><div className="mcap"><i className="mr-1.5 inline-block size-2 rounded-full border-2 align-middle" style={{ borderColor: 'var(--cmp)' }} />{cmpName}</div><div ref={el2} id="p-map2" /></div> : null}
      </div>
      <div className="legend-row" id="p-ov-leg" style={{ marginTop: 6 }}>{legend}</div>
      {rr ? <div className="max-w-xs"><RampLegend title={`${t('Elevation (m)')} · ${mf?.dem_labels?.[dem]?.[lang] ?? dem}`} stops={TERRAIN} lo={rr.z_range[0]} hi={rr.z_range[1]} fmt={(v) => v.toFixed(1)} note={`${rr.res_m.toFixed(1)} m · ${rr.source}`} /></div> : null}
      <div className="foot">{t('Filled dot: on peat. Hollow: off peat. Large: high confidence.')}{pr.lay.now_total > pr.lay.now.length ? ' ' + t('Showing {a} of {b} points.', { a: pr.lay.now.length, b: pr.lay.now_total }) : ''} {t('Basemap needs internet.')}</div>
    </div>
  )
}

// ---------------------------------------------------------------- indicators, land status, tenure, charts, villages
function Mid({ C, j, jc, pr, prc, conf }: { C: Ctx; j: number; jc: number | null; pr: Profile; prc: Profile | null; conf: string }) {
  const P = C.P, { lang, theme } = useStore()
  const strips = useRef<HTMLDivElement>(null), charts = useRef<HTMLDivElement>(null)
  const [tn, setTn] = useState({ high: false, split: false })
  const [w, setW] = useState(0)
  useEffect(() => { const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width / 40))); if (charts.current) ro.observe(charts.current); return () => ro.disconnect() }, [])
  useEffect(() => { if (strips.current) renderStrips(strips.current, C, j, jc) }, [C, j, jc, lang, theme, w])
  const high = conf === 'h'
  useEffect(() => {
    const host = charts.current; if (!host) return
    host.innerHTML = ''
    const names: [string, string] | undefined = prc && jc != null ? [P.name[j], P.name[jc]] : undefined
    const sr = <T,>(f: (x: Profile) => T) => (prc ? { cmp: f(prc) as any, names } : {})
    const monthly = (p: Profile): [number, number][] => (high ? p.now_m.map((m) => [m[0], p.lay.now.filter((x) => x[2] === m[0] && x[3] && x[4]).length]) : p.now_m.map((m) => [m[0], m[1]]))
    const hw = !!(pr.hm.length && prc && prc.hm.length)
    const mk = (title: string, tip: string, wide?: boolean, cls?: string) => { const d = document.createElement('div'); d.className = 'ch' + (wide ? ' wide' : '') + (cls ? ' ' + cls : ''); d.innerHTML = `<h3 class="hasTip"${tipAttr(t(tip))}>${t(title)}</h3><div></div>`; host.appendChild(d); return d.lastChild as HTMLElement }
    lineChart(mk('Burned, % of peat per year', "Burnt-area polygons, 2015 to 2026: the share of the KHG's peat burned in each year. 2026 is a partial year, drawn dashed."), { data: pr.burned, color: '--hist', partial: 2026, unit: '%', nd: 1, ticks: [2015, 2020, 2025], ...sr((x) => x.burned) })
    lineChart(mk('Hotspots on peat per year, VIIRS', 'FIRMS VIIRS S-NPP vegetation-fire hotspots that fall on peat, nominal and high confidence, per year.'), { data: pr.hs, color: '--hist', unit: '', nd: 0, ticks: [2012, 2016, 2020, 2024], ...sr((x) => x.hs) })
    const mh = Math.max(1, ...pr.now_m.map((m) => m[0]))
    lineChart(mk('Hotspots this year by month', 'MODIS hotspots on peat in each month of this year, medium and high confidence (high only when the filter is set).', hw, 'tall'), { data: monthly(pr), ...sr(monthly), color: '--now', unit: '', nd: 0, ticks: [...[1, 4, 7, 10].filter((x) => x <= mh), ...([1, 4, 7, 10].includes(mh) ? [] : [mh])], tickFmt: (m) => mon(m), xdom: [1, mh] })
    if (pr.hm.length) heatMap(mk('Hotspots per month and year', 'FIRMS VIIRS S-NPP hotspots on peat, nominal and high confidence (high only when the filter is set), counted per month. 2026 to the last day of data. Compared KHG share one colour scale.', hw, 'tall'), [{ name: P.name[j], hm: pr.hm }, ...(hw && jc != null ? [{ name: P.name[jc], hm: prc!.hm }] : [])], high, P.meta.page.period_now)
    if (pr.deficit.length) lineChart(mk('Dry-season water deficit, mm', 'TerraClimate climatic water deficit summed over the dry months (June to October), in mm. About 4 km resolution, 2015 to 2021. Shown for context, not scored.'), { data: pr.deficit, color: '--ink2', unit: ' mm', nd: 0, ticks: [2015, 2018, 2021], ...sr((x) => x.deficit) })
    if (pr.rain.length) lineChart(mk('Rain June to October, mm', 'TerraClimate rainfall in the dry months, in mm. About 4 km resolution, 2015 to 2021. Shown for context, not scored.'), { data: pr.rain, color: '--ink2', unit: ' mm', nd: 0, ticks: [2015, 2018, 2021], ...sr((x) => x.rain) })
    { const lh = mk('Land cover', 'ESA WorldCover classes sampled at 250 m. Open land is grass, shrub, crop, built and bare. Shown for context, not scored.', false, 'full')
      if (!pr.lc.length) lh.parentElement!.remove(); else if (prc && prc.lc.length && jc != null) { landBar(lh, pr.lc, { cap: P.name[j] }); landBar(lh, prc.lc, { cap: P.name[jc], append: true }) } else landBar(lh, pr.lc) }
  }, [pr, prc, j, jc, high, lang, theme, w, P])
  const ov = prc ? '' : landStatusHtml(pr), ten = prc ? '' : tenureHtml(pr, tn), vil = prc ? '' : villagesHtml(pr)
  return (
    <div className={cn('p-mid', !ov && 'noov')}>
      <div ref={strips} id="p-strips" className="p-strips" />
      {ov ? <div className="p-ov" dangerouslySetInnerHTML={{ __html: ov }} /> : null}
      {ten ? <div id="khg-evidence-tenure" className="p-ten scroll-mt-28" onChange={(e) => { const k = (e.target as HTMLInputElement).dataset.tn as 'high' | 'split'; if (k) setTn({ ...tn, [k]: (e.target as HTMLInputElement).checked }) }} dangerouslySetInnerHTML={{ __html: ten }} /> : null}
      <div ref={charts} id="p-charts" className="charts" />
      {vil ? <div className="p-vil" onClick={(e) => { const r = (e.target as HTMLElement).closest('tr.zr') as HTMLElement | null; if (r) { const v = pr.ov!.v[+r.dataset.i!]; dispatchEvent(new CustomEvent('khg-zoom', { detail: v[8] })) } }} dangerouslySetInnerHTML={{ __html: vil }} /> : null}
    </div>
  )
}
