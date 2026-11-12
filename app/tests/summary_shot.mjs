// usage: node tests/summary_shot.mjs   screenshots of the national summary page (light and dark, all land and peat), with the dev server running
import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:5173/#/summary')
await p.waitForSelector('text=Concession and forest area', { timeout: 30000 })
await p.waitForTimeout(1500)
await p.screenshot({ path: 'tests/screenshots/summary_all.png', fullPage: true })
// KPI cards in one row must have equal height
const h = await p.$$eval('.grid > .card.flex.flex-col.p-3', (els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().height)))
console.log('kpi heights', h)
await p.click('button:has-text("Peat only")')
await p.waitForTimeout(800)
await p.screenshot({ path: 'tests/screenshots/summary_peat.png', fullPage: true })
await p.click('button:has-text("Dark")')
await p.click('button:has-text("Forest function")')
await p.waitForTimeout(800)
await p.screenshot({ path: 'tests/screenshots/summary_dark.png', fullPage: true })
console.log(errs.length ? errs : 'no page errors')
await b.close()
