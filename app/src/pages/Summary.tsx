import { useEffect, useMemo, useState } from 'react'
import { DataTable, type Col } from '../components/DataTable'
import { LineChart, type Series } from '../components/LineChart'
import { TenureAcross, useTenure } from '../components/Tenure'
import { readJson, readTable } from '../lib/data'
import { useT } from '../lib/i18n'
import type { ScoringData } from '../lib/scoring'

type Area = { island: string; province: string; in_khg: boolean; forest_group: string; kawasan: string; concession: string; lic_bits: number; dmpg: boolean; peat: number; area_ha: number; burned_any_ha: number; burned_2plus_ha: number; [k: string]: any }
type Hot = { island: string; province: string; in_khg: boolean; forest_group: string; kawasan: string; concession: string; lic_bits: number; dmpg: boolean; peat: number; source: string; year: number; month: number; conf: string; static: boolean; ytd: boolean; n: number }
type Meta = { cell_m: number; years: [number, number]; viirs_last: string; modis_last: string; static_radius_m: Record<string, number> }
type Split = 'concession' | 'forest' | 'type' | 'function' | 'dmpg'
type Cls = { key: string; label: string; color: string }

const CONC = 1 | 2 | 4 | 8                 // licence bits that are concessions; PPHKM (16) is not
const NOW = 2026, PAST: [number, number] = [2015, 2025]
const SPLITS: Record<Split, { label: string; help: string; classes: Cls[]; of: (r: Area | Hot) => string }> = {
  concession: { label: 'Concession', help: 'Inside a business licence of 2025 (oil palm, mining, plantation forest PPHTR, forest concession PBPH), or outside every one. Community forest permits (PPHKM) are not concessions.',
    classes: [{ key: 'yes', label: 'Concession', color: 'var(--s2)' }, { key: 'no', label: 'No concession', color: 'var(--s1)' }], of: (r) => ((r.lic_bits & CONC) > 0 ? 'yes' : 'no') },
  forest: { label: 'Forest area', help: 'Forest area function 2023 (kawasan hutan, 1:250,000): forest area, other land use (APL), or water, undefined and not mapped.',
    classes: [{ key: 'kawasan', label: 'Forest area (kawasan hutan)', color: 'var(--s6)' }, { key: 'apl', label: 'Other land use (APL)', color: 'var(--s4)' }, { key: 'other', label: 'Water, undefined or not mapped', color: 'var(--muted)' }], of: (r) => r.forest_group },
  type: { label: 'Concession type', help: 'Licence type. Where licences overlap, the land takes the first type in this order: oil palm, mining, plantation forest, forest concession.',
    classes: [{ key: 'sawit', label: 'Oil palm', color: 'var(--s2)' }, { key: 'pphtr', label: 'Plantation forest (PPHTR)', color: 'var(--s7)' }, { key: 'tambang', label: 'Mining', color: 'var(--s8)' }, { key: 'pbph', label: 'Forest concession (PBPH)', color: 'var(--s3)' }, { key: 'none', label: 'No concession', color: 'var(--s1)' }], of: (r) => r.concession },
  function: { label: 'Forest function', help: 'Forest area function 2023. Where classes overlap, the first in this order is kept.',
    classes: [{ key: 'cons', label: 'Conservation', color: 'var(--s6)' }, { key: 'hl', label: 'Protection forest', color: 'var(--s3)' }, { key: 'prod', label: 'Production forest (HP, HPT)', color: 'var(--s7)' }, { key: 'hpk', label: 'Convertible production (HPK)', color: 'var(--s5)' }, { key: 'apl', label: 'Other land use (APL)', color: 'var(--s4)' }, { key: 'other', label: 'Water, undefined', color: 'var(--s1)' }, { key: 'none', label: 'Not mapped', color: 'var(--muted)' }], of: (r) => r.kawasan },
  dmpg: { label: 'DMPG village', help: 'Land inside a Desa Mandiri Peduli Gambut village (SiTMAT portal, 838 villages), or outside every one.',
    classes: [{ key: 'yes', label: 'DMPG village', color: 'var(--s5)' }, { key: 'no', label: 'Outside DMPG villages', color: 'var(--s1)' }], of: (r) => (r.dmpg ? 'yes' : 'no') },
}
const MATRIX_ROWS: Cls[] = SPLITS.concession.classes
const MATRIX_COLS: Cls[] = SPLITS.forest.classes

