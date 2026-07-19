// ③ 3D 완성 미리보기 — 실시간 뷰포트(전면 반구) + 패스트레이싱 렌더 + PNG 저장
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useProject, useSettings } from '../state/store'
import { fullPalette } from '../lib/palette'
import { buildBeadCurtain, buildScenario } from '../lib/scene3d'
import type { ScenarioKind } from '../lib/scene3d'
import { saveFiles, dateStamp } from '../lib/export'

type Phase = 'view' | 'rendering' | 'done'
// SSAA(슈퍼샘플)로 사진급 안티에일리어싱 — 목표 해상도의 ssaa배로 렌더 후 다운스케일
interface Quality { key: string; label: string; w: number; h: number; ssaa: number }
const QUALITIES: Quality[] = [
  { key: 'std', label: '표준', w: 1280, h: 720, ssaa: 2 },
  { key: 'high', label: '고품질', w: 1920, h: 1080, ssaa: 2 },
  { key: 'max', label: '최고', w: 2560, h: 1440, ssaa: 3 },
]
const SCENARIOS: { key: ScenarioKind; label: string }[] = [
  { key: 'window', label: '창가(역광)' },
  { key: 'wall', label: '벽면' },
  { key: 'studio', label: '스튜디오' },
]

export default function Render3D() {
  const grid = useProject((s) => s.grid)
  const W = useProject((s) => s.W)
  const H = useProject((s) => s.H)
  const go = useProject((s) => s.go)
  const customColors = useSettings((s) => s.customColors)
  const diameterMm = useSettings((s) => s.diameterMm)
  const palette = useMemo(() => fullPalette(customColors), [customColors])

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [scenario, setScenario] = useState<ScenarioKind>('window')
  const [wallColor, setWallColor] = useState('#efe7db')
  const [quality, setQuality] = useState('high')
  const [phase, setPhase] = useState<Phase>('view')
  const [rendUrl, setRendUrl] = useState<string | null>(null)
  const [stats, setStats] = useState<{ beads: number; colors: number } | null>(null)
  const [webglOk, setWebglOk] = useState(true)
  const [savedMsg, setSavedMsg] = useState('')

  // three 객체(리렌더에 안 태우려고 ref 보관)
  const three = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    curtain: ReturnType<typeof buildBeadCurtain>
    scen: ReturnType<typeof buildScenario> | null
    raf: number
    needsRender: boolean
    rendering: boolean
    curtainH: number
  } | null>(null)
  const rendBlob = useRef<Blob | null>(null)

  // ── 씬 1회 구성 ──
  useEffect(() => {
    if (!grid || !canvasRef.current || !wrapRef.current) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, preserveDrawingBuffer: true })
    } catch {
      setWebglOk(false)
      return
    }
    if (!renderer.capabilities.isWebGL2) {
      setWebglOk(false)
      renderer.dispose()
      return
    }
    const { clientWidth: cw, clientHeight: ch } = wrapRef.current
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(cw, ch, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0

    const scene = new THREE.Scene()
    const curtain = buildBeadCurtain(grid, W, H, palette, diameterMm)
    scene.add(curtain.group)
    setStats({ beads: curtain.stats.beads, colors: curtain.stats.colors })
    const curtainH = curtain.stats.hMeters * 1000

    const camera = new THREE.PerspectiveCamera(35, cw / ch, 1, 100000)
    camera.position.set(0, curtainH * 0.15, curtainH * 1.6)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = curtainH * 0.5
    controls.maxDistance = curtainH * 3.5
    // 전면 반구 제한 (벽걸이라 뒷면 불필요)
    controls.minAzimuthAngle = -Math.PI * 0.42
    controls.maxAzimuthAngle = Math.PI * 0.42
    controls.minPolarAngle = Math.PI * 0.28
    controls.maxPolarAngle = Math.PI * 0.62
    controls.update()

    const scen = buildScenario(scene, renderer, scenario, curtainH, wallColor)

    const state = {
      renderer, scene, camera, controls, curtain, scen,
      raf: 0, needsRender: true, rendering: false, curtainH,
    }
    three.current = state
    controls.addEventListener('change', () => { state.needsRender = true })

    // 실시간 렌더 루프 (on-demand: 움직일 때만)
    const loop = () => {
      state.raf = requestAnimationFrame(loop)
      if (state.rendering) return // 고해상도 렌더 중엔 실시간 루프 정지
      if (state.needsRender) {
        controls.update()
        renderer.render(scene, camera)
        state.needsRender = false
      }
    }
    loop()

    const onResize = () => {
      if (!wrapRef.current || state.rendering) return
      const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      state.needsRender = true
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(wrapRef.current)

    return () => {
      cancelAnimationFrame(state.raf)
      ro.disconnect()
      scen.dispose()
      curtain.dispose()
      controls.dispose()
      renderer.dispose()
      three.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 시나리오/벽색 변경 → 조명 재구성 ──
  useEffect(() => {
    const st = three.current
    if (!st || phase !== 'view') return
    st.scen?.dispose()
    st.scen = buildScenario(st.scene, st.renderer, scenario, st.curtainH, wallColor)
    st.needsRender = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, wallColor])

  // 고품질 렌더: 목표 해상도의 ssaa배로 오프스크린 렌더 → 다운스케일(SSAA) → PNG
  const startRender = async () => {
    const st = three.current
    if (!st) return
    const q = QUALITIES.find((x) => x.key === quality)!
    // 아이패드 등 메모리 제약: 초대형 버퍼는 ssaa 낮춤
    const maxDim = q.w * q.ssaa
    const ssaa = maxDim > 4200 && !/Win|Mac/.test(navigator.platform) ? 2 : q.ssaa
    const rw = q.w * ssaa, rh = q.h * ssaa

    st.rendering = true
    setPhase('rendering')
    setRendUrl(null)
    // 렌더 오버레이가 먼저 그려지도록 양보
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))

    const target = new THREE.WebGLRenderTarget(rw, rh, {
      samples: 4, // MSAA + 아래 SSAA 다운스케일 = 매우 깨끗한 경계
      colorSpace: THREE.SRGBColorSpace,
    })
    try {
      st.camera.aspect = q.w / q.h
      st.camera.updateProjectionMatrix()
      st.renderer.setRenderTarget(target)
      st.renderer.render(st.scene, st.camera)
      st.renderer.setRenderTarget(null)

      // 고해상도 픽셀 읽기
      const buf = new Uint8Array(rw * rh * 4)
      st.renderer.readRenderTargetPixels(target, 0, 0, rw, rh, buf)

      // ssaa배 → 목표 해상도로 다운스케일 (2D 캔버스 고품질 리샘플)
      const hi = document.createElement('canvas')
      hi.width = rw; hi.height = rh
      const hctx = hi.getContext('2d')!
      const img = hctx.createImageData(rw, rh)
      // WebGL은 아래가 원점 → 상하 뒤집기
      for (let y = 0; y < rh; y++) {
        const src = (rh - 1 - y) * rw * 4
        const dst = y * rw * 4
        img.data.set(buf.subarray(src, src + rw * 4), dst)
      }
      hctx.putImageData(img, 0, 0)

      const out = document.createElement('canvas')
      out.width = q.w; out.height = q.h
      const octx = out.getContext('2d')!
      octx.imageSmoothingEnabled = true
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(hi, 0, 0, q.w, q.h)

      const blob = await new Promise<Blob | null>((r) => out.toBlob((b) => r(b), 'image/png'))
      rendBlob.current = blob
      setRendUrl(blob ? URL.createObjectURL(blob) : null)
      setPhase('done')
    } catch {
      setWebglOk(false)
    } finally {
      target.dispose()
      // 뷰포트 복구
      if (wrapRef.current) {
        const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight
        st.renderer.setSize(w, h, false)
        st.camera.aspect = w / h
        st.camera.updateProjectionMatrix()
      }
      st.rendering = false
      st.needsRender = true
    }
  }

  const resetViewport = () => {
    if (rendUrl) URL.revokeObjectURL(rendUrl)
    setRendUrl(null)
    rendBlob.current = null
    setPhase('view')
    const st = three.current
    if (st) st.needsRender = true
  }

  const savePng = async () => {
    const blob = rendBlob.current
    if (!blob) return
    const how = await saveFiles([{ blob, name: `비즈발_3D렌더_${dateStamp()}.png` }])
    setSavedMsg(how === 'shared' ? '공유 창에서 "이미지 저장"을 누르면 사진앱에 저장돼요.' : '이미지를 저장했어요.')
    setTimeout(() => setSavedMsg(''), 4000)
  }

  if (!grid) return <p className="pad">먼저 사진을 변환해 주세요.</p>
  if (!webglOk) {
    return (
      <div className="pad">
        <p>이 브라우저에서는 3D 렌더를 사용할 수 없어요 (WebGL2 미지원).</p>
        <p className="muted">최신 사파리·크롬으로 열거나, 다른 기기에서 시도해 주세요.</p>
        <button className="btn-secondary" onClick={() => go('convert')}>← 돌아가기</button>
      </div>
    )
  }

  const rendering = phase === 'rendering'

  return (
    <div className="render3d">
      <div className="r3d-viewport" ref={wrapRef}>
        <canvas ref={canvasRef} className="r3d-canvas" style={{ display: phase === 'done' ? 'none' : 'block' }} />
        {phase === 'done' && rendUrl && <img className="r3d-result" src={rendUrl} alt="3D 렌더 결과" />}
        {rendering && (
          <div className="r3d-overlay">
            <div className="r3d-progress-card">
              <strong>고품질 렌더링 중…</strong>
              <div className="r3d-spinner" />
              <span className="muted">잠시만요, 사진급으로 굽는 중이에요</span>
            </div>
          </div>
        )}
      </div>

      <div className="controls r3d-panel">
        {phase === 'view' && (
          <>
            <p className="muted hint">
              드래그로 각도, 두 손가락·휠로 확대. 완성된 비즈발이 실제로 걸렸을 때 모습이에요.
              {stats && ` · 비즈 ${stats.beads.toLocaleString()}알 · ${stats.colors}색`}
            </p>
            <div className="seg-row">
              <span>상황</span>
              <div className="segmented">
                {SCENARIOS.map((s) => (
                  <button key={s.key} className={scenario === s.key ? 'on' : ''} onClick={() => setScenario(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {scenario === 'wall' && (
              <label className="field-row">
                벽 색상
                <input type="color" value={wallColor} onChange={(e) => setWallColor(e.target.value)} />
                <span className="muted">{wallColor}</span>
              </label>
            )}
            <div className="seg-row">
              <span>화질</span>
              <div className="segmented">
                {QUALITIES.map((q) => (
                  <button key={q.key} className={quality === q.key ? 'on' : ''} onClick={() => setQuality(q.key)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted hint">
              {(() => { const q = QUALITIES.find((x) => x.key === quality)!; return `${q.w}×${q.h} · ${q.ssaa}× 슈퍼샘플 · 물리기반 재질(투과·오로라)` })()}
            </p>
          </>
        )}
        {phase === 'done' && (
          <p className="muted hint">렌더 완료! [PNG 저장]으로 사진앱/파일에 저장하거나 [다시 조정]으로 각도를 바꿀 수 있어요.</p>
        )}
      </div>

      {savedMsg && <div className="toast">{savedMsg}</div>}

      <div className="bottom-bar">
        <button className="btn-secondary" onClick={() => go('convert')} disabled={rendering}>← 나가기</button>
        {phase === 'view' && (
          <button className="btn-primary" onClick={startRender}>▶ 렌더 진행</button>
        )}
        {phase === 'done' && (
          <>
            <button className="btn-secondary" onClick={resetViewport}>다시 조정</button>
            <button className="btn-primary" onClick={savePng}>💾 PNG 저장</button>
          </>
        )}
      </div>
    </div>
  )
}
