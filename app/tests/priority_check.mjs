// usage: node tests/priority_check.mjs [baseUrl]
// The four sections: national profile (both views), prioritisation (parity with the pipeline), KHG profiles (with and without a
// workspace, with a comparison), KHG table. Reports page errors, console errors and failed data requests. Needs the dev server.
import { chromium } from 'playwright-core'
const base = process.argv[2] ?? 'http://localhost:5173/'
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const pages = [
  ['#/', 'hotspot detections'], ['#/?v=status', 'By concession'], ['#/priority', 'Rank shift'], ['#/table', 'KHG shown'],
  ['#/khg/16.02.01', 'Land status of the peat'], ['#/khg/14.10.03?k2=16.02.01', 'Indicators'], ['#/khg/91.18-17.01', 'Indicators'], ['#/khg/11-12.01', 'Indicators'],
]
let bad = 0
for (const [hash, text] of pages) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
  p.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/data/')) errs.push(`${r.status()} ${r.url()}`) })
  await p.goto(base + hash)
  try { await p.getByText(text, { exact: false }).first().waitFor({ timeout: 30000 }) } catch { errs.push(`"${text}" not shown`) }
  if (hash === '#/priority') { const par = await p.locator('[data-parity]').getAttribute('data-parity'); if (!/^\d+:0$/.test(par ?? '')) errs.push('parity ' + par) }
  await p.waitForTimeout(2500)
  if (errs.length) { bad++; console.log(hash, errs.slice(0, 4).join(' | ')) } else console.log(hash, 'ok')
  await p.close()
}
await b.close()
console.log(bad ? `${bad} pages with errors` : 'all pages ok')
process.exit(bad ? 1 : 0)
