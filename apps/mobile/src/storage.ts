import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { initialState } from '../../../packages/shared/domain.mjs';
import type { State } from '../../../packages/shared/types';

const key = 'schiild.local.v1';
const draftKey = 'schiild.draft.v1';
export const imageDirectory = `${FileSystem.documentDirectory}schiils/`;
export async function loadState(): Promise<State> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return initialState();
  const state = JSON.parse(raw) as State;
  if (state.version !== 1 || !Array.isArray(state.ateliers) || !Array.isArray(state.schiils) || !['Asia/Tokyo', 'UTC'].includes(state.timezone)) throw new Error('INVALID_STORAGE');
  for (const item of state.schiils) {
    if (typeof item.schiilId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.schiildDate) || typeof item.uri !== 'string' || !Array.isArray(item.atelierIds)) throw new Error('INVALID_STORAGE');
  }
  for (const item of state.ateliers) if (typeof item.atelierId !== 'string' || typeof item.name !== 'string' || !Number.isInteger(item.capacity)) throw new Error('INVALID_STORAGE');
  return state;
}
export async function saveState(state: State) { await AsyncStorage.setItem(key, JSON.stringify(state)); }
export async function loadDraft() {
  const raw = await AsyncStorage.getItem(draftKey);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (typeof draft.uri !== 'string' || typeof draft.date !== 'string' || typeof draft.schiilId !== 'string') throw new Error('INVALID_DRAFT');
  return draft;
}
export async function saveDraft(draft: { uri: string; date: string; schiilId: string }) { await AsyncStorage.setItem(draftKey, JSON.stringify(draft)); }
export async function removeDraft() { await AsyncStorage.removeItem(draftKey); }
export async function keepPhoto(uri: string, filename: string) {
  await FileSystem.makeDirectoryAsync(imageDirectory, { intermediates: true });
  const target = `${imageDirectory}${filename}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}
export async function clearState() {
  await FileSystem.deleteAsync(imageDirectory, { idempotent: true });
  await AsyncStorage.multiRemove([key, draftKey]);
}
