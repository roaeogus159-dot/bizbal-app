import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, CustomColor } from '../lib/palette'
import { fullPalette, enabledIndices, paletteArrays } from '../lib/palette'
import type { SourceImage } from '../lib/convert'
import { autoSize, convertInWorker } from '../lib/convert'
import type { Background } from '../lib/render'

// ---------- 설정 + 팔레트 상태 (localStorage 영속) ----------

export type SizeMode = 'count' | 'widthCm'
export type PaintMode = 'auto' | 'expert'

interface SettingsState {
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

export type Screen = 'home' | 'convert' | 'editor' | 'result' | 'library'
export type Tool = 'pan' | 'point' | 'brush' | 'magic' | 'eyedrop'

interface UndoEntry {
  cells: Uint32Array
  before: Uint16Array
  after: Uint16Array
}

interface ProjectState {
  screen: Screen
  prevScreen: Screen
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
  // 원본 사진 오버레이 (직접 대조용)
  overlayOn: boolean
  overlayAlpha: number
  // 에디터
  tool: Tool
  selection: Set<number>
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]

  setOverlay: (on: boolean, alpha?: number) => void
  go: (s: Screen) => void
  setImage: (img: SourceImage) => void
  setSize: (W: number, H: number) => void
  applyAutoSize: () => void
  requestConvert: () => void
  hasEdits: () => boolean
  // 에디터 액션
  setTool: (t: Tool) => void
  setSelection: (sel: Set<number>) => void
  applyColor: (cells: number[], colorIdx: number) => void
  /** 실시간 칠하기: 지나간 순서의 셀들을 즉시 반영. 경로를 되짚으면 그만큼 취소. strokeCommit 시 한 행동으로 기록 */
  strokeMove: (cells: number[], colorIdx: number) => void
  strokeCommit: () => void
  saveNow: () => boolean
  undo: () => void
  redo: () => void
  resetEdits: () => void
  restore: (img: SourceImage, W: number, H: number, grid: Uint16Array) => void
}

let convertTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

const AUTOSAVE_MAX_CELLS = 200_000

// 진행 중인 칠하기 스트로크 상태
const strokeBefore = new Map<number, number>() // 실제로 색이 바뀐 셀 → 이전 팔레트 인덱스
let strokePath: number[] = [] // 포인터가 지나간 셀 순서 (되짚기 취소용)
const strokeSet = new Set<number>() // strokePath 멤버십

/** 즉시 저장. 성공 여부 반환 (중간 저장 버튼·자동저장 공용) */
function doAutosave(): boolean {
  const { image, W, H, grid } = useProject.getState()
  if (!image || !grid || grid.length > AUTOSAVE_MAX_CELLS) return false
  try {
    const bytes = new Uint8Array(grid.buffer.slice(0))
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    localStorage.setItem(
      'bizbal-project',
      JSON.stringify({ dataUrl: image.dataUrl, W, H, grid: btoa(bin), savedAt: Date.now() }),
    )
    return true
  } catch {
    return false // 용량 초과 등 (자동저장은 부가 기능)
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(doAutosave, 800)
}

export function loadAutosave(): { dataUrl: string; W: number; H: number; grid: Uint16Array; savedAt: number } | null {
  try {
    const raw = localStorage.getItem('bizbal-project')
    if (!raw) return null
    const p = JSON.parse(raw)
    const bin = atob(p.grid)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { ...p, grid: new Uint16Array(bytes.buffer) }
  } catch {
    return null
  }
}

export const useProject = create<ProjectState>()((set, get) => ({
  screen: 'home',
  prevScreen: 'home',
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
  overlayOn: false,
  overlayAlpha: 0.5,
  tool: 'point',
  selection: new Set(),
  undoStack: [],
  redoStack: [],

  setOverlay: (on, alpha) =>
    set((st) => ({ overlayOn: on, overlayAlpha: alpha ?? st.overlayAlpha })),

  go: (s) => set((st) => ({ screen: s, prevScreen: st.screen })),

  setImage: (img) => {
    set({
      image: img, grid: null, baseGrid: null, cellRgb: null, deltaE: null,
      selection: new Set(), undoStack: [], redoStack: [],
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

  requestConvert: () => {
    const { image, W, H } = get()
    if (!image || W < 1 || H < 1) return
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
      set((st) => ({
        grid: res.grid,
        baseGrid: res.grid.slice(),
        cellRgb: res.cellRgb,
        deltaE: res.deltaE,
        converting: false,
        convertMs: res.ms,
        gridVersion: st.gridVersion + 1,
        selection: new Set(),
        undoStack: [],
        redoStack: [],
      }))
      scheduleAutosave()
    }, 200)
  },

  hasEdits: () => get().undoStack.length > 0 || get().redoStack.length > 0,

  setTool: (t) => set({ tool: t }),
  setSelection: (sel) => set({ selection: sel }),

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
      undoStack: [...st.undoStack.slice(-99), { cells, before, after }],
      redoStack: [],
    }))
    scheduleAutosave()
  },

  saveNow: () => doAutosave(),

  applyColor: (cells, colorIdx) => {
    const { grid } = get()
    if (!grid || cells.length === 0) return
    const changed = cells.filter((c) => grid[c] !== colorIdx)
    if (changed.length === 0) return
    const entry: UndoEntry = {
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
    if (!entry || !grid) return
    for (let i = 0; i < entry.cells.length; i++) grid[entry.cells[i]] = entry.before[i]
    set((st) => ({
      undoStack: st.undoStack.slice(0, -1),
      redoStack: [...st.redoStack, entry],
      gridVersion: st.gridVersion + 1,
    }))
    scheduleAutosave()
  },

  redo: () => {
    const { redoStack, grid } = get()
    const entry = redoStack[redoStack.length - 1]
    if (!entry || !grid) return
    for (let i = 0; i < entry.cells.length; i++) grid[entry.cells[i]] = entry.after[i]
    set((st) => ({
      redoStack: st.redoStack.slice(0, -1),
      undoStack: [...st.undoStack, entry],
      gridVersion: st.gridVersion + 1,
    }))
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

  // 자동저장 복원: 변환 없이 저장된 grid 그대로 사용
  restore: (img, W, H, grid) =>
    set((st) => ({
      image: img, W, H,
      grid, baseGrid: grid.slice(),
      cellRgb: null, deltaE: null,
      selection: new Set(), undoStack: [], redoStack: [],
      gridVersion: st.gridVersion + 1,
      screen: 'convert', prevScreen: st.screen,
    })),
}))
