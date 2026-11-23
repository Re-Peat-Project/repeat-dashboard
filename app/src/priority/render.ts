// Drawing helpers of the prioritisation pages, ported from repeat-prioritisation .../national/assets (dashboard.js, final.js).
// Each takes the state it needs explicitly; the page components own the state.
import * as d3 from 'd3'
import {
  confChar, confName, css, DIM_TIP, esc, finDims, fmt, fx, IND, isDark, IV_COL, IV_NOTE, IV_ORDER, IV_SHORT, mon, monf, monthsShort, pc,
  SCORE_NOTE, t, tipAttr, TYPE_LABEL, TYPE_NOTE, TYPE_ORDER, TYPE_RULE, type FC, type PD, type Profile, type Weights,
} from './core'

export type Ctx = { P: PD; FC: FC; FC0: FC; w: Weights; atRef: boolean }

// ---------------------------------------------------------------- tooltips and small marks
export const typeVar = (ty: string) => `var(--ty${ty})`
export function ivTip(P: PD, v: string) {
  const M = P.meta.rule.intervention; if (!M || !v) return ''
  const a = Math.round(M.rewetting.min * 100), b = Math.round(M.revegetation.min * 100)
  return `<b>${esc(t(IV_SHORT[v] ?? v))}</b><br>${IV_NOTE[v] ? esc(t(IV_NOTE[v], { a, b })) + '<br>' : ''}<span>${esc(t("Intervention the peat needs, from two shares of the KHG's peat: canal-affected (KLH canal-influence zones, PPEG) and open or degraded cover (KLH land cover 2022: shrub, open land, open swamp, savanna). Thresholds written before the result. Independent of the type, which says how urgent and how complex."))}</span>`
}
export const ivBadge = (P: PD, v: string | null) => (v ? `<span class="ivb" style="--c:${IV_COL[v]}"${tipAttr(ivTip(P, v))}>${esc(t(IV_SHORT[v]))}</span>` : '')
export function indTip(P: PD, k: string) {
  const m = IND[k] || [k, '', (x: number) => fx(x, 2)]; const dir = (P.meta.rule.dirs || {})[k] === '-' ? t('Lower values raise the score.') : ''
  return `<b>${esc(t(m[0]))}</b><br>${esc(t(m[1]))}${dir ? '<br><span>' + esc(dir) + '</span>' : ''}`
}
export function tercile(C: Ctx, v: number | null, key: string) {
  if (v == null) return ''
  if (key === 'f') return v < (C.FC.fcut as number) ? t('low (flagged)') : ''
  if (key === 'p') return v >= (C.FC.pcut as number) ? t('high (flagged)') : ''
  const c = C.FC.cuts[key]; return v >= c[1] ? t('high') : v >= c[0] ? t('medium') : t('low')
}
export function dimTip(C: Ctx, key: string, j?: number) {
  const d = finDims(C.P).find((x) => x[0] === key)!, dn = d[2], w = C.w, ks = Object.keys(C.P.meta.rule.dims[dn])
  if (j === undefined) return `<b>${esc(t(d[1]))}</b><br>${esc(t(DIM_TIP[key]))}<br>` + ks.map((k) => `· ${esc(t((IND[k] || [k])[0]))}${w[k] !== 1 ? ` <span>(${t('weight')} ${fmt(w[k], 1)})</span>` : ''}`).join('<br>') + `<br><span>${esc(t(SCORE_NOTE, { m: C.P.meta.rule.min_peat }))}</span>`
  const v = (C.FC as any)[key][j] as number | null
  let h = `<b>${esc(C.P.name[j])}: ${esc(t(d[1]))} ${v == null ? t('n/a') : fx(v, 2)}</b>${v != null && tercile(C, v, key) ? ' (' + esc(tercile(C, v, key)) + ')' : ''}<br>`
  h += ks.map((k) => { const iv = C.P.ind[k] ? C.P.ind[k][j] : null; const m = IND[k] || [k, '', (x: number) => fx(x, 2)]; return `${esc(t(m[0]))}: <b>${iv == null ? t('n/a') : m[2](iv)}</b>${w[k] !== 1 ? ` <span>(${t('weight')} ${fmt(w[k], 1)})</span>` : ''}` }).join('<br>')
  return h + `<br><span>${esc(t(DIM_TIP[key]))}</span>`
}
export function finBar(C: Ctx, v: number | null, key: string, j: number) {
  const tip = tipAttr(dimTip(C, key, j))
  if (v == null) return `<span class="fbar na"${tip}>${t('n/a')}</span>`
  const c = key === 'f' ? [C.FC.fcut] : key === 'p' ? [C.FC.pcut] : C.FC.cuts[key], m = c.filter((x) => x != null).map((x) => `<i style="left:${((x as number) * 100).toFixed(1)}%"></i>`).join('')
  return `<span class="fbar"${tip}><b style="width:${(v * 100).toFixed(1)}%"></b>${m}</span><span class="fnum"${tip}>${fx(v, 2)}</span>`
}
export const typeTip = (ty: string) => `<b>${ty} · ${esc(t(TYPE_LABEL[ty]))}</b><br>${esc(t(TYPE_NOTE[ty]))}<br><span>${esc(t('Rule: {r}. Feasibility and people do not change the type.', { r: t(TYPE_RULE[ty]) }))}</span>`
export function profBar(C: Ctx, j: number) {
  const dd = finDims(C.P), n = dd.length
  return `<span class="pbar">${dd.map(([key]) => { const v = (C.FC as any)[key][j] as number | null; return `<b style="width:${v == null ? 0 : ((100 * v) / n).toFixed(2)}%;background:var(--dim-${key})"${tipAttr(dimTip(C, key, j))}></b>` }).join('')}</span>`
}
export function finTip(C: Ctx, j: number) {
  const P = C.P
  let h = `<b>${esc(P.name[j])}</b><br><span>${esc(P.prov[j])} · ${t('peat {x} km2', { x: fmt(P.peat[j], 0) })}</span>`
  if (!C.FC.type[j]) return h + `<br>${t('Not scored: no KLH peat, or below the minimum peat area and outside the 337.')}`
  const ty = C.FC.type[j] as string
  h += `<br><b>${ty} · ${esc(t(TYPE_LABEL[ty]))}</b> · ${P.k337[j] ? t('rank {a} of the 337', { a: C.FC.ru337[j] }) : t('rank {a}', { a: C.FC.ru[j] })}`
  if (P.iv[j]) h += `<br>${t('Intervention')}: <b>${esc(t(IV_SHORT[P.iv[j] as string]))}</b>`
  h += '<br>' + finDims(P).map(([key, lab]) => `${t(lab)} ${(C.FC as any)[key][j] == null ? t('n/a') : fx((C.FC as any)[key][j], 2)}`).join(' · ')
  return h + `<br><span>${t('Click to open the profile.')}</span>`
}

