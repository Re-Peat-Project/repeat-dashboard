// Opens the compare view, every panel and DEM, checks for errors, and checks that hovering one chart moves the crosshair in the others.
import { chromium } from 'playwright-core'
const base = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3]
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 1500 } })
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
await p.goto(`${base}#/compare`)
await p.waitForTimeout(6000)
const res = {}
for (const dem of ['deltadtm', 'lidar', 'demnas']) {
  await p.getByRole('button', { name: dem, exact: true }).click()
  await p.waitForTimeout(2500)
  for (const panel of ['Maps', 'Climatic balance', 'Groundwater model', 'Fire']) {
    await p.getByRole('button', { name: panel, exact: true }).click()
    await p.waitForTimeout(1200)
    res[`${dem}/${panel}`] = await p.locator('svg').count()
  }
}
await p.getByRole('button', { name: 'deltadtm', exact: true }).click()
await p.getByRole('button', { name: 'Groundwater model', exact: true }).click()
await p.waitForTimeout(1500)
const first = p.locator('svg[height="150"]').first()
const bb = await first.boundingBox()
await p.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.5)
await p.waitForTimeout(500)
const withCrosshair = await p.locator('svg[height="150"]').evaluateAll((els) => els.filter((e) => e.querySelector('circle')).length)
const total = await p.locator('svg[height="150"]').count()
if (out) await p.screenshot({ path: out })
console.log(JSON.stringify({ svgCounts: res, chartsWithCrosshair: withCrosshair, charts: total, errs }, null, 1))
await b.close()
