// Compare view, Maps panel: every layer mode on every DEM, then a screenshot of the sub-KHG units mode. usage: node tests/compare_maps_check.mjs [out.png]
import { chromium } from 'playwright-core'
const out = process.argv[2]
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 1300 } })
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
await p.goto('http://localhost:5173/#/compare')
await p.waitForTimeout(6000)
const res = {}
for (const dem of ['deltadtm', 'lidar', 'demnas']) {
  await p.getByRole('button', { name: dem, exact: true }).click()
  for (const mode of ['Satellite image only', 'DEM relief', 'Groundwater model: mean depth, dry season', 'Groundwater model: days deeper than 40 cm', 'Sub-KHG units', 'Climatic balance per sub-KHG']) {
    await p.locator('select').filter({ hasText: 'Satellite image only' }).selectOption({ label: mode })
    await p.waitForTimeout(2500)
    res[`${dem} / ${mode}`] = { canvases: await p.locator('.maplibregl-canvas').count(), notes: await p.locator('[class*="bg-black"]').count() }
  }
}
await p.getByRole('button', { name: 'deltadtm', exact: true }).click()
await p.locator('select').filter({ hasText: 'Satellite image only' }).selectOption({ label: 'Sub-KHG units' })
await p.waitForTimeout(6000)
if (out) await p.screenshot({ path: out })
console.log(JSON.stringify({ res, errs }, null, 1))
await b.close()
