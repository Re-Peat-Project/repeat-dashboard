import { Link } from 'react-router-dom'
import { fmt, IND, t, TYPE_LABEL, urgencyDrivers, type Profile, type ScoreOpts } from '@/priority/core'
import type { Ctx } from '@/priority/render'

export function KhgDecisionBrief({ C, profile, compare, options }: {
  C: Ctx; profile: Profile; compare: boolean; options: ScoreOpts
}) {
  const { P, FC, w } = C
  const j = profile.j
  const row = P.row[j]
  const rank = P.k337[j] ? FC.ru337[j] : FC.ru[j]
  const type = FC.type[j]
  const drivers = rank == null ? [] : urgencyDrivers(P, j, w, options).filter((d) => Math.abs(d.points) >= 0.05).slice(0, 3)
  const stations = row.tma_n ?? 0
  const tenure = !!profile.tn && !compare
  const village = profile.ov?.v.reduce<(typeof profile.ov.v)[number] | null>((best, v) => v[7] > (best?.[7] ?? 0) ? v : best, null)
  const next = !type ? 'Review the evidence gaps before assigning a priority.'
    : type === 'D' || type === 'E' ? 'Keep the KHG under monitoring and review if fire or water levels worsen.'
      : !stations ? 'Verify water levels and recent fire locations in the field before scoping works.'
        : type === 'B' ? 'Bring village and licence representatives together to review the overlap and agree on field checks.'
          : FC.lowf[j] ? 'Check access, water supply and feasibility in the field before scoping works.'
            : 'Use the fire and canal evidence to shortlist locations for field checks and restoration scoping.'
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' })
  const last = P.meta.page.period_now

  return (
    <section className="card mb-3 p-3 sm:p-4" aria-labelledby="khg-brief-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="khg-brief-title" className="text-base font-semibold">{t('Decision summary')}{compare ? ` · ${P.name[j]}` : ''}</h2>
        {last && <span className="muted text-xs">{t('Scoring hotspot data through {date}', { date: last.slice(0, 10) })}</span>}
      </div>
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <h3 className="mb-1 font-semibold">{t('Why it ranks here')}</h3>
          <p>{rank == null ? t('No urgency rank available') : t(P.k337[j] ? 'Urgency rank {n} in the KLH 337' : 'Urgency rank {n} among scored KHG', { n: rank })}{type ? ` · ${t(TYPE_LABEL[type])}` : ''}</p>
          {!!drivers.length && <div className="muted mt-1 space-y-0.5 text-xs">
            <p>{t('Largest effects on urgency from the midpoint')}</p>
            <ul className="space-y-0.5">
              {drivers.map(({ key, value, points }) => <li key={key}>
                {t(IND[key][0])} · {IND[key][2](value)} <span className="whitespace-nowrap">({points > 0 ? '+' : ''}{fmt(points, 1)} {t('pts')})</span>
              </li>)}
            </ul>
          </div>}
        </div>
        <div>
          <h3 className="mb-1 font-semibold">{t('Where to look first')}</h3>
          <p>{village ? t('{name} had the most detections on peat among mapped DMPG villages in this KHG ({n}).', { name: village[0], n: fmt(village[7], 0) })
            : t('Check where recent detections and repeat burns overlap canal-affected peat.')}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <button type="button" className="underline underline-offset-2" onClick={() => jump('khg-evidence-map')}>{t('Open the evidence map')}</button>
            {village && <button type="button" className="underline underline-offset-2" onClick={() => {
              jump('khg-evidence-map')
              dispatchEvent(new CustomEvent('khg-zoom', { detail: village[8] }))
            }}>{t('Zoom to village')}</button>}
            {tenure && <button type="button" className="underline underline-offset-2" onClick={() => jump('khg-evidence-tenure')}>{t('Fire by land tenure')}</button>}
          </div>
        </div>
        <div>
          <h3 className="mb-1 font-semibold">{t('Evidence and gaps')}</h3>
          <p>{stations ? t('{n} SiTMAT stations in the scoring data', { n: stations }) : t('No SiTMAT stations in the scoring data')}</p>
          {P.wk[j] ? <p className="muted text-xs">{t('Whole KHG used for scoring because no KLH peat was mapped.')}</p> : null}
          {row.depth_known_share != null && <p className="muted text-xs">{t('Peat depth mapped for {n}% of peat', { n: fmt(100 * row.depth_known_share, 0) })}</p>}
          {P.st[j] != null && <p className="muted text-xs">{t('Reference action type held in {n}% of weight draws', { n: fmt(100 * P.st[j]!, 0) })}</p>}
          <Link className="mt-1 inline-block underline underline-offset-2" to={`/?v=water&khg=${encodeURIComponent(profile.lay.k)}`}>{t('Open weekly water and fire')}</Link>
        </div>
        <div>
          <h3 className="mb-1 font-semibold">{t('Suggested next step')}</h3>
          <p>{t(next)}</p>
        </div>
      </div>
    </section>
  )
}
