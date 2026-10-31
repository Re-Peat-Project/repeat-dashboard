// usage: node tests/smoke.mjs [baseUrl]
// Opens every KHG workspace, every DEM variant and every mode; reports page errors and console errors.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
const base = process.argv[2] ?? 'http://localhost:5173/'
const cat = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8'))
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let bad = 0
for (const k of cat) {
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } })
  const errs = []
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
  await p.goto(`${base}#/khg/${k.code}`)
  await p.waitForTimeout(2500)
  const mf = JSON.parse(readFileSync(new URL(`../public/data/khg/${k.code}/manifest.json`, import.meta.url), 'utf8'))
  for (const dem of k.dems) {
    await p.getByRole('button', { name: mf.dem_labels?.[dem]?.en ?? dem, exact: true }).click()
    for (const tab of ['Fire', 'Water', 'Land & accountability', 'Interventions']) {
      await p.getByRole('tab', { name: tab, exact: true }).click()
      await p.waitForTimeout(700)
    }
  }
  const blank = await p.evaluate(() => document.body.innerText.length < 80)
  if (errs.length || blank) { bad++; console.log(k.code, blank ? 'BLANK PAGE' : '', errs.slice(0, 3).join(' | ')) } else console.log(k.code, 'ok')
  await p.close()
}
await b.close()
console.log(bad ? `${bad} KHG with errors` : 'all KHG pages ok')
process.exit(bad ? 1 : 0)