const f0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '–' : Math.round(v).toLocaleString())
const f1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '–' : v >= 100 ? f0(v) : v.toFixed(1))
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '–')

type Agg = { area: number; burned: Map<number, number>; ever: number; twice: number; modis: number; viirsYtd: Map<number, number> }
const agg = (): Agg => ({ area: 0, burned: new Map(), ever: 0, twice: 0, modis: 0, viirsYtd: new Map() })
const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v)
const sumPast = (a?: Agg) => { let s = 0; if (a) for (let y = PAST[0]; y <= PAST[1]; y++) s += a.burned.get(y) ?? 0; return s }
const pastMean = (m: Map<number, number>) => { let s = 0; for (let y = PAST[0]; y <= PAST[1]; y++) s += m.get(y) ?? 0; return s / (PAST[1] - PAST[0] + 1) }

type Sel = { src: 'viirs' | 'modis'; year: number }
function aggregate(area: Area[], hot: Hot[], key: (r: Area | Hot) => string, years: number[], sel: Sel) {
  const out = new Map<string, Agg>()
  const get = (k: string) => { if (!out.has(k)) out.set(k, agg()); return out.get(k)! }
  for (const r of area) {
    const a = get(key(r)); a.area += r.area_ha; a.ever += r.burned_any_ha; a.twice += r.burned_2plus_ha
    for (const y of years) add(a.burned, y, r[`burned_${y}_ha`] ?? 0)
  }
  for (const r of hot) {
    const a = get(key(r))
    if (r.source === sel.src && r.year === sel.year && (r.source === 'modis' || r.ytd)) a.modis += r.n // "modis" = the selected series
    if (r.source === 'viirs' && r.ytd) add(a.viirsYtd, r.year, r.n)
  }
  return out
}

function Seg<T extends string>({ value, set, opts, label }: { value: T; set: (v: T) => void; opts: [T, string, string?][]; label: string }) {
  return <div className="flex flex-col gap-1"><span className="muted text-xs">{label}</span>
    <div className="flex flex-wrap gap-1">{opts.map(([v, l, tip]) => <button key={v} className="btn text-xs" aria-pressed={value === v} title={tip} onClick={() => set(v)}>{l}</button>)}</div></div>
}

