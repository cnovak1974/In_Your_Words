const DB_NAME = "in-your-words";
const STORE = "pending-recordings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type PendingRecording = { sessionId: string; contentType: string; blob: Blob };
export async function savePending(value: PendingRecording) {
  const stored = {
    sessionId: value.sessionId,
    contentType: value.contentType,
    data: await value.blob.arrayBuffer(),
  };
  const db=await openDb(); await new Promise<void>((resolve,reject)=>{ const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(stored,"current"); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error ?? new Error("Could not preserve the recording locally")); }); db.close();
}
export async function loadPending(): Promise<PendingRecording | undefined> {
  const db=await openDb(); const value=await new Promise<any>((resolve,reject)=>{ const req=db.transaction(STORE).objectStore(STORE).get("current"); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error ?? new Error("Could not read the preserved recording")); }); db.close();
  if (!value) return undefined;
  if (value.blob instanceof Blob) return value as PendingRecording;
  return { sessionId: value.sessionId, contentType: value.contentType, blob: new Blob([value.data], { type: value.contentType }) };
}
export async function clearPending() {
  const db=await openDb(); await new Promise<void>((resolve,reject)=>{ const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).delete("current"); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error ?? new Error("Could not clear the preserved recording")); }); db.close();
}

