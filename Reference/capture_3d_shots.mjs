import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('3D')); if(b) b.click() })
await page.waitForSelector('.render3d .r3d-canvas', { timeout: 15000 })
await page.waitForTimeout(1200)
const shots = [['창가','window'],['벽면','wall'],['스튜디오','studio']]
for (const [label, key] of shots) {
  await page.evaluate((l)=>{ const b=[...document.querySelectorAll('.segmented button')].find(x=>x.textContent.includes(l)); if(b) b.click() }, label)
  await page.waitForTimeout(1400)
  const vp = await page.$('.r3d-viewport')
  await vp.screenshot({ path: `C:/Users/roaeo/AppData/Local/Temp/claude/3d_${key}.png` })
  console.log('shot', key)
}
await browser.close()
