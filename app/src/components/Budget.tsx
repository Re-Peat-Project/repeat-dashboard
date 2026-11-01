import { useEffect, useMemo, useState } from 'react'
import { DataTable, type Col } from './DataTable'
import { readJson, readTable, type Manifest } from '../lib/data'
import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'

type Row = { subkhg_id: string; intervention: string; item: string; quantity: number | null; basis: string; unit: string; cost_low_idr: number | null; cost_idr: number | null; cost_high_idr: number | null; priced: boolean }
type Src = { key: string; used: string; figure_quoted: string; unit: string; place_period: string; source: string; url: string | null; accessed: string; status: string; verified_by: string | null; note: string | null; applies: boolean | null }
type Curve = { n: number; cost_idr: number; cum: number }
type Summary = { budget: { price_year: number; total_low_idr: number | null; total_idr: number | null; total_high_idr: number | null; by_item: Record<string, { quantity: number; cost_low_idr: number | null; cost_idr: number | null; cost_high_idr: number | null }>
  unpriced: string[]; not_estimable: Record<string, { n_units: number; area_km2: number }>
  sekat_cost_idr: number | null; idr_per_m3_held: number | null; spend_curve: Curve[] } }

const ITEM: Record<string, { en: string; id: string; unit: string }> = {
  sekat_standard: { en: 'Wooden block', id: 'Sekat kayu', unit: 'units' }, sekat_tertiary: { en: 'Wooden block, tertiary canal', id: 'Sekat kayu, kanal tersier', unit: 'units' },
  sekat_reinforced: { en: 'Reinforced block (concrete)', id: 'Sekat beton', unit: 'units' }, sekat_ipg_estimate: { en: 'Blocks, KLH IPG estimate', id: 'Sekat, estimasi IPG KLH', unit: 'units' },
  canal_closure_km: { en: 'Canal closure', id: 'Penutupan kanal', unit: 'km' }, revegetation_ha: { en: 'Revegetation', id: 'Revegetasi', unit: 'ha' },
  deep_wells: { en: 'Deep wells', id: 'Sumur bor', unit: 'units' }, pump_units: { en: 'Pump units', id: 'Unit pompa', unit: 'units' }, pump_fuel_l: { en: 'Pump fuel', id: 'Bahan bakar pompa', unit: 'L' },
}
const ORDER = Object.keys(ITEM)
const COLOR: Record<string, string> = Object.fromEntries(ORDER.map((k, i) => [k, `var(--s${(i % 8) + 1})`]))

export function idr(v: number | null | undefined, lang: 'en' | 'id') {
  if (v == null || !Number.isFinite(v)) return '-'
  const a = Math.abs(v), nf = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2))
  return `Rp ${a >= 1e12 ? `${nf(v / 1e12)} ${lang === 'id' ? 'triliun' : 'trillion'}` : a >= 1e9 ? `${nf(v / 1e9)} ${lang === 'id' ? 'miliar' : 'bn'}` : a >= 1e6 ? `${nf(v / 1e6)} ${lang === 'id' ? 'juta' : 'mn'}` : Math.round(v).toLocaleString()}`
}

