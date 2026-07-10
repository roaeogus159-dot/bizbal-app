import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomColor } from '../lib/palette'
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
  undo: () => void
  redo: () => void
  resetEdits: () => void
  restore: (img: SourceImage, W: number, H: number, grid: Uint16Array) => void
}

let convertTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

const AUTOSAVE_MAX_CELLS = 200_000

function scheduleAutosave() {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    const { image, W, H, grid } = useProject.getState()
    if (!image || !grid || grid.length > AUTOSAVE_MAX_CELLS) return
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
    } catch {
      // 용량 초과 등은 무시 (자동저장은 부가 기능)
    }
  }, 800)
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

  resetEdits: () => {
    const { baseGrid } = get()
    if (!baseGrid) return
    set((st) => ({
      grid: baseGrid.slice(),
      selection: new Set(),
      undoStack: [],
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
