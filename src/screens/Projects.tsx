// 내 작업 목록: 저장된 작업 열기·이름 변경·파일 내보내기·삭제
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProject, useSettings } from '../state/store'
import type { SavedProject } from '../lib/db'
import { listProjects, deleteProject } from '../lib/db'
import { decodeImage } from '../lib/convert'
import { fullPalette, EMPTY } from '../lib/palette'
import { hexToRgb } from '../lib/color'
import { buildProjectFile, downloadProjectFile } from '../lib/project'

/** 도안 미니 썸네일 (1칸=1px 캔버스를 CSS로 축소) */
function PatternThumb({ entry }: { entry: SavedProject }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const customColors = useSettings((s) => s.customColors)
  const palette = useMemo(() => fullPalette(customColors), [customColors])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const grid = new Uint16Array(entry.grid)
    cv.width = entry.W
    cv.height = entry.H
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(entry.W, entry.H)
    const rgb = palette.map((c) => hexToRgb(c.hex))
    for (let i = 0; i < grid.length; i++) {
      const [r, g, b] = grid[i] === EMPTY ? [244, 240, 242] : (rgb[grid[i]] ?? [244, 240, 242])
      img.data[i * 4] = r
      img.data[i * 4 + 1] = g
      img.data[i * 4 + 2] = b
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [entry, palette])

  return <canvas ref={canvasRef} className="proj-thumb" />
}

export default function Projects() {
  const [items, setItems] = useState<SavedProject[] | null>(null)
  const restore = useProject((s) => s.restore)
  const currentId = useProject((s) => s.projectId)
  const customColors = useSettings((s) => s.customColors)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    listProjects().then(setItems).catch(() => setItems([]))
  }
  useEffect(refresh, [])

  const openEntry = async (e: SavedProject) => {
    setBusy(true)
    try {
      const res = await fetch(e.dataUrl)
      const img = await decodeImage(await res.blob())
      restore(img, e.W, e.H, new Uint16Array(e.grid), { id: e.id, name: e.name })
    } catch {
      alert('작업을 여는 데 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  const exportEntry = (e: SavedProject) => {
    const json = buildProjectFile(e.name, e.W, e.H, e.dataUrl, new Uint16Array(e.grid), customColors)
    downloadProjectFile(json, e.name)
  }

  const renameEntry = async (e: SavedProject) => {
    const name = window.prompt('작업 이름', e.name)
    if (!name?.trim()) return
    const { putProject } = await import('../lib/db')
    await putProject({ ...e, name: name.trim() })
    refresh()
  }

  const removeEntry = async (e: SavedProject) => {
    if (!window.confirm(`"${e.name}" 작업을 삭제할까요? 되돌릴 수 없어요.`)) return
    await deleteProject(e.id)
    refresh()
  }

  return (
    <div className="library">
      <div className="controls">
        <p className="muted hint pad-h">
          작업은 수정할 때마다 자동 저장됩니다. [📤 파일]로 내보내면 카톡·메일·USB로 옮겨
          다른 컴퓨터의 홈 → [작업 파일 열기]에서 이어서 할 수 있어요.
        </p>
        {items === null && <p className="muted pad">불러오는 중…</p>}
        {items?.length === 0 && (
          <p className="muted pad">아직 저장된 작업이 없어요. 사진을 변환하면 자동으로 여기에 쌓입니다.</p>
        )}
        {items?.map((e) => (
          <div key={e.id} className="card proj-row">
            <button className="proj-main" onClick={() => openEntry(e)} disabled={busy} title="열기">
              <PatternThumb entry={e} />
              <span className="proj-info">
                <strong>
                  {e.name}
                  {e.id === currentId && <span className="proj-current"> · 현재 작업</span>}
                </strong>
                <span className="muted">
                  {e.W}×{e.H}칸 · {new Date(e.savedAt).toLocaleString('ko-KR', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </span>
            </button>
            <span className="proj-actions">
              <button className="btn-ghost" onClick={() => renameEntry(e)} title="이름 바꾸기">✏️</button>
              <button className="btn-ghost" onClick={() => exportEntry(e)} title="파일로 내보내기">📤</button>
              <button className="btn-ghost" onClick={() => removeEntry(e)} title="삭제">🗑️</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
