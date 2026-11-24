import { Link } from 'react-router-dom'
import { fmt, IND, IV_SHORT, t, TYPE_LABEL, urgencyDrivers, type Profile, type ScoreOpts } from '@/priority/core'
import { typeVar, type Ctx } from '@/priority/render'

function urgencyRank({ P, FC }: Ctx, j: number) {
  const rank = P.k337[j] ? FC.ru337[j] : FC.ru[j]
  return rank == null ? '' : t(P.k337[j] ? 'Urgency rank {n} in the KLH 337' : 'Urgency rank {n} among scored KHG', { n: rank })
}

function DecisionExplanation({ C, j, compare }: { C: Ctx; j: number; compare: boolean }) {
  const { P, FC } = C
  const type = FC.type[j]
  const strategy = P.iv[j]
  const [lowerUrgency, upperUrgency] = FC.cuts.u
  const points = (value: number) => fmt(100 * value, 1)
  const upperThird = (score: number, cut: number) => t('{score}/100 · Upper third starts at {cut}', { score: points(score), cut: points(cut) })
  const belowUpperThird = (score: number, cut: number) => t('{score}/100 · Below the upper-third cutoff of {cut}', { score: points(score), cut: points(cut) })
  const urgency = FC.u[j]
  const complexity = FC.c[j]
  const stake = FC.s[j]
  const urgencyReason = urgency == null ? null
    : type === 'A' || type === 'B' ? upperThird(urgency, upperUrgency)
      : type === 'C' ? t('{score}/100 · Middle third runs from {low} to below {high}', { score: points(urgency), low: points(lowerUrgency), high: points(upperUrgency) })
        : t('{score}/100 · Below the middle-third cutoff of {cut}', { score: points(urgency), cut: points(lowerUrgency) })
  const complexityReason = complexity == null ? t('Complexity score unavailable')
    : type === 'B' ? upperThird(complexity, FC.cuts.c[1]) : belowUpperThird(complexity, FC.cuts.c[1])
  const stakeReason = stake == null ? t('Stake score unavailable')
    : type === 'D' ? upperThird(stake, FC.cuts.s[1]) : belowUpperThird(stake, FC.cuts.s[1])
  const explainComplexity = type === 'A' || type === 'B'
  const evidence = P.row[j]
  const rules = P.meta.rule.intervention
  const Heading = compare ? 'h4' : 'h3'

  return (
    <div className="min-w-0">
      {compare && <div className="mb-2">
        <h3 className="text-sm font-semibold">{P.name[j]}</h3>
        <p className="muted text-xs">{urgencyRank(C, j) || t('No urgency rank available')}</p>
      </div>}
      <div className={`grid gap-3 ${compare ? '' : 'sm:grid-cols-2'}`}>
        <div className="min-w-0 rounded-lg border border-border p-2.5">
          <Heading className="muted text-xs font-medium">{t('Why this action type')}</Heading>
          {type ? <>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <span className="tyb" style={{ backgroundColor: typeVar(type) }}>{type}</span>
              {t(TYPE_LABEL[type])}
            </div>
            <dl className="mt-2 space-y-1 text-xs">
              {urgencyReason && <div><dt className="inline font-medium">{t('Urgency')}</dt> <dd className="inline muted">· {urgencyReason}</dd></div>}
              {explainComplexity && <div><dt className="inline font-medium">{t('Complexity')}</dt> <dd className="inline muted">· {complexityReason}</dd></div>}
              {(type === 'D' || type === 'E') && <div><dt className="inline font-medium">{t('Stake')}</dt> <dd className="inline muted">· {stakeReason}</dd></div>}
            </dl>
            {type === 'B' && <p className="mt-2 text-xs">{t('Urgent action needs coordination across landholders and public agencies.')}{evidence.actor_types != null && evidence.villages != null && <> {t('The scoring data record {actors} types of actor on damaged peat and {villages} villages involved.', { actors: fmt(evidence.actor_types, 0), villages: fmt(evidence.villages, 0) })}</>}</p>}
          </> : <p className="mt-1 text-sm">{t('No action type assigned')}</p>}
        </div>
        <div className="min-w-0 rounded-lg border border-border p-2.5">
          <Heading className="muted text-xs font-medium">{t('Why this restoration strategy')}</Heading>
          {strategy ? <>
            <p className="mt-1 text-sm font-semibold">{t(IV_SHORT[strategy] ?? strategy)}</p>
            <dl className="mt-2 space-y-1 text-xs">
              {([['rewetting', 'Canal-affected peat'], ['revegetation', 'Peat needing replanting']] as const).map(([key, fallback]) => {
                const rule = rules?.[key]
                if (!rule) return null
                const value = evidence[rule.indicator]
                return <div key={key}>
                  <dt className="inline font-medium">{t(IND[rule.indicator]?.[0] ?? fallback)}</dt>{' '}
                  <dd className="inline muted">· {value == null ? t('No data for this indicator')
                    : t(value >= rule.min ? '{value}% meets the {cut}% threshold' : '{value}% is below the {cut}% threshold', { value: points(value), cut: points(rule.min) })}</dd>
                </div>
              })}
            </dl>
            {(strategy === 'rewetting' || strategy === 'rewetting and revegetation') && <p className="mt-2 text-xs">{t('Rewetting aims to slow drainage and raise the water table. Check canal conditions and water levels before choosing works.')}</p>}
          </> : <p className="mt-1 text-sm">{t('No strategy assigned')}</p>}
        </div>
      </div>
    </div>
  )
}

export function KhgDecisionBrief({ C, profile, other, options }: {
  C: Ctx; profile: Profile; other: Profile | null; options: ScoreOpts
}) {
  const { P, FC, w } = C
  const j = profile.j
  const row = P.row[j]
  const rank = P.k337[j] ? FC.ru337[j] : FC.ru[j]
  const type = FC.type[j]
  const drivers = rank == null ? [] : urgencyDrivers(P, j, w, options).filter((d) => Math.abs(d.points) >= 0.05).slice(0, 3)
  const stations = row.tma_n ?? 0
  const tenure = !other && profile.tn?.a.some((row) => row[3] > 0)
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
    <section className="card" aria-labelledby="khg-brief-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="khg-brief-title" className="text-base font-semibold">{t('Decision summary')}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {!other && rank != null && <span className="font-medium">{urgencyRank(C, j)}</span>}
          {last && <span className="muted">{t('Scoring hotspot data through {date}', { date: last.slice(0, 10) })}</span>}
        </div>
      </div>
      <div className={`mt-3 grid gap-3 ${other ? 'md:grid-cols-2' : ''}`}>
        <DecisionExplanation C={C} j={j} compare={!!other} />
        {other && <DecisionExplanation C={C} j={other.j} compare />}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <p><strong className="font-semibold">{t('Suggested next step')}</strong> · {t(next)}</p>
        <button type="button" className="font-medium underline underline-offset-2" onClick={() => jump('khg-evidence-map')}>{t('Open the evidence map')}</button>
      </div>
      <details className="mt-2 border-t border-border pt-2">
        <summary className="font-medium">{t('Supporting evidence')}</summary>
        {other && <p className="mt-2 text-sm font-semibold">{P.name[j]}</p>}
        <div className="mt-2 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <h3 className="mb-1 font-semibold">{t('Why it ranks here')}</h3>
            {rank == null && <p>{t('No urgency rank available')}</p>}
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
        </div>
      </details>
    </section>
  )
}
