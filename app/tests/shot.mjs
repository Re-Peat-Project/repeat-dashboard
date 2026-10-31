// usage: node tests/shot.mjs <url> <out.png> [width] [height] [waitMs]
// Opens the page in Chrome (software WebGL), waits, prints console errors and writes a screenshot.
import { chromium } from 'playwright-core'
const [url, out, w = '1440', h = '900', wait = '9000'] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: +w, height: +h } })
const log = []
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(m.type() + ': ' + m.text().slice(0, 200)) })
p.on('pageerror', (e) => log.push('pageerror: ' + e.message))
await p.goto(url)
await p.waitForTimeout(+wait)
for (const c of (process.env.CLICK ?? '').split('|').filter(Boolean)) { await p.getByText(c, { exact: true }).first().click(); await p.waitForTimeout(4000) }
await p.screenshot({ path: out })
console.log(log.slice(0, 12).join('\n') || 'no console errors')
await b.close()
