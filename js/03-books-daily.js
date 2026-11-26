/* 03-books-daily.js — الكتب: الذاكرة المؤقتة، الكتب الجارية، التنبيهات، تسجيل التقدم، الواجهة اليومية */

/* ============ الكتب: ذاكرة مؤقتة + ربط بالسجل والتركيز ============ */

let booksCache = [];
let entriesCache = [];

async function refreshBooksCache(){
  let res = await sb.from('books').select('*, subjects(name)').order('level').order('sort_order').order('created_at');
  if(res.error) res = await sb.from('books').select('*').order('level').order('sort_order').order('created_at');
  if(!res.error) booksCache = res.data || [];
  return res.error;
}

async function syncBooksUi(){
  await refreshBooksCache();
  renderCurrentBooks();
  refreshBookSelects();
}

function lessonUnit(b){ return (b.kind || 'matn') === 'book' ? 'صفحة' : 'درس'; }

function bookOptionsHtml(selectedId){
  const rank = {in_progress:0, todo:1, complete:2};
  const list = booksCache
    .filter(b => b.status !== 'complete' || b.id === selectedId)
    .sort((a,b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  const groups = new Map();
  list.forEach(b => {
    const name = (b.subjects && b.subjects.name) || 'أخرى';
    if(!groups.has(name)) groups.set(name, []);
    groups.get(name).push(b);
  });
  return `<option value="">— بدون كتاب —</option>` + [...groups.entries()].map(([name, items]) =>
    `<optgroup label="${attrEscape(name)}">${items.map(b =>
      `<option value="${b.id}" ${b.id===selectedId?'selected':''}>${escapeHtml(b.name)}${b.status==='in_progress' ? ' (أدرسه الحين)' : ''}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function refreshBookSelects(){
  const e = document.getElementById('entryBook');
  if(e){ const v = e.value; e.innerHTML = bookOptionsHtml(v); e.value = v; onEntryBookChange(); }
  const f = document.getElementById('focusBook');
  if(f){
    f.innerHTML = bookOptionsHtml(focusBookId);
    f.value = focusBookId;
    if(f.value !== focusBookId) focusBookId = '';
    updateFocusLinkUi();
  }
}

function renderCurrentBooks(){
  const el = document.getElementById('currentBooks');
  if(!el) return;
  const current = booksCache.filter(b => b.status === 'in_progress');
  el.innerHTML = `
    <div class="timeline-head"><h2>أدرسه الحين</h2></div>
    ${current.length ? `<div class="books-grid">${current.map(b => {
      const p = bookProgressPct(b);
      const subject = (b.subjects && b.subjects.name) || '';
      return `
      <div class="path-card status-in_progress">
        <div class="cb-row"><div class="sj-name" style="margin-bottom:0">${escapeHtml(b.name)}</div><div class="cb-pct">${p.pct}%</div></div>
        <div class="cb-sub">${escapeHtml(subject)}</div>
        ${bookTimeHtml(b)}
        <div class="sj-progress-bar" style="margin-bottom:0"><div class="sj-progress-fill" style="width:${p.pct}%"></div></div>
      </div>`;
    }).join('')}</div>` : `<div class="empty" style="padding:26px 20px">لا يوجد كتاب تدرسه الآن. من «الطريق» غيّر حالة كتاب إلى «أدرسه الحين» ليظهر هنا.</div>`}
  `;
}

function showToast(msg, kind, action){
  let wrap = document.getElementById('toastWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (kind === 'warn' ? ' warn' : '');
  t.textContent = msg;
  if(action){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { t.remove(); action.onClick(); });
    t.appendChild(btn);
    t.style.pointerEvents = 'auto';
  }
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, action ? 9000 : 4200);
}

/* يسجّل في الكتاب أنك وصلت للدرس/الصفحة n، كأنك عدّلته بنفسك من «الطريق» */
async function recordProgress(book, n){
  const b = booksCache.find(x => x.id === book.id) || book;
  if(!n || n <= 0) return false;
  const isPages = (b.kind || 'matn') === 'book';
  const doneKey = isPages ? 'completed_pages' : 'completed_lessons';
  const totalKey = isPages ? 'total_pages' : 'total_lessons';
  const total = b[totalKey] || 0;
  const prev = b[doneKey] || 0;
  let next = Math.max(prev, n);
  if(total > 0) next = Math.min(next, total);
  const patch = {};
  if(next !== prev) patch[doneKey] = next;
  let status = b.status;
  if(total > 0 && next >= total) status = 'complete';
  else if(status === 'todo') status = 'in_progress';
  if(status !== b.status) patch.status = status;
  if(!Object.keys(patch).length) return false;
  const {error} = await sb.from('books').update(patch).eq('id', b.id);
  if(error){ showToast('تعذّر تحديث الكتاب: ' + error.message, 'warn'); return false; }
  Object.assign(b, patch);
  renderCurrentBooks();
  const p = bookProgressPct(b);
  showToast(status === 'complete' && patch.status
    ? `🎉 أتممت «${b.name}»`
    : `📖 «${b.name}»: وصلت إلى ${lessonUnit(b)} ${next} (${p.pct}%)`);
  return true;
}

async function quickProgress(id){
  const b = booksCache.find(x => x.id === id);
  if(!b) return;
  const done = bookProgressPct(b).done;
  const unit = lessonUnit(b);
  const input = prompt(`وصلت إلى أي ${unit}؟ (الحالي: ${done})`, String(done + 1));
  if(input === null) return;
  const n = parseInt(normalizeDigits(input)) || 0;
  if(n <= 0) return;
  await recordProgress(b, n);
  await loadBooks();
}

function boxCollapsed(k, def){
  const v = localStorage.getItem('rihla_box_' + k);
  return v === null ? !!def : v === '1';
}
function toggleBox(k){
  const el = document.getElementById('box-' + k);
  if(!el) return;
  const c = el.classList.toggle('collapsed');
  try{ localStorage.setItem('rihla_box_' + k, c ? '1' : '0'); }catch(e){}
}

function renderDailyView(){
  const el = document.getElementById('dailyView');
  el.innerHTML = `
    <div id="backupReminder"></div>
    <div id="currentBooks" class="current-books"></div>
    <div id="dailyGoal"></div>
    <div id="vacationBar"></div>
    <div id="monthlySummary"></div>
    <div class="entry-box fold${boxCollapsed('entry', false) ? ' collapsed' : ''}" id="box-entry">
      <button class="fold-head" onclick="toggleBox('entry')"><span>سجل اليوم</span><span class="draft-ind" id="draftInd"></span><span class="fold-chev">⌄</span></button>
      <div class="fold-body">
      <div class="row2">
        <div class="field">
          <label>الكتاب</label>
          <select id="entryBook" onchange="onEntryBookChange()">${bookOptionsHtml('')}</select>
        </div>
        <div class="field">
          <label id="entryLessonLabel">رقم الدرس</label>
          <input id="entryLesson" type="text" inputmode="numeric" disabled placeholder="اختر كتابًا أولاً">
        </div>
      </div>
      <div class="hint" id="entryLessonHint" style="margin:-6px 0 14px"></div>
      <div class="row2">
        <div class="field">
          <label>الوقت (بالدقائق)</label>
          <input id="entryMinutes" type="text" inputmode="numeric" placeholder="مثل: 45">
        </div>
        <div class="field">
          <label>التاريخ</label>
          <input type="date" id="dateInput">
        </div>
      </div>
      ${noteFoldHtml('entryNote', '', 'مثل: درستُ مبحث الفاعل، أو الفصل الثالث، أو شرح عبارة «...»')}
      <label class="focus-check"><input type="checkbox" id="entryReview"> مراجعة (لا تُحسب درسًا جديدًا ولا تغيّر إنجاز الكتاب)</label>
      <button class="primary" id="saveEntryButton" onclick="addEntry()" style="width:100%">حفظ جلسة التركيز</button>
      <div id="cancelEditWrap" style="display:none;text-align:left;margin-top:-5px">
        <button class="ghost" onclick="cancelEditEntry()">إلغاء التعديل</button>
      </div>
      </div>
    </div>

    <div class="timeline-head">
      <h2>سجل الأيام</h2>
      <span style="display:flex;gap:8px">
        <input id="tagSearch" placeholder="ابحث بوسم..." oninput="onTagSearch()">
      </span>
    </div>
    <div id="timeline"></div>
    <div class="backup-box fold${boxCollapsed('backup', true) ? ' collapsed' : ''}" id="box-backup">
      <button class="fold-head" onclick="toggleBox('backup')"><span>النسخ الاحتياطي والتصدير</span><span class="fold-chev">⌄</span></button>
      <div class="fold-body">
        <div class="hint" id="backupInfo"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="primary" onclick="exportBackup()">⬇ تصدير نسخة احتياطية</button>
          <button class="ghost" onclick="pickBackupFile()">⬆ استيراد من نسخة</button>
          <input type="file" id="backupFile" accept="application/json,.json" style="display:none" onchange="importBackup(this)">
        </div>
      </div>
    </div>
    <div style="text-align:center;margin-top:10px">
      <button class="ghost" onclick="resetCreds()">تغيير قاعدة البيانات</button>
    </div>
  `;

  document.getElementById('dateInput').valueAsDate = new Date();
  const eb = document.getElementById('box-entry');
  eb.addEventListener('input', entryDraftSave);
  eb.addEventListener('change', entryDraftSave);
  entryDraftRestore();

  renderCurrentBooks();
  loadEntries();
}

function onEntryBookChange(){
  const sel = document.getElementById('entryBook');
  if(!sel) return;
  const b = booksCache.find(x => x.id === sel.value);
  const input = document.getElementById('entryLesson');
  const hint = document.getElementById('entryLessonHint');
  input.disabled = !b;
  if(!b){
    input.placeholder = 'اختر كتابًا أولاً';
    document.getElementById('entryLessonLabel').textContent = 'رقم الدرس';
    hint.textContent = '';
    return;
  }
  const unit = lessonUnit(b);
  const done = bookProgressPct(b).done;
  document.getElementById('entryLessonLabel').textContent = unit === 'صفحة' ? 'رقم الصفحة' : 'رقم الدرس';
  input.placeholder = 'مثل: ' + (done + 1);
  hint.textContent = `وصلتَ حاليًا إلى ${unit} ${done}.`;
}

const STATUS_LABELS = {todo:'لسا ما بدأت', in_progress:'أدرسه الحين', complete:'خلصته'};

const PRESET_SUBJECTS = ['نحو','صرف','بلاغة','منطق','أصول فقه','فقه','إملاء','علوم الكتاب والحديث','التفسير','الحديث','السيرة','الأدب','العلوم الطبيعية'];

let currentSubjectId = null;
let currentSubjectName = '';
let editingBookId = null;

function attrEscape(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function arabicNumeral(n){
  const map = {'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩'};
  return String(n).split('').map(d=>map[d]||d).join('');
}

function bookProgressPct(b){
  if((b.kind || 'matn') === 'book'){
    const total = b.total_pages || 0;
    const done = b.completed_pages || 0;
    const pct = total>0 ? Math.min(100, Math.round((done/total)*100)) : 0;
    return {pct, done, total, unit:'صفحة'};
  }
  const total = b.total_lessons || 0;
  const done = b.completed_lessons || 0;
  const pct = total>0 ? Math.min(100, Math.round((done/total)*100)) : 0;
  return {pct, done, total, unit:'درس'};
}

function normalizeDigits(str){
  if(str === null || str === undefined) return str;
  const eastern = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(str).replace(/[٠-٩۰-۹]/g, ch => {
    let i = eastern.indexOf(ch);
    if(i === -1) i = persian.indexOf(ch);
    return i !== -1 ? String(i) : ch;
  });
}
