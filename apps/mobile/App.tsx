import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp/500Medium';
import { colors as c, radius } from '../../packages/shared/tokens';
import { t } from '../../packages/shared/copy';
import { addAtelier, addToAtelier, initialState, logicalDate, recordSchiil, timeWindow } from '../../packages/shared/domain.mjs';
import type { AtelierId, SchiilId, State } from '../../packages/shared/types';
import { clearState, keepPhoto, loadDraft, loadState, removeDraft, saveDraft, saveState } from './src/storage';

type Screen = 'home' | 'archive' | 'my' | 'settings' | 'create' | 'atelier' | 'camera' | 'photo';
type Draft = { uri: string; date: string; schiilId: SchiilId };
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const rootScreens: Screen[] = ['home', 'archive', 'my'];

function Label({ children }: { children: React.ReactNode }) { return <Text style={styles.label}>{children}</Text>; }
function Button({ title, onPress, secondary = false, danger = false, busy = false }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, danger && styles.dangerButton, pressed && { opacity: 0.7 }]}>{busy ? <ActivityIndicator color={secondary ? c.ink : c.surface} /> : <Text style={[styles.buttonText, secondary && { color: c.ink }]}>{title}</Text>}</Pressable>;
}
function Empty({ title, body }: { title: string; body?: string }) { return <View style={styles.empty}><View style={styles.emptyMark}><View style={styles.markDot} /></View><Text style={styles.body}>{title}</Text>{body && <Text style={styles.muted}>{body}</Text>}</View>; }

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, NotoSansJP_400Regular, NotoSansJP_500Medium });
  const [state, setState] = useState<State>(initialState());
  const stateRef = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [atelierId, setAtelierId] = useState<AtelierId | null>(null);
  const [schiilId, setSchiilId] = useState<SchiilId | null>(null);
  const [today, setToday] = useState(logicalDate());
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('12');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<AtelierId[]>([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'record' | 'delete' | null>(null);
  const [archiveTab, setArchiveTab] = useState<'photos' | 'works'>('photos');

  useEffect(() => { Promise.all([loadState(), loadDraft()]).then(([value, pending]) => { stateRef.current = value; setState(value); if (pending && !value.schiils.some(item => item.schiilId === pending.schiilId)) setDraft(pending); }).catch(() => setLoadFailed(true)).finally(() => setLoaded(true)); }, []);
  useEffect(() => {
    const refresh = () => setToday(logicalDate());
    const interval = setInterval(refresh, 1000);
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);
  useEffect(() => { if (notice) AccessibilityInfo.announceForAccessibility(notice); }, [notice]);
  useEffect(() => { if (Platform.OS === 'web') document.documentElement.style.colorScheme = 'light'; }, []);
  const recorded = state.schiils.find(item => item.schiildDate === today);
  const atelier = state.ateliers.find(item => item.atelierId === atelierId);
  const photo = state.schiils.find(item => item.schiilId === schiilId);
  const windowLabel = timeWindow(today, state.timezone);

  function go(next: Screen) { if (lock.current) return; setNotice(''); setScreen(next); }
  async function mutate(action: (current: State) => State) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { const next = action(stateRef.current); await saveState(next); stateRef.current = next; setState(next); return true; }
    catch (error) { const code = error instanceof Error ? error.message : ''; setNotice(t(code === 'DATE_CHANGED' ? 'dateChanged' : code === 'ALREADY_RECORDED' ? 'recorded' : 'genericError')); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function startCamera() { setSelected(atelierId ? [atelierId] : state.ateliers.map(item => item.atelierId)); setCameraReady(false); go('camera'); }
  async function capture() {
    if (!camera.current || !cameraReady || lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    const date = logicalDate();
    try {
      const image = await camera.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!image) throw new Error('NO_IMAGE');
      const side = Math.min(image.width, image.height);
      const square = await manipulateAsync(image.uri, [{ crop: { originX: Math.floor((image.width - side) / 2), originY: Math.floor((image.height - side) / 2), width: side, height: side } }, { resize: { width: 1080, height: 1080 } }], { compress: 0.85, format: SaveFormat.JPEG });
      const nextId = uid() as SchiilId;
      const uri = await keepPhoto(square.uri, nextId);
      const pending = { uri, date, schiilId: nextId };
      setDraft(pending);
      await saveDraft(pending);
    } catch { setNotice(t('cameraError')); }
    finally { lock.current = false; setBusy(false); }
  }
  async function commitPhoto() {
    if (!draft) return;
    const ok = await mutate(current => recordSchiil(current, { schiilId: draft.schiilId, schiildDate: draft.date, uri: draft.uri, atelierIds: selected, createdAt: new Date().toISOString() }));
    setConfirm(null);
    if (ok) { setDraft(null); await removeDraft().catch(() => {}); setScreen('home'); setNotice(t('stored')); }
    else if (draft.date === logicalDate() && !stateRef.current.schiils.some(item => item.schiildDate === draft.date)) setNotice(t('saveError'));
  }
  async function create() {
    const n = Number(capacity);
    if (!name.trim() || name.trim().length > 40 || !Number.isInteger(n) || n < 2 || n > 2000) { setNotice(t('invalidAtelier')); return; }
    const newId = uid() as AtelierId;
    if (await mutate(current => addAtelier(current, { atelierId: newId, name, capacity: n, createdAt: new Date().toISOString() }))) { setAtelierId(newId); setName(''); setCapacity('12'); setScreen('atelier'); setNotice(''); }
  }
  async function erase() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await clearState(); const next = initialState(); stateRef.current = next; setState(next); setDraft(null); setAtelierId(null); setSchiilId(null); setScreen('home'); setNotice(''); }
    catch { setNotice(t('genericError')); }
    finally { setConfirm(null); lock.current = false; setBusy(false); }
  }

  if (!loaded || (!fontsLoaded && !fontError)) return <SafeAreaProvider><SafeAreaView style={styles.app}><View style={styles.center}><ActivityIndicator color={c.ink} /><Text style={styles.muted}>{t('loading')}</Text></View></SafeAreaView></SafeAreaProvider>;
  if (loadFailed) return <SafeAreaProvider><SafeAreaView style={styles.app}><View style={styles.center}><Text style={styles.body}>{t('storageError')}</Text></View></SafeAreaView></SafeAreaProvider>;
  const isCamera = screen === 'camera' && !draft && !recorded;

  return <SafeAreaProvider><SafeAreaView style={styles.app} edges={['top', 'left', 'right']}><StatusBar style="dark" />
    <View style={styles.header}>
      {rootScreens.includes(screen) ? <View style={styles.wordmark}><View style={styles.logo}><View style={styles.logoInset} /></View><Text style={styles.brand}>{t('brand')}</Text></View> : <Pressable accessibilityRole="button" onPress={() => go(screen === 'photo' ? 'archive' : 'home')} style={styles.back}><Text style={styles.body}>‹ {t('back')}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => go('settings')} hitSlop={12}><Text style={styles.meta}>{t('settings')}</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {notice !== '' && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.body}>{notice}</Text></View>}

      {screen === 'home' && <>
        <Label>{today.replaceAll('-', '.')} / {t('today')}</Label>
        <Text style={styles.title}>{t('once')}</Text>
        <Text style={styles.muted}>{t('intro')}</Text>
        <Text style={styles.window}>{windowLabel}</Text>
        {recorded ? <View style={styles.recordCard}><Image source={{ uri: recorded.uri }} style={styles.recordImage} accessibilityLabel={t('cameraTitle')} /><View style={styles.recordBody}><Label>{t('photos')}</Label><Text style={styles.subtitle}>{t('recorded')}</Text><Text style={styles.muted}>{t('recordedHint')}</Text></View></View> : <View style={styles.todayCard}><View style={styles.viewfinder}><View style={styles.viewfinderCross} /><View style={[styles.viewfinderCross, { transform: [{ rotate: '90deg' }] }]} /></View><Text style={styles.body}>{state.ateliers.length ? t('cameraHint') : t('noAtelier')}</Text><Button title={state.ateliers.length ? t('capture') : t('createFirst')} onPress={() => state.ateliers.length ? startCamera() : go('create')} /></View>}
        <View style={styles.sectionHeader}><Text style={styles.subtitle}>{t('yourAteliers')}</Text><Pressable accessibilityRole="button" onPress={() => go('create')} hitSlop={12}><Text style={styles.body}>＋</Text></Pressable></View>
        {state.ateliers.map((item, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} ${t('open')}`} key={item.atelierId} onPress={() => { setAtelierId(item.atelierId); go('atelier'); }} style={styles.atelierRow}><Text style={styles.rowNumber}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={styles.body}>{item.name}</Text><Text style={styles.meta}>{t('capacityLabel', { n: item.capacity })}</Text></View><Text style={styles.body}>↗</Text></Pressable>)}
        <View style={styles.localBox}><Label>{t('local')}</Label><Text style={styles.muted}>{t('localNote')}</Text></View>
      </>}

      {screen === 'create' && <><Label>ATELIER</Label><Text style={styles.title}>{t('create')}</Text><Text style={styles.muted}>{t('createHint')}</Text><Text style={styles.fieldLabel}>{t('atelierName')}</Text><TextInput accessibilityLabel={t('atelierName')} value={name} onChangeText={setName} maxLength={40} placeholder={t('namePlaceholder')} placeholderTextColor={c.ink3} style={styles.input} /><Text style={styles.fieldLabel}>{t('capacity')}</Text><TextInput accessibilityLabel={t('capacity')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={4} style={[styles.input, styles.numeric]} /><Text style={styles.muted}>{t('capacityHint')}</Text><View style={styles.spacer} /><Button title={t('create')} onPress={create} busy={busy} /></>}

      {screen === 'atelier' && atelier && <><Label>ATELIER / {t('capacityLabel', { n: atelier.capacity })}</Label><Text style={styles.title}>{atelier.name}</Text><Text style={styles.window}>{windowLabel}</Text><View style={styles.canvasUnavailable}><Text style={styles.subtitle}>{t('canvas')}</Text><Text style={styles.muted}>{t('canvasNote')}</Text></View><View style={styles.sectionHeader}><Text style={styles.subtitle}>{t('members', { n: atelier.capacity })}</Text></View><View accessibilityLabel={t('anonymous')} style={styles.members}>{Array.from({ length: Math.min(atelier.capacity, 48) }, (_, index) => <View key={index} style={styles.member} />)}</View><Text style={styles.muted}>{t('anonymous')}</Text><View style={styles.spacer} />{recorded ? recorded.atelierIds.includes(atelier.atelierId) ? <Text style={styles.body}>{t('added')}</Text> : <Button title={t('add')} onPress={async () => { if (await mutate(current => addToAtelier(current, recorded.schiilId, atelier.atelierId))) setNotice(t('stored')); }} busy={busy} /> : <Button title={t('capture')} onPress={startCamera} />}<View style={styles.sectionHeader}><Text style={styles.subtitle}>{t('works')}</Text></View><Empty title={t('noWorks')} body={t('noWorksHint')} /></>}

      {screen === 'camera' && recorded && <><Text style={styles.title}>{t('recorded')}</Text><Image source={{ uri: recorded.uri }} style={styles.fullImage} /><Text style={styles.muted}>{t('recordedHint')}</Text><Button title={t('home')} onPress={() => go('home')} /></>}
      {isCamera && <><Label>{today.replaceAll('-', '.')} / 1080 × 1080</Label><Text style={styles.title}>{t('cameraTitle')}</Text><Text style={styles.window}>{windowLabel}</Text>{permission?.granted ? <><View style={styles.cameraFrame}><CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => setNotice(t('cameraError'))} /><View pointerEvents="none" style={styles.cameraGuides}><View style={styles.cameraGuide} /><View style={styles.cameraGuide} /></View></View><Text style={styles.muted}>{t('cameraHint')}</Text>{cameraReady && <Pressable accessibilityRole="button" accessibilityLabel={t('shutter')} disabled={busy} onPress={capture} style={styles.shutter}>{busy ? <ActivityIndicator color={c.ink} /> : <View style={styles.shutterInner} />}</Pressable>}</> : <Empty title={t('permissionTitle')} body={t('permissionBody')} />}{!permission?.granted && <Button title={permission?.canAskAgain === false ? t('openSettings') : t('allow')} onPress={() => { if (permission?.canAskAgain === false) Linking.openSettings().catch(() => setNotice(t('cameraError'))); else requestPermission().catch(() => setNotice(t('cameraError'))); }} />}</>}

      {screen === 'camera' && draft && !recorded && <><Label>{draft.date.replaceAll('-', '.')} / {t('photos')}</Label><Text style={styles.title}>{t('review')}</Text><Image source={{ uri: draft.uri }} style={styles.fullImage} /><Text style={styles.meta}>{t('dimensions')}</Text><Text style={styles.fieldLabel}>{t('chooseAtelier')}</Text>{state.ateliers.map(item => <Pressable key={item.atelierId} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.atelierId) }} onPress={() => setSelected(items => items.includes(item.atelierId) ? items.filter(value => value !== item.atelierId) : [...items, item.atelierId])} style={styles.choice}><Text style={styles.body}>{item.name}</Text><View style={[styles.checkbox, selected.includes(item.atelierId) && { backgroundColor: c.fill }]}><Text style={styles.checkText}>{selected.includes(item.atelierId) ? '✓' : ''}</Text></View></Pressable>)}<View style={styles.spacer} /><Button title={t('confirm')} onPress={() => { if (!selected.length) setNotice(t('chooseRequired')); else if (draft.date !== logicalDate()) setNotice(t('dateChanged')); else setConfirm('record'); }} busy={busy} /><Button title={t('retake')} secondary onPress={() => { setDraft(null); setCameraReady(false); setNotice(''); }} /></>}

      {screen === 'archive' && <><Label>ARCHIVE</Label><Text style={styles.title}>{t('archive')}</Text><View style={styles.tabs}>{(['photos', 'works'] as const).map(tab => <Pressable accessibilityRole="tab" accessibilityState={{ selected: archiveTab === tab }} key={tab} onPress={() => setArchiveTab(tab)} style={[styles.tab, archiveTab === tab && styles.activeTab]}><Text style={styles.body}>{t(tab)}</Text></Pressable>)}</View>{archiveTab === 'works' ? <Empty title={t('noWorks')} body={t('noWorksHint')} /> : !state.schiils.length ? <><Empty title={t('noPhotos')} /><Button title={state.ateliers.length ? t('capture') : t('createFirst')} onPress={() => state.ateliers.length ? startCamera() : go('create')} /></> : <View style={styles.photoGrid}>{[...state.schiils].reverse().map(item => <Pressable accessibilityRole="button" accessibilityLabel={`${t('detail')} ${item.schiildDate}`} onPress={() => { setSchiilId(item.schiilId); go('photo'); }} key={item.schiilId} style={styles.photoTile}><Image source={{ uri: item.uri }} style={styles.tileImage} /><Text style={styles.meta}>{item.schiildDate.replaceAll('-', '.')}</Text></Pressable>)}</View>}</>}

      {screen === 'photo' && photo && <><Label>{t('photos')} / {photo.schiildDate.replaceAll('-', '.')}</Label><Text style={styles.title}>{t('detail')}</Text><Image source={{ uri: photo.uri }} style={styles.fullImage} /><Text style={styles.window}>{timeWindow(photo.schiildDate, state.timezone)}</Text><Text style={styles.meta}>{t('dimensions')}</Text><View style={styles.sectionHeader}><Text style={styles.subtitle}>{t('atelier')}</Text></View>{photo.atelierIds.map(itemId => <Text key={itemId} style={styles.body}>{state.ateliers.find(item => item.atelierId === itemId)?.name}</Text>)}<Text style={styles.muted}>{t('notSent')}</Text></>}

      {screen === 'my' && <><Label>MY RECORD</Label><Text style={styles.title}>{t('my')}</Text><View style={styles.statRow}><View style={styles.stat}><Text style={styles.statNumber}>{String(state.schiils.length).padStart(2, '0')}</Text><Text style={styles.muted}>{t('photos')}</Text></View><View style={styles.stat}><Text style={styles.statNumber}>{String(state.ateliers.length).padStart(2, '0')}</Text><Text style={styles.muted}>{t('atelier')}</Text></View></View><Button title={t('archive')} secondary onPress={() => go('archive')} /><Button title={t('settings')} secondary onPress={() => go('settings')} /><View style={styles.localBox}><Label>{t('local')}</Label><Text style={styles.muted}>{t('localNote')}</Text></View></>}

      {screen === 'settings' && <><Label>SETTINGS</Label><Text style={styles.title}>{t('settings')}</Text><Text style={styles.fieldLabel}>{t('timezone')}</Text>{(['Asia/Tokyo', 'UTC'] as const).map(zone => <Pressable accessibilityRole="radio" accessibilityState={{ checked: state.timezone === zone }} key={zone} onPress={() => mutate(current => ({ ...current, timezone: zone }))} style={styles.choice}><Text style={styles.body}>{t(zone === 'UTC' ? 'utc' : 'tokyo')}</Text><Text style={styles.body}>{state.timezone === zone ? '●' : '○'}</Text></Pressable>)}<Text style={styles.muted}>{t('timeNote')}</Text><View style={styles.sectionHeader}><Text style={styles.subtitle}>{t('about')}</Text></View><Text style={styles.muted}>{t('aboutBody')}</Text><View style={styles.spacer} /><Pressable accessibilityRole="button" onPress={() => setConfirm('delete')} style={styles.deleteRow}><Text style={[styles.body, { color: c.danger }]}>{t('delete')}</Text></Pressable><Text style={styles.meta}>Schiild / 0.1.0</Text></>}
    </ScrollView>

    {rootScreens.includes(screen) && <SafeAreaView edges={['bottom']} style={styles.navSafe}><View style={styles.nav}>{(['home', 'archive', 'my'] as const).map((item, index) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: screen === item }} key={item} onPress={() => { setAtelierId(null); go(item); }} style={styles.navItem}><View style={[styles.navIcon, index === 1 && styles.archiveIcon, index === 2 && styles.personIcon, screen === item && { backgroundColor: c.fill }]} /><Text style={[styles.navLabel, screen === item && { color: c.ink }]}>{t(item)}</Text></Pressable>)}</View></SafeAreaView>}

    <Modal visible={confirm !== null} transparent animationType="none" onRequestClose={() => { if (!busy) setConfirm(null); }}><View style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modal}><ScrollView><Text accessibilityRole="header" style={styles.subtitle}>{t(confirm === 'delete' ? 'deleteTitle' : 'confirmTitle')}</Text>{confirm === 'delete' ? <><Text style={styles.fieldLabel}>{t('disappears')}</Text><Text style={styles.muted}>{t('disappearsBody')}</Text><Text style={styles.fieldLabel}>{t('remains')}</Text><Text style={styles.muted}>{t('remainsBody')}</Text></> : <Text style={styles.muted}>{t('confirmBody')}</Text>}<View style={styles.spacer} /><Button title={t(confirm === 'delete' ? 'deleteConfirm' : 'confirm')} danger={confirm === 'delete'} onPress={confirm === 'delete' ? erase : commitPhoto} busy={busy} /><Button title={t('cancel')} secondary onPress={() => { if (!busy) setConfirm(null); }} /></ScrollView></View></View></Modal>
  </SafeAreaView></SafeAreaProvider>;
}

const jp = 'NotoSansJP_400Regular';
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: c.bg }, flex: { flex: 1 }, center: { flex: 1, justifyContent: 'center', padding: 32, gap: 16 },
  header: { minHeight: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: c.line },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brand: { fontFamily: 'Inter_500Medium', fontSize: 26, letterSpacing: -1, color: c.ink },
  logo: { width: 24, height: 24, backgroundColor: c.fill, padding: 4 }, logoInset: { width: 8, height: 8, backgroundColor: c.bg, alignSelf: 'flex-end' }, back: { paddingVertical: 12 },
  content: { padding: 24, paddingBottom: 48, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  label: { color: c.ink2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, letterSpacing: 1.2, lineHeight: 20 },
  title: { fontFamily: 'NotoSansJP_500Medium', color: c.ink, fontSize: 28, lineHeight: 42 },
  subtitle: { fontFamily: 'NotoSansJP_500Medium', fontSize: 18, color: c.ink, lineHeight: 28 },
  body: { fontFamily: jp, fontSize: 16, lineHeight: 26, color: c.ink }, muted: { fontFamily: jp, fontSize: 14, lineHeight: 24, color: c.ink2 },
  meta: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: c.ink2, lineHeight: 20 },
  window: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 20, color: c.ink2 },
  button: { minHeight: 56, padding: 16, backgroundColor: c.fill, borderRadius: radius.control, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.fill },
  buttonText: { fontFamily: 'NotoSansJP_500Medium', fontSize: 16, color: c.surface, textAlign: 'center' }, secondaryButton: { backgroundColor: c.bg, borderColor: c.lineStrong }, dangerButton: { backgroundColor: c.danger, borderColor: c.danger },
  todayCard: { padding: 24, backgroundColor: c.surface, borderRadius: radius.card, gap: 24, borderWidth: 1, borderColor: c.line },
  viewfinder: { alignSelf: 'center', marginVertical: 24, width: 80, height: 80, borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' }, viewfinderCross: { position: 'absolute', height: 1, width: 16, backgroundColor: c.lineStrong },
  sectionHeader: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  atelierRow: { borderTopWidth: 1, borderColor: c.line, paddingVertical: 24, flexDirection: 'row', gap: 16, alignItems: 'center' }, rowNumber: { fontFamily: 'Inter_400Regular', color: c.ink3, fontSize: 14 },
  localBox: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderColor: c.line, gap: 8 },
  input: { backgroundColor: c.surface, borderRadius: radius.control, borderWidth: 1, borderColor: c.lineStrong, padding: 16, minHeight: 56, fontSize: 16, fontFamily: jp, color: c.ink }, numeric: { fontFamily: 'Inter_400Regular' },
  fieldLabel: { marginTop: 16, fontFamily: 'NotoSansJP_500Medium', fontSize: 14, color: c.ink }, spacer: { height: 16 },
  canvasUnavailable: { minHeight: 160, padding: 24, borderWidth: 1, borderColor: c.line, justifyContent: 'center', gap: 12 }, members: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, member: { width: 24, height: 32, backgroundColor: c.sunken, borderWidth: 1, borderColor: c.lineStrong },
  empty: { paddingVertical: 32, gap: 16 }, emptyMark: { width: 32, height: 32, borderWidth: 1, borderColor: c.lineStrong, padding: 8 }, markDot: { width: 8, height: 8, backgroundColor: c.lineStrong },
  recordCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }, recordImage: { width: '100%', aspectRatio: 1, borderRadius: 0 }, recordBody: { padding: 24, gap: 12 },
  cameraFrame: { width: '100%', aspectRatio: 1, backgroundColor: c.fill, overflow: 'hidden' }, cameraGuides: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', justifyContent: 'space-evenly' }, cameraGuide: { width: 1, backgroundColor: c.surface, opacity: 0.25 },
  shutter: { alignSelf: 'center', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: c.ink, padding: 4, alignItems: 'center', justifyContent: 'center', marginVertical: 16 }, shutterInner: { backgroundColor: c.fill, width: 64, height: 64, borderRadius: 32 },
  fullImage: { width: '100%', aspectRatio: 1, borderRadius: 0 },
  choice: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: c.line, gap: 16 }, checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' }, checkText: { color: c.surface, fontSize: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line }, tab: { padding: 16, flex: 1, alignItems: 'center' }, activeTab: { borderBottomWidth: 2, borderColor: c.ink },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, photoTile: { width: '47%', gap: 8 }, tileImage: { width: '100%', aspectRatio: 1, borderRadius: 0 },
  statRow: { flexDirection: 'row', paddingVertical: 32, gap: 32, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, marginVertical: 16 }, stat: { flex: 1, gap: 8 }, statNumber: { fontFamily: 'Inter_400Regular', fontSize: 48, color: c.ink },
  deleteRow: { paddingVertical: 16, borderTopWidth: 1, borderColor: c.line }, notice: { padding: 16, backgroundColor: c.sunken, borderRadius: radius.control },
  navSafe: { backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.line }, nav: { flexDirection: 'row', minHeight: 80 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }, navLabel: { fontFamily: jp, fontSize: 12, color: c.ink2 }, navIcon: { width: 16, height: 16, borderWidth: 1, borderColor: c.ink }, archiveIcon: { borderTopWidth: 4 }, personIcon: { borderRadius: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20,19,15,0.45)', justifyContent: 'center', padding: 24 }, modal: { padding: 24, backgroundColor: c.bg, borderRadius: radius.card, maxHeight: '85%', gap: 16 },
});
