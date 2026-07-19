// 색상 라이브러리: 전체 색 보기 + 브랜드별 관리 + 팔레트 사용(일괄) + 커스텀 색 추가
import { useMemo, useState } from 'react'
import { useSettings } from '../state/store'
import type { Category, Finish, CustomColor, Brand } from '../lib/palette'
import { BASE_PALETTE, BEADPAL_PALETTE, CATEGORY_LABELS, BRANDS } from '../lib/palette'
import BeadSwatch from '../components/BeadSwatch'

const CATS: Category[] = ['solid', 'transparent', 'semi', 'aurora', 'custom']
const FINISH_LABELS: Record<Finish, string> = {
  opaque: '불투명', transparent: '투명', semi: '반투명', aurora: '오로라',
}
// 은센(A) + 비즈팔레트(B) 전체 브랜드 색
const BRAND_PALETTE = [...BASE_PALETTE, ...BEADPAL_PALETTE]
type BrandFilter = 'all' | Brand

export default function Library() {
  const s = useSettings()
  const [cat, setCat] = useState<Category>('solid')
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all')
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const items = useMemo(() => {
    let base = cat === 'custom'
      ? s.customColors.filter((c) => !c.deleted)
      : BRAND_PALETTE.filter((c) => c.category === cat && (brandFilter === 'all' || c.brand === brandFilter))
    const q = query.trim().toLowerCase()
    if (q) {
      base = base.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    }
    return base
  }, [cat, brandFilter, query, s.customColors])

  const catCodes = items.map((c) => c.code)
  const enabledCount = catCodes.filter((c) => !s.disabled[c]).length
  const at4mm = s.diameterMm === 4

  return (
    <div className="library">
      <div className="controls">
        <div className="card">
          <div className="lib-toolbar" data-guide="toolbar">
            <input
              className="search"
              placeholder="색 이름/코드 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="toggle-sm">
              <input
                type="checkbox"
                checked={s.photoView}
                onChange={(e) => s.set('photoView', e.target.checked)}
              />
              실제 색상 보기
            </label>
          </div>
          <div className="lib-bulk" data-guide="bulk">
            <button
              className="btn-sm btn-secondary"
              onClick={() => s.setCategoryEnabled(BRAND_PALETTE.map((c) => c.code), true)}
            >
              전체 사용
            </button>
            <button
              className="btn-sm btn-secondary"
              onClick={() => s.setCategoryEnabled(BRAND_PALETTE.map((c) => c.code), false)}
            >
              전체 해제
            </button>
            <button className="btn-sm btn-primary" onClick={() => setAddOpen(true)}>
              ＋ 커스텀 색 추가
            </button>
          </div>
          {/* 브랜드 범례 */}
          <p className="muted hint brand-legend">
            <strong>A</strong> = <a href={BRANDS.A.url} target="_blank" rel="noreferrer">{BRANDS.A.name}</a>
            {' '}({BRANDS.A.material}·{BRANDS.A.sizesMm.join('/')}mm) &nbsp;·&nbsp;
            <strong>B</strong> = <a href={BRANDS.B.url} target="_blank" rel="noreferrer">{BRANDS.B.name}</a>
            {' '}({BRANDS.B.material}·{BRANDS.B.sizesMm.join('/')}mm)
          </p>
          {/* 브랜드 필터 */}
          <div className="chips-row">
            <span>브랜드</span>
            {([['all', '전체'], ['A', 'A 은센'], ['B', 'B 비즈팔레트']] as [BrandFilter, string][]).map(([b, label]) => (
              <button key={b} className={`chip ${brandFilter === b ? 'on' : ''}`} onClick={() => setBrandFilter(b)}>
                {label}
              </button>
            ))}
          </div>
          {at4mm && (
            <p className="muted hint brand-warn">
              ⚠️ 지금 <strong>4mm</strong> 프로젝트예요. 비즈팔레트(B)는 6·8mm만 팔아서 <strong>변환에 사용되지 않아요</strong>.
              6/8mm로 바꾸면 B 비즈도 쓸 수 있어요.
            </p>
          )}
        </div>

        <div className="cat-tabs" data-guide="cats">
          {CATS.map((c) => (
            <button key={c} className={`tab ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
              {CATEGORY_LABELS[c]}
              {c === 'custom' && s.customColors.filter((x) => !x.deleted).length > 0 &&
                ` (${s.customColors.filter((x) => !x.deleted).length})`}
            </button>
          ))}
        </div>

        <div className="card" data-guide="list">
          <label className="toggle-sm cat-head">
            <input
              type="checkbox"
              checked={enabledCount === catCodes.length && catCodes.length > 0}
              onChange={(e) => s.setCategoryEnabled(catCodes, e.target.checked)}
            />
            <strong>{CATEGORY_LABELS[cat]}</strong> 전체 선택/해제
            <span className="muted">({enabledCount}/{catCodes.length} 사용 중)</span>
          </label>
          <ul>
            {items.map((c) => {
              const bUnavail = at4mm && c.brand === 'B'
              return (
              <li key={c.code} className={`color-row ${bUnavail ? 'row-unavail' : ''}`}>
                <input
                  type="checkbox"
                  checked={!s.disabled[c.code]}
                  onChange={(e) => s.toggleColor(c.code, e.target.checked)}
                  title="변환에 사용"
                />
                <BeadSwatch color={c} />
                <span className="color-name">
                  {c.name} <span className="muted">{c.code}</span>
                </span>
                <span className="muted finish-tag">
                  {bUnavail ? '4mm 미판매' : `${FINISH_LABELS[c.finish]} · ${c.sizeMm}mm`}
                </span>
                {cat === 'custom' && (
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      if (window.confirm(`${c.name}(${c.code}) 색을 삭제할까요?`)) s.removeCustomColor(c.code)
                    }}
                  >
                    삭제
                  </button>
                )}
              </li>
              )
            })}
            {items.length === 0 && (
              <p className="muted pad">
                {cat === 'custom' ? '아직 추가한 색이 없습니다. 다른 사이트에서 산 비즈도 추가해 보세요.' : '검색 결과가 없습니다.'}
              </p>
            )}
          </ul>
        </div>
      </div>

      {addOpen && <AddCustomColor onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddCustomColor({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#d98ba0')
  const [finish, setFinish] = useState<Finish>('opaque')
  const [sizeMm, setSizeMm] = useState(8.0)
  const [photo, setPhoto] = useState<string | undefined>(undefined)

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    // 작은 정사각 썸네일로 축소해 localStorage에 저장
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 96
      const side = Math.min(img.width, img.height)
      cv.getContext('2d')!.drawImage(
        img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 96, 96,
      )
      setPhoto(cv.toDataURL('image/jpeg', 0.8))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(f)
  }

  const submit = () => {
    if (!name.trim()) {
      alert('색 이름을 입력해 주세요.')
      return
    }
    const n = s.customColors.length + 1
    const custom: Omit<CustomColor, 'custom' | 'category'> = {
      code: `C${n}`,
      name: name.trim(),
      hex,
      finish,
      sizeMm: Math.max(1, sizeMm),
      photo,
    }
    s.addCustomColor(custom)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>커스텀 색 추가</strong>
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
        <div className="form-col">
          <label className="field-row">
            이름
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 무광 라벤더" />
          </label>
          <label className="field-row">
            색상
            <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} />
            <span className="muted">{hex}</span>
          </label>
          <div className="chips-row">
            <span>재질</span>
            {(Object.keys(FINISH_LABELS) as Finish[]).map((f) => (
              <button key={f} className={`chip ${finish === f ? 'on' : ''}`} onClick={() => setFinish(f)}>
                {FINISH_LABELS[f]}
              </button>
            ))}
          </div>
          <label className="field-row">
            실제 지름
            <input
              type="number" step={0.1} min={1} inputMode="decimal"
              value={sizeMm}
              onChange={(e) => setSizeMm(Number(e.target.value) || 8)}
            />
            mm <span className="muted">(줄 길이 계산에 사용)</span>
          </label>
          <label className="field-row">
            실제 사진(선택)
            <input type="file" accept="image/*" onChange={onPhoto} />
          </label>
          {photo && <img src={photo} alt="미리보기" className="swatch swatch-photo" style={{ width: 48, height: 48 }} />}
          <button className="btn-primary" onClick={submit}>추가</button>
        </div>
      </div>
    </div>
  )
}
