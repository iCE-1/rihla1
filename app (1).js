const LS_KEY_URL = 'rihla_supabase_url';
const LS_KEY_KEY = 'rihla_supabase_key';

let sb = null;
let monthlySummaryVisible = localStorage.getItem('rihla_monthly_summary') !== 'hidden';
let selectedMonthlySummaryKey = null;
let monthlySummaryKeys = [];
let currentMonthlySummaryIndex = 0;
let collapsedTagGroups = new Set();
try { collapsedTagGroups = new Set(JSON.parse(localStorage.getItem('rihla_collapsed_tag_groups') || '[]')); } catch(e) {}
let editingEntryId = null;
let entriesById = new Map();

function tagLabel(id){ return id === 'tarkiz' ? 'جلسة تركيز' : 'قيد'; }

function toDateStr(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function computeStreak(dateStrings){
  const set = new Set(dateStrings);
  let cursor = new Date();
  if(!set.has(toDateStr(cursor))){
    cursor.setDate(cursor.getDate()-1);
  }
  let streak = 0;
  while(set.has(toDateStr(cursor))){
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

function applyTheme(){
  const dark = localStorage.getItem('rihla_theme') === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = dark ? '☀️' : '🌙';
}
function toggleTheme(){
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('rihla_theme', isDark ? 'light' : 'dark');
  applyTheme();
}

function getCreds(){
  return { url: localStorage.getItem(LS_KEY_URL), key: localStorage.getItem(LS_KEY_KEY) };
}

function renderSetup(){
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="setup-screen">
    <h1>الرحلة العلمية</h1>
    <p style="color:var(--ink-soft);font-size:.88rem">لتجعل سجلك دائمًا ويتبعك على كل أجهزتك، يحتاج التطبيق قاعدة بيانات مجانية من Supabase (خمس دقائق فقط، مرة واحدة):</p>
    <ol>
      <li>افتح <a href="https://supabase.com" target="_blank">supabase.com</a> وسجّل حساب مجاني</li>
      <li>أنشئ مشروع جديد (New Project)</li>
      <li>من القائمة الجانبية: SQL Editor ← New query، والصق هذا السطر ثم Run:</li>
    </ol>
    <pre style="background:var(--paper);padding:10px;font-size:.78rem;overflow:auto;border:1px solid var(--rule)">create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  entry_date date not null,
  type text not null,
  content text not null,
  tags text default '',
  focus_minutes int,
  created_at timestamp default now()
);
alter table entries enable row level security;
create policy "read own" on entries for select using (auth.uid() = user_id);
create policy "insert own" on entries for insert with check (auth.uid() = user_id);
create policy "delete own" on entries for delete using (auth.uid() = user_id);
grant select, insert, delete on entries to authenticated;

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  sort_order int default 0,
  created_at timestamp default now()
);
alter table subjects enable row level security;
create policy "read own subjects" on subjects for select using (auth.uid() = user_id);
create policy "insert own subjects" on subjects for insert with check (auth.uid() = user_id);
create policy "update own subjects" on subjects for update using (auth.uid() = user_id);
create policy "delete own subjects" on subjects for delete using (auth.uid() = user_id);
grant select, insert, update, delete on subjects to authenticated;

create table books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  subject_id uuid references subjects(id) on delete cascade not null,
  name text not null,
  level int not null default 1,
  kind text not null default 'matn',
  total_lessons int not null default 0,
  completed_lessons int not null default 0,
  total_pages int not null default 0,
  completed_pages int not null default 0,
  volumes int not null default 1,
  current_lesson text default '',
  status text not null default 'todo',
  sort_order int default 0,
  created_at timestamp default now()
);
alter table books enable row level security;
create policy "read own books" on books for select using (auth.uid() = user_id);
create policy "insert own books" on books for insert with check (auth.uid() = user_id);
create policy "update own books" on books for update using (auth.uid() = user_id);
create policy "delete own books" on books for delete using (auth.uid() = user_id);
grant select, insert, update, delete on books to authenticated;

create table srs_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  start_date date not null,
  duration_kind text not null default '3m',
  duration_days int default 90,
  review_count int default 7,
  current_stage int not null default 0,
  schedule_mode text not null default 'curve',
  curve real default 1.6,
  base_interval int default 1,
  multiplier real default 2,
  custom_offsets text default '',
  shift_days int default 0,
  rebase_on_review boolean default false,
  paused boolean default false,
  last_reviewed_at date,
  tags text default '',
  created_at timestamp default now()
);
alter table srs_units enable row level security;
create policy "read own srs" on srs_units for select using (auth.uid() = user_id);
create policy "insert own srs" on srs_units for insert with check (auth.uid() = user_id);
create policy "update own srs" on srs_units for update using (auth.uid() = user_id);
create policy "delete own srs" on srs_units for delete using (auth.uid() = user_id);
grant select, insert, update, delete on srs_units to authenticated;

-- لو جدول srs_units عندك قديم (منشأ قبل تحديث المراجعة)، شغّل هذا مرة وحدة:
alter table srs_units add column if not exists schedule_mode text not null default 'curve';
alter table srs_units add column if not exists curve real default 1.6;
alter table srs_units add column if not exists base_interval int default 1;
alter table srs_units add column if not exists multiplier real default 2;
alter table srs_units add column if not exists custom_offsets text default '';
alter table srs_units add column if not exists shift_days int default 0;
alter table srs_units add column if not exists rebase_on_review boolean default false;
alter table srs_units add column if not exists paused boolean default false;
alter table srs_units add column if not exists last_reviewed_at date;</pre>
    <ol start="4">
      <li>من Authentication ← Providers، تأكد إن Email مفعّل (مفعّل افتراضيًا)</li>
      <li>من Authentication ← Settings، عطّل "Confirm email" إذا تبي تدخل مباشرة بدون تفعيل بريد (اختياري، تقدر تسويها لاحقًا بأمان أكثر)</li>
      <li>من Settings ← API، انسخ <b>Project URL</b> و <b>anon public key</b> وألصقهما هنا:</li>
    </ol>
    <input id="urlInput" placeholder="Project URL">
    <input id="keyInput" placeholder="anon public key">
    <button class="primary" onclick="saveCreds()">حفظ ومتابعة</button>
    <p style="font-size:.75rem;color:var(--ink-soft)">هذي المفاتيح تسمح فقط بإنشاء حساب وتسجيل دخول — بياناتك محمية بحساب خاص فيك حتى لو صار الرابط عام.</p>
  </div>`;
}

function saveCreds(){
  const url = document.getElementById('urlInput').value.trim();
  const key = document.getElementById('keyInput').value.trim();
  if(!url || !key){ alert('الرجاء تعبئة الحقلين'); return; }
  localStorage.setItem(LS_KEY_URL, url);
  localStorage.setItem(LS_KEY_KEY, key);
  init();
}

async function init(){
  const {url, key} = getCreds();
  if(!url || !key){ renderSetup(); return; }
  sb = window.supabase.createClient(url, key);

  const { data: { session } } = await sb.auth.getSession();
  if(!session){ renderAuth(); return; }
  await renderApp();
}

function renderAuth(){
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="setup-screen">
    <h1>الرحلة العلمية</h1>
    <p style="color:var(--ink-soft);font-size:.88rem">سجّل دخولك ببريدك حتى يبقى سجلك خاصًا فيك، حتى لو صار رابط الصفحة عام.</p>
    <input id="authEmail" type="email" placeholder="البريد الإلكتروني">
    <input id="authPass" type="password" placeholder="كلمة السر (6 أحرف على الأقل)">
    <div id="authMsg" style="color:var(--red);font-size:.8rem;margin-bottom:8px"></div>
    <button class="primary" onclick="signIn()" style="width:100%;margin-bottom:8px">دخول</button>
    <button class="ghost" onclick="signUp()" style="width:100%">إنشاء حساب جديد</button>
    <p style="margin-top:16px"><button class="ghost" onclick="resetCreds()">تغيير قاعدة البيانات</button></p>
  </div>`;
}

async function signIn(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPass').value;
  const {error} = await sb.auth.signInWithPassword({email, password});
  if(error){ document.getElementById('authMsg').textContent = error.message; return; }
  await renderApp();
}

async function signUp(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPass').value;
  if(!email || password.length < 6){
    document.getElementById('authMsg').textContent = 'أدخل بريدًا وكلمة سر لا تقل عن 6 أحرف';
    return;
  }
  const {data, error} = await sb.auth.signUp({email, password});
  if(error){ document.getElementById('authMsg').textContent = error.message; return; }
  if(data.session){ await renderApp(); }
  else { document.getElementById('authMsg').style.color = 'var(--green)'; document.getElementById('authMsg').textContent = 'تم إنشاء الحساب. تحقق من بريدك لتفعيله ثم سجّل دخولك.'; }
}

async function signOut(){
  await sb.auth.signOut();
  renderAuth();
}

