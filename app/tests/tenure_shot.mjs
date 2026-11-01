// usage: node tests/tenure_shot.mjs [code]   screenshots of the tenure panel (KHG Land mode) and the national across-KHG chart
import { chromium } from 'playwright-core'
const [code = '62.11-14.02'] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(`http://localhost:5173/#/khg/${code}?m=land`)
await p.waitForTimeout(4000)
const panel = p.locator('text=Fire by land tenure').first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
await panel.screenshot({ path: `tests/screenshots/tenure_${code}.png` })
await p.goto('http://localhost:5173/#/')
await p.waitForTimeout(4000)
const across = p.locator('text=2026 against earlier years, by land tenure').first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
await across.screenshot({ path: 'tests/screenshots/tenure_across.png' })
console.log(errs.length ? errs : 'no page errors')
await b.close()
