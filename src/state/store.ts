import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, CustomColor } from '../lib/palette'
import { fullPalette, enabledIndices, paletteArrays, EMPTY } from '../lib/palette'
import type { SourceImage } from '../lib/convert'
import { autoSize, convertInWorker } from '../lib/convert'
import type { Background } from '../lib/render'
import { putProject } from '../lib/db'

// ---------- 설정 + 팔레트 상태 (localStorage 영속) ----------

export type SizeMode = 'count' | 'widthCm'
// auto: 자동 채색 / expert: 자동+ΔE 강조 / manual: 빈 칸만 생성, 직접 채우기
export type PaintMode = 'auto' | 'expert' | 'manual'

interface SettingsState {
  theme: 'light' | 'dark'
  penMode: boolean // 애플펜 모드: 손가락=화면 이동, 펜=편집 (아이패드용)
  diameterMm: 4 | 6 | 8
  sizeMode: SizeMode
  budget: number // 총 개수 기준 (기본 9000)
  widthCm: number // 가로 cm 기준 (기본 80)
  lockAspect: boolean
  paintMode: PaintMode
  maxColors: number
  dithering: boolean
  photoView: boolean // 스와치 ↔ 실제 비즈 사진 (모든 색 리스트 공통)
  materialView: boolean // 재질감(완성 느낌) 미리보기
  background: Background
  expertThreshold: number // 전문가 모드 ΔE 강조 임계값
  disabled: Record<string, boolean> // 변환에서 제외한 색 코드
  customColors: CustomColor[]
  // 구매 계획 (은센 기준: 100개입 1,000원, 카테고리별 수정 가능)
  packSize: number
  packPrices: Record<Category, number>
  setPackPrice: (cat: Category, price: number) => void
  set: <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => void
  toggleColor: (code: string, on: boolean) => void
  setCategoryEnabled: (codes: string[], on: boolean) => void
  addCustomColor: (c: Omit<CustomColor, 'custom' | 'category'>) => void
  updateCustomColor: (code: string, patch: Partial<CustomColor>) => void
  removeCustomColor: (code: string) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      penMode: false,
      diameterMm: 8,
      sizeMode: 'widthCm',
      budget: 9000,
      widthCm: 80,
      lockAspect: true,
      paintMode: 'auto',
      maxColors: 24,
      dithering: false,
      photoView: false,
      materialView: false,
      background: 'white',
      expertThreshold: 20,
      disabled: {},
      customColors: [],
      packSize: 100,
      packPrices: { solid: 1000, transparent: 1000, semi: 1000, aurora: 1000, custom: 1000 },
      setPackPrice: (cat, price) =>
        set((st) => ({ packPrices: { ...st.packPrices, [cat]: Math.max(0, price) } })),
      set: (k, v) => set({ [k]: v } as Pick<SettingsState, typeof k>),
      toggleColor: (code, on) =>
        set((st) => {
          const disabled = { ...st.disabled }
          if (on) delete disabled[code]
          else disabled[code] = true
          return { disabled }
        }),
      setCategoryEnabled: (codes, on) =>
        set((st) => {
          const disabled = { ...st.disabled }
          for (const c of codes) {
            if (on) delete disabled[c]
            else disabled[c] = true
          }
          return { disabled }
        }),
      addCustomColor: (c) =>
        set((st) => ({
          customColors: [
            ...st.customColors,
            { ...c, custom: true, category: 'custom' },
          ],
        })),
      updateCustomColor: (code, patch) =>
        set((st) => ({
          customColors: st.customColors.map((c) =>
            c.code === code ? { ...c, ...patch } : c,
          ),
        })),
      // 삭제 시 자리 유지(deleted 플래그) → grid 인덱스가 깨지지 않음
      removeCustomColor: (code) =>
        set((st) => ({
          customColors: st.customColors.map((c) =>
            c.code === code ? { ...c, deleted: true } : c,
          ),
        })),
    }),
    { name: 'bizbal-settings' },
  ),
)

// ---------- 프로젝트 상태 (메모리) ----------

export type Screen = 'home' | 'convert' | 'editor' | 'result' | 'library' | 'projects'
export type Tool = 'pan' | 'point' | 'brush' | 'bucket' | 'magic' | 'eyedrop' | 'rowcol' | 'paste'

