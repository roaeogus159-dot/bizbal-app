// PC 기준: 내 작업 목록 + 파일 내보내기/불러오기(다른 컴퓨터 시뮬레이션) 검증
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

// ① 샘플 변환 → 자동 저장(IndexedDB) 대기
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
await page.waitForTimeout(1500) // 자동저장 디바운스

// ② 홈 → 내 작업 목록
await page.evaluate(() => {
  const back = document.querySelector('.app-header .back')
  back.click()
})
await page.waitForSelector('.home-actions', { timeout: 10000 })
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('내 작업 목록')).click()
})
await page.waitForSelector('.proj-row', { timeout: 10000 })
const entryInfo = await page.$eval('.proj-row .proj-info', (el) => el.textContent)
await page.screenshot({ path: `${OUT}32_projects_list.png` })

// ③ 파일 내보내기 (다운로드 캡처)
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.evaluate(() => {
    document.querySelector('.proj-actions button[title="파일로 내보내기"]').click()
  }),
])
const filePath = await download.path()
const fileName = download.suggestedFilename()
const json = JSON.parse(readFileSync(filePath, 'utf8'))
const fileOk = json.app === 'bizbal' && json.version === 1 && json.W > 0 && json.gridB64.length > 0

// ④ "다른 컴퓨터" 시뮬레이션: 저장소 전부 비우고 새로 접속
await page.evaluate(async () => {
  localStorage.clear()
  const dbs = await indexedDB.databases()
  await Promise.all(dbs.map((d) => new Promise((r) => {
    const req = indexedDB.deleteDatabase(d.name)
    req.onsuccess = req.onerror = req.onblocked = r
  })))
})
await page.goto('http://localhost:5199/')
await page.waitForSelector('.home-actions', { timeout: 10000 })
const freshHome = await page.evaluate(() =>
  ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('이어하기')))

// ⑤ 작업 파일 열기
await page.setInputFiles('input[accept*=".json"]', filePath)
await page.waitForSelector('.color-list', { timeout: 20000 })
await page.waitForTimeout(400)
const sizeInfo = await page.$eval('.size-info', (el) => el.innerText)
await page.screenshot({ path: `${OUT}33_imported.png` })

// ⑥ 불러온 작업이 다시 목록에 자동 저장되는지
await page.waitForTimeout(1200)
await page.evaluate(() => document.querySelector('.app-header .back').click())
await page.waitForSelector('.home-actions', { timeout: 10000 })
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('내 작업 목록')).click()
})
await page.waitForSelector('.proj-row', { timeout: 10000 })
const importedEntry = await page.$eval('.proj-row .proj-info strong', (el) => el.textContent)

console.log(JSON.stringify({ entryInfo, fileName, fileOk, freshHome, sizeInfo, importedEntry }))
await browser.close()