/** Budget estimate of a pump run: totals with their range, by item, by sub-KHG, the spend curve, the rows and the register of unit costs. */
export function BudgetPanel({ code, dem, mf }: { code: string; dem: string; mf: Manifest }) {
  const t = useT(), lang = useStore((s) => s.lang)
  const [sum, setSum] = useState<Summary | null>(null), [rows, setRows] = useState<Row[]>([]), [src, setSrc] = useState<Src[]>([])
  const file = (id: string) => mf.tables.find((x) => x.id === id && x.dem === dem)?.file
  useEffect(() => {
    const s = file('pump_budget_summary'), b = file('pump_budget'), r = file('pump_budget_sources')
    s ? readJson<Summary>(`khg/${code}/${s}`).then(setSum).catch(() => setSum(null)) : setSum(null)
    b ? readTable<Row>(`khg/${code}/${b}`).then(setRows).catch(() => setRows([])) : setRows([])
    r ? readTable<Src>(`khg/${code}/${r}`).then(setSrc).catch(() => setSrc([])) : setSrc([])
  }, [code, dem, mf])
  const name = (k: string) => ITEM[k] ? ITEM[k][lang] : k
  const units = useMemo(() => [...new Set(rows.map((r) => r.subkhg_id))].sort(), [rows])
  const short = (id: string) => id.replace(/^.*_(?=S\d+$)/, '')
  const bySub = useMemo(() => units.map((u) => { const rs = rows.filter((r) => r.subkhg_id === u && r.cost_idr != null); return { u, total: rs.reduce((a, r) => a + (r.cost_idr ?? 0), 0), parts: ORDER.map((k) => ({ k, v: rs.filter((r) => r.item === k).reduce((a, r) => a + (r.cost_idr ?? 0), 0) })).filter((p) => p.v > 0) } }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total), [rows, units])
  if (!sum) return <div className="card muted p-3 text-sm">{t('Budget estimate')}: {t('Not available for this DEM')}</div>
  const B = sum.budget
  const items = ORDER.filter((k) => B.by_item[k] && B.by_item[k].quantity > 0).map((k) => ({ k, ...B.by_item[k] }))
  const itemMax = Math.max(1, ...items.map((i) => i.cost_high_idr ?? i.cost_idr ?? 0))
  const subMax = Math.max(1, ...bySub.map((s) => s.total))
  const tile = (label: string, value: string, sub?: string, tipText?: string) => <div data-tip={tipText}><div className="text-lg font-semibold leading-tight">{value}</div><div className="muted text-xs">{label}</div>{sub && <div className="muted text-xs">{sub}</div>}</div>
  const cols: Col<Row>[] = [
    { key: 'subkhg_id', label: t('Sub-KHG'), fmt: (v) => short(String(v)) }, { key: 'item', label: t('Item'), fmt: (v) => name(String(v)) },
    { key: 'quantity', label: t('Quantity'), align: 'right', fmt: (v, r) => (v == null ? '-' : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${r.unit}`) },
    { key: 'cost_low_idr', label: t('Low'), unit: 'Rp', align: 'right', fmt: (v) => idr(v, lang) }, { key: 'cost_idr', label: t('Central'), unit: 'Rp', align: 'right', fmt: (v, r) => (r.priced ? idr(v, lang) : t('no verified price')) },
    { key: 'cost_high_idr', label: t('High'), unit: 'Rp', align: 'right', fmt: (v) => idr(v, lang) }, { key: 'basis', label: t('Basis') },
  ]
  const curve = B.spend_curve
  const cw = 460, ch = 150, cm = { l: 44, r: 10, t: 8, b: 24 }
  const cx = (n: number) => cm.l + (n / Math.max(1, curve[curve.length - 1]?.n ?? 1)) * (cw - cm.l - cm.r)
  const cy = (v: number) => ch - cm.b - v * (ch - cm.t - cm.b)
  const cmax = curve[curve.length - 1]?.cost_idr ?? 1
  return (
    <div className="card flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-baseline gap-2"><div className="font-medium" data-tip={t('Quantities come from the run. Prices are the national cost standard (Perdirjen PPKL P.16/2022) as ranges (low, central, high) in rupiah of the price year, not adjusted for inflation. An item without a price in the standard keeps its quantity and has no cost.')}>{t('Budget estimate')}</div><span className="muted ml-auto text-xs">{t('Price year')} {B.price_year}</span></div>
      <div className="grid grid-cols-2 gap-3">
        {tile(t('Total, cost standard P.16/2022'), idr(B.total_idr, lang), `${idr(B.total_low_idr, lang)} – ${idr(B.total_high_idr, lang)}`, t('Sum of the priced items. A sub-KHG whose quantity could not be computed adds no cost, so the total is a floor.'))}
        {tile(t('Cost per m³ of water held'), B.idr_per_m3_held != null ? `Rp ${Math.round(B.idr_per_m3_held).toLocaleString()}` : '-', B.sekat_cost_idr != null ? `${t('blocks')} ${idr(B.sekat_cost_idr, lang)}` : undefined, t('Cost of the blocks divided by the water they hold back in the analysed sub-KHG.'))}
      </div>

      <div>
        <div className="mb-1 font-medium">{t('By item')}</div>
        <div className="flex flex-col gap-1.5 text-xs">
          {items.map((i) => (
            <div key={i.k}>
              <div className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate"><i className="chip" style={{ background: COLOR[i.k] }} />{name(i.k)}</span>
                <span className="muted">{i.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {ITEM[i.k].unit}</span><span className="w-28 text-right">{i.cost_idr != null ? idr(i.cost_idr, lang) : <span className="muted">{t('no verified price')}</span>}</span></div>
              {i.cost_idr != null && <div className="relative h-2.5 rounded" style={{ background: 'color-mix(in srgb, var(--ink) 7%, transparent)' }} title={`${idr(i.cost_low_idr, lang)} – ${idr(i.cost_high_idr, lang)}`}>
                <i className="absolute left-0 top-0 h-full rounded" style={{ width: `${(100 * i.cost_idr) / itemMax}%`, background: COLOR[i.k] }} />
                {i.cost_low_idr != null && i.cost_high_idr != null && <i className="absolute top-1/2 h-px" style={{ left: `${(100 * i.cost_low_idr) / itemMax}%`, width: `${(100 * (i.cost_high_idr - i.cost_low_idr)) / itemMax}%`, background: 'var(--ink)' }} />}
              </div>}
            </div>
          ))}
        </div>
        <div className="muted mt-1 text-xs">{t('Bar: central price. Line: low to high.')}</div>
      </div>

      {bySub.length > 0 && <div>
        <div className="mb-1 font-medium">{t('By sub-KHG')}</div>
        <div className="flex flex-col gap-1 text-xs">
          {bySub.map((s) => <div key={s.u} className="flex items-center gap-2"><span className="w-8 shrink-0">{short(s.u)}</span>
            <div className="flex h-3 flex-1 gap-px overflow-hidden rounded" style={{ background: 'color-mix(in srgb, var(--ink) 7%, transparent)' }}>
              <div className="flex h-full gap-px" style={{ width: `${(100 * s.total) / subMax}%` }}>{s.parts.map((p) => <i key={p.k} style={{ width: `${(100 * p.v) / s.total}%`, background: COLOR[p.k] }} title={`${name(p.k)}: ${idr(p.v, lang)}`} />)}</div></div>
            <span className="w-24 shrink-0 text-right">{idr(s.total, lang)}</span></div>)}
        </div>
        <div className="muted mt-1 flex flex-wrap gap-x-3 text-xs">{ORDER.filter((k) => bySub.some((s) => s.parts.some((p) => p.k === k))).map((k) => <span key={k}><i className="chip" style={{ background: COLOR[k] }} />{name(k)}</span>)}</div>
      </div>}

      {curve.length > 1 && <div>
        <div className="mb-1 font-medium" data-tip={t('Blocks in order of benefit: the cumulative cost, and the share of the water the plan holds back that they account for.')}>{t('Spend curve')}</div>
        <svg viewBox={`0 0 ${cw} ${ch}`} className="w-full" role="img" aria-label={t('Spend curve')}>
          {[0, 0.5, 1].map((v) => <g key={v}><line x1={cm.l} x2={cw - cm.r} y1={cy(v)} y2={cy(v)} stroke="var(--ink)" strokeOpacity={0.12} /><text x={cm.l - 4} y={cy(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{Math.round(v * 100)}%</text></g>)}
          <polyline fill="none" stroke="var(--s1)" strokeWidth={2} points={curve.map((p) => `${cx(p.n)},${cy(p.cum)}`).join(' ')} />
          <polyline fill="none" stroke="var(--s2)" strokeWidth={2} strokeDasharray="4 3" points={curve.map((p) => `${cx(p.n)},${cy(p.cost_idr / cmax)}`).join(' ')} />
          <text x={cm.l} y={ch - 6} fontSize="9" fill="var(--muted)">1</text><text x={cw - cm.r} y={ch - 6} textAnchor="end" fontSize="9" fill="var(--muted)">{curve[curve.length - 1].n} {t('blocks')}</text>
        </svg>
        <div className="muted text-xs"><i className="chip" style={{ background: 'var(--s1)' }} />{t('Share of the water held')} · <i className="chip" style={{ background: 'var(--s2)' }} />{t('Cumulative cost')} ({idr(cmax, lang)} {t('at the last block')})</div>
      </div>}

      {(B.unpriced.length > 0 || Object.keys(B.not_estimable).length > 0) && <div className="rounded p-2 text-xs" style={{ background: 'color-mix(in srgb, var(--s4) 14%, transparent)' }}>
        {B.unpriced.length > 0 && <div>{t('Quantity without a price in the cost standard')}: {B.unpriced.map(name).join(', ')}. {t('The total leaves them out.')}</div>}
        {Object.entries(B.not_estimable).map(([k, v]) => <div key={k}>{name(k)}: {v.n_units} {t('sub-KHG could not be estimated')} ({Math.round(v.area_km2)} km²).</div>)}
      </div>}

      <details><summary className="cursor-pointer font-medium">{t('Items by sub-KHG')}</summary><div className="mt-2"><DataTable rows={rows.map((r, i) => ({ ...r, _k: String(i) }))} cols={cols as Col<Row & { _k: string }>[]} rowKey="_k" searchKeys={['subkhg_id', 'item', 'basis']} placeholder={t('Search')} initialSort={{ key: 'cost_idr', dir: -1 }} limit={200} /></div></details>

      {src.length > 0 && <details><summary className="cursor-pointer font-medium" data-tip={t('The entries of the cost standard behind the unit prices.')}>{t('Unit-cost sources')} ({src.length})</summary>
        <div className="mt-2 max-h-[360px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0" style={{ background: 'var(--surface)' }}><tr><th className="px-1 text-left">{t('Price')}</th><th className="px-1 text-left">{t('Figure quoted')}</th><th className="px-1 text-left">{t('Source')}</th><th className="px-1 text-left">{t('Status')}</th></tr></thead>
          <tbody>{src.map((r, i) => <tr key={i} className="align-top"><td className="px-1 py-0.5">{r.key}<div className="muted">{r.used}</div></td><td className="px-1 py-0.5">{r.figure_quoted}<div className="muted">{r.unit} · {r.place_period}</div></td>
            <td className="px-1 py-0.5">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="underline">{r.source}</a> : r.source}<div className="muted">{r.accessed}</div></td>
            <td className="px-1 py-0.5"><span className="rounded px-1" style={{ border: '1px solid var(--s6)' }}>{r.status === 'standard' ? t('cost standard') : t('source document')}</span>{r.note && <div className="muted">{r.note}</div>}</td></tr>)}</tbody></table></div></details>}
    </div>
  )
}