// 칸 편집 (같은 크기 안에서 색만 바뀜)
interface CellEdit {
  kind: 'cells'
  cells: Uint32Array
  before: Uint16Array
  after: Uint16Array
}
// 크기 변경 (행/열 자르기·추가) — 전/후 스냅샷으로 되돌리기/다시실행
interface ResizeEdit {
  kind: 'resize'
  prevW: number; prevH: number; prevGrid: Uint16Array; prevBase: Uint16Array
  nextW: number; nextH: number; nextGrid: Uint16Array; nextBase: Uint16Array
}
type UndoEntry = CellEdit | ResizeEdit

interface ProjectState {
  screen: Screen
  prevScreen: Screen
  projectId: string // 내 작업 목록에서 이 작업을 식별
  projectName: string
  image: SourceImage | null
  W: number
  H: number
  grid: Uint16Array | null // 현재(수정 반영)
  baseGrid: Uint16Array | null // 자동 변환 원본
  cellRgb: Uint8ClampedArray | null // 다운샘플 원본 대표색 (전문가 후보·스포이드용)
  deltaE: Float32Array | null
  converting: boolean
  convertMs: number
  gridVersion: number // 캔버스 리렌더 트리거
  convertedKey: string | null // 현재 grid를 만든 설정 키
  // 원본 사진 오버레이 (직접 대조용)
  overlayOn: boolean
  overlayAlpha: number
  // 에디터
  tool: Tool
  selection: Set<number>
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  recentColors: number[] // 최근에 고른 색 (앞이 가장 최근)

  setOverlay: (on: boolean, alpha?: number) => void
  go: (s: Screen) => void
  setImage: (img: SourceImage) => void
  setSize: (W: number, H: number) => void
  applyAutoSize: () => void
  /** preserveEdits=true면 수정한 칸(grid≠baseGrid)은 유지하고 나머지만 재변환 */
  requestConvert: (preserveEdits?: boolean) => void
  hasEdits: () => boolean
  // 에디터 액션
  setTool: (t: Tool) => void
  setSelection: (sel: Set<number>) => void
  pushRecentColor: (idx: number) => void
  applyColor: (cells: number[], colorIdx: number) => void
  /** 칸별로 다른 값을 한 번의 행동으로 적용 (행/열 이동·붙여넣기 공용) */
  applyCellValues: (cells: number[], values: number[]) => void
  /** 실시간 칠하기: 지나간 순서의 셀들을 즉시 반영. 경로를 되짚으면 그만큼 취소. strokeCommit 시 한 행동으로 기록 */
  strokeMove: (cells: number[], colorIdx: number) => void
  strokeCommit: () => void
  saveNow: () => boolean
  undo: () => void
  redo: () => void
  resetEdits: () => void
  /** 가장자리 행/열 추가(빈 칸)·자르기. 재변환 없이 도안만 변경 */
  cropGrid: (edge: 'top' | 'bottom' | 'left' | 'right', delta: 1 | -1) => void
  setProjectName: (name: string) => void
  restore: (
    img: SourceImage, W: number, H: number, grid: Uint16Array,
    opts?: { id?: string; name?: string; baseGrid?: Uint16Array },
  ) => void
}

/** 현재 설정 기준 변환 키 — grid가 이 설정으로 만들어졌는지 판별 (불필요한 재변환 방지) */
export function currentConvertKey(W: number, H: number): string {
  const s = useSettings.getState()
  // 직접 모드는 빈 칸 격자라 팔레트·색수·디더링과 무관 → W×H만으로 키 구성
  if (s.paintMode === 'manual') return JSON.stringify(['manual', W, H])
  return JSON.stringify([
    W, H,
    Object.keys(s.disabled).sort(),
    s.customColors.filter((c) => !c.deleted).map((c) => c.code),
    s.maxColors,
    s.dithering,
  ])
}

