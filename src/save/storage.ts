import { parseSave, serializeSave, type SaveData } from '../sim/save';

const KEY = 'rotten-depths-save';

export function loadSave(): SaveData | null {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return null; // storage blocked
  }
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, serializeSave(d));
  } catch { /* quota or blocked: the game still plays, it just won't persist */ }
}

export function eraseSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