// ---------------------------------------------------------------- rank shift (pre-registered weights against the current ones)
export function renderShift(svgEl: SVGSVGElement, C: Ctx, idx: number[], only337: boolean, sel: string | null, onSelect: (code: string) => void, nRows: number) {
  const svg = d3.select(svgEl), P = C.P
  const rk = (j: number) => (only337 ? C.FC.ru337[j] : C.FC.ru[j]) as number, rk0 = (j: number) => (only337 ? C.FC0.ru337[j] : C.FC0.ru[j]) as number
  const pool = idx.filter((j) => rk(j) != null && rk0(j) != null), n = Math.max(10, nRows)
  const a = pool.slice().sort((x, y) => rk0(x) - rk0(y)).slice(0, n), b = pool.slice().sort((x, y) => rk(x) - rk(y)).slice(0, n)
  const ids = [...new Set([...a, ...b])]
  const W = svgEl.getBoundingClientRect().width || 520, rowH = 20, H = Math.max(n, ids.length) * rowH + 36
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H); svg.selectAll('*').remove()
  const L = W * 0.45, R = W * 0.55
  const left = ids.slice().sort((x, y) => rk0(x) - rk0(y)), right = ids.slice().sort((x, y) => rk(x) - rk(y))
  const yL = new Map(left.map((j, k) => [j, 32 + k * rowH])), yR = new Map(right.map((j, k) => [j, 32 + k * rowH]))
  const moved = ids.some((j) => rk(j) !== rk0(j))
  svg.append('text').attr('x', L).attr('y', 12).attr('text-anchor', 'end').attr('class', 'bh').text(t('Pre-registered weights'))
  svg.append('text').attr('x', R).attr('y', 12).attr('class', 'bh').text(moved ? t('Your weights') : t('Your weights (same)'))
  const nm = (j: number) => { const s = P.name[j]; const m = Math.max(18, Math.floor((W * 0.45) / 7.2) - 4); return s.length > m ? s.slice(0, m - 1) + '…' : s }
  const g = svg.append('g').selectAll('g').data(ids).join('g').attr('class', 'bl').style('cursor', 'pointer')
    .attr('data-tip', (j) => `<b>${esc(P.name[j])}</b><br>${t('pre-registered {a} → now {b}', { a: rk0(j), b: rk(j) })}`)
    .on('click', (_e, j) => onSelect(P.id[j]))
  g.append('line').attr('x1', L + 4).attr('x2', R - 4).attr('y1', (j) => yL.get(j)! - 4).attr('y2', (j) => yR.get(j)! - 4)
    .attr('stroke', (j) => (P.id[j] === sel ? css('--now') : Math.abs(rk(j) - rk0(j)) >= 3 ? css('--ink2') : css('--axis'))).attr('stroke-width', (j) => (P.id[j] === sel ? 2.2 : 1.2))
  g.append('text').attr('x', L).attr('y', (j) => yL.get(j)!).attr('text-anchor', 'end').text((j) => `${nm(j)}  ${rk0(j)}`)
  g.append('text').attr('x', R).attr('y', (j) => yR.get(j)!).text((j) => `${rk(j)}  ${nm(j)}`)
}