function newProjectMeta() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    projectId: `p${Date.now()}`,
    projectName: `작업 ${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
  }
}

let convertTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

const AUTOSAVE_MAX_CELLS = 200_000

// 진행 중인 칠하기 스트로크 상태
const strokeBefore = new Map<number, number>() // 실제로 색이 바뀐 셀 → 이전 팔레트 인덱스
let strokePath: number[] = [] // 포인터가 지나간 셀 순서 (되짚기 취소용)
const strokeSet = new Set<number>() // strokePath 멤버십

function u16ToB64(arr: Uint16Array): string {
  const bytes = new Uint8Array(arr.buffer.slice(0))
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function b64ToU16(b64: string): Uint16Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Uint16Array(bytes.buffer)
}

/** 즉시 저장. 성공 여부 반환 (중간 저장 버튼·자동저장 공용) */
function doAutosave(): boolean {
  const { image, W, H, grid, baseGrid, projectId, projectName } = useProject.getState()
  if (!image || !grid) return false
  // 내 작업 목록(IndexedDB) — baseGrid도 함께 저장해 복원 후에도 '수정 칸' 구분 유지
  void putProject({
    id: projectId,
    name: projectName,
    savedAt: Date.now(),
    W, H,
    dataUrl: image.dataUrl,
    grid: grid.buffer.slice(0) as ArrayBuffer,
    base: baseGrid ? (baseGrid.buffer.slice(0) as ArrayBuffer) : undefined,
  }).catch(() => {})
  // 빠른 '이어하기' 슬롯 (localStorage, 큰 도안은 생략)
  if (grid.length <= AUTOSAVE_MAX_CELLS) {
    try {
      localStorage.setItem(
        'bizbal-project',
        JSON.stringify({
          dataUrl: image.dataUrl, W, H,
          grid: u16ToB64(grid),
          base: baseGrid ? u16ToB64(baseGrid) : undefined,
          savedAt: Date.now(),
        }),
      )
    } catch {
      // localStorage 용량 초과는 무시 (IndexedDB에는 저장됨)
    }
  }
  return true
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(doAutosave, 800)
}

export function loadAutosave(): {
  dataUrl: string; W: number; H: number; grid: Uint16Array; baseGrid?: Uint16Array; savedAt: number
} | null {
  try {
    const raw = localStorage.getItem('bizbal-project')
    if (!raw) return null
    const p = JSON.parse(raw)
    return {
      ...p,
      grid: b64ToU16(p.grid),
      baseGrid: p.base ? b64ToU16(p.base) : undefined,
    }
  } catch {
    return null
  }
}

export const useProject = create<ProjectState>()((set, get) => ({
  screen: 'home',
  prevScreen: 'home',
  ...newProjectMeta(),
  image: null,
  W: 0,
  H: 0,
  grid: null,
  baseGrid: null,
  cellRgb: null,
  deltaE: null,
  converting: false,
  convertMs: 0,
  gridVersion: 0,
  convertedKey: null,
  overlayOn: false,
  overlayAlpha: 0.5,
  tool: 'point',
  selection: new Set(),
  undoStack: [],
  redoStack: [],
  recentColors: [],

  setOverlay: (on, alpha) =>
    set((st) => ({ overlayOn: on, overlayAlpha: alpha ?? st.overlayAlpha })),

  go: (s) => set((st) => ({ screen: s, prevScreen: st.screen })),

  setImage: (img) => {
    set({
      ...newProjectMeta(), // 새 사진 = 새 작업으로 목록에 쌓임
      image: img, grid: null, baseGrid: null, cellRgb: null, deltaE: null,
      selection: new Set(), undoStack: [], redoStack: [], recentColors: [],
    })
    get().applyAutoSize()
  },

  setSize: (W, H) => {
    W = Math.max(1, Math.round(W))
    H = Math.max(1, Math.round(H))
    set({ W, H, selection: new Set(), undoStack: [], redoStack: [] })
    get().requestConvert()
  },

  applyAutoSize: () => {
    const img = get().image
    if (!img) return
    const s = useSettings.getState()
    const { W, H } = autoSize(img.aspect, s.sizeMode, s.budget, s.widthCm, s.diameterMm)
    get().setSize(W, H)
  },

  requestConvert: (preserveEdits = false) => {
    const { image, W, H, grid: oldGrid, baseGrid: oldBase } = get()
    if (!image || W < 1 || H < 1) return
    // 수정 칸 스냅샷 (같은 W×H 재변환에서만 의미 있음)
    let keep: { idx: Uint32Array; color: Uint16Array } | null = null
    if (preserveEdits && oldGrid && oldBase && oldGrid.length === W * H) {
      const idxs: number[] = []
      for (let i = 0; i < oldGrid.length; i++) if (oldGrid[i] !== oldBase[i]) idxs.push(i)
      if (idxs.length > 0) {
        keep = {
          idx: new Uint32Array(idxs),
          color: new Uint16Array(idxs.map((i) => oldGrid[i])),
        }
      }
    }
    const applyKeep = (g: Uint16Array) => {
      if (!keep) return
      for (let i = 0; i < keep.idx.length; i++) g[keep.idx[i]] = keep.color[i]
    }
    // 직접 채우기 모드: 매칭 없이 빈 칸 격자만 생성
    if (useSettings.getState().paintMode === 'manual') {
      clearTimeout(convertTimer)
      const grid = new Uint16Array(W * H).fill(EMPTY)
      const base = grid.slice() // 자동(빈) 상태 기준 — keep 적용 전에 확보
      applyKeep(grid)
      set((st) => ({
        grid,
        baseGrid: base,
        cellRgb: null,
        deltaE: null,
        converting: false,
        gridVersion: st.gridVersion + 1,
        convertedKey: currentConvertKey(W, H),
        selection: new Set(),
        undoStack: [],
        redoStack: [],
      }))
      scheduleAutosave()
      return
    }
    set({ converting: true })
    clearTimeout(convertTimer)
    convertTimer = setTimeout(async () => {
      const s = useSettings.getState()
      const pal = fullPalette(s.customColors)
      const idxs = enabledIndices(s.customColors, s.disabled)
      if (idxs.length === 0) {
        set({ converting: false })
        return
      }
      const { lab, rgb, map } = paletteArrays(pal, idxs)
      const res = await convertInWorker(image, W, H, lab, rgb, map, s.maxColors, s.dithering)
      if (!res) return // 더 새로운 요청이 대체함
      const base = res.grid.slice() // 자동 변환 결과 기준 — keep 적용 전에 확보
      applyKeep(res.grid) // '세부 수정 유지' 재변환: 수정 칸 복원 (base와 달라 여전히 수정으로 인식)
      set((st) => ({
        grid: res.grid,
        baseGrid: base,
        cellRgb: res.cellRgb,
        deltaE: res.deltaE,
        converting: false,
        convertMs: res.ms,
        gridVersion: st.gridVersion + 1,
        convertedKey: currentConvertKey(get().W, get().H),
        selection: new Set(),
        undoStack: [],
        redoStack: [],
      }))
      scheduleAutosave()
    }, 200)
  },

  // 실제로 자동 결과와 다른 칸이 있는지 (undo 스택뿐 아니라 복원된 수정도 인식)
  hasEdits: () => {
    const { grid, baseGrid } = get()
    if (!grid || !baseGrid || grid.length !== baseGrid.length) {
      return get().undoStack.length > 0
    }
    for (let i = 0; i < grid.length; i++) if (grid[i] !== baseGrid[i]) return true
    return false
  },

  setTool: (t) => set({ tool: t }),
  setSelection: (sel) => set({ selection: sel }),

  pushRecentColor: (idx) =>
    set((st) =>
      idx === EMPTY
        ? st // 지우개는 항상 맨 앞에 고정 표시라 기록 불필요
        : { recentColors: [idx, ...st.recentColors.filter((i) => i !== idx)].slice(0, 24) },
    ),

  strokeMove: (cells, colorIdx) => {
    const { grid } = get()
    if (!grid) return
    let changed = false
    for (const c of cells) {
      const n = strokePath.length
      if (n > 0 && c === strokePath[n - 1]) continue // 같은 칸에 머무름
      // 직전 경로로 되짚기: 마지막 칠을 취소
      if (n >= 2 && c === strokePath[n - 2]) {
        const last = strokePath.pop()!
        strokeSet.delete(last)
        const prev = strokeBefore.get(last)
        if (prev !== undefined) {
          grid[last] = prev
          strokeBefore.delete(last)
          changed = true
        }
        continue
      }
      if (strokeSet.has(c)) continue // 자기 경로 교차는 유지
      strokePath.push(c)
      strokeSet.add(c)
      if (grid[c] !== colorIdx) {
        strokeBefore.set(c, grid[c])
        grid[c] = colorIdx
        changed = true
      }
    }
    if (changed) set((st) => ({ gridVersion: st.gridVersion + 1 }))
  },

  strokeCommit: () => {
    strokePath = []
    strokeSet.clear()
    if (strokeBefore.size === 0) return
    const { grid } = get()
    if (!grid) {
      strokeBefore.clear()
      return
    }
    const cells = new Uint32Array(strokeBefore.keys())
    const before = new Uint16Array(strokeBefore.values())
    const after = new Uint16Array(cells.length)
    for (let i = 0; i < cells.length; i++) after[i] = grid[cells[i]]
    strokeBefore.clear()
    set((st) => ({
      undoStack: [...st.undoStack.slice(-99), { kind: 'cells', cells, before, after }],
      redoStack: [],
    }))
    scheduleAutosave()
  },

  saveNow: () => doAutosave(),

  applyCellValues: (cells, values) => {
    const { grid } = get()
    if (!grid || cells.length === 0) return
    const ci: number[] = []
    const bi: number[] = []
    const ai: number[] = []
    for (let i = 0; i < cells.length; i++) {
      if (grid[cells[i]] !== values[i]) {
        ci.push(cells[i])
        bi.push(grid[cells[i]])
        ai.push(values[i])
      }
    }
    if (ci.length === 0) return
    const entry: UndoEntry = {
      kind: 'cells',
      cells: new Uint32Array(ci),
      before: new Uint16Array(bi),
      after: new Uint16Array(ai),
    }
    for (let i = 0; i < ci.length; i++) grid[ci[i]] = ai[i]
    set((st) => ({
      undoStack: [...st.undoStack.slice(-99), entry],
      redoStack: [],
      gridVersion: st.gridVersion + 1,
    }))
    scheduleAutosave()
  },

  applyColor: (cells, colorIdx) => {
    const { grid } = get()
    if (!grid || cells.length === 0) return
    const changed = cells.filter((c) => grid[c] !== colorIdx)
    if (changed.length === 0) return
    const entry: UndoEntry = {
      kind: 'cells',
      cells: new Uint32Array(changed),
      before: new Uint16Array(changed.map((c) => grid[c])),
      after: new Uint16Array(changed.length).fill(colorIdx),
    }
    for (const c of changed) grid[c] = colorIdx
    set((st) => ({
      undoStack: [...st.undoStack.slice(-99), entry],
      redoStack: [],
      gridVersion: st.gridVersion + 1,
    }))
    scheduleAutosave()
  },

  undo: () => {
    const { undoStack, grid } = get()
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    if (entry.kind === 'resize') {
      // 크기 변경 되돌리기: 이전 크기·격자로 복원
      set((st) => ({
        W: entry.prevW, H: entry.prevH,
        grid: entry.prevGrid.slice(), baseGrid: entry.prevBase.slice(),
        cellRgb: null, deltaE: null, selection: new Set(),
        convertedKey: currentConvertKey(entry.prevW, entry.prevH),
        undoStack: st.undoStack.slice(0, -1),
        redoStack: [...st.redoStack, entry],
        gridVersion: st.gridVersion + 1,
      }))
    } else {
      if (!grid) return
      for (let i = 0; i < entry.cells.length; i++) grid[entry.cells[i]] = entry.before[i]
      set((st) => ({
        undoStack: st.undoStack.slice(0, -1),
        redoStack: [...st.redoStack, entry],
        gridVersion: st.gridVersion + 1,
      }))
    }
    scheduleAutosave()
  },

  redo: () => {
    const { redoStack, grid } = get()
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    if (entry.kind === 'resize') {
      set((st) => ({
        W: entry.nextW, H: entry.nextH,
        grid: entry.nextGrid.slice(), baseGrid: entry.nextBase.slice(),
        cellRgb: null, deltaE: null, selection: new Set(),
        convertedKey: currentConvertKey(entry.nextW, entry.nextH),
        redoStack: st.redoStack.slice(0, -1),
        undoStack: [...st.undoStack, entry],
        gridVersion: st.gridVersion + 1,
      }))
    } else {
      if (!grid) return
      for (let i = 0; i < entry.cells.length; i++) grid[entry.cells[i]] = entry.after[i]
      set((st) => ({
        redoStack: st.redoStack.slice(0, -1),
        undoStack: [...st.undoStack, entry],
        gridVersion: st.gridVersion + 1,
      }))
    }
    scheduleAutosave()
  },

  // 초기화도 하나의 행동으로 기록 → 되돌리기로 취소 가능
  resetEdits: () => {
    const { grid, baseGrid } = get()
    if (!grid || !baseGrid) return
    const idxs: number[] = []
    for (let i = 0; i < grid.length; i++) if (grid[i] !== baseGrid[i]) idxs.push(i)
    if (idxs.length === 0) {
      set({ selection: new Set() })
      return
    }
    const entry: UndoEntry = {
      kind: 'cells',
      cells: new Uint32Array(idxs),
      before: new Uint16Array(idxs.map((i) => grid[i])),
      after: new Uint16Array(idxs.map((i) => baseGrid[i])),
    }
    for (const i of idxs) grid[i] = baseGrid[i]
    set((st) => ({
      selection: new Set(),
      undoStack: [...st.undoStack.slice(-99), entry],
      redoStack: [],
      gridVersion: st.gridVersion + 1,
    }))
    scheduleAutosave()
  },

  cropGrid: (edge, delta) => {
    const { grid, baseGrid, W, H } = get()
    if (!grid) return
    const nW = edge === 'left' || edge === 'right' ? W + delta : W
    const nH = edge === 'top' || edge === 'bottom' ? H + delta : H
    if (nW < 1 || nH < 1) return
    // 원본(src) 좌표 → 새(dst) 좌표 오프셋
    const dx = edge === 'left' ? delta : 0 // 왼쪽 추가 시 기존 칸이 오른쪽으로 밀림(+1)
    const dy = edge === 'top' ? delta : 0
    const remap = (src: Uint16Array): Uint16Array => {
      const out = new Uint16Array(nW * nH).fill(EMPTY)
      for (let y = 0; y < H; y++) {
        const ny = y + dy
        if (ny < 0 || ny >= nH) continue
        for (let x = 0; x < W; x++) {
          const nx = x + dx
          if (nx < 0 || nx >= nW) continue
          out[ny * nW + nx] = src[y * W + x]
        }
      }
      return out
    }
    const prevBase = baseGrid ?? grid.slice()
    const newGrid = remap(grid)
    const newBase = remap(prevBase)
    // 크기 변경 스냅샷을 되돌리기 기록에 추가 (자르기·추가도 undo/redo 가능)
    const entry: UndoEntry = {
      kind: 'resize',
      prevW: W, prevH: H, prevGrid: grid.slice(), prevBase: prevBase.slice(),
      nextW: nW, nextH: nH, nextGrid: newGrid.slice(), nextBase: newBase.slice(),
    }
    set((st) => ({
      W: nW, H: nH,
      grid: newGrid,
      baseGrid: newBase,
      cellRgb: null, // 격자 크기가 바뀌어 원본 대표색·ΔE는 무효화 (전문가 강조는 재변환 시 복원)
      deltaE: null,
      selection: new Set(),
      undoStack: [...st.undoStack.slice(-99), entry],
      redoStack: [],
      gridVersion: st.gridVersion + 1,
      // 재변환 없이 이 크기의 grid를 '현재'로 확정 → 변환 화면에서 자동 재변환 안 함
      convertedKey: currentConvertKey(nW, nH),
    }))
    scheduleAutosave()
  },

  setProjectName: (name) => {
    set({ projectName: name })
    scheduleAutosave()
  },

  // 저장된 작업 복원: 변환 없이 저장된 grid 그대로 사용
  restore: (img, W, H, grid, opts) =>
    set((st) => ({
      ...(opts?.id ? { projectId: opts.id } : { projectId: newProjectMeta().projectId }),
      projectName: opts?.name ?? newProjectMeta().projectName,
      image: img, W, H,
      grid,
      // base가 있으면 그걸로 → 복원 후에도 수정 칸(grid≠base) 구분 유지. 없으면 grid 자체를 base로
      baseGrid: opts?.baseGrid ?? grid.slice(),
      cellRgb: null, deltaE: null,
      selection: new Set(), undoStack: [], redoStack: [], recentColors: [],
      gridVersion: st.gridVersion + 1,
      // 복원된 grid는 그대로 신뢰 → 열자마자 재변환으로 덮어쓰지 않게 키를 현재 설정으로
      convertedKey: currentConvertKey(W, H),
      screen: 'convert', prevScreen: st.screen,
    })),
}))
