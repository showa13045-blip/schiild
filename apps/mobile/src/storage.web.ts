import { initialState } from '../../../packages/shared/domain.mjs';
import type { State } from '../../../packages/shared/types';

// Browser preview data is local to this browser profile and origin.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('schiild-preview-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read(key: string): Promise<any> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const request = tx.objectStore('records').get(key);
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
async function write(key: string, value?: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    if (value === undefined) store.delete(key); else store.put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function loadState(): Promise<State> {
  const state = await read('state');
  if (!state) return initialState();
  if (state.version !== 1 || !Array.isArray(state.ateliers) || !Array.isArray(state.schiils)) throw new Error('INVALID_STORAGE');
  return state;
}
export async function saveState(state: State) { await write('state', state); }
export async function loadDraft() { return (await read('draft')) ?? null; }
export async function saveDraft(draft: { uri: string; date: string; schiilId: string }) { await write('draft', draft); }
export async function removeDraft() { await write('draft'); }
export async function keepPhoto(uri: string, _filename: string): Promise<string> {
  if (uri.startsWith('data:image/')) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error('PHOTO_READ_FAILED');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export async function clearState() {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