// ---------------------------------------------------------------- profile: type block, tiles, strips
export function profileFinalHtml(C: Ctx, j: number) {
  const P = C.P, FC = C.FC
  if (!FC.type[j]) return `<p class="hint">${t('Not scored in the final prioritisation: no KLH peat, or below the minimum peat area and outside the 337.')}</p>`
  const ty = FC.type[j] as string, iv = P.iv[j], M = P.meta.rule.intervention
  const ranks = P.k337[j] ? t('rank {a} of the 337 by urgency, {b} in type {ty}', { a: FC.ru337[j], b: FC.rt[j], ty }) : t('rank {a} by urgency, {b} in type {ty}', { a: FC.ru[j], b: FC.rt[j], ty })
  const cs = P.ind.canal_share?.[j], os = P.ind.open_share?.[j]
  return `<div class="pf-h"><span class="tyb big" style="--c:${typeVar(ty)}"${tipAttr(typeTip(ty))}>${ty}</span><div><b>${esc(t(TYPE_LABEL[ty]))}</b> ${ivBadge(P, iv)}<br><span class="hint">${esc(t(TYPE_NOTE[ty]))}</span>${iv && IV_NOTE[iv] ? `<br><span class="hint">${esc(t(IV_NOTE[iv], { a: Math.round(M.rewetting.min * 100), b: Math.round(M.revegetation.min * 100) }))} ${t('Canal-affected {a}, open or degraded {b}.', { a: cs != null ? pc(cs) : t('n/a'), b: os != null ? pc(os) : t('n/a') })}</span>` : ''}</div></div>
    <div class="pf-d">${finDims(P).map(([k, l]) => `<div class="pf-r"><span class="hasTip"${tipAttr(dimTip(C, k))}>${esc(t(l))}</span>${finBar(C, (FC as any)[k][j], k, j)}</div>`).join('')}</div>
    <p class="hint">${esc(ranks)} · ${t('type kept in {p}% of weight draws', { p: P.st[j] == null ? '–' : fx((P.st[j] as number) * 100, 0) })}${P.wk[j] ? ' · ' + t('no KLH peat: whole KHG used, less reliable') : ''}${P.small[j] ? ' · ' + t('small peat area: less reliable') : ''}${FC.lowf[j] ? ' · ' + t('low feasibility') : ''}${FC.hix[j] ? ' · ' + t('high exposure') : ''}${!C.atRef && C.FC0.type[j] !== ty ? ' · ' + t('type {a} at the pre-registered weights', { a: C.FC0.type[j] }) : ''}</p>`
}
export function rankTiles(C: Ctx, j: number): [string, string][] {
  const P = C.P, FC = C.FC
  if (!FC.type[j]) return [[t('n/a'), t('Rank by urgency')], [t('n/a'), t('Type')]]
  const d = ((C.FC0.ru[j] ?? 0) as number) - ((FC.ru[j] ?? 0) as number)
  return [[`${P.k337[j] ? FC.ru337[j] : FC.ru[j]}<small>${!C.atRef && d ? (d > 0 ? '▲' + d : '▼' + -d) : ''}</small>`, P.k337[j] ? t('Rank of the 337 by urgency') : t('Rank by urgency')],
    [`<span style="color:var(--ty${FC.type[j]})">${FC.type[j]}</span>`, t(TYPE_LABEL[FC.type[j] as string])]]
}
export function renderStrips(host: HTMLElement, C: Ctx, j: number, jc: number | null) {
  const P = C.P
  host.innerHTML = ''; host.classList.toggle('cmp', jc != null)
  host.insertAdjacentHTML('beforeend', `<h3 class="hasTip"${tipAttr(t('Where this KHG sits on each indicator among the KHG with at least {m} km2 of peat. Grey bars: how those KHG are spread. Marker: this KHG; ring: the KHG compared.', { m: P.meta.rule.min_peat }))}>${t('Indicators')}</h3>`)
  for (const [key, lab, dn] of finDims(P)) {
    host.insertAdjacentHTML('beforeend', `<div class="gs hasTip"${tipAttr(dimTip(C, key))}><span class="sw" style="background:var(--dim-${key})"></span>${t(lab)}</div>`)
    for (const k of Object.keys(P.meta.rule.dims[dn])) {
      const x = P.ind[k]; if (!x) continue
      const vals: number[] = []; for (let a = 0; a < x.length; a++) if (P.pool[a] && x[a] != null) vals.push(x[a] as number); vals.sort(d3.ascending)
      const v = x[j], vc = jc != null ? x[jc] : null, m = IND[k] || [k, '', (z: number) => fx(z, 2)]
      const row = document.createElement('div'); row.className = 'strip'
      row.innerHTML = `<span class="t hasTip"${tipAttr(indTip(P, k))}>${esc(t(m[0]))}<b>w ${fmt(C.w[k], 1)}</b></span><svg></svg><span class="n">${v == null ? t('n/a') : m[2](v)}${jc != null ? `<span class="cv"><i></i>${vc == null ? t('n/a') : m[2](vc)}</span>` : ''}</span>`
      host.appendChild(row)
      const svgEl = row.querySelector('svg')!, svg = d3.select(svgEl); const W = svgEl.clientWidth || 240; svg.attr('viewBox', `0 0 ${W} 22`)
      if (vals.length < 2) continue
      const lo = d3.quantileSorted(vals, 0.02)!, hi = d3.quantileSorted(vals, 0.98)!, sx = d3.scaleLinear([lo, Math.max(hi, lo + 1e-9)], [4, W - 4]).clamp(true)
      const bins = d3.bin().domain(sx.domain() as [number, number]).thresholds(28)(vals.map((a) => Math.min(Math.max(a, lo), hi))); const mx = d3.max(bins, (b) => b.length)!
      svg.append('g').selectAll('rect').data(bins).join('rect').attr('x', (b) => sx(b.x0!)).attr('width', (b) => Math.max(1, sx(b.x1!) - sx(b.x0!) - 1))
        .attr('y', (b) => 20 - 18 * Math.sqrt(b.length / mx)).attr('height', (b) => 18 * Math.sqrt(b.length / mx)).attr('fill', css('--axis')).attr('opacity', 0.7)
      if (vc != null) svg.append('circle').attr('cx', sx(vc)).attr('cy', 11).attr('r', 5).attr('fill', 'none').attr('stroke', css('--cmp')).attr('stroke-width', 1.8)
      if (v != null) {
        svg.append('rect').attr('x', sx(v) - 1.5).attr('y', 1).attr('width', 3).attr('height', 20).attr('fill', css('--now'))
        const p = (d3.bisectLeft(vals, v) + d3.bisectRight(vals, v)) / 2 / vals.length
        svgEl.dataset.tip = `<b>${esc(t(m[0]))}: ${m[2](v)}</b><br>${t('Higher than {p}% of the KHG with at least {m} km2 of peat.', { p: fx(100 * p, 0), m: P.meta.rule.min_peat })}${vc != null && jc != null ? `<br>${esc(P.name[jc])}: ${m[2](vc)}` : ''}`
      }
    }
  }
}

