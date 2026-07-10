// 단계별 말풍선 가이드: 대상 요소를 밝게 강조하고 말풍선으로 설명
// 말풍선 왼쪽 아래 [가이드 종료], 오른쪽 아래 [이전][다음]
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GuideStep } from '../lib/guides'

interface Props {
  steps: GuideStep[]
  onClose: () => void
}

interface Hole {
  top: number
  left: number
  w: number
  h: number
}

const PAD = 6 // 강조 링 여백

export default function GuideTour({ steps, onClose }: Props) {
  const [idx, setIdx] = useState(0)
  const [hole, setHole] = useState<Hole | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [bubbleH, setBubbleH] = useState(160)
  const step = steps[idx]

  // 대상 요소를 화면 중앙으로 스크롤 후 위치 측정
  useEffect(() => {
    let dead = false
    const measure = () => {
      if (dead) return
      if (!step.target) {
        setHole(null)
        return
      }
      const el = document.querySelector(step.target)
      if (!el) {
        setHole(null)
        return
      }
      const r = el.getBoundingClientRect()
      setHole({
        top: Math.max(0, r.top - PAD),
        left: Math.max(0, r.left - PAD),
        w: Math.min(window.innerWidth, r.width + PAD * 2),
        h: r.height + PAD * 2,
      })
    }
    const el = step.target ? document.querySelector(step.target) : null
    if (el) {
      // details 안에 숨어있으면 펼침
      let p = el.parentElement
      while (p) {
        if (p instanceof HTMLDetailsElement) p.open = true
        p = p.parentElement
      }
      el.scrollIntoView({ block: 'center' })
    }
    measure()
    const t = setTimeout(measure, 350) // 스크롤 안정화 후 재측정
    window.addEventListener('resize', measure)
    return () => {
      dead = true
      clearTimeout(t)
      window.removeEventListener('resize', measure)
    }
  }, [idx, step.target])

  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight)
  }, [idx, hole])

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 말풍선 위치: 대상 아래 공간이 부족하면 위로
  let bubbleStyle: React.CSSProperties
  if (hole) {
    const below = hole.top + hole.h + 12
    const fitsBelow = below + bubbleH + 12 < vh
    const top = fitsBelow ? below : Math.max(12, hole.top - bubbleH - 12)
    const width = Math.min(330, vw - 24)
    const left = Math.min(Math.max(12, hole.left + hole.w / 2 - width / 2), vw - width - 12)
    bubbleStyle = { top, left, width }
  } else {
    const width = Math.min(330, vw - 24)
    bubbleStyle = { top: '38%', left: (vw - width) / 2, width }
  }

  return (
    <div className="guide-root">
      {/* 어둡게: 대상 주변 4분할 (대상 자리는 밝게 남김) */}
      {hole ? (
        <>
          <div className="guide-dim" style={{ top: 0, left: 0, width: '100%', height: hole.top }} />
          <div className="guide-dim" style={{ top: hole.top + hole.h, left: 0, width: '100%', bottom: 0 }} />
          <div className="guide-dim" style={{ top: hole.top, left: 0, width: hole.left, height: hole.h }} />
          <div
            className="guide-dim"
            style={{ top: hole.top, left: hole.left + hole.w, right: 0, height: hole.h }}
          />
          <div
            className="guide-ring"
            style={{ top: hole.top, left: hole.left, width: hole.w, height: hole.h }}
          />
        </>
      ) : (
        <div className="guide-dim" style={{ inset: 0 }} />
      )}

      <div ref={bubbleRef} className="guide-bubble" style={bubbleStyle}>
        <div className="guide-progress">
          {idx + 1} / {steps.length}
        </div>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        <div className="guide-btns">
          <button className="btn-ghost guide-quit" onClick={onClose}>
            가이드 종료
          </button>
          <div className="guide-nav">
            <button
              className="btn-sm btn-secondary"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              이전
            </button>
            {idx < steps.length - 1 ? (
              <button className="btn-sm btn-primary" onClick={() => setIdx((i) => i + 1)}>
                다음
              </button>
            ) : (
              <button className="btn-sm btn-primary" onClick={onClose}>
                완료
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