async function renderApp(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="top">
      <div>
        <div class="title">الرحلة العلمية</div>
        <div class="hijri-note">سجلّك الشخصي لكل ما تحفظ وتقرأ وتستفيد</div>
      </div>
      <span style="display:flex;align-items:center;gap:8px">
        <button class="ghost" id="themeToggle" onclick="toggleTheme()">🌙</button>
        <span id="status-pill">متصل</span>
        <button class="ghost" onclick="signOut()">خروج</button>
      </span>
    </header>

    <div class="tabs-nav">
      <button class="tab-btn active" id="tabDaily" onclick="switchTab('daily')">السجل اليومي</button>
      <button class="tab-btn" id="tabPath" onclick="switchTab('path')">الطريق</button>
      <button class="tab-btn" id="tabFocus" onclick="switchTab('focus')">التركيز</button>
      <button class="tab-btn" id="tabSrs" onclick="switchTab('srs')">المراجعة</button>
    </div>

    <div id="dailyView"></div>
    <div id="pathView" style="display:none"></div>
    <div id="focusView" style="display:none"></div>
    <div id="srsView" style="display:none"></div>
  `;

  applyTheme();
  renderDailyView();
  renderFocusView();
}

function switchTab(tab){
  if(tab==='path') currentSubjectId = null;
  document.getElementById('tabDaily').classList.toggle('active', tab==='daily');
  document.getElementById('tabPath').classList.toggle('active', tab==='path');
  document.getElementById('tabFocus').classList.toggle('active', tab==='focus');
  document.getElementById('tabSrs').classList.toggle('active', tab==='srs');
  document.getElementById('dailyView').style.display = tab==='daily' ? '' : 'none';
  document.getElementById('pathView').style.display = tab==='path' ? '' : 'none';
  document.getElementById('focusView').style.display = tab==='focus' ? '' : 'none';
  document.getElementById('srsView').style.display = tab==='srs' ? '' : 'none';
  if(tab==='path') renderPathView();
  if(tab==='srs') renderSrsView();
}

function renderDailyView(){
  const el = document.getElementById('dailyView');
  el.innerHTML = `
    <div id="monthlySummary"></div>
    <div class="entry-box">
      <div class="field">
        <label>ماذا سجّلت اليوم؟</label>
        <textarea id="contentInput" placeholder="مثال: حفظت من باب الطهارة إلى باب الحيض من متن أبي شجاع..."></textarea>
      </div>
      <div class="field">
        <label>الوسوم (اختياري، افصل بينها بفاصلة)</label>
        <input id="tagsInput" placeholder="مثل: فائدة، مراجعة، نحو">
        <div style="font-size:.72rem;color:var(--ink-soft);margin-top:5px">يظهر القيد تحت الوسم الأول في سجل الأيام، مع بقاء بقية الوسوم ظاهرة داخله.</div>
      </div>
      <div class="field">
        <label>اسم أو رقم الدرس (اختياري — يُحسب الدرس مرة واحدة ولو تكرر في عدة جلسات)</label>
        <input id="lessonNameInput" placeholder="مثل: الآجرومية — الدرس 12">
      </div>
      <div class="row2">
        <div class="field">
          <label>التاريخ</label>
          <input type="date" id="dateInput">
        </div>
        <div class="field" style="display:flex;align-items:flex-end;">
          <button class="primary" id="saveEntryButton" onclick="addEntry()" style="width:100%">حفظ في السجل</button>
        </div>
      </div>
      <div id="cancelEditWrap" style="display:none;text-align:left;margin-top:-5px">
        <button class="ghost" onclick="cancelEditEntry()">إلغاء التعديل</button>
      </div>
    </div>

    <div class="timeline-head">
      <h2>سجل الأيام</h2>
      <span style="display:flex;gap:8px">
        <input id="tagSearch" placeholder="ابحث بوسم..." onkeyup="loadEntries()">
      </span>
    </div>
    <div id="timeline"></div>
    <div style="text-align:center;margin-top:10px">
      <button class="ghost" onclick="resetCreds()">تغيير قاعدة البيانات</button>
    </div>
  `;

  document.getElementById('dateInput').valueAsDate = new Date();

  loadEntries();
}

const STATUS_LABELS = {todo:'لسا ما بدأت', in_progress:'أدرسه الحين', complete:'خلصته'};

const PRESET_SUBJECTS = ['نحو','صرف','بلاغة','منطق','أصول فقه','فقه','إملاء','علوم الكتاب والحديث','التفسير','الحديث','السيرة','الأدب','العلوم الطبيعية'];

let currentSubjectId = null;
let currentSubjectName = '';
let editingBookId = null;
let editingSrsId = null;
let expandedSrsIds = new Set();

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

async function renderPathView(){
  if(currentSubjectId){
    await renderSubjectDetail();
  } else {
    await renderSubjectsGrid();
  }
}

async function ensurePresetSubjects(){
  const {data:existing, error} = await sb.from('subjects').select('id,name');
  if(error) return;
  const existingNames = (existing||[]).map(s=>s.name);
  const missing = PRESET_SUBJECTS.filter(n => !existingNames.includes(n));
  if(missing.length){
    const rows = missing.map(name => ({name, sort_order: PRESET_SUBJECTS.indexOf(name)}));
    await sb.from('subjects').insert(rows);
  }
}

async function renderSubjectsGrid(){
  const el = document.getElementById('pathView');
  el.innerHTML = `
    <div class="timeline-head">
      <h2>الطريق</h2>
      <button class="primary" onclick="openAddSubjectForm()">+ إضافة علم مخصص</button>
    </div>
    <div id="subjectFormWrap"></div>
    <div id="subjectsGrid" class="subjects-grid"><div class="empty">جاري التحميل...</div></div>
  `;
  await ensurePresetSubjects();
  await loadSubjectsGrid();
}

function openAddSubjectForm(){
  const wrap = document.getElementById('subjectFormWrap');
  wrap.innerHTML = `
    <div class="entry-box">
      <div class="field">
        <label>اسم العلم الجديد</label>
        <input id="newSubjectName" placeholder="مثل: علم الفرائض">
      </div>
      <div style="display:flex;gap:10px">
        <button class="primary" onclick="saveNewSubject()">حفظ</button>
        <button class="ghost" onclick="document.getElementById('subjectFormWrap').innerHTML=''">إلغاء</button>
      </div>
    </div>
  `;
  wrap.scrollIntoView({behavior:'smooth', block:'start'});
}

async function saveNewSubject(){
  const name = document.getElementById('newSubjectName').value.trim();
  if(!name){ alert('اكتب اسم العلم أولاً'); return; }
  const {error} = await sb.from('subjects').insert({name, sort_order: 1000 + (Date.now() % 1000)});
  if(error){ alert('صار خطأ: '+error.message); return; }
  document.getElementById('subjectFormWrap').innerHTML = '';
  await loadSubjectsGrid();
}

async function deleteSubject(id){
  if(!confirm('حذف هذا العلم وكل الكتب المسجّلة تحته؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
  await sb.from('subjects').delete().eq('id', id);
  await loadSubjectsGrid();
}

async function loadSubjectsGrid(){
  const {data:subs, error} = await sb.from('subjects').select('*').order('sort_order').order('created_at');
  const grid = document.getElementById('subjectsGrid');
  if(error){ grid.innerHTML = `<div class="empty">تعذّر التحميل: ${error.message}</div>`; return; }

  const {data:books} = await sb.from('books').select('subject_id, kind, total_lessons, completed_lessons, total_pages, completed_pages');

  const sorted = [...(subs||[])].sort((a,b)=>{
    const ai = PRESET_SUBJECTS.indexOf(a.name); const bi = PRESET_SUBJECTS.indexOf(b.name);
    if(ai===-1 && bi===-1) return (a.sort_order||0)-(b.sort_order||0);
    if(ai===-1) return 1;
    if(bi===-1) return -1;
    return ai-bi;
  });

  if(sorted.length===0){
    grid.innerHTML = `<div class="empty">لا توجد علوم بعد.</div>`;
    return;
  }

  grid.innerHTML = sorted.map(s=>{
    const subBooks = (books||[]).filter(b=>b.subject_id===s.id);
    const pctList = subBooks.map(b=>bookProgressPct(b).pct);
    const avgPct = pctList.length ? Math.round(pctList.reduce((a,c)=>a+c,0)/pctList.length) : 0;
    const matnBooks = subBooks.filter(b=>(b.kind||'matn')==='matn');
    const pageBooks = subBooks.filter(b=>(b.kind||'matn')==='book');
    const lessonsDone = matnBooks.reduce((s2,b)=>s2+(b.completed_lessons||0),0);
    const lessonsTotal = matnBooks.reduce((s2,b)=>s2+(b.total_lessons||0),0);
    const pagesDone = pageBooks.reduce((s2,b)=>s2+(b.completed_pages||0),0);
    const pagesTotal = pageBooks.reduce((s2,b)=>s2+(b.total_pages||0),0);
    const breakdown = [
      matnBooks.length ? `${lessonsDone}/${lessonsTotal} درس` : '',
      pageBooks.length ? `${pagesDone}/${pagesTotal} صفحة` : ''
    ].filter(Boolean).join(' · ');
    const isCustom = !PRESET_SUBJECTS.includes(s.name);
    const dataAttr = attrEscape(JSON.stringify({id:s.id, name:s.name}));
    return `
    <div class="path-card" data-subject="${dataAttr}" onclick="openSubject(JSON.parse(this.getAttribute('data-subject')))">
      ${isCustom ? `<button class="ghost del" onclick="event.stopPropagation();deleteSubject('${s.id}')">حذف</button>` : ''}
      <div class="sj-name">${escapeHtml(s.name)}</div>
      <div class="sj-status">${subBooks.length} كتاب/متن</div>
      <div class="sj-progress-bar"><div class="sj-progress-fill" style="width:${avgPct}%"></div></div>
      <div class="sj-progress-label">متوسط الإنجاز: ${avgPct}%${breakdown ? ' — ' + breakdown : ''}</div>
    </div>`;
  }).join('');
}

function openSubject(s){
  currentSubjectId = s.id;
  currentSubjectName = s.name;
  renderPathView();
}

function backToSubjects(){
  currentSubjectId = null;
  currentSubjectName = '';
  renderPathView();
}

async function renderSubjectDetail(){
  const el = document.getElementById('pathView');
  el.innerHTML = `
    <div class="timeline-head">
      <div>
        <button class="ghost" onclick="backToSubjects()">→ رجوع للطريق</button>
        <h2 style="display:inline-block;margin-inline-start:10px">${escapeHtml(currentSubjectName)}</h2>
      </div>
      <button class="primary" onclick="openBookForm()">+ إضافة كتاب</button>
    </div>
    <div id="bookFormWrap"></div>
    <div id="levelsWrap"><div class="empty">جاري التحميل...</div></div>
  `;
  await loadBooks();
}

async function loadBooks(){
  const {data, error} = await sb.from('books').select('*').eq('subject_id', currentSubjectId).order('level').order('sort_order').order('created_at');
  const wrap = document.getElementById('levelsWrap');
  if(error){ wrap.innerHTML = `<div class="empty">تعذّر التحميل: ${error.message}</div>`; return; }
  if(!data || data.length===0){
    wrap.innerHTML = `<div class="empty">لسا ما أضفت كتب لهذا العلم. أضف أول كتاب أو متن ⤴</div>`;
    return;
  }
  const levels = {};
  data.forEach(b=>{
    const lvl = b.level || 1;
    if(!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(b);
  });
  const statusRank = {in_progress:0, todo:1, complete:2};
  const sortBooks = (a,b) => {
    const statusDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if(statusDiff) return statusDiff;
    const sortDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    if(sortDiff) return sortDiff;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  };
  Object.values(levels).forEach(list => list.sort(sortBooks));
  const levelNums = Object.keys(levels).map(Number).sort((a,b)=>{
    const aHasCurrent = levels[a].some(book => book.status === 'in_progress') ? 0 : 1;
    const bHasCurrent = levels[b].some(book => book.status === 'in_progress') ? 0 : 1;
    if(aHasCurrent !== bHasCurrent) return aHasCurrent - bHasCurrent;
    return a - b;
  });
  wrap.innerHTML = levelNums.map(lvl => `
    <div class="level-section">
      <div class="level-title">المستوى (${arabicNumeral(lvl)})</div>
      <div class="books-grid">
        ${levels[lvl].map(b => bookCardHtml(b)).join('')}
      </div>
    </div>
  `).join('');
}

function bookCardHtml(b){
  const kind = b.kind || 'matn';
  const prog = bookProgressPct(b);
  const dataAttr = attrEscape(JSON.stringify(b));
  const kindLabel = kind === 'book'
    ? `كتاب${(b.volumes||1) > 1 ? ' — ' + arabicNumeral(b.volumes) + ' مجلدات' : ''}`
    : 'متن';
  return `
    <div class="path-card status-${b.status}">
      <button class="ghost del" onclick="deleteBook('${b.id}')">حذف</button>
      <div class="sj-name">${escapeHtml(b.name)}</div>
      <div class="sj-status">${STATUS_LABELS[b.status]} · ${kindLabel}</div>
      ${b.current_lesson ? `<div class="sj-current">📝 ${escapeHtml(b.current_lesson)}</div>` : ''}
      <div class="sj-progress-bar"><div class="sj-progress-fill" style="width:${prog.pct}%"></div></div>
      <div class="sj-progress-label">${prog.done} / ${prog.total} ${prog.unit} (${prog.pct}%)</div>
      <button class="ghost" data-book="${dataAttr}" onclick="openBookForm(JSON.parse(this.getAttribute('data-book')))">تعديل</button>
    </div>`;
}

function openBookForm(existing){
  editingBookId = existing ? existing.id : null;
  const wrap = document.getElementById('bookFormWrap');
  const b = existing || {name:'', level:1, kind:'matn', total_lessons:0, completed_lessons:0, total_pages:0, completed_pages:0, volumes:1, current_lesson:'', status:'todo'};
  const kind = b.kind || 'matn';
  wrap.innerHTML = `
    <div class="entry-box">
      <div class="row2">
        <div class="field">
          <label>اسم الكتاب أو المتن</label>
          <input id="bkName" value="${escapeHtml(b.name)}" placeholder="مثل: الآجرومية">
        </div>
        <div class="field">
          <label>المستوى</label>
          <input id="bkLevel" type="text" inputmode="numeric" value="${b.level}">
        </div>
      </div>
      <div class="field">
        <label>نوع المدخل</label>
        <select id="bkKind" onchange="changeBookKind(this.value)">
          <option value="matn" ${kind==='matn'?'selected':''}>متن / دروس</option>
          <option value="book" ${kind==='book'?'selected':''}>كتاب (صفحات)</option>
        </select>
      </div>
      <div id="bkProgressFields"></div>
      <div class="row2">
        <div class="field">
          <label>الحالة</label>
          <select id="bkStatus">
            ${Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${b.status===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>ملاحظات (اختياري)</label>
          <input id="bkCurrent" value="${escapeHtml(b.current_lesson||'')}" placeholder="أي ملاحظة تحب تسجلها">
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="primary" onclick="saveBook()">حفظ</button>
        <button class="ghost" onclick="cancelBookForm()">إلغاء</button>
      </div>
    </div>
  `;
  renderBookProgressFields(kind, b);
  wrap.scrollIntoView({behavior:'smooth', block:'start'});
}

function renderBookProgressFields(kind, b){
  const el = document.getElementById('bkProgressFields');
  if(!el) return;
  if(kind === 'book'){
    el.innerHTML = `
      <div class="row2">
        <div class="field">
          <label>عدد الصفحات الكلي</label>
          <input id="bkTotalPages" type="text" inputmode="numeric" value="${b.total_pages||0}">
        </div>
        <div class="field">
          <label>عدد الصفحات المقروءة</label>
          <input id="bkDonePages" type="text" inputmode="numeric" value="${b.completed_pages||0}">
        </div>
      </div>
      <div class="field" style="max-width:220px">
        <label>عدد المجلدات</label>
        <input id="bkVolumes" type="text" inputmode="numeric" value="${b.volumes||1}">
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="row2">
        <div class="field">
          <label>عدد الدروس الكلي</label>
          <input id="bkTotal" type="text" inputmode="numeric" value="${b.total_lessons||0}">
        </div>
        <div class="field">
          <label>عدد الدروس المنجزة</label>
          <input id="bkDone" type="text" inputmode="numeric" value="${b.completed_lessons||0}">
        </div>
      </div>
    `;
  }
}

function changeBookKind(newKind){
  const draft = {
    id: editingBookId,
    name: document.getElementById('bkName').value,
    level: document.getElementById('bkLevel').value,
    kind: newKind,
    status: document.getElementById('bkStatus').value,
    current_lesson: document.getElementById('bkCurrent').value,
    total_lessons: 0, completed_lessons: 0, total_pages: 0, completed_pages: 0, volumes: 1
  };
  openBookForm(draft);
}

function cancelBookForm(){
  document.getElementById('bookFormWrap').innerHTML = '';
  editingBookId = null;
}

async function saveBook(){
  const id = editingBookId;
  const name = document.getElementById('bkName').value.trim();
  if(!name){ alert('اكتب اسم الكتاب أولاً'); return; }
  const kind = document.getElementById('bkKind').value;
  const payload = {
    subject_id: currentSubjectId,
    name,
    level: parseInt(normalizeDigits(document.getElementById('bkLevel').value)) || 1,
    kind,
    status: document.getElementById('bkStatus').value,
    current_lesson: document.getElementById('bkCurrent').value.trim()
  };
  if(kind === 'book'){
    const totalP = parseInt(normalizeDigits(document.getElementById('bkTotalPages').value)) || 0;
    let doneP = parseInt(normalizeDigits(document.getElementById('bkDonePages').value)) || 0;
    if(totalP > 0 && doneP > totalP) doneP = totalP;
    payload.total_pages = totalP;
    payload.completed_pages = doneP;
    payload.volumes = parseInt(normalizeDigits(document.getElementById('bkVolumes').value)) || 1;
    payload.total_lessons = 0;
    payload.completed_lessons = 0;
  } else {
    const totalL = parseInt(normalizeDigits(document.getElementById('bkTotal').value)) || 0;
    let doneL = parseInt(normalizeDigits(document.getElementById('bkDone').value)) || 0;
    if(totalL > 0 && doneL > totalL) doneL = totalL;
    payload.total_lessons = totalL;
    payload.completed_lessons = doneL;
    payload.total_pages = 0;
    payload.completed_pages = 0;
    payload.volumes = 1;
  }
  let error;
  if(id){
    ({error} = await sb.from('books').update(payload).eq('id', id));
  } else {
    ({error} = await sb.from('books').insert(payload));
  }
  if(error){ alert('صار خطأ: '+error.message); return; }
  document.getElementById('bookFormWrap').innerHTML = '';
  editingBookId = null;
  await loadBooks();
}

async function deleteBook(id){
  if(!confirm('حذف هذا الكتاب؟')) return;
  await sb.from('books').delete().eq('id', id);
  await loadBooks();
}

/* ============ نظام التركيز: بومودورو، مؤقت حر، وساعة توقف ============ */

const POMODORO_PHASE_LABELS = {work:'جلسة عمل', short:'استراحة قصيرة', long:'استراحة طويلة'};

let timerMode = 'pomodoro';
let timerRunning = false;
let timerEndAt = null;
let timerRemainingMs = 0;
let timerInterval = null;
let pomodoroPhase = 'work';
let pomodoroRound = 1;
let alarmSound = localStorage.getItem('rihla_alarm') || 'bell';
let alarmLoopInterval = null;
let audioCtx = null;
let stopwatchRunning = false;
let stopwatchStartRef = null;
let stopwatchElapsedMs = 0;

function renderFocusView(){
  const el = document.getElementById('focusView');
  el.innerHTML = `
    <div class="timeline-head"><h2>التركيز</h2></div>
    <div class="tabs-nav" style="margin-bottom:16px">
      <button class="tab-btn ${timerMode==='pomodoro'?'active':''}" id="modePomodoro" onclick="setTimerMode('pomodoro')">بومودورو</button>
      <button class="tab-btn ${timerMode==='free'?'active':''}" id="modeFree" onclick="setTimerMode('free')">مؤقت حر</button>
      <button class="tab-btn ${timerMode==='stopwatch'?'active':''}" id="modeStopwatch" onclick="setTimerMode('stopwatch')">ساعة توقف</button>
    </div>
    <div class="entry-box" id="focusPanel"></div>
    <div class="field" style="max-width:220px">
      <label>صوت التنبيه</label>
      <select id="alarmSelect" onchange="changeAlarmSound(this.value)">
        <option value="bell" ${alarmSound==='bell'?'selected':''}>جرس</option>
        <option value="chime" ${alarmSound==='chime'?'selected':''}>نغمة هادئة</option>
        <option value="pulse" ${alarmSound==='pulse'?'selected':''}>نبضات</option>
      </select>
    </div>
  `;
  renderFocusPanel();
}

function setTimerMode(mode){
  if(timerRunning || stopwatchRunning) return;
  timerMode = mode;
  timerRemainingMs = 0;
  renderFocusView();
}

function renderFocusPanel(){
  const panel = document.getElementById('focusPanel');
  if(!panel) return;
  const dis = timerRunning ? 'disabled' : '';
  if(timerMode === 'pomodoro'){
    panel.innerHTML = `
      <div class="row2">
        <div class="field">
          <label>مدة العمل (دقيقة)</label>
          <input id="pmWork" type="text" inputmode="numeric" value="25" ${dis}>
        </div>
        <div class="field">
          <label>مدة الاستراحة القصيرة (دقيقة)</label>
          <input id="pmShort" type="text" inputmode="numeric" value="5" ${dis}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>مدة الاستراحة الطويلة (دقيقة)</label>
          <input id="pmLong" type="text" inputmode="numeric" value="15" ${dis}>
        </div>
        <div class="field">
          <label>عدد الجولات قبل الاستراحة الطويلة</label>
          <input id="pmRounds" type="text" inputmode="numeric" value="4" ${dis}>
        </div>
      </div>
      <div class="focus-phase-label" id="phaseLabel">${POMODORO_PHASE_LABELS[pomodoroPhase]} — الجولة ${pomodoroRound}</div>
      <div class="focus-display" id="timerDisplay">--:--</div>
      <div class="field">
        <label>تدرس ايش الحين؟ (اختياري، يُسجَّل بالسجل اليومي)</label>
        <input id="focusTag" placeholder="مثل: نحو، مراجعة الآجرومية">
      </div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> أضف الجلسة تلقائيًا للسجل اليومي عند الانتهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
    `;
  } else if(timerMode === 'free'){
    panel.innerHTML = `
      <div class="field" style="max-width:200px">
        <label>عدد الدقائق</label>
        <input id="freeMinutes" type="text" inputmode="numeric" value="20" ${dis}>
      </div>
      <div class="focus-display" id="timerDisplay">--:--</div>
      <div class="field">
        <label>تدرس ايش الحين؟ (اختياري، يُسجَّل بالسجل اليومي)</label>
        <input id="focusTag" placeholder="مثل: قراءة، حفظ">
      </div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> أضف الجلسة تلقائيًا للسجل اليومي عند الانتهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
    `;
  } else {
    panel.innerHTML = `
      <div class="focus-phase-label">تبدأ من صفر وتستمر لين توقفها بنفسك</div>
      <div class="focus-display" id="timerDisplay">00:00</div>
      <div class="field">
        <label>تدرس ايش الحين؟ (اختياري، يُسجَّل بالسجل اليومي)</label>
        <input id="focusTag" placeholder="مثل: قراءة حرة">
      </div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> سجّل الجلسة تلقائيًا بالسجل اليومي عند الإنهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
    `;
  }
  renderFocusControls();
  if(timerMode === 'stopwatch'){
    updateStopwatchDisplay(stopwatchElapsedMs);
  } else {
    updateTimerDisplay();
  }
}

function renderFocusControls(){
  const el = document.getElementById('focusControls');
  if(!el) return;
  if(timerMode === 'stopwatch'){
    if(stopwatchRunning){
      el.innerHTML = `
        <button class="ghost" onclick="pauseStopwatch()">إيقاف مؤقت</button>
        <button class="primary" onclick="finishStopwatch()">إنهاء الجلسة</button>
      `;
    } else if(stopwatchElapsedMs > 0){
      el.innerHTML = `
        <button class="primary" onclick="resumeStopwatch()">استمرار</button>
        <button class="ghost" onclick="finishStopwatch()">إنهاء الجلسة</button>
      `;
    } else {
      el.innerHTML = `<button class="primary" onclick="startStopwatch()">ابدأ</button>`;
    }
    return;
  }
  if(timerRunning){
    el.innerHTML = `
      <button class="ghost" onclick="pauseTimer()">إيقاف مؤقت</button>
      <button class="ghost" onclick="resetTimer()">إعادة تعيين</button>
    `;
  } else if(timerRemainingMs > 0){
    el.innerHTML = `
      <button class="primary" onclick="resumeTimer()">استمرار</button>
      <button class="ghost" onclick="resetTimer()">إعادة تعيين</button>
    `;
  } else {
    el.innerHTML = `<button class="primary" onclick="startTimer()">ابدأ</button>`;
  }
}

function disableFocusInputs(disabled){
  ['pmWork','pmShort','pmLong','pmRounds','freeMinutes'].forEach(id=>{
    const elx = document.getElementById(id);
    if(elx) elx.disabled = disabled;
  });
}

function formatElapsed(ms){
  const totalSec = Math.max(0, Math.floor(ms/1000));
  const hh = Math.floor(totalSec/3600);
  const mm = Math.floor((totalSec%3600)/60);
  const ss = totalSec%60;
  if(hh > 0){
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }
  return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function updateStopwatchDisplay(ms){
  const disp = document.getElementById('timerDisplay');
  if(!disp) return;
  disp.textContent = formatElapsed(ms);
}

function startStopwatch(){
  stopwatchElapsedMs = 0;
  const banner = document.getElementById('focusBanner');
  if(banner) banner.innerHTML = '';
  runStopwatch();
}

function resumeStopwatch(){
  const banner = document.getElementById('focusBanner');
  if(banner) banner.innerHTML = '';
  runStopwatch();
}

function runStopwatch(){
  stopwatchStartRef = Date.now();
  stopwatchRunning = true;
  renderFocusControls();
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickStopwatch, 250);
  tickStopwatch();
}

function pauseStopwatch(){
  stopwatchElapsedMs += Date.now() - stopwatchStartRef;
  stopwatchRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  renderFocusControls();
}

function tickStopwatch(){
  if(!stopwatchRunning) return;
  const live = stopwatchElapsedMs + (Date.now() - stopwatchStartRef);
  updateStopwatchDisplay(live);
}

async function finishStopwatch(){
  let finalMs = stopwatchElapsedMs;
  if(stopwatchRunning){
    finalMs += Date.now() - stopwatchStartRef;
  }
  clearInterval(timerInterval);
  timerInterval = null;
  stopwatchRunning = false;
  const minutesDone = Math.round(finalMs/60000);

  const tagEl = document.getElementById('focusTag');
  const tagVal = tagEl ? tagEl.value.trim() : '';
  const autoLogEl = document.getElementById('autoLog');
  const shouldLog = autoLogEl ? autoLogEl.checked : true;

  if(shouldLog){
    await logFocusSession(minutesDone, 'ساعة توقف', tagVal);
  }

  stopwatchElapsedMs = 0;
  stopwatchStartRef = null;
  renderFocusControls();
  updateStopwatchDisplay(0);

  const banner = document.getElementById('focusBanner');
  if(banner){
    banner.innerHTML = `
      <div class="focus-banner">
        <div>✅ انتهت الجلسة — ${minutesDone} دقيقة</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
          <button class="primary" onclick="document.getElementById('focusBanner').innerHTML=''">تم</button>
        </div>
      </div>
    `;
  }
}

function getPhaseDurationMinutes(){
  if(timerMode === 'free'){
    const fEl = document.getElementById('freeMinutes');
    return fEl ? (parseInt(normalizeDigits(fEl.value)) || 20) : 20;
  }
  if(pomodoroPhase === 'work'){
    const e2 = document.getElementById('pmWork');
    return e2 ? (parseInt(normalizeDigits(e2.value)) || 25) : 25;
  }
  if(pomodoroPhase === 'short'){
    const e3 = document.getElementById('pmShort');
    return e3 ? (parseInt(normalizeDigits(e3.value)) || 5) : 5;
  }
  const e4 = document.getElementById('pmLong');
  return e4 ? (parseInt(normalizeDigits(e4.value)) || 15) : 15;
}

function startTimer(){
  const minutes = getPhaseDurationMinutes();
  if(minutes <= 0){ alert('حدد عدد دقائق أكبر من صفر'); return; }
  timerRemainingMs = minutes * 60000;
  const banner = document.getElementById('focusBanner');
  if(banner) banner.innerHTML = '';
  runTimer();
}

function resumeTimer(){
  const banner = document.getElementById('focusBanner');
  if(banner) banner.innerHTML = '';
  runTimer();
}

function runTimer(){
  try{
    getAudioCtx();
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
  timerEndAt = Date.now() + timerRemainingMs;
  timerRunning = true;
  renderFocusControls();
  disableFocusInputs(true);
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

function pauseTimer(){
  timerRemainingMs = Math.max(0, timerEndAt - Date.now());
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  renderFocusControls();
  disableFocusInputs(false);
}

function resetTimer(){
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerRemainingMs = 0;
  timerEndAt = null;
  stopAlarm();
  const banner = document.getElementById('focusBanner');
  if(banner) banner.innerHTML = '';
  renderFocusControls();
  disableFocusInputs(false);
  updateTimerDisplay();
}

function tickTimer(){
  if(!timerRunning) return;
  const remaining = timerEndAt - Date.now();
  if(remaining <= 0){
    timerRemainingMs = 0;
    updateTimerDisplay();
    onTimerComplete();
    return;
  }
  timerRemainingMs = remaining;
  updateTimerDisplay();
}

function updateTimerDisplay(){
  const disp = document.getElementById('timerDisplay');
  if(!disp) return;
  let ms = timerRemainingMs;
  if((!ms || ms<=0) && !timerRunning){
    ms = getPhaseDurationMinutes() * 60000;
  }
  const totalSec = Math.max(0, Math.ceil(ms/1000));
  const mm = String(Math.floor(totalSec/60)).padStart(2,'0');
  const ss = String(totalSec%60).padStart(2,'0');
  disp.textContent = `${mm}:${ss}`;
}

async function onTimerComplete(){
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  renderFocusControls();
  disableFocusInputs(false);
  playAlarm();

  const minutesDone = getPhaseDurationMinutes();
  const tagEl = document.getElementById('focusTag');
  const tagVal = tagEl ? tagEl.value.trim() : '';
  const autoLogEl = document.getElementById('autoLog');
  const shouldLog = autoLogEl ? autoLogEl.checked : true;
  const phaseLabel = timerMode === 'pomodoro' ? POMODORO_PHASE_LABELS[pomodoroPhase] : 'مؤقت حر';

  if(shouldLog && (timerMode === 'free' || pomodoroPhase === 'work')){
    await logFocusSession(minutesDone, phaseLabel, tagVal);
  }

  const banner = document.getElementById('focusBanner');
  if(banner){
    banner.innerHTML = `
      <div class="focus-banner">
        <div>⏰ انتهى الوقت! (${escapeHtml(phaseLabel)})</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
          <button class="ghost" onclick="stopAlarm()">إيقاف الصوت</button>
          ${timerMode==='pomodoro' ? `<button class="primary" onclick="advancePomodoro()">التالي</button>` : `<button class="primary" onclick="resetTimer()">تم</button>`}
        </div>
      </div>
    `;
  }
}

async function logFocusSession(minutes, phaseLabel, tag){
  try{
    await sb.from('entries').insert({
      entry_date: toDateStr(new Date()),
      type: 'tarkiz',
      content: `جلسة تركيز (${phaseLabel}): ${minutes} دقيقة`,
      tags: tag || '',
      focus_minutes: minutes
    });
  }catch(e){ /* لا نعطّل المؤقت لو فشل التسجيل التلقائي */ }
}

function advancePomodoro(){
  const roundsEl = document.getElementById('pmRounds');
  const rounds = roundsEl ? (parseInt(normalizeDigits(roundsEl.value)) || 4) : 4;
  if(pomodoroPhase === 'work'){
    if(pomodoroRound >= rounds){
      pomodoroPhase = 'long';
      pomodoroRound = 1;
    } else {
      pomodoroPhase = 'short';
    }
  } else {
    if(pomodoroPhase === 'short'){ pomodoroRound++; }
    pomodoroPhase = 'work';
  }
  timerRemainingMs = 0;
  renderFocusPanel();
}

function changeAlarmSound(val){
  alarmSound = val;
  localStorage.setItem('rihla_alarm', val);
}

function getAudioCtx(){
  if(!audioCtx){ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  return audioCtx;
}

function beep(freq, duration, delay){
  try{
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  }catch(e){}
}

function playSoundOnce(){
  if(alarmSound === 'bell'){
    beep(880, 0.35, 0);
    beep(660, 0.35, 0.4);
  } else if(alarmSound === 'chime'){
    beep(523.25, 0.5, 0);
    beep(659.25, 0.5, 0.15);
    beep(783.99, 0.6, 0.3);
  } else {
    beep(700, 0.12, 0);
    beep(700, 0.12, 0.2);
    beep(700, 0.12, 0.4);
  }
}

function playAlarm(){
  playSoundOnce();
  let count = 1;
  alarmLoopInterval = setInterval(()=>{
    if(count >= 4){ clearInterval(alarmLoopInterval); alarmLoopInterval = null; return; }
    playSoundOnce();
    count++;
  }, 1800);
}

function stopAlarm(){
  if(alarmLoopInterval){ clearInterval(alarmLoopInterval); alarmLoopInterval = null; }
}

/* ============ نظام التكرار المتباعد (المراجعة) ============ */

const SRS_DURATION_LABELS = {'3m':'٣ أشهر', '6m':'٦ أشهر', '1y':'سنة', 'custom':'مخصصة'};
const SRS_MODE_LABELS = {
  curve: 'منحنى تلقائي (تباعد متزايد)',
  double: 'مضاعفة (١، ٢، ٤، ٨ ...)',
  manual: 'مواعيد يدوية (أنا أكتبها)'
};
const SRS_CURVE_PRESETS = [
  {v:1.0, label:'متساوٍ'},
  {v:1.3, label:'لطيف'},
  {v:1.6, label:'متوازن'},
  {v:2.2, label:'متباعد'},
  {v:3.0, label:'متباعد جدًا'}
];

let srsFilter = 'all';
let srsSearch = '';

function srsTotalDays(kind, customDays){
  if(kind === '3m') return 90;
  if(kind === '6m') return 180;
  if(kind === '1y') return 365;
  return (customDays && customDays > 0) ? customDays : 90;
}

function srsNum(v, fallback){
  const n = parseFloat(normalizeDigits(String(v == null ? '' : v)));
  return isNaN(n) ? fallback : n;
}

function srsCleanOffsets(days){
  return [...new Set(days.filter(d => d > 0).map(d => Math.round(d)))].sort((a,b)=>a-b);
}

/* قائمة الأيام (من تاريخ البداية) لكل مراجعة، حسب النمط المختار */
function srsOffsets(u){
  const mode = u.schedule_mode || 'curve';
  const n = Math.max(1, Math.round(srsNum(u.review_count, 7)));
  if(mode === 'manual'){
    const parsed = String(u.custom_offsets || '')
      .split(/[،,\s]+/)
      .map(s => srsNum(s, 0))
      .filter(d => d > 0);
    const cleaned = srsCleanOffsets(parsed);
    return cleaned.length ? cleaned : [1];
  }
  if(mode === 'double'){
    const base = Math.max(1, srsNum(u.base_interval, 1));
    const mult = Math.max(1, srsNum(u.multiplier, 2));
    const days = [];
    let step = base, acc = 0;
    for(let i=0;i<n;i++){ acc += step; days.push(acc); step = step * mult; }
    return srsCleanOffsets(days);
  }
  const total = srsTotalDays(u.duration_kind, u.duration_days);
  const curve = Math.min(4, Math.max(0.4, srsNum(u.curve, 1.6)));
  const days = [];
  for(let i=1;i<=n;i++) days.push(Math.max(1, Math.round(Math.pow(i/n, curve) * total)));
  return srsCleanOffsets(days);
}

function srsAddDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0,0,0,0);
  return d;
}

/* التواريخ الفعلية لكل مراجعة، مع مراعاة التأجيل وإعادة الاحتساب من آخر مراجعة */
function srsDates(u){
  const offsets = srsOffsets(u);
  const shift = Math.round(srsNum(u.shift_days, 0));
  const stage = Math.min(u.current_stage || 0, offsets.length);
  const start = new Date(u.start_date);
  const rebase = !!u.rebase_on_review && !!u.last_reviewed_at && stage > 0;
  const anchor = rebase ? new Date(u.last_reviewed_at) : start;
  return offsets.map((off, i) => {
    if(rebase && i >= stage) return srsAddDays(anchor, off - offsets[stage-1] + shift);
    return srsAddDays(start, off + shift);
  });
}

function srsNextReviewInfo(unit){
  const dates = srsDates(unit);
  const stage = unit.current_stage || 0;
  if(stage >= dates.length) return {done:true, total:dates.length, paused:!!unit.paused};
  const today = new Date();
  today.setHours(0,0,0,0);
  const nextDate = dates[stage];
  const diffDays = Math.round((nextDate - today) / 86400000);
  return {done:false, nextDate, stageNum:stage+1, total:dates.length, diffDays, paused:!!unit.paused};
}

function humanCountdown(diffDays){
  if(diffDays < 0) return `مضت منذ ${Math.abs(diffDays)} يوم`;
  if(diffDays === 0) return 'اليوم';
  if(diffDays < 30) return `بعد ${diffDays} يوم`;
  if(diffDays < 365) return `بعد ${Math.round(diffDays/30)} شهر`;
  return `بعد ${Math.round(diffDays/365*10)/10} سنة`;
}

function srsFullSchedule(unit){
  const dates = srsDates(unit);
  const offsets = srsOffsets(unit);
  const today = new Date();
  today.setHours(0,0,0,0);
  const stage = unit.current_stage || 0;
  return dates.map((d, i)=>({
    num: i+1,
    date: d,
    dateStr: toDateStr(d),
    offset: offsets[i],
    gap: i === 0 ? offsets[0] : offsets[i] - offsets[i-1],
    completed: i < stage,
    diffDays: Math.round((d - today) / 86400000)
  }));
}

function toggleSrsExpand(id){
  if(expandedSrsIds.has(id)) expandedSrsIds.delete(id);
  else expandedSrsIds.add(id);
  loadSrsUnits();
}

function renderSrsScheduleList(unit){
  const full = srsFullSchedule(unit);
  return `
    <div class="srs-schedule-list">
      ${full.map(item => `
        <div class="srs-schedule-row ${item.completed ? 'srs-done' : ''}">
          <span>${item.completed ? '✓' : item.num}. ${formatDate(item.dateStr)} <span class="srs-gap">(+${item.gap} يوم)</span></span>
          <span class="srs-schedule-countdown">${item.completed ? 'تمّت' : humanCountdown(item.diffDays)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderSrsView(){
  const el = document.getElementById('srsView');
  el.innerHTML = `
    <div class="timeline-head">
      <h2>المراجعة (تكرار متباعد)</h2>
      <button class="primary" onclick="openSrsForm()">+ إضافة وحدة تعليمية</button>
    </div>
    <div id="srsFormWrap"></div>
    <div id="srsDueBanner"></div>
    <div class="srs-toolbar">
      <div class="srs-filters" id="srsFilters"></div>
      <input id="srsSearch" class="srs-search" placeholder="بحث بالاسم أو الوسم..." value="${escapeHtml(srsSearch)}" oninput="setSrsSearch(this.value)">
    </div>
    <div id="srsList" class="subjects-grid"><div class="empty">جاري التحميل...</div></div>
  `;
  await loadSrsUnits();
}

function setSrsFilter(f){
  srsFilter = f;
  loadSrsUnits();
}

function setSrsSearch(v){
  srsSearch = v;
  loadSrsUnits();
}

/* ---------- نموذج الإضافة/التعديل ---------- */

function srsDraftFromForm(){
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const mode = val('srsMode') || 'curve';
  const kind = val('srsDurationKind') || '3m';
  return {
    id: editingSrsId,
    title: val('srsTitle'),
    start_date: val('srsStartDate'),
    schedule_mode: mode,
    duration_kind: kind,
    duration_days: kind === 'custom' ? (Math.round(srsNum(val('srsCustomDays'), 90)) || 90) : srsTotalDays(kind),
    review_count: Math.max(1, Math.round(srsNum(val('srsReviewCount'), 7))),
    curve: srsNum(val('srsCurve'), 1.6),
    base_interval: Math.max(1, Math.round(srsNum(val('srsBaseInterval'), 1))),
    multiplier: Math.max(1, srsNum(val('srsMultiplier'), 2)),
    custom_offsets: val('srsCustomOffsets'),
    rebase_on_review: document.getElementById('srsRebase') ? document.getElementById('srsRebase').checked : false,
    shift_days: srsNum(val('srsShiftDays'), 0),
    current_stage: parseInt(val('srsCurrentStage')) || 0,
    paused: document.getElementById('srsPaused') ? document.getElementById('srsPaused').checked : false,
    tags: val('srsTags')
  };
}

function refreshSrsForm(){
  const draft = srsDraftFromForm();
  openSrsForm(draft, true);
}

function updateSrsPreview(){
  const wrap = document.getElementById('srsPreview');
  if(!wrap) return;
  const draft = srsDraftFromForm();
  const full = srsFullSchedule(draft);
  wrap.innerHTML = `
    <div class="srs-preview">
      <div class="srs-preview-head">معاينة الجدول (${full.length} مراجعة)</div>
      <div class="srs-preview-chips">
        ${full.map(i=>`<span class="srs-chip" title="${formatDate(i.dateStr)}">${i.num}. ${formatDate(i.dateStr)} <b>+${i.gap}ي</b></span>`).join('')}
      </div>
    </div>
  `;
}

function openSrsForm(existing, keepScroll){
  editingSrsId = existing ? (existing.id || null) : null;
  const wrap = document.getElementById('srsFormWrap');
  const u = Object.assign({
    title:'', start_date: toDateStr(new Date()), schedule_mode:'curve',
    duration_kind:'3m', duration_days:90, review_count:7, curve:1.6,
    base_interval:1, multiplier:2, custom_offsets:'1, 3, 7, 14, 30, 60, 90',
    rebase_on_review:false, shift_days:0, current_stage:0, paused:false, tags:''
  }, existing || {});
  const mode = u.schedule_mode || 'curve';
  const kind = u.duration_kind || '3m';
  const stagesCount = srsOffsets(u).length;

  wrap.innerHTML = `
    <div class="entry-box">
      <div class="field">
        <label>اسم الوحدة التعليمية</label>
        <input id="srsTitle" value="${escapeHtml(u.title||'')}" placeholder="مثل: حفظ سورة البقرة، متن الآجرومية">
      </div>
      <div class="row2">
        <div class="field">
          <label>تاريخ بداية الوحدة</label>
          <input type="date" id="srsStartDate" value="${u.start_date}" onchange="updateSrsPreview()">
        </div>
        <div class="field">
          <label>نمط الجدولة</label>
          <select id="srsMode" onchange="refreshSrsForm()">
            ${Object.entries(SRS_MODE_LABELS).map(([k,v])=>`<option value="${k}" ${mode===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>

      ${mode === 'curve' ? `
      <div class="row2">
        <div class="field">
          <label>مدة التكرار</label>
          <select id="srsDurationKind" onchange="refreshSrsForm()">
            ${Object.entries(SRS_DURATION_LABELS).map(([k,v])=>`<option value="${k}" ${kind===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>عدد المراجعات خلال المدة</label>
          <input id="srsReviewCount" type="text" inputmode="numeric" value="${Math.round(srsNum(u.review_count,7))}" oninput="updateSrsPreview()">
        </div>
      </div>
      ${kind === 'custom' ? `
      <div class="field" style="max-width:220px">
        <label>عدد الأيام الكلي</label>
        <input id="srsCustomDays" type="text" inputmode="numeric" value="${Math.round(srsNum(u.duration_days,90))}" oninput="updateSrsPreview()">
      </div>` : ''}
      <div class="field">
        <label>شدّة التباعد <span class="srs-hint">(كل ما زادت، تقاربت المراجعات في البداية وتباعدت في الآخر)</span></label>
        <input id="srsCurve" type="range" min="0.6" max="3" step="0.1" value="${srsNum(u.curve,1.6)}" oninput="updateSrsPreview()">
        <div class="srs-presets">
          ${SRS_CURVE_PRESETS.map(p=>`<button type="button" class="srs-chip-btn" onclick="document.getElementById('srsCurve').value=${p.v};updateSrsPreview()">${p.label}</button>`).join('')}
        </div>
      </div>` : ''}

      ${mode === 'double' ? `
      <div class="row2">
        <div class="field">
          <label>أول فاصل (أيام)</label>
          <input id="srsBaseInterval" type="text" inputmode="numeric" value="${Math.round(srsNum(u.base_interval,1))}" oninput="updateSrsPreview()">
        </div>
        <div class="field">
          <label>معامل المضاعفة</label>
          <input id="srsMultiplier" type="text" inputmode="decimal" value="${srsNum(u.multiplier,2)}" oninput="updateSrsPreview()">
        </div>
      </div>
      <div class="field" style="max-width:220px">
        <label>عدد المراجعات</label>
        <input id="srsReviewCount" type="text" inputmode="numeric" value="${Math.round(srsNum(u.review_count,7))}" oninput="updateSrsPreview()">
      </div>` : ''}

      ${mode === 'manual' ? `
      <div class="field">
        <label>مواعيد المراجعة بالأيام من البداية <span class="srs-hint">(افصل بفاصلة، مثال: 1, 3, 7, 14, 30)</span></label>
        <input id="srsCustomOffsets" value="${escapeHtml(u.custom_offsets||'')}" oninput="updateSrsPreview()">
      </div>` : ''}

      <div class="row2">
        <div class="field">
          <label>وين وصلت؟</label>
          <select id="srsCurrentStage">
            <option value="0" ${(u.current_stage||0)===0?'selected':''}>لسا ما بدأت أي مراجعة</option>
            ${Array.from({length:stagesCount}, (_,i)=>`<option value="${i+1}" ${(u.current_stage||0)===i+1?'selected':''}>خلصت المراجعة رقم ${i+1} (من ${stagesCount})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>تأجيل كل المواعيد (أيام)</label>
          <input id="srsShiftDays" type="text" inputmode="numeric" value="${Math.round(srsNum(u.shift_days,0))}" oninput="updateSrsPreview()">
        </div>
      </div>

      <div class="srs-switches">
        <label class="srs-switch"><input type="checkbox" id="srsRebase" ${u.rebase_on_review?'checked':''} onchange="updateSrsPreview()"> احسب المواعيد القادمة من آخر مراجعة فعلية</label>
        <label class="srs-switch"><input type="checkbox" id="srsPaused" ${u.paused?'checked':''}> إيقاف مؤقت لهذه الوحدة</label>
      </div>

      <div class="field">
        <label>الوسوم (اختياري)</label>
        <input id="srsTags" value="${escapeHtml(u.tags||'')}" placeholder="مثل: قرآن، حفظ">
      </div>

      <div id="srsPreview"></div>

      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="primary" onclick="saveSrsUnit()">حفظ</button>
        <button class="ghost" onclick="cancelSrsForm()">إلغاء</button>
      </div>
    </div>
  `;
  updateSrsPreview();
  if(!keepScroll) wrap.scrollIntoView({behavior:'smooth', block:'start'});
}

function cancelSrsForm(){
  document.getElementById('srsFormWrap').innerHTML = '';
  editingSrsId = null;
}

async function saveSrsUnit(){
  const id = editingSrsId;
  const draft = srsDraftFromForm();
  if(!draft.title.trim()){ alert('اكتب اسم الوحدة التعليمية أولاً'); return; }
  if(!draft.start_date){ alert('حدد تاريخ بداية الوحدة'); return; }
  const payload = {
    title: draft.title.trim(),
    start_date: draft.start_date,
    schedule_mode: draft.schedule_mode,
    duration_kind: draft.duration_kind,
    duration_days: draft.duration_days,
    review_count: draft.review_count,
    curve: draft.curve,
    base_interval: draft.base_interval,
    multiplier: draft.multiplier,
    custom_offsets: draft.custom_offsets,
    rebase_on_review: draft.rebase_on_review,
    shift_days: draft.shift_days,
    current_stage: draft.current_stage,
    paused: draft.paused,
    tags: (draft.tags||'').trim()
  };
  let error;
  if(id){
    ({error} = await sb.from('srs_units').update(payload).eq('id', id));
  } else {
    ({error} = await sb.from('srs_units').insert(payload));
  }
  if(error){ alert('صار خطأ: '+error.message+'\n\nلو الخطأ عن عمود ناقص، شغّل تحديث الجدول من صفحة الإعداد.'); return; }
  document.getElementById('srsFormWrap').innerHTML = '';
  editingSrsId = null;
  await loadSrsUnits();
}

async function deleteSrsUnit(id){
  if(!confirm('حذف هذه الوحدة التعليمية من نظام المراجعة؟')) return;
  await sb.from('srs_units').delete().eq('id', id);
  await loadSrsUnits();
}

async function srsUpdate(id, patch){
  const {error} = await sb.from('srs_units').update(patch).eq('id', id);
  if(error){ alert('صار خطأ: '+error.message); return false; }
  await loadSrsUnits();
  return true;
}

async function markSrsReviewed(id, currentStage){
  await srsUpdate(id, {current_stage: currentStage + 1, last_reviewed_at: toDateStr(new Date())});
}

async function undoSrsReview(id, currentStage){
  if(currentStage <= 0) return;
  await srsUpdate(id, {current_stage: currentStage - 1});
}

async function postponeSrs(id, currentShift, days){
  await srsUpdate(id, {shift_days: Math.round(srsNum(currentShift,0)) + days});
}

async function toggleSrsPause(id, paused){
  await srsUpdate(id, {paused: !paused});
}

async function resetSrsUnit(id){
  if(!confirm('إعادة الوحدة إلى البداية (تصفير المراجعات والتأجيل)؟')) return;
  await srsUpdate(id, {current_stage: 0, shift_days: 0, last_reviewed_at: null});
}

/* ---------- القائمة ---------- */

async function loadSrsUnits(){
  const {data, error} = await sb.from('srs_units').select('*').order('created_at');
  const list = document.getElementById('srsList');
  const banner = document.getElementById('srsDueBanner');
  if(!list) return;
  if(error){ list.innerHTML = `<div class="empty">تعذّر التحميل: ${error.message}</div>`; if(banner) banner.innerHTML=''; return; }

  if(!data || data.length===0){
    list.innerHTML = `<div class="empty">لسا ما أضفت أي وحدة تعليمية. ابدأ بإضافة أول وحدة ⤴</div>`;
    if(banner) banner.innerHTML = '';
    const filters = document.getElementById('srsFilters');
    if(filters) filters.innerHTML = '';
    return;
  }

  const infos = data.map(u => ({unit:u, info: srsNextReviewInfo(u)}));
  const isDue = x => !x.info.done && !x.unit.paused && x.info.diffDays <= 0;
  const counts = {
    all: infos.length,
    due: infos.filter(isDue).length,
    upcoming: infos.filter(x => !x.info.done && !x.unit.paused && x.info.diffDays > 0).length,
    paused: infos.filter(x => x.unit.paused).length,
    done: infos.filter(x => x.info.done).length
  };
  const lateCount = infos.filter(x => isDue(x) && x.info.diffDays < 0).length;

  if(banner){
    banner.innerHTML = counts.due > 0
      ? `<div class="monthly-summary">🔔 عندك <b>${counts.due}</b> وحدة تحتاج مراجعة اليوم${lateCount ? ` — منها <b>${lateCount}</b> متأخرة` : ''}.</div>`
      : '';
  }

  const filters = document.getElementById('srsFilters');
  if(filters){
    const labels = {all:'الكل', due:'مستحقة', upcoming:'قادمة', paused:'موقوفة', done:'مكتملة'};
    filters.innerHTML = Object.entries(labels).map(([k,v])=>
      `<button class="srs-filter ${srsFilter===k?'active':''}" onclick="setSrsFilter('${k}')">${v} (${counts[k]})</button>`
    ).join('');
  }

  const q = srsSearch.trim().toLowerCase();
  let shown = infos.filter(x => {
    if(srsFilter === 'due' && !isDue(x)) return false;
    if(srsFilter === 'upcoming' && !(!x.info.done && !x.unit.paused && x.info.diffDays > 0)) return false;
    if(srsFilter === 'paused' && !x.unit.paused) return false;
    if(srsFilter === 'done' && !x.info.done) return false;
    if(q && !((x.unit.title||'') + ' ' + (x.unit.tags||'')).toLowerCase().includes(q)) return false;
    return true;
  });

  // الأقرب استحقاقًا أولًا، والمكتمل والموقوف في الآخر
  shown.sort((a,b)=>{
    const rank = x => x.info.done ? 2 : (x.unit.paused ? 1 : 0);
    if(rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.info.diffDays ?? 0) - (b.info.diffDays ?? 0);
  });

  if(shown.length === 0){
    list.innerHTML = `<div class="empty">ما في وحدات تطابق هذا التصفية.</div>`;
    return;
  }

  list.innerHTML = shown.map(({unit, info})=>{
    const dataAttr = attrEscape(JSON.stringify(unit));
    const stage = unit.current_stage || 0;
    const shift = Math.round(srsNum(unit.shift_days, 0));
    let statusHtml, cardClass;
    if(info.done){
      statusHtml = `<div class="sj-status">✅ اكتملت كل المراجعات (${info.total})</div>`;
      cardClass = 'status-complete';
    } else {
      const dateLabel = formatDate(toDateStr(info.nextDate));
      let dueLabel;
      if(info.diffDays < 0) dueLabel = `متأخرة ${Math.abs(info.diffDays)} يوم`;
      else if(info.diffDays === 0) dueLabel = 'اليوم';
      else dueLabel = `بعد ${info.diffDays} يوم`;
      cardClass = unit.paused ? 'status-todo' : (info.diffDays <= 0 ? 'status-todo' : 'status-in_progress');
      statusHtml = `<div class="sj-status">المراجعة ${info.stageNum} من ${info.total} — ${dueLabel} (${dateLabel})</div>`;
    }
    const progress = Math.round((stage / Math.max(1, info.total || stage)) * 100);
    const due = !info.done && !unit.paused && info.diffDays <= 0;
    return `
    <div class="path-card ${cardClass} ${unit.paused ? 'srs-paused' : ''}">
      <button class="ghost del" onclick="deleteSrsUnit('${unit.id}')">حذف</button>
      <div class="sj-name">${escapeHtml(unit.title)} ${unit.paused ? '<span class="srs-badge">موقوفة</span>' : ''}</div>
      ${statusHtml}
      <div class="srs-progress"><span style="width:${progress}%"></span></div>
      <div class="srs-meta">${SRS_MODE_LABELS[unit.schedule_mode || 'curve']}${shift ? ` • مؤجلة ${shift} يوم` : ''}</div>
      ${unit.tags ? `<div class="tags-row">${unit.tags.split(',').map(t=>t.trim()).filter(Boolean).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="srs-actions">
        ${due ? `<button class="primary" onclick="markSrsReviewed('${unit.id}', ${stage})">تمت المراجعة ✓</button>` : ''}
        ${(!info.done && !unit.paused && info.diffDays > 0) ? `<button class="ghost" onclick="markSrsReviewed('${unit.id}', ${stage})">راجعتها مبكرًا ✓</button>` : ''}
        ${!info.done ? `
          <button class="ghost" onclick="postponeSrs('${unit.id}', ${shift}, 1)">تأجيل يوم</button>
          <button class="ghost" onclick="postponeSrs('${unit.id}', ${shift}, 7)">تأجيل أسبوع</button>` : ''}
        ${stage > 0 ? `<button class="ghost" onclick="undoSrsReview('${unit.id}', ${stage})">تراجع ↺</button>` : ''}
        <button class="ghost" onclick="toggleSrsPause('${unit.id}', ${unit.paused ? 'true' : 'false'})">${unit.paused ? 'استئناف ▶' : 'إيقاف ⏸'}</button>
        <button class="ghost" data-srs="${dataAttr}" onclick="openSrsForm(JSON.parse(this.getAttribute('data-srs')))">تعديل</button>
        <button class="ghost" onclick="resetSrsUnit('${unit.id}')">تصفير</button>
        <button class="ghost" onclick="toggleSrsExpand('${unit.id}')">${expandedSrsIds.has(unit.id) ? 'إخفاء المواعيد ▴' : 'كل المواعيد ▾'}</button>
      </div>
      ${expandedSrsIds.has(unit.id) ? renderSrsScheduleList(unit) : ''}
    </div>`;
  }).join('');
}

async function addEntry(){
  const content = document.getElementById('contentInput').value.trim();
  const date = document.getElementById('dateInput').value;
  let tags = document.getElementById('tagsInput').value.trim();
  const lessonName = document.getElementById('lessonNameInput').value.trim();
  if(!content){ alert('اكتب ما تريد تسجيله أولاً'); return; }
  if(splitTags(tags).some(tag=>tag === 'درس') && !lessonName){
    alert('حتى يُحسب الدرس بدقة، اكتب اسمه أو رقمه في خانة «اسم أو رقم الدرس».');
    return;
  }
  // الاسم هو مفتاح الدرس؛ لذلك لا تحتسب الجلسات المتكررة للدرس نفسه أكثر من مرة.
  if(lessonName){
    const lessonTag = `درس: ${lessonName}`;
    const existingTags = splitTags(tags);
    if(!existingTags.includes(lessonTag)) existingTags.push(lessonTag);
    tags = existingTags.join(', ');
  }
  const payload = { entry_date: date, content, tags };
  const {error} = editingEntryId
    ? await sb.from('entries').update(payload).eq('id', editingEntryId)
    : await sb.from('entries').insert({ ...payload, type: 'entry' });
  if(error){ alert('صار خطأ: '+error.message); return; }
  cancelEditEntry();
  await loadEntries();
}

function startEditEntry(id){
  const entry = entriesById.get(id);
  if(!entry) return;
  editingEntryId = id;
  const lessonTag = splitTags(entry.tags).find(tag => /^درس\s*:\s*(.+)$/i.test(tag));
  const lessonMatch = lessonTag && lessonTag.match(/^درس\s*:\s*(.+)$/i);
  document.getElementById('contentInput').value = entry.content || '';
  document.getElementById('dateInput').value = entry.entry_date || '';
  document.getElementById('tagsInput').value = splitTags(entry.tags).filter(tag => tag !== lessonTag).join(', ');
  document.getElementById('lessonNameInput').value = lessonMatch ? lessonMatch[1] : '';
  document.getElementById('saveEntryButton').textContent = 'حفظ التعديلات';
  document.getElementById('cancelEditWrap').style.display = '';
  document.querySelector('.entry-box').scrollIntoView({behavior:'smooth', block:'start'});
}

function cancelEditEntry(){
  editingEntryId = null;
  const content = document.getElementById('contentInput');
  if(!content) return;
  content.value = '';
  document.getElementById('tagsInput').value = '';
  document.getElementById('lessonNameInput').value = '';
  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('saveEntryButton').textContent = 'حفظ في السجل';
  document.getElementById('cancelEditWrap').style.display = 'none';
}

async function deleteEntry(id){
  if(!confirm('حذف هذا القيد؟')) return;
  await sb.from('entries').delete().eq('id', id);
  await loadEntries();
}

async function loadEntries(){
  const tagSearch = document.getElementById('tagSearch') ? document.getElementById('tagSearch').value.trim().toLowerCase() : '';
  let query = sb.from('entries').select('*').order('entry_date', {ascending:false}).order('created_at', {ascending:false});
  let {data, error} = await query;
  const timeline = document.getElementById('timeline');
  if(error){ timeline.innerHTML = `<div class="empty">تعذّر تحميل السجل: ${error.message}</div>`; return; }
  entriesById = new Map((data||[]).map(entry => [entry.id, entry]));

  renderStats();

  if(tagSearch){
    data = (data||[]).filter(e => (e.tags||'').toLowerCase().includes(tagSearch));
  }

  if(!data || data.length===0){
    timeline.innerHTML = `<div class="empty">لا توجد قيود بعد. ابدأ رحلتك بتسجيل أول فائدة أو حفظ اليوم ⤴</div>`;
    return;
  }
  const groupedEntries = new Map();
  data.forEach(entry => {
    // أول وسم هو الوسم الرئيسي: يضع كل قيد في مجموعة واحدة من دون تكرار.
    const mainTag = splitTags(entry.tags)[0] || 'بدون وسم';
    if(!groupedEntries.has(mainTag)) groupedEntries.set(mainTag, []);
    groupedEntries.get(mainTag).push(entry);
  });

  const renderEntry = e => `
    <div class="day-entry">
      <button class="ghost del" onclick="deleteEntry('${e.id}')">حذف</button>
      <button class="ghost edit" onclick="startEditEntry('${e.id}')">تعديل</button>
      <div class="date">${formatDate(e.entry_date)} <span class="tag">${tagLabel(e.type)}</span></div>
      <p>${escapeHtml(e.content)}</p>
      ${e.tags ? `<div class="tags-row">${splitTags(e.tags).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `;

  timeline.innerHTML = [...groupedEntries.entries()].map(([tag, entries]) => `
    <section class="tag-group${collapsedTagGroups.has(tag) ? ' collapsed' : ''}">
      <button type="button" class="tag-group-head" data-tag="${escapeHtml(tag)}" onclick="toggleTagGroup(this)" aria-expanded="${!collapsedTagGroups.has(tag)}">
        <h3>${tag === 'بدون وسم' ? 'بدون وسم' : '#'+escapeHtml(tag)}</h3>
        <span style="display:flex;align-items:center;gap:8px"><span class="tag-group-count">${entries.length} ${entries.length===1 ? 'قيد' : 'قيود'}</span><span class="tag-group-chevron">⌄</span></span>
      </button>
      <div class="tag-group-entries"><div>${entries.map(renderEntry).join('')}</div></div>
    </section>
  `).join('');
}

function splitTags(value){
  return (value||'').split(/[,،]/).map(tag=>tag.trim()).filter(Boolean);
}

function normalizeLessonKey(value){
  return value
    .normalize('NFKC')
    .replace(/[ـًٌٍَُِّْ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[‐‑–—―-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

function entryMonthKey(entryDate){
  return String(entryDate || '').slice(0, 7);
}

function monthLabelFromKey(key){
  if(!key) return 'بدون شهر';
  const [year, month] = key.split('-').map(Number);
  if(!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString('ar-SA', {month:'long', year:'numeric'});
}

function shiftMonthlySummaryMonth(step){
  if(!monthlySummaryKeys.length) return;
  const nextIndex = Math.max(0, Math.min(monthlySummaryKeys.length - 1, currentMonthlySummaryIndex + step));
  if(nextIndex === currentMonthlySummaryIndex) return;
  selectedMonthlySummaryKey = monthlySummaryKeys[nextIndex];
  renderStats();
}

function lessonKeys(entries){
  const keys = new Set();
  (entries||[]).forEach(entry => {
    splitTags(entry.tags).forEach(tag => {
      // لا يكفي وسم «درس» وحده: لا بد من اسم/رقم ثابت حتى نميّز الدرس الجديد عن جلسة متابعة له.
      const match = tag.match(/^درس\s*:\s*(.+)$/i);
      if(match && match[1].trim()) keys.add(normalizeLessonKey(match[1]));
    });
  });
  return keys;
}

function setMonthlySummaryVisibility(){
  const card = document.getElementById('monthlySummaryCard');
  const btn = document.getElementById('monthlySummaryToggle');
  if(card) card.classList.toggle('collapsed', !monthlySummaryVisible);
  if(btn) btn.setAttribute('aria-expanded', String(monthlySummaryVisible));
}

function toggleMonthlySummary(){
  monthlySummaryVisible = !monthlySummaryVisible;
  localStorage.setItem('rihla_monthly_summary', monthlySummaryVisible ? 'visible' : 'hidden');
  setMonthlySummaryVisibility();
}

function toggleTagGroup(button){
  const tag = button.dataset.tag;
  const group = button.closest('.tag-group');
  const isCollapsed = !group.classList.contains('collapsed');
  group.classList.toggle('collapsed', isCollapsed);
  button.setAttribute('aria-expanded', String(!isCollapsed));
  if(isCollapsed) collapsedTagGroups.add(tag);
  else collapsedTagGroups.delete(tag);
  localStorage.setItem('rihla_collapsed_tag_groups', JSON.stringify([...collapsedTagGroups]));
}

async function renderStats(){
  const {data:all} = await sb.from('entries').select('type, entry_date, focus_minutes, tags');
  const entries = all || [];
  const availableKeys = [...new Set(entries.map(e => entryMonthKey(e.entry_date)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  monthlySummaryKeys = availableKeys.length ? availableKeys : [currentMonthKey];
  if(selectedMonthlySummaryKey && !monthlySummaryKeys.includes(selectedMonthlySummaryKey)){
    selectedMonthlySummaryKey = null;
  }
  const selectedKey = selectedMonthlySummaryKey || (monthlySummaryKeys.includes(currentMonthKey) ? currentMonthKey : monthlySummaryKeys[0]);
  currentMonthlySummaryIndex = Math.max(0, monthlySummaryKeys.indexOf(selectedKey));
  selectedMonthlySummaryKey = monthlySummaryKeys[currentMonthlySummaryIndex] || currentMonthKey;

  const monthEntries = entries.filter(e => entryMonthKey(e.entry_date) === selectedMonthlySummaryKey);
  const focusEntries = monthEntries.filter(e=>e.type==='tarkiz');
  const focusMinutesTotal = focusEntries.reduce((s,e)=>s+(e.focus_minutes||0),0);
  const focusTimeLabel = focusMinutesTotal >= 60
    ? `${Math.floor(focusMinutesTotal/60)}س ${focusMinutesTotal%60}د`
    : `${focusMinutesTotal}د`;

  const summaryEl = document.getElementById('monthlySummary');
  if(summaryEl){
    const monthLabel = monthLabelFromKey(selectedMonthlySummaryKey);
    const lessonsCount = lessonKeys(monthEntries).size;
    const atNewest = currentMonthlySummaryIndex === 0;
    const atOldest = currentMonthlySummaryIndex === monthlySummaryKeys.length - 1;
    summaryEl.innerHTML = `
      <section class="monthly-summary-card" id="monthlySummaryCard">
        <button class="monthly-summary-toggle" id="monthlySummaryToggle" onclick="toggleMonthlySummary()" aria-expanded="true">
          <span class="monthly-summary-title">ملخص ${monthLabel}</span>
          <span class="monthly-summary-brief">${lessonsCount} دروس · ${focusTimeLabel} تركيز</span>
          <span class="summary-chevron">⌄</span>
        </button>
        <div class="monthly-summary-content">
          <div>
            درست <b>${lessonsCount}</b> ${lessonsCount===1 ? 'درسًا' : 'دروس'}، ومجموع وقت التركيز <b>${focusTimeLabel}</b>.
            <div style="font-size:.75rem;color:var(--ink-soft);margin-top:5px">يُحتسب الدرس بالوسم المنظّم: درس: اسم أو رقم الدرس. أعد استخدام الاسم نفسه عند متابعة الدرس.</div>
            <div class="monthly-summary-nav">
              <button class="ghost monthly-nav-btn" onclick="shiftMonthlySummaryMonth(1)" ${atOldest ? 'disabled' : ''}>← الشهر السابق</button>
              <button class="ghost monthly-nav-btn" onclick="shiftMonthlySummaryMonth(-1)" ${atNewest ? 'disabled' : ''}>الشهر التالي →</button>
            </div>
          </div>
        </div>
      </section>`;
    setMonthlySummaryVisibility();
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

init();
