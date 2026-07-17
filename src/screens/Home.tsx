import { useEffect, useRef, useState } from 'react'
import { useProject, useSettings, loadAutosave } from '../state/store'
import { decodeImage } from '../lib/convert'
import { parseProjectFile } from '../lib/project'

export default function Home() {
  const fileRef = useRef<HTMLInputElement>(null)
  const projRef = useRef<HTMLInputElement>(null)
  const setImage = useProject((s) => s.setImage)
  const restore = useProject((s) => s.restore)
  const go = useProject((s) => s.go)
  const customColors = useSettings((s) => s.customColors)
  const setSetting = useSettings((s) => s.set)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<ReturnType<typeof loadAutosave>>(null)

  useEffect(() => {
    setSaved(loadAutosave())
  }, [])

  const openImage = async (file: Blob) => {
    setBusy(true)
    try {
      const img = await decodeImage(file)
      setImage(img)
      go('convert')
    } catch {
      alert('이미지를 열 수 없습니다. 다른 사진을 선택해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void openImage(f)
    e.target.value = ''
  }

  const openSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}sample.jpg`)
    await openImage(await res.blob())
  }

  // .bizbal.json 작업 파일 열기 (다른 컴퓨터에서 카톡·메일·USB로 받은 파일)
  const onProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const parsed = parseProjectFile(await f.text(), customColors)
      if (parsed.newCustoms.length > 0) {
        setSetting('customColors', [...customColors, ...parsed.newCustoms])
      }
      const res = await fetch(parsed.dataUrl)
      const img = await decodeImage(await res.blob())
      restore(img, parsed.W, parsed.H, parsed.grid, { name: parsed.name })
    } catch (err) {
      alert(`작업 파일을 열 수 없어요: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const resumeSaved = async () => {
    if (!saved) return
    setBusy(true)
    try {
      const res = await fetch(saved.dataUrl)
      const img = await decodeImage(await res.blob())
      restore(img, saved.W, saved.H, saved.grid, { baseGrid: saved.baseGrid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home">
      <div className="home-hero">
        <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" className="home-logo" />
        <h1>비즈발 도안 생성기</h1>
        <p className="muted">
          사진을 고르면 비즈발(구슬발) 도안과<br />색상별 필요 개수를 자동으로 계산합니다
        </p>
      </div>

      <div className="home-actions">
        <button className="btn-primary btn-big" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? '여는 중…' : '📷 사진 선택'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

        {saved && (
          <button className="btn-secondary" onClick={resumeSaved} disabled={busy}>
            🕘 최근 작업 이어하기 ({saved.W}×{saved.H}칸)
          </button>
        )}
        <button className="btn-secondary" onClick={() => go('projects')}>
          📁 내 작업 목록
        </button>
        <button className="btn-secondary" onClick={() => projRef.current?.click()} disabled={busy}>
          📂 작업 파일 열기 (.bizbal)
        </button>
        <input
          ref={projRef} type="file" hidden
          accept=".json,.bizbal,application/json"
          onChange={onProjectFile}
        />
        <button className="btn-secondary" onClick={openSample} disabled={busy}>
          ✨ 샘플 사진으로 체험
        </button>
        <button className="btn-secondary" onClick={() => go('library')}>
          🎨 색상 라이브러리 (은센 85색)
        </button>
      </div>

      <p className="home-foot muted">
        모든 변환은 휴대폰 안에서 처리됩니다 · 사진이 서버로 전송되지 않아요
      </p>
    </div>
  )
}
