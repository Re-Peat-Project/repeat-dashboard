// usage: node tests/investigation_shot.mjs   full-page screenshot of /investigation, cut into 1400x1800 slices
import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome' })
const p = await b.newPage({ viewport: { width: 1300, height: 1000 } })
const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:5173/#/investigation'); await p.waitForTimeout(3000)
const h = await p.evaluate(() => document.documentElement.scrollHeight)
console.log('page height', h)
for (let i = 0; i * 1800 < h && i < 8; i++) await p.screenshot({ path: `tests/screenshots/inv_${i}.png`, clip: { x: 0, y: i * 1800, width: 1300, height: Math.min(1800, h - i * 1800) }, fullPage: true })
console.log(errs.length ? errs : 'no page errors')
await b.close()