// ---------------------------------------------------------------- charts
type LineOpts = { data: [number, number][]; cmp?: [number, number][] | null; names?: [string, string]; color: string; partial?: number; unit: string; nd: number; ticks?: number[]; tickFmt?: (v: number) => string; xdom?: [number, number] }
export function lineChart(host: HTMLElement, o: LineOpts) {
  const B = o.cmp && o.cmp.length ? o.cmp : null, W = host.clientWidth || 300, H = 128, m = { l: 34, r: B ? 84 : 14, t: 8, b: 20 }; host.innerHTML = ''
  if (!o.data || !o.data.length) { host.innerHTML = `<p class="hint">${t('No data')}</p>`; return }
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
  const both = B ? o.data.concat(B) : o.data, xs = both.map((d) => d[0]), x = d3.scaleLinear(o.xdom || [d3.min(xs)!, d3.max(xs)!], [m.l, W - m.r])
  const ymax = d3.max(both, (d) => d[1]) || 1, y = d3.scaleLinear([0, ymax * 1.08], [H - m.b, m.t]).nice(3)
  const col = css(o.color), ccol = css('--cmp')
  svg.append('g').attr('class', 'gridl').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W - m.l - m.r)).tickFormat(() => ''))
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(6).tickFormat((v) => fmt(+v, +v < 10 && +v % 1 ? 1 : 0)))
  svg.select('.axis path').remove()
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(o.ticks || x.ticks(4)).tickFormat((v) => (o.tickFmt ? o.tickFmt(+v) : d3.format('d')(+v))).tickSize(3))
  const line = d3.line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))
  const draw = (data: [number, number][], c: string, area: boolean) => {
    const full = o.partial ? data.filter((d) => d[0] < o.partial!) : data; if (!full.length) return null
    if (area) svg.append('path').datum(full).attr('d', d3.area<[number, number]>().x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1]))).attr('fill', c).attr('opacity', 0.1)
    svg.append('path').datum(full).attr('d', line).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    if (o.partial) {
      const pi = data.findIndex((d) => d[0] === o.partial); if (pi > 0) svg.append('path').datum([data[pi - 1], data[pi]]).attr('d', line).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('stroke-dasharray', '3 3')
      const pd = data[pi]; if (pd) svg.append('circle').attr('cx', x(pd[0])).attr('cy', y(pd[1])).attr('r', 4).attr('fill', css('--surface')).attr('stroke', c).attr('stroke-width', 2)
    }
    const last = full[full.length - 1]
    svg.append('circle').attr('cx', x(last[0])).attr('cy', y(last[1])).attr('r', 4).attr('fill', c).attr('stroke', css('--surface')).attr('stroke-width', 2)
    return data[data.length - 1]
  }
  if (B) draw(B, ccol, false)
  const endA = draw(o.data, col, true)
  if (B && o.names && endA) {
    const ends = ([[endA, o.names[0], col], [B[B.length - 1], o.names[1], ccol]] as [[number, number], string, string][]).map(([d, n]) => { n = n.replace(/Sungai /g, '').split(' - ')[0]; return { y: y(d[1]), n: n.length > 12 ? n.slice(0, 11) + '…' : n } })
    if (Math.abs(ends[0].y - ends[1].y) < 12) { const mid = (ends[0].y + ends[1].y) / 2, up = ends[0].y <= ends[1].y ? 0 : 1; ends[up].y = mid - 6; ends[1 - up].y = mid + 6 }
    svg.append('g').selectAll('text').data(ends).join('text').attr('x', W - m.r + 16).attr('y', (d) => d.y + 4).attr('fill', css('--ink2')).attr('font-size', 11).text((d) => d.n)
  }
  const mx = d3.maxIndex(o.data, (d) => d[1]), pk = o.data[mx]
  if (!B && pk && pk[1] > 0) svg.append('text').attr('x', Math.min(W - m.r - 2, Math.max(m.l + 2, x(pk[0])))).attr('y', y(pk[1]) - 5).attr('text-anchor', x(pk[0]) > W - 60 ? 'end' : x(pk[0]) < m.l + 30 ? 'start' : 'middle').attr('fill', css('--ink2')).attr('font-size', 11).text(fmt(pk[1], o.nd) + o.unit)
  const dot = svg.append('circle').attr('r', 4.5).attr('fill', col).attr('stroke', css('--surface')).attr('stroke-width', 2).style('display', 'none')
  const dotB = B ? svg.append('circle').attr('r', 4.5).attr('fill', ccol).attr('stroke', css('--surface')).attr('stroke-width', 2).style('display', 'none') : null
  const years = [...new Set(both.map((d) => d[0]))].sort((p, q) => p - q), step = (W - m.l - m.r) / Math.max(1, years.length - 1)
  const at = (a: [number, number][], yr: number) => a.find((d) => d[0] === yr)
  svg.append('g').selectAll('rect').data(years).join('rect').attr('x', (yr) => x(yr) - step / 2).attr('width', step).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .attr('data-tip', (yr) => {
      const a = at(o.data, yr), b = B ? at(B, yr) : null
      const row = (nm: string | undefined, d: [number, number] | null | undefined) => (d ? (B ? `${esc(nm)} ` : '') + `${fmt(d[1], o.nd)}${o.unit}` : null)
      return `<b>${o.tickFmt ? o.tickFmt(yr) : yr}${o.partial && yr === o.partial ? ' ' + t('(partial year)') : ''}</b>` + [row(o.names?.[0], a), B ? row(o.names?.[1], b) : null].filter(Boolean).map((r) => '<br>' + r).join('')
    })
    .on('mousemove', (_e, yr) => {
      const a = at(o.data, yr), b = B ? at(B, yr) : null
      dot.style('display', a ? (null as any) : 'none'); if (a) dot.attr('cx', x(yr)).attr('cy', y(a[1]))
      if (dotB) { dotB.style('display', b ? (null as any) : 'none'); if (b) dotB.attr('cx', x(yr)).attr('cy', y(b[1])) }
    })
    .on('mouseleave', () => { dot.style('display', 'none'); if (dotB) dotB.style('display', 'none') })
}
const HEAT = { light: ['#f6f0e8', '#fdcc8a', '#fc8d59', '#e34a33', '#7f0000'], dark: ['#6a4429', '#a45a2a', '#d06d2f', '#ee8650', '#ffd2a8'] }
export function heatMap(host: HTMLElement, items: { name: string; hm: [number, number, number, number][] }[], high: boolean, periodNow: string) {
  host.innerHTML = ''; const ramp = HEAT[isDark() ? 'dark' : 'light'], mlab = monthsShort().map((m) => m[0])
  const yrs = items.flatMap((it) => it.hm.map((r) => r[0])), y0 = 2012, y1 = Math.max(d3.max(yrs) || y0, periodNow ? new Date(periodNow).getFullYear() : y0), years = d3.range(y0, y1 + 1)
  const maps = items.map((it) => { const m = new Map<number, number>(); for (const [y, mo, nm, nh] of it.hm) m.set(y * 100 + mo, high ? nh : nm + nh); return m })
  const mx = Math.max(1, ...maps.flatMap((m) => [...m.values()]))
  const color = (n: number) => (n <= 0 ? css('--none') : ramp[Math.min(ramp.length - 1, 1 + Math.floor(Math.sqrt(n / mx) * (ramp.length - 1.001)))])
  const cw = 22, ch = 14, l = 34, tp = 14, W = l + cw * 12, H = tp + ch * years.length + 4, cur = y1
  const row = document.createElement('div'); row.className = 'hmrow'; host.appendChild(row)
  items.forEach((it, k) => {
    const box = document.createElement('div'); box.className = 'hm'; row.appendChild(box)
    if (items.length > 1) box.insertAdjacentHTML('beforeend', `<div class="lc-cap">${esc(it.name)}</div>`)
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', t('Hotspots per month and year') + ' ' + it.name)
    mlab.forEach((m, j) => svg.append('text').attr('x', l + cw * j + cw / 2).attr('y', 10).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', css('--muted')).text(m))
    years.forEach((y, r) => {
      svg.append('text').attr('x', l - 4).attr('y', tp + ch * r + ch - 3).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', y === cur ? css('--ink') : '#898781').attr('font-weight', y === cur ? 700 : 400).text(y)
      for (let j = 0; j < 12; j++) {
        const n = maps[k].get(y * 100 + j + 1) || 0
        svg.append('rect').attr('x', l + cw * j + 1).attr('y', tp + ch * r + 1).attr('width', cw - 2).attr('height', ch - 2).attr('rx', 2).attr('fill', color(n))
          .attr('data-tip', `<b>${monf(j + 1)} ${y}</b><br>${items.length > 1 ? esc(it.name) + ' ' : ''}${fmt(n, 0)}`)
      }
    })
  })
  const lg = document.createElement('div'); lg.className = 'hmleg'; lg.dataset.tip = t('Shade follows the square root of the count; 0 is grey.')
  lg.innerHTML = `<span>0</span><span class="ramp" style="background:linear-gradient(90deg,${ramp.join(',')})"></span><span>${fmt(mx, 0)}</span>`; host.appendChild(lg)
}
export function landBar(host: HTMLElement, lc: [string, number][], opt: { cap?: string; append?: boolean } = {}) {
  const W = host.clientWidth || 300, H = 26; if (!opt.append) host.innerHTML = ''
  if (opt.cap) host.insertAdjacentHTML('beforeend', `<div class="lc-cap">${esc(opt.cap)}</div>`)
  if (!lc || !lc.length) { host.insertAdjacentHTML('beforeend', `<p class="hint">${t('No data')}</p>`); return }
  const bucket: Record<string, string> = { Tree: 'Tree', Wetland: 'Wetland, water', Water: 'Wetland, water', Mangrove: 'Wetland, water' }
  const cols: Record<string, string> = { Tree: '#008300', 'Open land': isDark() ? '#c98500' : '#eda100', 'Wetland, water': isDark() ? '#9085e9' : '#6250d6' }
  const agg: Record<string, number> = {}; lc.forEach(([n, v]) => { const b = bucket[n] || 'Open land'; agg[b] = (agg[b] || 0) + v })
  const items = ['Tree', 'Open land', 'Wetland, water'].map((n) => ({ n, v: agg[n] || 0, x0: 0 })).filter((d) => d.v > 0)
  const tot = d3.sum(items, (d) => d.v); let acc = 0; const x = d3.scaleLinear([0, tot], [0, W]); items.forEach((d) => { d.x0 = acc; acc += d.v })
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
  svg.selectAll('rect').data(items).join('rect').attr('x', (d) => x(d.x0)).attr('y', 2).attr('height', 22).attr('width', (d) => Math.max(1, x(d.v) - 2)).attr('rx', 3).attr('fill', (d) => cols[d.n])
    .attr('data-tip', (d) => `<b>${t(d.n)}</b><br>${t('{v}% of the KHG', { v: fmt(d.v, 1) })}<br><span>${lc.filter((l) => (bucket[l[0]] || 'Open land') === d.n).map((l) => t(l[0]) + ' ' + fmt(l[1], 0) + '%').join(', ')}</span>`)
  const lg = document.createElement('div'); lg.className = 'legend-row'; lg.style.marginTop = '6px'
  lg.innerHTML = items.map((d) => `<span><span class="sw" style="background:${cols[d.n]}"></span>${t(d.n)} ${fmt(d.v, 0)}%</span>`).join(''); host.appendChild(lg)
}
export { mon }

// ---------------------------------------------------------------- land status of the peat and fire by land tenure
export const OVCLS: Record<string, [string, string][]> = {
  forest: [['cons', 'Conservation'], ['hl', 'Protection forest'], ['prod', 'Production forest'], ['hpk', 'Convertible production'], ['apl', 'Other land use'], ['other', 'Water, undefined'], ['none', 'Not mapped']],
  feg: [['lindung', 'Protected function'], ['budidaya', 'Cultivation function'], ['none', 'Not mapped']],
  licence: [['sawit', 'Oil palm'], ['pbph', 'Forest concession (PBPH)'], ['pphkm', 'Community forest (PPHKM)'], ['pphtr', 'Plantation forest (PPHTR)'], ['tambang', 'Mining'], ['none', 'No licence']],
  village: [['in', 'Target village'], ['out', 'Outside target villages']],
  dmpg: [['in', 'DMPG village'], ['out', 'Outside DMPG villages']],
  dmpg_prog: [['DMPG', 'DMPG'], ['DMPG and DMPM', 'DMPG and DMPM']],
  ring: [['lic', 'In a licence'], ['ring', 'Within 5 km of a licence'], ['out', 'Farther from licences']],
}
OVCLS.dmpg_forest = OVCLS.forest
export function ovColor(layer: string, c: string) {
  const d = isDark(), v = d ? '#9085e9' : '#6250d6', g = '#008300', y = d ? '#c98500' : '#eda100', m = d ? '#d55181' : '#e87ba4', r = d ? '#e66767' : '#e34948', n = d ? '#4a4a46' : '#c9c8c0', b = d ? '#5b7080' : '#9fb3c1'
  const map: Record<string, Record<string, string>> = { forest: { cons: v, hl: g, prod: y, hpk: m, apl: n, other: b, none: n }, feg: { lindung: g, budidaya: y, none: n }, licence: { sawit: y, pbph: g, pphkm: m, pphtr: v, tambang: r, none: n }, village: { in: v, out: n }, dmpg: { in: v, out: n }, dmpg_prog: { DMPG: v, 'DMPG and DMPM': m }, ring: { lic: y, ring: m, out: n } }
  map.dmpg_forest = map.forest
  return (map[layer] || {})[c] || n
}
type OvRow = { c: string; l: string; v: number[] }
function ovSeg(layer: string, rows: OvRow[], tot: number[]) {
  const mk = (k: number) => {
    const v = rows.map((r) => r.v[k]), den = Math.max(tot[k], d3.sum(v)) || 1
    return v.map((x, j) => (x > 0 ? `<i style="width:${(100 * x) / den}%;background:${ovColor(layer, rows[j].c)}"${tipAttr(`<b>${t(rows[j].l)}</b><br>${fmt(x, k === 2 ? 0 : 1)}${k === 2 ? '' : ' km2'} <span>(${fmt((100 * x) / (tot[k] || 1), 0)}% ${t(['of the peat', 'of the burned peat', 'of the hotspots'][k])})</span>`)}></i>` : '')).join('')
  }
  return [0, 1, 2].map((k) => mk(k))
}
const TNLAB: Record<string, string> = { licence: 'Business licence', forest: 'Forest area, no licence', other_land: 'Other land' }
const tnColor = (k: string) => (k === 'licence' ? (isDark() ? '#d95926' : '#eb6834') : k === 'forest' ? '#008300' : isDark() ? '#3987e5' : '#2a78d6')
export function tenureHtml(Pr: Profile, st: { high: boolean; split: boolean }) {
  const T = Pr.tn; if (!T || !T.a.length) return ''
  const key = (r: any[]) => r[0] + (st.split ? (r[2] ? ':d' : ':o') : '')
  type G = { k: string; ten: string; dm: number; peat: number; n: Map<number, number> }
  const Gm = new Map<string, G>(), get = (r: any[]) => { const k = key(r); if (!Gm.has(k)) Gm.set(k, { k, ten: r[0], dm: r[2], peat: 0, n: new Map() }); return Gm.get(k)! }
  T.a.forEach((r) => { get(r).peat += r[3] })
  T.h.forEach((r) => { if (st.high && r[4] !== 'h') return; const g = get(r); g.n.set(r[3], (g.n.get(r[3]) || 0) + r[5]) })
  const ord = Object.keys(TNLAB), rows = [...Gm.values()].filter((g) => g.peat > 0).sort((a, b) => ord.indexOf(a.ten) - ord.indexOf(b.ten) || b.dm - a.dm).map((g) => {
    const n26 = g.n.get(2026) || 0; let past = 0; for (let y = 2015; y <= 2025; y++) past += (g.n.get(y) || 0) / 11
    const r26 = (100 * n26) / g.peat, rp = (100 * past) / g.peat; return { ...g, n26, past, r26, rp, ratio: rp > 0 ? r26 / rp : null, few: g.peat < 5 || n26 + past * 11 < 20 }
  })
  if (!rows.length) return ''
  const top = d3.max(rows, (g) => Math.max(g.r26, g.rp)) || 1, end = (T.end || '').replace('-', '/')
  const lab = (g: G) => t(TNLAB[g.ten]) + (st.split ? ` <small>${t(g.dm ? 'DMPG village land' : 'Outside DMPG')}</small>` : '')
  return `<div class="ovact ov-tenure"><div class="ovhead"><h3 class="hasTip"${tipAttr(t('Hotspots on peat per 100 km2 of peat from 1 January to {d}. Bar: 2026. Tick: mean of 2015 to 2025 over the same dates. Each point of the KHG takes one class: business licence, forest area without a licence, other land. DMPG village land can fall in any class. A comparison of rates is an association; it does not show the cause of a fire or who is responsible.', { d: end }))}>${t('Fire by land tenure')}</h3>
    <label class="chk"><input type="checkbox" data-tn="split"${st.split ? ' checked' : ''}> ${t('Split by DMPG village land')}</label> <label class="chk"><input type="checkbox" data-tn="high"${st.high ? ' checked' : ''}> ${t('High confidence only')}</label></div>`
    + rows.map((g) => `<div class="ovrow" style="grid-template-columns:215px 1fr 118px;${g.few ? 'opacity:.55' : ''}"><span class="ovl">${lab(g)}</span><div class="ovbar" style="position:relative"${tipAttr(`<b>${t(TNLAB[g.ten])}</b><br>${fmt(g.peat, 0)} km2 ${t('of peat')}<br>2026: ${fmt(g.n26, 0)} ${t('hotspots')}<br>${t('Mean 2015 to 2025')}: ${fmt(g.past, 1)}`)}><i style="width:${(100 * g.r26) / top}%;background:${tnColor(g.ten)}"></i><b style="position:absolute;top:-2px;bottom:-2px;width:2px;left:${(100 * g.rp) / top}%;background:var(--ink)"></b></div><span class="ovv">${fmt(g.r26, g.r26 < 10 ? 1 : 0)} / ${fmt(g.rp, g.rp < 10 ? 1 : 0)}${g.ratio != null ? ` <b>×${fmt(g.ratio, g.ratio < 10 ? 1 : 0)}</b>` : ''}</span></div>`).join('')
    + `<p class="hint">${t('Faded rows have few detections or little peat.')} ${t('2026 / mean of 2015 to 2025, per 100 km2 of peat.')}</p></div>`
}
/** Land status of the peat: one bar triple per layer. Licence holders are not shown in this dashboard. */
export function landStatusHtml(Pr: Profile) {
  if (!Pr.ov) return ''
  const S = Pr.ov.s, fo = S.forest || [], tot = [d3.sum(fo, (r) => r[2]), d3.sum(fo, (r) => r[3]), d3.sum(fo, (r) => r[4])]
  const val = (layer: string, c: string) => { const r = (S[layer] || []).find((x) => x[0] === c); return r ? [r[2], r[3], r[4]] : [0, 0, 0] }
  const mkRows = (layer: string, codes: string[]): OvRow[] => codes.map((c) => ({ c, l: (OVCLS[layer].find((a) => a[0] === c) || [0, c])[1] as string, v: val(layer, c) }))
  const groups: { layer: string; title: string; tip: string; rows: OvRow[] }[] = []
  groups.push({ layer: 'forest', title: 'Forest area function', tip: "Forest area function 2023 (Kawasan Hutan, 1:250,000). Bars: the share of the KHG's peat, of the peat burned in 2015 to 2025, and of this year's hotspots on peat.", rows: mkRows('forest', OVCLS.forest.map((a) => a[0])) })
  groups.push({ layer: 'feg', title: 'Peat function', tip: "Peat ecosystem function 2017: indicative protected (Lindung) or cultivation (Budidaya). Bars: the share of the KHG's peat, of the peat burned in 2015 to 2025, and of this year's hotspots on peat.", rows: mkRows('feg', OVCLS.feg.map((a) => a[0])) })
  const lic: OvRow[] = OVCLS.licence.slice(0, 5).map(([c, l]) => ({ c, l, v: (S['licence_' + c] || [[0, 0, 0, 0, 0]])[0].slice(2, 5) }))
  const any = (S.licence_any || [[0, 0, 0, 0, 0]])[0].slice(2, 5)
  lic.push({ c: 'none', l: 'No licence', v: tot.map((x, k) => Math.max(0, x - any[k])) })
  groups.push({ layer: 'licence', title: 'Licences', tip: 'Business licences, 2025 update. Licences overlap, so the segments can add up to more than the peat; the grey segment is peat with no licence.', rows: lic })
  groups.push({ layer: 'ring', title: '5 km ring', tip: 'Peat in a licence, within 5 km of one but inside none, or farther. The three classes add up. Licences outside the KHG count when their ring reaches into it.', rows: mkRows('ring', OVCLS.ring.map((a) => a[0])) })
  groups.push({ layer: 'village', title: 'Target villages', tip: 'Village areas targeted for peat restoration in the 2026 Bluebook.', rows: [{ c: 'in', l: 'Target village', v: val('village', 'in') }, { c: 'out', l: 'Outside target villages', v: tot.map((x, k) => Math.max(0, x - val('village', 'in')[k])) }] })
  groups.push({ layer: 'dmpg', title: 'DMPG villages', tip: "Desa Mandiri Peduli Gambut villages of the SiTMAT portal (838 villages with programme and scheme year). Context, not scored. Bars: the share of the KHG's peat, of the peat burned in 2015 to 2025, and of this year's hotspots on peat.", rows: [{ c: 'in', l: 'DMPG village', v: val('dmpg', 'in') }, { c: 'out', l: 'Outside DMPG villages', v: tot.map((x, k) => Math.max(0, x - val('dmpg', 'in')[k])) }] })
  if (val('dmpg', 'in')[0] > 0) {
    groups.push({ layer: 'dmpg_prog', title: 'DMPG programme', tip: "Programme of the DMPG villages: DMPG, or DMPG together with DMPM. Share of the KHG's peat, burned peat and hotspots.", rows: mkRows('dmpg_prog', OVCLS.dmpg_prog.map((a) => a[0])) })
    groups.push({ layer: 'dmpg_forest', title: 'Kawasan hutan in DMPG villages', tip: "Forest area function of the land inside DMPG villages only: how much of the KHG's peat, burned peat and hotspots lies in village land that is also forest area. Bars are shares of the whole KHG, so they fill only as far as the villages reach.", rows: mkRows('dmpg_forest', OVCLS.forest.map((a) => a[0])) })
  }
  const rowLab = [['Peat area', "Peat area in each class, from KLH's peat land map."], ['Burned peat', 'Peat that burned at least once in 2015 to 2025 (burnt-area polygons).'], ['Hotspots this year', 'MODIS hotspots on peat this year, medium and high confidence.']]
  const totTxt = [fmt(tot[0], 0) + ' km2', fmt(tot[1], 0) + ' km2', fmt(tot[2], 0)]
  let html = `<div class="ovhead"><h3 class="hasTip"${tipAttr(t("Where the peat, the burned peat and this year's hotspots fall on each land-status layer. A segment wider in the lower bars than in the top bar means fire is over-represented in that class."))}>${t('Land status of the peat')}</h3>${Pr.ov.whole ? `<span class="hint">${t("No peat in KLH's peat map: the whole KHG is counted as peat, as in the ranking.")}</span>` : ''}</div><div class="ovgrid">`
  groups.forEach((g) => {
    const rows = g.rows.filter((r) => (r.v[0] >= 0.002 * tot[0] || r.v[1] > 0 || r.v[2] > 0) && r.v[0] + r.v[1] + r.v[2] > 0); if (!rows.length) return
    const bars = ovSeg(g.layer, rows, tot)
    html += `<div class="ovg"><div class="ovt hasTip"${tipAttr(t(g.tip))}>${t(g.title)}</div><div class="ovleg">${rows.map((r) => `<span><span class="sw" style="background:${ovColor(g.layer, r.c)}"></span>${t(r.l)}${tot[0] ? ` <small>${fmt((100 * r.v[0]) / tot[0], 0)}%</small>` : ''}</span>`).join('')}</div>`
      + [0, 1, 2].map((k) => `<div class="ovrow"><span class="ovl hasTip"${tipAttr(t(rowLab[k][1]))}>${t(rowLab[k][0])}</span><div class="ovbar">${bars[k]}</div><span class="ovv">${totTxt[k]}</span></div>`).join('') + '</div>'
  })
  return html + '</div>'
}
export function villagesHtml(Pr: Profile) {
  const V = Pr.ov?.v || []
  if (!V.length) return ''
  return `<div class="ovact ov-vil"><div class="ovt hasTip"${tipAttr(t('DMPG villages that reach into this KHG, by area inside it. Area, peat, burned peat (2015 to 2025) and hotspots this year are counted inside the KHG only.'))}>${t('DMPG villages')} <small>${V.length}</small></div><div class="tablewrap" style="max-height:300px"><table class="t4"><thead><tr><th>${t('Village')}</th><th>${t('Sub-district')}</th><th>${t('Programme')}</th><th>${t('Scheme')}</th><th>${t('Area km2')}</th><th>${t('Peat km2')}</th><th>${t('Burned peat km2')}</th><th>${t('Hotspots')}</th></tr></thead><tbody>`
    + V.map((v, j) => `<tr class="zr" data-i="${j}"${tipAttr(t('Click to show the village on the map.'))}><td style="text-align:left">${esc(v[0])}</td><td style="text-align:left">${esc(v[1])}</td><td style="text-align:left">${esc(String(v[2]).replace('Skema ', ''))}</td><td style="text-align:left">${esc(v[3])}</td><td>${fmt(v[4], 1)}</td><td>${fmt(v[5], 1)}</td><td>${fmt(v[6], 1)}</td><td>${fmt(v[7], 0)}</td></tr>`).join('') + '</tbody></table></div></div>'
}
export function ovTable(Pr: Profile) {
  if (!Pr.ov) return ''
  const names: Record<string, string> = { forest: 'Forest area function', feg: 'Peat function', village: 'Target villages', dmpg: 'DMPG villages', dmpg_prog: 'DMPG programme', dmpg_forest: 'Kawasan hutan in DMPG villages', ring: '5 km ring' }
  let rows = ''
  for (const [layer, arr] of Object.entries(Pr.ov.s)) {
    const base = layer.startsWith('licence_') ? 'licence' : layer, lb = layer === 'licence_any' ? t('Any licence') : null
    arr.forEach((r) => { const l = lb || t(((OVCLS[base] || []).find((a) => a[0] === r[0]) || [0, r[0]])[1] as string); rows += `<tr><td style="text-align:left">${t(names[layer] || 'Licences')}</td><td style="text-align:left">${esc(l)}</td><td>${fmt(r[1], 1)}</td><td>${fmt(r[2], 1)}</td><td>${fmt(r[3], 1)}</td><td>${fmt(r[4], 0)}</td></tr>` })
  }
  return `<table class="dt wide"><thead><tr><th style="text-align:left">${t('Layer')}</th><th style="text-align:left">${t('Class')}</th><th>${t('Area km2')}</th><th>${t('Peat km2')}</th><th>${t('Burned peat km2')}</th><th>${t('Hotspots')}</th></tr></thead><tbody>${rows}</tbody></table>`
}
export function yearTable(Pr: Profile, name: string | null) {
  const yrs = [...new Set([...Pr.burned.map((d) => d[0]), ...Pr.hs.map((d) => d[0]), ...Pr.deficit.map((d) => d[0])])].sort()
  const get = (a: [number, number][], y: number) => { const f = a.find((d) => d[0] === y); return f ? f[1] : '–' }
  return `<table class="dt">${name ? `<caption>${esc(name)}</caption>` : ''}<thead><tr><th>${t('Year')}</th><th${tipAttr(t("Burnt-area polygons. Share of the KHG's peat burned in the year, in %."))}>${t('Burned % of peat')}</th><th${tipAttr(t('FIRMS VIIRS S-NPP hotspots on peat, count.'))}>${t('Hotspots VIIRS')}</th><th${tipAttr(t('TerraClimate dry-season water deficit, mm.'))}>${t('Deficit mm')}</th><th${tipAttr(t('TerraClimate rainfall June to October, mm.'))}>${t('Rain Jun-Oct mm')}</th></tr></thead><tbody>${yrs.map((y) => `<tr><td>${y}</td><td>${get(Pr.burned, y)}</td><td>${get(Pr.hs, y)}</td><td>${get(Pr.deficit, y)}</td><td>${get(Pr.rain, y)}</td></tr>`).join('')}</tbody></table>`
}
export function monthTable(Pr: Profile, name: string | null) {
  return `<table class="dt">${name ? `<caption>${esc(name)}</caption>` : ''}<thead><tr><th>${t('Month 2026')}</th><th${tipAttr(t('MODIS hotspots on peat, medium and high confidence, count.'))}>${t('On peat')}</th><th${tipAttr(t('The same hotspots anywhere in the KHG, count.'))}>${t('In KHG')}</th></tr></thead><tbody>${Pr.now_m.map((m) => `<tr><td>${mon(m[0])}</td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody></table>`
}
export { confChar, confName, IV_ORDER, TYPE_ORDER }
