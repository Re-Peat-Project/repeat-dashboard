import { useEffect, useMemo, useState } from 'react'
import { dataUrl, readJson } from '../lib/data'
import { useT } from '../lib/i18n'

type Viz = { type: string; title: string; [k: string]: any }
type Sample = { khg_id: string; name: string; why: string; viz: Viz[] }
type Question = {
  id: string; title: string; group: string; question: string; prediction: { supports: string; rejects: string }; method: string[]; data: string[]
  verdict: { label: 'supports' | 'rejects' | 'inconclusive' | 'not testable'; reason: string }; viz: Viz[]; samples: Sample[]; csv: string[]
}
type Doc = { provenance: Record<string, any>; questions: Question[] }

const TEN: Record<string, string> = { licence: 'var(--s2)', forest: 'var(--s6)', other_land: 'var(--s1)', all: 'var(--s7)' }
const TEN_NAME: Record<string, string> = { licence: 'Business licence', forest: 'Forest area, no licence', other_land: 'Other land' }
const VERDICT: Record<string, { label: string; color: string; icon: string }> = {
  supports: { label: 'Supports', color: 'var(--s6)', icon: '✓' }, rejects: { label: 'Rejects', color: 'var(--s8)', icon: '✕' }, inconclusive: { label: 'Inconclusive', color: 'var(--s4)', icon: '?' }, 'not testable': { label: 'Not testable', color: 'var(--muted)', icon: '–' },
}
const f2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2))

function Chip({ v }: { v: Question['verdict']['label'] }) {
  const t = useT(), d = VERDICT[v]
  return <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-semibold" style={{ border: `1.5px solid ${d.color}`, color: 'var(--ink)' }}><b style={{ color: d.color }}>{d.icon}</b>{t(d.label)}</span>
}

