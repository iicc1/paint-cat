/** "Recent pictures": the file and, if available, its File System Access handle are stored in IndexedDB. */

const DB_NAME = 'paintcat';
const STORE = 'recent';
const MAX_BYTES = 25 * 1024 * 1024;

export interface RecentRecord {
  id: string;
  name: string;
  blob?: Blob;
  handle?: FileSystemFileHandle;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.addEventListener('upgradeneeded', () => req.result.createObjectStore(STORE, { keyPath: 'id' }));
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error));
    t.addEventListener('complete', () => db.close());
  });
}

export async function putRecent(rec: RecentRecord): Promise<void> {
  const value: RecentRecord = { id: rec.id, name: rec.name, handle: rec.handle };
  if (rec.blob && rec.blob.size <= MAX_BYTES) value.blob = rec.blob;
  try {
    await tx('readwrite', (s) => s.put(value));
  } catch {
    // Some browsers cannot clone the handle: store only the file.
    try {
      await tx('readwrite', (s) => s.put({ id: rec.id, name: rec.name, blob: value.blob }));
    } catch {
      /* no IndexedDB: the recent list cannot be reopened */
    }
  }
}

export async function getRecent(id: string): Promise<RecentRecord | undefined> {
  try {
    return await tx<RecentRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<RecentRecord | undefined>);
  } catch {
    return undefined;
  }
}

export async function deleteRecent(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* nothing to delete */
  }
}
