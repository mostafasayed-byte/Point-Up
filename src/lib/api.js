/* طبقة البيانات: كل التعامل مع Supabase هنا */
import { supabase, BUCKET } from './supabase.js';
import { genSerial, today, uuid } from './util.js';

export const PAGE = 30;

const one = (data) => (Array.isArray(data) ? data[0] : data);
const safeQ = (q) => String(q || '').replace(/[,()%*\\"]/g, ' ').trim();

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/* ===== الشركة والأعضاء ===== */
export async function getMembership(userId) {
  const mem = check(await supabase.from('members').select('user_id,org_id,display_name,role').eq('user_id', userId).maybeSingle());
  if (!mem) return null;
  const org = check(await supabase.from('organizations').select('id,name,invite_code,settings').eq('id', mem.org_id).single());
  return { member: mem, org };
}

export async function createOrganization(name, display) {
  return check(await supabase.rpc('create_organization', { p_name: name, p_display: display }));
}

export async function joinOrganization(code, display) {
  return check(await supabase.rpc('join_organization', { p_code: code, p_display: display }));
}

export async function listMembers(orgId) {
  return check(await supabase.from('members').select('user_id,display_name,role').eq('org_id', orgId)) || [];
}

export async function saveSettings(orgId, settings) {
  const rows = check(await supabase.from('organizations').update({ settings }).eq('id', orgId).select('settings'));
  if (!rows || !rows.length) throw Object.assign(new Error('لم يتم الحفظ: ليس لديك صلاحية تعديل بيانات الشركة.'), { code: '42501' });
  return rows[0].settings;
}

/* ===== التخزين ===== */
export async function uploadBlob(path, blob, upsert = false) {
  check(await supabase.storage.from(BUCKET).upload(path, blob, { upsert, contentType: blob.type || 'image/jpeg' }));
  return path;
}

export async function removeFiles(paths) {
  const p = (paths || []).filter(Boolean);
  if (!p.length) return;
  try { await supabase.storage.from(BUCKET).remove(p); } catch (e) { console.warn('cleanup failed', e); }
}

const urlCache = new Map();
/* يحمّل الملف من التخزين الخاص ويعيد رابط blob محلي (آمن للرسم على Canvas) */
export function fileUrl(path) {
  if (!path) return Promise.resolve('');
  if (!urlCache.has(path)) {
    const p = supabase.storage.from(BUCKET).download(path).then(({ data, error }) => {
      if (error) throw error;
      return URL.createObjectURL(data);
    });
    p.catch(() => urlCache.delete(path));
    urlCache.set(path, p);
  }
  return urlCache.get(path);
}

export async function signedUrl(path) {
  const d = check(await supabase.storage.from(BUCKET).createSignedUrl(path, 3600));
  return d.signedUrl;
}

/* ===== المستندات ===== */
async function withSerialRetry(fn) {
  let last;
  for (let i = 0; i < 5; i++) {
    const serial = genSerial();
    const { data, error } = await fn(serial);
    if (!error) return one(data);
    last = error;
    if (error.code !== '23505') break;
  }
  throw last;
}

/* payload: كل حقول المستند ما عدا serial والرقم (يولّدهما السيرفر) */
export async function issueDocument(payload) {
  return withSerialRetry((serial) => supabase.rpc('issue_document', { p: { ...payload, serial } }));
}

function docFilter(query, { q, type }) {
  if (type && type !== 'all') query = query.eq('type', type);
  const s = safeQ(q);
  if (s) query = query.or(`client.ilike.%${s}%,no.ilike.%${s}%`);
  return query;
}

export async function listDocuments({ page = 0, q = '', type = 'all' }) {
  let query = supabase.from('documents').select('*', { count: 'exact' });
  query = docFilter(query, { q, type }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await build().range(from, from + 999));
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

export async function sumDocuments({ q = '', type = 'all' }) {
  const rows = await fetchAll(() => docFilter(supabase.from('documents').select('total'), { q, type }).order('created_at', { ascending: false }));
  return rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
}

export async function allDocuments() {
  return fetchAll(() => supabase.from('documents').select('*').order('created_at', { ascending: false }));
}

export async function deleteDocument(row) {
  const rows = check(await supabase.from('documents').delete().eq('id', row.id).select('id'));
  if (!rows || !rows.length) throw Object.assign(new Error('لم يتم الحذف: ربما حُذف بالفعل (من شريكك) أو ليس لديك صلاحية.'), { code: '42501' });
  await removeFiles(attachmentPaths(row.attachments));
}

export const attachmentPaths = (a) => (a || []).map((p) => (typeof p === 'string' ? p : p && (p.storage_path || p.path))).filter(Boolean);

/* ===== الألبومات ===== */
export async function issueAlbum(meta, photos, orgId, onProgress) {
  const album = await withSerialRetry((serial) => supabase.rpc('issue_album', { p: { ...meta, serial } }));
  if (!album || !album.id) throw new Error('لم يُرجع الخادم بيانات الألبوم.');
  const uploaded = [];
  try {
    const rows = [];
    for (let i = 0; i < photos.length; i++) {
      onProgress && onProgress(i + 1, photos.length);
      const path = `${orgId}/albums/${album.id}/${uuid()}.jpg`;
      await uploadBlob(path, photos[i].blob);
      uploaded.push(path);
      rows.push({ album_id: album.id, org_id: orgId, storage_path: path, caption: photos[i].cap || '', position: i });
    }
    const inserted = check(await supabase.from('album_photos').insert(rows).select('id,storage_path,caption,position'));
    return { album, photos: inserted || rows };
  } catch (e) {
    await removeFiles(uploaded);
    try { await supabase.from('albums').delete().eq('id', album.id); } catch (x) { /* ignore */ }
    throw e;
  }
}

function albFilter(query, q) {
  const s = safeQ(q);
  if (s) query = query.or(`client.ilike.%${s}%,project.ilike.%${s}%,title.ilike.%${s}%,no.ilike.%${s}%`);
  return query;
}

export async function listAlbums({ page = 0, q = '' }) {
  const query = albFilter(supabase.from('albums').select('*, album_photos(count)', { count: 'exact' }), q)
    .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data || []).map((r) => ({ ...r, photo_count: (r.album_photos && r.album_photos[0] && r.album_photos[0].count) || 0 })), count: count || 0 };
}

export async function albumPhotos(albumId) {
  return check(await supabase.from('album_photos').select('id,storage_path,caption,position').eq('album_id', albumId).order('position', { ascending: true })) || [];
}

export async function deleteAlbum(album) {
  const photos = await albumPhotos(album.id);
  if (photos.length) check(await supabase.from('album_photos').delete().eq('album_id', album.id));
  const rows = check(await supabase.from('albums').delete().eq('id', album.id).select('id'));
  if (!rows || !rows.length) throw Object.assign(new Error('لم يتم الحذف: ربما حُذف بالفعل (من شريكك) أو ليس لديك صلاحية.'), { code: '42501' });
  await removeFiles(photos.map((p) => p.storage_path));
}

/* ===== سجل الأرقام ===== */
export async function addStamp({ orgId, serial, file_name, note }) {
  return check(await supabase.from('stamp_register').insert({ org_id: orgId, serial, kind: 'stamp', stamped_on: today(), file_name, note: note || null }));
}

export async function listStamps(limit = 30) {
  return check(await supabase.from('stamp_register').select('serial,kind,stamped_on,file_name,note,created_at').order('created_at', { ascending: false }).limit(limit)) || [];
}

export async function allStamps() {
  return fetchAll(() => supabase.from('stamp_register').select('serial,kind,stamped_on,file_name,note,created_at').order('created_at', { ascending: false }));
}

/* ===== التحقق العام ===== */
export async function verifySerial(serial) {
  return one(check(await supabase.rpc('verify_serial', { p_serial: serial })));
}
