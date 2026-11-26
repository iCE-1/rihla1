/* 10-backup.js — النسخ الاحتياطي والاستيراد، وأدوات عامة (formatDate، escapeHtml، resetCreds) */

/* ============ النسخ الاحتياطي ============ */

const BACKUP_KEY = 'rihla_last_backup';
const BACKUP_SNOOZE = 'rihla_backup_snooze';

function lastBackupInfo(){
  const last = parseInt(localStorage.getItem(BACKUP_KEY) || '0') || 0;
  return {last, days: last ? Math.floor((Date.now() - last) / 86400000) : null};
}

function renderBackupInfo(){
  const el = document.getElementById('backupInfo');
  if(!el) return;
  const {last, days} = lastBackupInfo();
  el.textContent = last
    ? `آخر تصدير من هذا الجهاز: ${days === 0 ? 'اليوم' : 'قبل ' + days + ' يومًا'}. الملف صورة ثابتة من بياناتك لحظة التصدير.`
    : 'لم تصدّر نسخة من هذا الجهاز بعد. الملف صورة ثابتة من بياناتك لحظة التصدير.';
}

function renderBackupReminder(){
  const el = document.getElementById('backupReminder');
  if(!el) return;
  const {last, days} = lastBackupInfo();
  const snooze = parseInt(localStorage.getItem(BACKUP_SNOOZE) || '0') || 0;
  const due = last ? days >= 30 : entriesCache.length >= 5;
  if(!due || Date.now() < snooze){ el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="monthly-summary" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <span>🗂 ${last ? `آخر نسخة احتياطية قبل ${days} يومًا.` : 'لم تصدّر نسخة احتياطية من بياناتك بعد.'}</span>
      <span style="display:flex;gap:8px">
        <button class="primary" onclick="exportBackup()">صدّر الآن</button>
        <button class="ghost" onclick="snoozeBackup()">ذكّرني لاحقًا</button>
      </span>
    </div>`;
}

function snoozeBackup(){
  localStorage.setItem(BACKUP_SNOOZE, String(Date.now() + 7 * 86400000));
  renderBackupReminder();
}

async function exportBackup(){
  try{
    showToast('جاري تجهيز النسخة...');
    const [subjects, books, entries] = await Promise.all([
      fetchAllRows('subjects', q => q.order('id')),
      fetchAllRows('books', q => q.order('id')),
      fetchAllRows('entries', q => q.order('id'))
    ]);
    const payload = {app:'rihla', version:1, exported_at:new Date().toISOString(), subjects, books, entries};
    const blob = new Blob([JSON.stringify(payload, null, 1)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rihla-backup-${toDateStr(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
    localStorage.removeItem(BACKUP_SNOOZE);
    renderBackupReminder();
    renderBackupInfo();
    showToast(`تم تصدير ${entries.length} قيد و${books.length} كتاب ✓`);
  }catch(e){
    showToast('تعذّر التصدير: ' + (e.message || e), 'warn');
  }
}

function pickBackupFile(){
  document.getElementById('backupFile').click();
}

async function upsertChunks(table, rows){
  for(let i = 0; i < rows.length; i += 200){
    const {error} = await sb.from(table).upsert(rows.slice(i, i + 200), {onConflict:'id'});
    if(error) throw error;
  }
}

async function importBackup(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  let data;
  try{ data = JSON.parse(await file.text()); }
  catch(e){ alert('الملف غير صالح.'); return; }
  if(!data || data.app !== 'rihla' || !Array.isArray(data.entries) || !Array.isArray(data.books) || !Array.isArray(data.subjects)){
    alert('هذا ليس ملف نسخة احتياطية من «الرحلة العلمية».');
    return;
  }
  if(!confirm(`سيتم دمج النسخة مع بياناتك الحالية:\n• ${data.subjects.length} علم\n• ${data.books.length} كتاب\n• ${data.entries.length} قيد\n\nما كان له نفس المعرّف سيُستبدل بما في الملف، ولن يُحذف أي شيء آخر.\n\nمتابعة؟`)) return;
  try{
    showToast('جاري الاستيراد، لا تغلق الصفحة...');
    const strip = ({user_id, ...rest}) => rest;
    const {data: current} = await sb.from('subjects').select('id,name');
    const byName = new Map((current || []).map(x => [x.name, x.id]));
    const curIds = new Set((current || []).map(x => x.id));
    const idMap = new Map();
    const subjectRows = [];
    data.subjects.forEach(x => {
      if(!curIds.has(x.id) && byName.has(x.name)){
        idMap.set(x.id, byName.get(x.name));   // علم موجود بنفس الاسم: ندمج الكتب فيه
      } else {
        idMap.set(x.id, x.id);
        subjectRows.push(strip(x));
      }
    });
    await upsertChunks('subjects', subjectRows);
    await upsertChunks('books', data.books.map(b => ({...strip(b), subject_id: idMap.get(b.subject_id) || b.subject_id})));
    await upsertChunks('entries', data.entries.map(strip));
    await syncBooksUi();
    await loadEntries();
    showToast(`تم استيراد ${data.entries.length} قيد و${data.books.length} كتاب ✓`);
  }catch(e){
    showToast('تعذّر الاستيراد: ' + (e.message || e), 'warn');
  }
}

function formatDate(d){
  const date = new Date(d);
  return date.toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'});
}
function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
function resetCreds(){
  if(!confirm('سيتم فصل الاتصال بهذه القاعدة (بياناتك تبقى محفوظة في Supabase). متابعة؟')) return;
  localStorage.removeItem(LS_KEY_URL);
  localStorage.removeItem(LS_KEY_KEY);
  init();
}
