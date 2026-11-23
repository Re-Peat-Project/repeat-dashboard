// The live scoring of the prioritisation pages must reproduce the pipeline (repeat-national-final) at the pre-registered weights:
// type, urgency rank, rank among the 337 and rank within the type, for every KHG. Reads the tables of pipeline/build_priority.py.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const DIR = join(import.meta.dirname, '..', 'public', 'data', 'priority')
const have = existsSync(join(DIR, 'khg_profile.csv'))


describe.skipIf(!have)('priority scoring', () => {
  let core: typeof import('../src/priority/core')
  beforeAll(async () => {
    const g = globalThis as any
    g.localStorage ??= { getItem: () => null, setItem: () => {} }
    g.matchMedia ??= () => ({ matches: false })
    g.document ??= { documentElement: { dataset: {} } }
    core = await import('../src/priority/core')
  }, 120_000)
  const load = () => {
    const rows = core.parseCsv(readFileSync(join(DIR, 'khg_profile.csv'), 'utf8'), 'khg_profile')
    const meta = JSON.parse(readFileSync(join(DIR, 'priority_meta.json'), 'utf8'))
    return core.buildPD(rows, meta)
  }

  it('codes stay text', () => {
    const P = load()
    expect(P.id.every((c) => typeof c === 'string')).toBe(true)
    expect(P.idx.size).toBe(P.n)
  })

  it('reproduces type and ranks at the pre-registered weights', () => {
    const P = load()
    const r = core.finCompute(P, core.refW(P), { missing: 'skip', conf: 'mh' })
    const diff: string[] = []
    for (let j = 0; j < P.n; j++) {
      const a = [r.type[j] ?? null, r.ru[j] ?? null, r.ru337[j] ?? null, r.rt[j] ?? null], b = [P.type[j] ?? null, P.ru[j] ?? null, P.k337[j] ? P.ru337[j] : null, P.rt[j] ?? null]
      if (!P.k337[j]) a[2] = null
      if (a.some((x, k) => x !== b[k])) diff.push(`${P.id[j]} page ${a.join('/')} pipeline ${b.join('/')}`)
    }
    expect(diff.slice(0, 10)).toEqual([])
  })

  it('every scored indicator has a label', () => {
    const P = load()
    for (const d of Object.values(P.meta.rule.dims)) for (const k of Object.keys(d)) expect(core.IND[k], k).toBeTruthy()
  })
})
