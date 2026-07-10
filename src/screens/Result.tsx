// ③ 도안 결과: 휴대폰용 컬러 / 인쇄용 A4 / 세로 줄 순서표를 세로로 표시, 각각·모두 저장
import { useEffect, useMemo, useState } from 'react'
import { useProject, useSettings } from '../state/store'
import { fullPalette } from '../lib/palette'
import { buildLegend, strandLengths } from '../lib/pattern'
import {
  renderColorPng, renderPrintPages, renderStrandSheets,
  canvasToBlob, saveFiles, dateStamp,
} from '../lib/export'

interface OutFile {
  url: string
  blob: Blob
  name: string
}

export default function Result() {
  const grid = useProject((s) => s.grid)
  const gridVersion = useProject((s) => s.gridVersion)
  const W = useProject((s) => s.W)
  const H = useProject((s) => s.H)
  const go = useProject((s) => s.go)
  const customColors = useSettings((s) => s.customColors)
  const diameterMm = useSettings((s) => s.diameterMm)

  const palette = useMemo(() => fullPalette(customColors), [customColors])
  const [color, setColor] = useState<OutFile | null>(null)
  const [prints, setPrints] = useState<OutFile[]>([])
  const [strands, setStrands] = useState<OutFile[]>([])
  const [building, setBuilding] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const lens = useMemo(
    () => (grid ? strandLengths(grid, W, H, palette) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, W, H, palette, gridVersion],
  )

  useEffect(() => {
    if (!grid) return
    let dead = false
    const urls: string[] = []
    setBuilding(true)
    ;(async () => {
      const d = dateStamp()
      const legend = buildLegend(grid)

      const mk = async (cv: HTMLCanvasElement, name: string): Promise<OutFile> => {
        const blob = await canvasToBlob(cv)
        const url = URL.createObjectURL(blob)
        urls.push(url)
        return { url, blob, name }
      }

      const colorFile = await mk(renderColorPng(grid, W, H, palette), `비즈발_컬러_${d}.png`)
      if (dead) return
      setColor(colorFile)

      const { pages } = renderPrintPages(grid, W, H, palette, legend, diameterMm)
      const printFiles: OutFile[] = []
      for (let i = 0; i < pages.length; i++) {
        printFiles.push(
          await mk(pages[i], pages.length > 1 ? `비즈발_인쇄_A4_${d}_p${i + 1}.png` : `비즈발_인쇄_A4_${d}.png`),
        )
      }
      if (dead) return
      setPrints(printFiles)

      const sheets = renderStrandSheets(grid, W, H, palette)
      const strandFiles: OutFile[] = []
      for (let i = 0; i < sheets.length; i++) {
        strandFiles.push(
          await mk(sheets[i], sheets.length > 1 ? `비즈발_줄순서_${d}_p${i + 1}.png` : `비즈발_줄순서_${d}.png`),
        )
      }
      if (dead) return
      setStrands(strandFiles)
      setBuilding(false)
    })()
    return () => {
      dead = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, gridVersion, W, H, palette, diameterMm])

  if (!grid) return <p className="pad">먼저 사진을 변환해 주세요.</p>

  const saveGroup = async (files: OutFile[]) => {
    const how = await saveFiles(files.map(({ blob, name }) => ({ blob, name })))
    setSavedMsg(how === 'shared' ? '공유 시트에서 "이미지 저장"을 누르면 사진앱에 저장됩니다.' : '다운로드 폴더에 저장했습니다.')
    setTimeout(() => setSavedMsg(''), 4000)
  }

  const all = [...(color ? [color] : []), ...prints, ...strands]

  return (
    <div className="result">
      <div className="controls result-scroll">
        <section className="card" data-guide="out-color">
          <div className="result-head">
            <h3>① 휴대폰용 컬러 도안</h3>
            {color && <button className="btn-sm btn-secondary" onClick={() => saveGroup([color])}>저장</button>}
          </div>
          {color ? <img className="result-img" src={color.url} alt="컬러 도안" /> : <p className="muted pad">생성 중…</p>}
        </section>

        <section className="card" data-guide="out-print">
          <div className="result-head">
            <h3>② 인쇄용 A4 도안 {prints.length > 1 ? `(${prints.length}장)` : ''}</h3>
            {prints.length > 0 && (
              <button className="btn-sm btn-secondary" onClick={() => saveGroup(prints)}>저장</button>
            )}
          </div>
          <p className="muted hint">칸 색상+순번, 5칸 얇은 선·10칸 굵은 선, 네 변 좌표, 마지막 장은 범례입니다.</p>
          {prints.length > 0
            ? prints.map((f) => <img key={f.name} className="result-img" src={f.url} alt={f.name} />)
            : <p className="muted pad">{building ? '생성 중…' : ''}</p>}
        </section>

        <section className="card" data-guide="out-strand">
          <div className="result-head">
            <h3>③ 세로 줄 순서표 {strands.length > 1 ? `(${strands.length}장)` : ''}</h3>
            {strands.length > 0 && (
              <button className="btn-sm btn-secondary" onClick={() => saveGroup(strands)}>저장</button>
            )}
          </div>
          {lens && (
            <p className="muted hint">
              총 {W}줄 · 줄 길이 {(lens.minMm / 10).toFixed(1)}~{(lens.maxMm / 10).toFixed(1)}cm
              (편차 {(lens.devMm / 10).toFixed(1)}cm)
            </p>
          )}
          {strands.length > 0
            ? strands.map((f) => <img key={f.name} className="result-img" src={f.url} alt={f.name} />)
            : <p className="muted pad">{building ? '생성 중…' : ''}</p>}
        </section>
      </div>

      {savedMsg && <div className="toast">{savedMsg}</div>}

      <div className="bottom-bar" data-guide="actions">
        <button className="btn-secondary" onClick={() => go('convert')}>← 변환 설정</button>
        <button className="btn-primary" disabled={building || all.length === 0} onClick={() => saveGroup(all)}>
          {building ? '생성 중…' : `📥 모두 저장 (${all.length}개 파일)`}
        </button>
      </div>
    </div>
  )
}
