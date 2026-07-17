// 내 작업 목록 저장소 (IndexedDB — localStorage보다 용량 여유가 커서 여러 작업 보관 가능)

export interface SavedProject {
  id: string
  name: string
  savedAt: number
  W: number
  H: number
  dataUrl: string // 원본 사진 축소본
  grid: ArrayBuffer // Uint16Array 버퍼
}

const DB_NAME = 'bizbal'
const STORE = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export function putProject(p: SavedProject): Promise<unknown> {
  return tx('readwrite', (s) => s.put(p))
}

export async function listProjects(): Promise<SavedProject[]> {
  const all = await tx<SavedProject[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => b.savedAt - a.savedAt)
}

export function getProject(id: string): Promise<SavedProject | undefined> {
  return tx('readonly', (s) => s.get(id))
}

export function deleteProject(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id))
}
