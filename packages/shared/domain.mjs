export function logicalDate(now = new Date()) { return now.toISOString().slice(0, 10); }
export function timeWindow(date, timeZone = 'Asia/Tokyo') {
  const begin = new Date(date + 'T00:00:00Z');
  const end = new Date(begin.getTime() + 86400000);
  const formatter = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatter.format(begin)} – ${formatter.format(end)} ${timeZone === 'Asia/Tokyo' ? 'JST' : 'UTC'}`;
}
export function initialState() { return { version: 1, ateliers: [], schiils: [], timezone: 'Asia/Tokyo' }; }
export function addAtelier(state, atelier) {
  const name = atelier.name.trim();
  if (!name || name.length > 40 || !Number.isInteger(atelier.capacity) || atelier.capacity < 2 || atelier.capacity > 2000) throw new Error('INVALID_ATELIER');
  if (state.ateliers.some(item => item.atelierId === atelier.atelierId)) throw new Error('DUPLICATE_ATELIER');
  return { ...state, ateliers: [...state.ateliers, { ...atelier, name }] };
}
export function recordSchiil(state, schiil, now = new Date()) {
  if (schiil.schiildDate !== logicalDate(now)) throw new Error('DATE_CHANGED');
  if (state.schiils.some(item => item.schiildDate === schiil.schiildDate)) throw new Error('ALREADY_RECORDED');
  if (!schiil.atelierIds.length || schiil.atelierIds.some(atelierId => !state.ateliers.some(item => item.atelierId === atelierId))) throw new Error('INVALID_ATELIER');
  return { ...state, schiils: [...state.schiils, schiil] };
}
export function addToAtelier(state, schiilId, atelierId, now = new Date()) {
  const source = state.schiils.find(item => item.schiilId === schiilId);
  if (!source || source.schiildDate !== logicalDate(now)) throw new Error('DATE_CHANGED');
  if (!state.ateliers.some(item => item.atelierId === atelierId)) throw new Error('INVALID_ATELIER');
  return { ...state, schiils: state.schiils.map(item => item.schiilId === schiilId ? { ...item, atelierIds: [...new Set([...item.atelierIds, atelierId])] } : item) };
}
