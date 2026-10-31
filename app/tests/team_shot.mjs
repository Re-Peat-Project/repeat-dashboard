// usage: node tests/team_shot.mjs [code] [label]   screenshot of a team variant in the Interventions mode
import { chromium } from 'playwright-core'
const [code = '16.02.01', label = 'DEMNAS (full sub-KHG)'] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
await p.goto(`http://localhost:5173/#/khg/${code}`)
await p.waitForTimeout(2500)
await p.getByRole('button', { name: label, exact: true }).click()
await p.getByRole('tab', { name: 'Interventions', exact: true }).click()
await p.waitForTimeout(6000)
await p.screenshot({ path: `tests/screenshots/team_${code}.png` })
await b.close()