/** Ratios with their interval on a log axis. */
function Ci({ viz }: { viz: Viz }) {
  const rows = viz.rows as { label: string; ratio: number | null; lo: number | null; hi: number | null; kind: string; note: string }[]
  const vals = rows.flatMap((r) => [r.ratio, r.lo, r.hi]).filter((v): v is number => v != null && v > 0)
  const lo = Math.max(0.05, Math.min(0.5, ...vals) / 1.15), hi = Math.min(40, Math.max(2, ...vals) * 1.15)
  const X = (v: number) => (100 * (Math.log(Math.min(hi, Math.max(lo, v))) - Math.log(lo))) / (Math.log(hi) - Math.log(lo))
  const ticks = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16].filter((v) => v >= lo && v <= hi)
  return (
    <div className="text-xs">
      <div className="grid items-center gap-y-0.5" style={{ gridTemplateColumns: 'minmax(8rem,16rem) 1fr minmax(7rem,14rem)' }}>
        {rows.map((r, i) => (
          <div key={i} className="contents">
            <span className={`truncate ${r.kind === 'pooled' ? 'font-semibold' : ''}`} title={r.label}>{r.label}</span>
            <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-5 w-full" aria-hidden>
              {ticks.map((v) => <line key={v} x1={X(v)} x2={X(v)} y1={0} y2={12} stroke="var(--ink)" strokeOpacity={v === (viz.ref ?? 1) ? 0.6 : 0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
              {viz.effect && viz.effect !== viz.ref && <line x1={X(viz.effect)} x2={X(viz.effect)} y1={0} y2={12} stroke="var(--s4)" strokeDasharray="2 2" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              {r.ratio != null && r.lo != null && r.hi != null && <>
                <line x1={X(r.lo)} x2={X(r.hi)} y1={6} y2={6} stroke={r.kind === 'pooled' ? 'var(--ink)' : 'var(--muted)'} strokeWidth={r.kind === 'pooled' ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
                <rect x={X(r.ratio) - 0.7} y={r.kind === 'pooled' ? 1.5 : 3} width={1.4} height={r.kind === 'pooled' ? 9 : 6} fill={r.kind === 'pooled' ? 'var(--ink)' : 'var(--muted)'} />
              </>}
            </svg>
            <span className="muted truncate" title={r.note}>{r.ratio == null ? 'n/a' : `${f2(r.ratio)} (${f2(r.lo)}–${f2(r.hi)})`} · {r.note}</span>
          </div>
        ))}
        <span /><div className="muted relative h-4">{ticks.map((v) => <span key={v} className="absolute -translate-x-1/2" style={{ left: `${X(v)}%` }}>{v}</span>)}</div><span />
      </div>
      {viz.effect && <div className="muted mt-1">Dashed line: the effect size the rule asks for ({viz.effect}). Line: 95% interval. Pooled rows in bold.</div>}
    </div>
  )
}

function Groups({ viz }: { viz: Viz }) {
  const groups = viz.groups as { label: string; note?: string; series: { name: string; value: number | null }[] }[]
  const top = Math.max(1e-9, ...groups.flatMap((g) => g.series.map((s) => s.value ?? 0)))
  const colors = ['var(--muted)', 'var(--s2)']
  return (
    <div className="flex flex-col gap-2 text-xs">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate">{g.label}</span><span className="muted">{g.note}</span></div>
          {g.series.map((s, i) => <div key={s.name} className="flex items-center gap-2" title={s.name}>
            <span className="muted w-56 shrink-0 truncate">{s.name}</span>
            <div className="h-2.5 flex-1 rounded" style={{ background: 'color-mix(in srgb, var(--ink) 7%, transparent)' }}><i className="block h-full rounded" style={{ width: `${(100 * (s.value ?? 0)) / top}%`, background: colors[i % 2] }} /></div>
            <span className="w-14 text-right">{f2(s.value)}</span></div>)}
        </div>
      ))}
      <div className="muted">{viz.unit}</div>
    </div>
  )
}

function Scatter({ viz }: { viz: Viz }) {
  const pts = viz.points as { label: string; x: number; y: number; group: string }[]
  const W = 520, H = 300, m = { l: 46, r: pts.length <= 16 ? 130 : 12, t: 10, b: 38 }
  const lx = !!viz.log, ly = !!(viz.log || viz.logy)
  const tx = (v: number) => (lx ? Math.log10(v) : v), ty = (v: number) => (ly ? Math.log10(v) : v)
  const xs = pts.map((p) => tx(p.x)), ys = pts.map((p) => ty(p.y))
  const pad = (a: number[], extra?: number) => { const lo = Math.min(...a, ...(extra == null ? [] : [extra])), hi = Math.max(...a, ...(extra == null ? [] : [extra])); const d = (hi - lo) * 0.08 || 0.5; return [lo - d, hi + d] }
  const [x0, x1] = pad(xs, lx ? 0 : undefined), [y0, y1] = pad(ys, ly ? 0 : undefined)
  const X = (v: number) => m.l + ((tx(v) - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (v: number) => H - m.b - ((ty(v) - y0) / (y1 - y0)) * (H - m.t - m.b)
  const tickVals = (lo: number, hi: number, isLog: boolean) => (isLog ? [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32].filter((v) => Math.log10(v) >= lo && Math.log10(v) <= hi) : Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4))
  const label = pts.length <= 16
  const groupsInPlot = [...new Set(pts.map((p) => p.group))]
  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={viz.title}>
      {tickVals(x0, x1, lx).map((v) => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeOpacity={0.1} /><text x={X(v)} y={H - m.b + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{f2(v)}</text></g>)}
      {tickVals(y0, y1, ly).map((v) => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--ink)" strokeOpacity={0.1} /><text x={m.l - 4} y={Y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{f2(v)}</text></g>)}
      {viz.ref != null && <g><line x1={m.l} x2={W - m.r} y1={Y(viz.ref)} y2={Y(viz.ref)} stroke="var(--ink)" strokeOpacity={0.45} strokeDasharray="3 3" />{!lx && <line x1={X(0)} x2={X(0)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeOpacity={0.45} strokeDasharray="3 3" />}{lx && <line x1={X(1)} x2={X(1)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeOpacity={0.45} strokeDasharray="3 3" />}</g>}
      {pts.map((p, i) => <g key={i}><circle cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={TEN[p.group] ?? 'var(--s7)'} stroke="var(--surface)" strokeWidth={1.2}><title>{`${p.label}: ${f2(p.x)}, ${f2(p.y)}`}</title></circle>{label && <text x={X(p.x) + 6} y={Y(p.y) + 3} fontSize="9" fill="var(--ink)">{p.label}</text>}</g>)}
      <text x={(W + m.l) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">{viz.xlabel}</text>
      <text transform={`translate(11 ${(H - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill="var(--muted)">{viz.ylabel}</text>
    </svg>
    {groupsInPlot.length > 1 && <div className="muted flex flex-wrap gap-x-3 text-xs">{groupsInPlot.map((g) => <span key={g}><i className="chip" style={{ background: TEN[g] }} />{TEN_NAME[g] ?? g}</span>)}</div>}
    </>
  )
}

function Lines({ viz }: { viz: Viz }) {
  const series = viz.series as { name: string; tenure?: string; dash?: boolean; points: [number, number][] }[]
  const W = 460, H = 230, m = { l: 44, r: 12, t: 10, b: 32 }
  const all = series.flatMap((s) => s.points)
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y1 = Math.max(1e-9, ...all.map((p) => p[1])) * 1.05
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r), Y = (v: number) => H - m.b - (v / y1) * (H - m.t - m.b)
  const cols = ['var(--s2)', 'var(--s2)', 'var(--s1)', 'var(--s1)']
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={viz.title}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={m.l} x2={W - m.r} y1={Y(f * y1)} y2={Y(f * y1)} stroke="var(--ink)" strokeOpacity={0.1} /><text x={m.l - 4} y={Y(f * y1) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{f2(f * y1)}</text></g>)}
        {[0, 0.5, 1].map((f) => <text key={f} x={X(x0 + f * (x1 - x0))} y={H - m.b + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{Math.round(x0 + f * (x1 - x0))}</text>)}
        {series.map((s, i) => <polyline key={s.name} fill="none" stroke={s.tenure ? TEN[s.tenure] : cols[i % 4]} strokeWidth={2} strokeDasharray={s.dash ? '4 3' : undefined} strokeLinejoin="round" points={s.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} />)}
        <text x={(W + m.l) / 2} y={H - 3} textAnchor="middle" fontSize="10" fill="var(--muted)">{viz.xlabel}</text>
      </svg>
      <div className="muted flex flex-wrap gap-x-3 text-xs">{series.map((s, i) => <span key={s.name}><i className="chip" style={{ background: s.tenure ? TEN[s.tenure] : cols[i % 4], opacity: s.dash ? 0.5 : 1 }} />{s.name}</span>)}</div>
    </div>
  )
}

function BlockMap({ viz }: { viz: Viz }) {
  const cells = viz.cells as [number, number, number][]
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1])
  const x0 = Math.min(...xs), y1 = Math.max(...ys), w = Math.max(...xs) - x0 + 1, h = y1 - Math.min(...ys) + 1
  const sorted = cells.map((c) => c[2]).sort((a, b) => a - b), top = Math.max(1, sorted[Math.floor(0.95 * (sorted.length - 1))])
  const col = (v: number) => (v <= 0 ? 'color-mix(in srgb, var(--ink) 8%, transparent)' : `color-mix(in srgb, var(--s8) ${Math.round(25 + 75 * Math.min(1, Math.sqrt(v / top)))}%, var(--surface))`)
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-md" style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={viz.title} shapeRendering="crispEdges">
        {cells.map((c, i) => <rect key={i} x={c[0] - x0} y={y1 - c[1]} width={1} height={1} fill={col(c[2])}><title>{`${f2(c[2])}`}</title></rect>)}
      </svg>
      <div className="muted text-xs">Grey: no increase. Red: increase, up to the 95th percentile ({f2(top)}). North is up; each square is {(viz.size ?? 2000) / 1000} km.</div>
    </div>
  )
}

function Table({ viz }: { viz: Viz }) {
  const cols = viz.cols as string[], rows = viz.rows as (string | number)[][]
  return (
    <div className="max-h-80 overflow-auto"><table className="w-full text-xs">
      <thead className="sticky top-0" style={{ background: 'var(--surface)' }}><tr>{cols.map((c, i) => <th key={i} className={`px-2 py-1 ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-2 py-0.5 ${j ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody></table></div>
  )
}

function VizBlock({ viz }: { viz: Viz }) {
  const body = viz.type === 'ci' ? <Ci viz={viz} /> : viz.type === 'groups' ? <Groups viz={viz} /> : viz.type === 'scatter' ? <Scatter viz={viz} /> : viz.type === 'lines' ? <Lines viz={viz} /> : viz.type === 'map' ? <BlockMap viz={viz} /> : <Table viz={viz} />
  return <figure className="mb-3"><figcaption className="mb-1 text-sm font-medium">{viz.title}</figcaption>{body}</figure>
}

function Section({ q, n }: { q: Question; n: number }) {
  const t = useT()
  return (
    <section id={q.id} className="card scroll-mt-4 p-4">
      <div className="muted text-xs uppercase">{t('Question')} {n}</div>
      <h2 className="mb-1 text-lg font-semibold">{q.title}</h2>
      <p className="mb-3 text-sm">{q.question}</p>

      <h3 className="mb-1 text-sm font-semibold">{t('Prediction, fixed before the run')}</h3>
      <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded p-2" style={{ border: '1px solid var(--s6)' }}><b style={{ color: 'var(--s6)' }}>✓ {t('Supports if')}</b><div>{q.prediction.supports}</div></div>
        <div className="rounded p-2" style={{ border: '1px solid var(--s8)' }}><b style={{ color: 'var(--s8)' }}>✕ {t('Rejects if')}</b><div>{q.prediction.rejects}</div></div>
      </div>

      <h3 className="mb-1 text-sm font-semibold">{t('Data and method')}</h3>
      <ul className="mb-3 list-disc pl-5 text-sm">{q.method.map((m, i) => <li key={i}>{m}</li>)}</ul>
      <div className="muted mb-3 text-xs">{t('Data')}: {q.data.join('; ')}</div>

      <h3 className="mb-1 text-sm font-semibold">{t('Analysis')}</h3>
      {q.viz.map((v, i) => <VizBlock key={i} viz={v} />)}

      {q.samples.length > 0 && <>
        <h3 className="mb-1 mt-2 text-sm font-semibold">{t('Worked samples from real KHG')}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {q.samples.map((s) => <div key={s.khg_id} className="rounded p-3" style={{ border: '1px solid color-mix(in srgb, var(--ink) 15%, transparent)' }}>
            <div className="font-medium">{s.name}</div><div className="muted mb-2 text-xs">{s.why}</div>
            {s.viz.map((v, i) => <VizBlock key={i} viz={v} />)}</div>)}
        </div>
      </>}

      <div className="mt-3 rounded p-3" style={{ border: `2px solid ${VERDICT[q.verdict.label].color}` }}>
        <div className="flex items-center gap-2"><span className="text-sm font-semibold">{t('Verdict')}</span><Chip v={q.verdict.label} /></div>
        <p className="mt-1 text-sm">{q.verdict.reason}</p>
      </div>
      <div className="muted mt-2 text-xs">{t('Tables behind this question')}: {q.csv.map((f, i) => <span key={f}>{i ? ', ' : ''}<a className="underline" href={dataUrl(`hypotheses/${f}`)} download>{f}</a></span>)}</div>
    </section>
  )
}

export default function Hypotheses() {
  const t = useT()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { readJson<Doc>('hypotheses/hypotheses.json').then(setDoc).catch(() => setErr(true)) }, [])
  const groups = useMemo(() => (doc ? [...new Set(doc.questions.map((q) => q.group))] : []), [doc])
  if (err) return <div className="p-6 text-sm">{t('The investigation data is not built yet: run repeat-hypotheses and pipeline/build_hypotheses.py.')}</div>
  if (!doc) return <div className="p-6 text-sm">{t('Loading')}…</div>
  const P = doc.provenance
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3">
      <header className="card p-4">
        <h1 className="mb-1 text-xl font-semibold">{t('Investigation: fire in 2026 by land tenure and place')}</h1>
        <p className="text-sm">{t('In 2026 the forest area without a licence burned far above its own level of 2015 to 2025 in several KHG. Each question below tests one explanation. The prediction and the rule for the verdict are fixed in code before the run; every number comes from the files listed and can be rerun.')}</p>
        <div className="muted mt-2 grid gap-x-4 text-xs sm:grid-cols-2">
          <div>{t('Window')}: 1 {t('January')} – {P.window_last_day} · {t('baseline')} {P.baseline_years[0]}–{P.baseline_years[1]} · {t('test year')} {P.test_year}</div>
          <div>{t('Generated')}: {P.generated} · {t('seed')} {P.seed} · {P.bootstrap_draws} {t('bootstrap draws')}</div>
          <div>{Object.keys(P.khg_cell_panels).length} KHG {t('in the cell tests')}; {P.khg_tenure_tables} KHG {t('in the tenure tables')}</div>
          <div>{t('Rerun')}: <code>{P.command}</code></div>
        </div>
        <p className="muted mt-2 text-xs">{t('Hotspots are satellite detections on peat (VIIRS), not burned area. An association is not a cause, and a verdict of inconclusive means the data cannot decide. The licence layer is the 2025 map applied to every year.')} <a className="underline" href={dataUrl('hypotheses/hypotheses.json')} download>hypotheses.json</a> · <a className="underline" href={dataUrl('hypotheses/provenance.json')} download>provenance.json</a></p>
      </header>

      <nav className="card p-3" aria-label={t('Questions')}>
        <div className="mb-1 text-sm font-semibold">{t('Verdicts at a glance')}</div>
        <div className="grid gap-y-1 text-sm" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          {doc.questions.map((q, i) => <div key={q.id} className="contents"><span className="muted pr-2">{i + 1}</span><a className="underline" href={`#${q.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(q.id)?.scrollIntoView({ behavior: 'smooth' }) }}>{q.title}</a><Chip v={q.verdict.label} /></div>)}
        </div>
      </nav>

      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-4">
          <h2 className="mt-2 border-b pb-1 text-sm font-semibold uppercase" style={{ borderColor: 'color-mix(in srgb, var(--ink) 20%, transparent)' }}>{g}</h2>
          {doc.questions.filter((q) => q.group === g).map((q) => <Section key={q.id} q={q} n={doc.questions.indexOf(q) + 1} />)}
        </div>
      ))}
    </div>
  )
}
