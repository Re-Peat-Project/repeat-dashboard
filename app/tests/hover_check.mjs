// Hovers over several points of a KHG map and prints the popup text. usage: node tests/hover_check.mjs <code> [out.png]
import { chromium } from 'playwright-core'
const [code = '16.02.01', out] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
await p.goto(`http://localhost:5173/#/khg/${code}`)
await p.waitForTimeout(6000)
for (const l of ['Sub-KHG units (priority)', 'Existing canal blocks', 'Business licences 2025']) { const el = p.getByText(l, { exact: true }); if (await el.count()) await el.first().click() }
await p.waitForTimeout(3000)
const box = await p.locator('.maplibregl-canvas').boundingBox()
const seen = []
for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.4], [0.6, 0.6], [0.45, 0.65], [0.55, 0.35]]) {
  await p.mouse.move(box.x + box.width * fx, box.y + box.height * fy)
  await p.waitForTimeout(700)
  const t = await p.locator('.maplibregl-popup-content').first().innerText().catch(() => '')
  seen.push(t.replace(/\s+/g, ' ').slice(0, 260))
  if (t && out && seen.filter(Boolean).length === 1) await p.screenshot({ path: out })
}
console.log(JSON.stringify({ popups: seen, errs }, null, 1))
await b.close()