export default function Summary() {
  const t = useT()
  const tenure = useTenure()
  const [names, setNames] = useState(new Map<string, string>())
  useEffect(() => {
    readJson<ScoringData>('national/scoring.json')
      .then(({ khg }) => setNames(new Map(khg.id.map((id, i) => [id, khg.name[i]]))))
      .catch(() => {})
  }, [])
  const [src, setSrc] = useState<'viirs' | 'modis'>('modis')
  const [year, setYear] = useState(NOW)
  const [high, setHigh] = useState(false)
  const sel = useMemo<Sel>(() => ({ src, year: src === 'modis' ? NOW : year }), [src, year])
  const yr = sel.year, srcName = src === 'viirs' ? 'VIIRS' : 'MODIS'
  const incomplete = yr === 2024 || yr === NOW
  const bY = (a?: Agg) => (yr >= PAST[0] ? a?.burned.get(yr) ?? 0 : null)
  const [area, setArea] = useState<Area[]>([])
  const [hot, setHot] = useState<Hot[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [err, setErr] = useState('')
  const [basis, setBasis] = useState<'all' | 'peat'>('all')
  const [scope, setScope] = useState<'all' | 'in' | 'out'>('all')
  const [island, setIsland] = useState('')
  const [province, setProvince] = useState('')
  const [split, setSplit] = useState<Split>('concession')
  const [withStatic, setWithStatic] = useState(false)
  useEffect(() => {
    Promise.all([readTable<Area>('national/fire_area.parquet'), readTable<Hot>('national/fire_hot.parquet'), readJson<Meta>('national/fire_meta.json')])
      .then(([a, h, m]) => { setArea(a); setHot(h); setMeta(m) }).catch(() => setErr(t('The national summary data is not built yet: run pipeline/build_fire_summary.py.')))
  }, [t])
  const years = useMemo(() => meta ? Array.from({ length: meta.years[1] - meta.years[0] + 1 }, (_, i) => meta.years[0] + i) : [], [meta])
  const keep = (r: Area | Hot) => (basis === 'all' || r.peat === 1) && (scope === 'all' || (scope === 'in') === r.in_khg) && (!island || r.island === island) && (!province || r.province === province)
  const A = useMemo(() => area.filter(keep), [area, basis, scope, island, province])
  const H = useMemo(() => hot.filter((r) => keep(r) && (high ? r.conf === 'high' : true) && (withStatic || !r.static)), [hot, basis, scope, island, province, high, withStatic])
  const islands = useMemo(() => [...new Set(area.map((r) => r.island))].filter((s) => !s.startsWith('Outside')).sort(), [area])
  const provinces = useMemo(() => [...new Set(area.filter((r) => !island || r.island === island).map((r) => r.province))].filter((s) => !s.startsWith('Outside')).sort(), [area, island])

  const total = useMemo(() => aggregate(A, H, () => 'all', years, sel).get('all') ?? agg(), [A, H, years, sel])
  const by = (f: (r: Area | Hot) => string) => aggregate(A, H, f, years, sel)
  const conc = useMemo(() => by(SPLITS.concession.of), [A, H, years, sel])
  const forest = useMemo(() => by(SPLITS.forest.of), [A, H, years, sel])
  const dmpg = useMemo(() => by(SPLITS.dmpg.of), [A, H, years, sel])
  const matrix = useMemo(() => by((r) => `${SPLITS.concession.of(r)}|${r.forest_group}`), [A, H, years, sel])
  const sp = SPLITS[split]
  const cls = useMemo(() => by(sp.of), [A, H, years, sel, split])
  const shown = sp.classes.filter((c) => (cls.get(c.key)?.area ?? 0) > 0 || (cls.get(c.key)?.modis ?? 0) > 0)

  const unit = basis === 'peat' ? t('of peat') : t('of land')
  const rate = (n: number, ha: number) => (ha > 0 ? (n / ha) * 1e4 : null)       // per 100 km² (10,000 ha)
  const last = meta?.viirs_last?.slice(5).replace('-', '/') ?? ''
  const burnedLines: Series[] = shown.map((c) => ({ name: t(c.label), color: c.color, points: years.map((y) => ({ x: new Date(y, 6, 1), y: (cls.get(c.key)?.burned.get(y) ?? 0) / 100 })) }))
  const viirsYears = useMemo(() => [...new Set(hot.filter((r) => r.source === 'viirs').map((r) => r.year))].sort(), [hot])
  const viirsLines: Series[] = shown.map((c) => ({ name: t(c.label), color: c.color, points: viirsYears.map((y) => ({ x: new Date(y, 6, 1), y: cls.get(c.key)?.viirsYtd.get(y) ?? 0 })) }))
  const kpi = (label: string, value: string, sub: string, tip: string) => (
    <div className="min-w-0 p-3" title={tip}><dt className="muted text-xs">{label}</dt><dd className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd><dd className="muted mt-1 text-xs">{sub}</dd></div>)
  const share = (m: Map<string, Agg>, k: string) => `${pct(sumPast(m.get(k)), sumPast(total))} ${t('of burned area')} ${PAST[0]}–${PAST[1]} · ${pct(m.get(k)?.area ?? 0, total.area)} ${t('of the area')}`

  const provRows = useMemo(() => {
    const keyP = (r: Area | Hot) => r.province
    const all = aggregate(A, H, keyP, years, sel)
    const c = aggregate(A.filter((r) => (r.lic_bits & CONC) > 0), H.filter((r) => (r.lic_bits & CONC) > 0), keyP, years, sel)
    const k = aggregate(A.filter((r) => r.forest_group === 'kawasan'), H.filter((r) => r.forest_group === 'kawasan'), keyP, years, sel)
    const d = aggregate(A.filter((r) => r.dmpg), H.filter((r) => r.dmpg), keyP, years, sel)
    const isl = new Map(area.map((r) => [r.province, r.island]))
    return [...all].filter(([p]) => !p.startsWith('Outside')).map(([p, a]) => {
      const b = sumPast(a)
      return { province: p, island: isl.get(p) ?? '', area_km2: a.area / 100, burned: bY(a), burned_past: pastMean(a.burned), burned_conc: b > 0 ? (100 * sumPast(c.get(p))) / b : null,
        burned_kws: b > 0 ? (100 * sumPast(k.get(p))) / b : null, modis: a.modis, density: rate(a.modis, a.area),
        hs_conc: a.modis > 0 ? (100 * (c.get(p)?.modis ?? 0)) / a.modis : null, hs_kws: a.modis > 0 ? (100 * (k.get(p)?.modis ?? 0)) / a.modis : null, hs_dmpg: a.modis > 0 ? (100 * (d.get(p)?.modis ?? 0)) / a.modis : null }
    })
  }, [A, H, years, sel, area])
  const pc = (v: number | null) => (v == null ? '–' : `${Math.round(v)}`)
  const provCols: Col<(typeof provRows)[number]>[] = [
    { key: 'province', label: t('Province') }, { key: 'island', label: t('Island'), fmt: (v) => String(v).replace(/^Pulau /, '') },
    { key: 'area_km2', label: basis === 'peat' ? t('Peat') : t('Land'), unit: 'km²', align: 'right', fmt: f0 },
    { key: 'burned', label: `${t('Burned')} ${yr}${incomplete ? '*' : ''}`, unit: 'ha', align: 'right', fmt: f0 },
    { key: 'burned_past', label: `${t('Mean')} ${PAST[0]}–${PAST[1]}`, unit: t('ha/yr'), align: 'right', fmt: f0 },
    { key: 'burned_conc', label: t('Concession'), unit: '%', align: 'right', fmt: pc },
    { key: 'burned_kws', label: t('Forest area'), unit: '%', align: 'right', fmt: pc },
    { key: 'modis', label: `${t('Hotspots')} ${yr}`, align: 'right', fmt: f0 },
    { key: 'density', label: t('per 100 km²'), align: 'right', fmt: f1 },
    { key: 'hs_conc', label: t('Concession'), unit: '%', align: 'right', fmt: pc },
    { key: 'hs_kws', label: t('Forest area'), unit: '%', align: 'right', fmt: pc },
    { key: 'hs_dmpg', label: 'DMPG', unit: '%', align: 'right', fmt: pc },
  ]

  if (err) return <div className="card m-3 p-3 text-sm">{err}</div>
  if (!meta) return <div className="muted m-3 p-3 text-sm">{t('Loading')}…</div>
  const scopeName = province || island || t('Indonesia')
  const maxRate = Math.max(1e-9, ...MATRIX_ROWS.flatMap((r) => MATRIX_COLS.map((c) => rate(matrix.get(`${r.key}|${c.key}`)?.modis ?? 0, matrix.get(`${r.key}|${c.key}`)?.area ?? 0) ?? 0)))
  const maxCls = Math.max(1e-9, ...shown.map((c) => rate(cls.get(c.key)?.modis ?? 0, cls.get(c.key)?.area ?? 0) ?? 0))

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-x-5 gap-y-2 px-3 py-2 text-sm" role="group" aria-label={t('Filters')}>
        <Seg label={t('Area basis')} value={basis} set={setBasis} opts={[['all', t('All land'), t('Every cell inside the village boundaries of 2023.')], ['peat', t('Peat only'), t("Cells in KLH's peat land map (integrated thematic analysis for peat restoration, April 2026).")]]} />
        <Seg label={t('KHG')} value={scope} set={setScope} opts={[['all', t('All')], ['in', t('Inside KHG')], ['out', t('Outside KHG')]]} />
        <label className="flex flex-col gap-1"><span className="muted text-xs">{t('Island')}</span>
          <select className="card px-2 py-1" value={island} onChange={(e) => { setIsland(e.target.value); setProvince('') }}><option value="">{t('Indonesia')}</option>{islands.map((s) => <option key={s} value={s}>{s.replace(/^Pulau /, '')}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="muted text-xs">{t('Province')}</span>
          <select className="card px-2 py-1" value={province} onChange={(e) => setProvince(e.target.value)}><option value="">{t('All')}</option>{provinces.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <Seg label={t('Hotspots')} value={src} set={setSrc} opts={[['viirs', 'VIIRS', t('VIIRS S-NPP, 375 m: one sensor since 2012, so every year is compared over the same window, 1 January to the last 2026 date.')], ['modis', 'MODIS', t('MODIS, 1 km, 2026 only: the series KLH reports (KLH file, then NASA FIRMS near real time).')]]} />
        <label className="flex flex-col gap-1"><span className="muted text-xs">{t('Year')}</span>
          <select className="card px-2 py-1" value={yr} disabled={src === 'modis'} onChange={(e) => setYear(Number(e.target.value))}>{viirsYears.slice().reverse().map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <Seg label={t('Hotspot confidence')} value={high ? 'h' : 'mh'} set={(v) => setHigh(v === 'h')} opts={[['mh', t('Medium + high')], ['h', t('High confidence')]]} />
        <label className="muted flex items-center gap-1 pb-1 text-xs" title={t('MODIS and VIIRS near-real-time hotspots carry no type. Those within 1 km (MODIS) or 375 m (VIIRS) of a VIIRS detection typed as volcano, static land source (such as a gas flare) or offshore are left out unless included here.')}>
          <input type="checkbox" checked={withStatic} onChange={(e) => setWithStatic(e.target.checked)} />{t('Include likely static sources')}</label>
        <span className="muted ml-auto pb-1 text-xs">{srcName} {yr}: 1/1 {t('to')} {src === 'viirs' ? last : meta.modis_last.slice(5).replace('-', '/')} · {t('Burned area')}: KLHK {meta.years[0]}–{meta.years[1]}</span>
      </div>

      <dl className="card grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {kpi(basis === 'peat' ? t('Peat area') : t('Land area'), f0(total.area / 100), `km² · ${scopeName}`, t('Area of the selection on the equal-area grid.'))}
        {kpi(`${t('Burned')} ${yr}${incomplete ? ` (${t('incomplete')})` : ''}`, f0(bY(total)), `ha · ${t('mean')} ${PAST[0]}–${PAST[1]}: ${f0(pastMean(total.burned))} ha/${t('yr')}`, t('KLHK burnt-area polygons of the year, on the 30 m grid. The 2026 layer holds 0.2 ha per VIIRS hotspot against 2 to 6 ha in 2015 to 2023 and 2025: incomplete as delivered, so compare 2026 with earlier years through the hotspots. 2024 is also incomplete (0.6 ha per hotspot).'))}
        {kpi(`${t('Hotspots')} ${yr}`, f0(total.modis), `${srcName}, ${high ? t('high confidence') : t('medium + high')} · ${f1(rate(total.modis, total.area))} ${t('per 100 km²')} ${unit}${src === 'viirs' ? ` · ×${(total.modis / Math.max(1, pastMean(total.viirsYtd))).toFixed(1)} ${t('mean')} ${PAST[0]}–${PAST[1]}` : ''}`, src === 'viirs' ? t('VIIRS hotspots from 1 January to the last 2026 date, the same window in every year, and their ratio to the 2015 to 2025 mean.') : t('MODIS hotspots of the year: KLH file, then NASA FIRMS MODIS near real time.'))}
        {kpi(t('In concessions'), pct(conc.get('yes')?.modis ?? 0, total.modis), share(conc, 'yes'), t('Share of the selected year\'s hotspots (large figure), of the burned area of 2015 to 2025 and of the area (line) inside a business licence. A hotspot inside a licence is a spatial overlap, not responsibility.'))}
        {kpi(t('In forest area'), pct(forest.get('kawasan')?.modis ?? 0, total.modis), share(forest, 'kawasan'), t('Share inside the forest area (kawasan hutan), with or without a licence.'))}
        {kpi(t('In DMPG villages'), pct(dmpg.get('yes')?.modis ?? 0, total.modis), share(dmpg, 'yes'), t('Share inside DMPG village land.'))}
      </dl>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="card min-w-0 p-3">
          <div className="font-medium">{t('Concession and forest area')} · {scopeName}</div>
          <div className="muted mb-2 text-xs">{t('Each cell')}: {t('area')} km² · {t('burned')} {yr} ha · {t('hotspots')} {yr} ({srcName}) · <b style={{ color: 'var(--ink)' }}>{t('per 100 km²')}</b>. {t('Shade: hotspot density.')}</div>
          <div className="overflow-x-auto"><div className="grid min-w-[24rem] gap-1 text-xs" style={{ gridTemplateColumns: 'minmax(6rem,auto) repeat(3, minmax(0,1fr))' }}>
            <span />{MATRIX_COLS.map((c) => <span key={c.key} className="muted px-1" title={SPLITS.forest.help}>{t(c.label)}</span>)}
            {MATRIX_ROWS.map((r) => <div key={r.key} className="contents">
              <span className="self-center font-medium" title={SPLITS.concession.help}><i className="chip" style={{ background: r.color }} />{t(r.label)}</span>
              {MATRIX_COLS.map((c) => { const a = matrix.get(`${r.key}|${c.key}`) ?? agg(), d = rate(a.modis, a.area); return (
                <div key={c.key} className="rounded p-2" style={{ background: `color-mix(in srgb, var(--s2) ${d ? Math.round((70 * d) / maxRate) : 0}%, transparent)`, border: '1px solid var(--line)' }}>
                  <div className="text-lg font-semibold tabular-nums">{f1(d)}</div>
                  <div className="tabular-nums">{f0(a.area / 100)} km²</div>
                  <div className="tabular-nums">{f0(bY(a))} ha{incomplete ? '*' : ''}</div>
                  <div className="tabular-nums">{f0(a.modis)} {t('hotspots')}</div>
                </div>) })}
            </div>)}
          </div></div>
        </div>

        <div className="card min-w-0 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="font-medium">{t('By')} {t(sp.label).toLowerCase()} · {scopeName}</div>
            <div className="ml-auto flex flex-wrap gap-1">{(Object.keys(SPLITS) as Split[]).map((k) => <button key={k} className="btn text-xs" aria-pressed={split === k} title={t(SPLITS[k].help)} onClick={() => setSplit(k)}>{t(SPLITS[k].label)}</button>)}</div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[31rem] text-xs">
            <thead><tr className="muted text-right">
              <th className="text-left font-normal" />
              <th className="font-normal" title={t('Area of the class on the equal-area grid.')}>{basis === 'peat' ? t('Peat') : t('Land')} <span>(km²)</span></th>
              <th className="font-normal" title={t('KLHK burnt-area polygons of the year. The 2026 layer is incomplete as delivered.')}>{t('Burned')} {yr}{incomplete ? '*' : ''} (ha)</th>
              <th className="font-normal" title={t('Mean yearly burned area over the earlier years.')}>{t('Mean')} {PAST[0]}–{PAST[1]} (ha/{t('yr')})</th>
              <th className="font-normal" title={t('Share of the class burned at least once in 2015 to 2026.')}>{t('Ever burned')} (%)</th>
              <th className="font-normal" title={t('Hotspots of the selected sensor and year.')}>{t('Hotspots')} {yr}</th>
              <th className="w-[26%] pl-2 text-left font-normal" title={t('Hotspots of the selected sensor and year per 100 km² of the class.')}>{t('per 100 km²')}</th>
            </tr></thead>
            <tbody>{shown.map((c) => { const a = cls.get(c.key)!, d = rate(a.modis, a.area); return (
              <tr key={c.key} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1"><i className="chip" style={{ background: c.color }} />{t(c.label)}</td>
                <td className="text-right tabular-nums">{f0(a.area / 100)}</td>
                <td className="text-right tabular-nums">{f0(bY(a))}</td>
                <td className="text-right tabular-nums">{f0(pastMean(a.burned))}</td>
                <td className="text-right tabular-nums">{a.area > 0 ? ((100 * a.ever) / a.area).toFixed(1) : '–'}</td>
                <td className="text-right tabular-nums">{f0(a.modis)}</td>
                <td className="pl-2"><div className="flex items-center gap-1"><div className="h-2.5 rounded" style={{ width: `${(70 * (d ?? 0)) / maxCls}%`, background: c.color }} /><span className="tabular-nums">{f1(d)}</span></div></td>
              </tr>) })}</tbody>
          </table></div>
          {incomplete && <div className="muted mt-1 text-xs">* {t('Burned area of 2026 (and 2024) is incomplete as delivered: it holds far less burned area per hotspot than the other years.')}</div>}
          {split === 'type' && <div className="muted mt-1 text-xs">{t('Overlapping licences: the land counts once, under the first type in the list.')}</div>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <LineChart title={`${t('Burned area per year')} · ${t(sp.label)}`} yLabel="km²" series={burnedLines} fmt={(v) => f0(v)} zeroBase area={false}
          note={t('KLHK burned-area coverage for 2024 and 2026 is incomplete.')}/>
        <LineChart title={`${t('VIIRS hotspots per year')}, 1/1–${last}`} series={viirsLines} fmt={(v) => f0(v)} zeroBase area={false} />
      </div>

      <div className="card p-3">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3"><span className="font-medium">{t('By province')}</span>
          <span className="muted text-xs">{t('Shares in %: burned area 2015 to 2025 (first pair) and hotspots of the selected year (last three) inside concessions, forest area and DMPG villages. Burned area of 2024 and 2026 is incomplete as delivered.')}</span></div>
        <DataTable rows={provRows} cols={provCols} rowKey="province" searchKeys={['province', 'island']} placeholder={t('Search province')} selectedKey={province || null}
          onRow={(r) => { setIsland(r.island); setProvince(province === r.province ? '' : r.province) }} initialSort={{ key: 'modis', dir: -1 }} />
      </div>
      <p className="muted px-1 text-xs">{t('Every layer is laid on one equal-area grid of 30 m cells; a cell takes the class of the polygon its centre falls in, and a hotspot the class of the cell it falls in. Licences 2025 and forest area 2023 are matched to every year, so land may have had another status in earlier years. Hotspots and burns inside a licence are a spatial overlap; they do not show the cause of a fire or who is responsible.')}</p>
      {tenure && names.size > 0 && <TenureAcross data={tenure} names={names} />}
    </div>
  )
}
