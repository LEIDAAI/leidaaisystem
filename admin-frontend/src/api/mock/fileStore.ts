/**
 * Mock 模式文件实体存储：IndexedDB（localStorage 仅约 5MB 配额，放不下 PDF/文档，
 * 故用 IndexedDB 存原始 Blob）。库名 admin-demo-files，对象仓库 files，主键 id。
 * 真实模式下文件由后端对象存储承载，本模块不被引用。
 */
export interface FileRecord { id: string; name: string; type: string; blob: Blob }
const DB_NAME = 'admin-demo-files'
const STORE = 'files'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'))
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error || new Error('IndexedDB 操作失败'))
  })
}

export const putFileRecord = (rec: FileRecord) => run<IDBValidKey>('readwrite', (s) => s.put(rec))
export const getFileRecord = (id: string) => run<FileRecord | undefined>('readonly', (s) => s.get(id))
export const deleteFileRecord = (id: string) => run<undefined>('readwrite', (s) => s.delete(id))
