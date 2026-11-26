/* 01-core.js — النواة: الثوابت والحالة العامة، الملاحظات، الثيم، الإعداد والدخول، init، renderApp، التبويبات والتمرير */

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

// خانة ملاحظات قابلة للطي: تبقى مطوية حتى تحتاجها، وتُفتح تلقائيًا إن كان فيها نص
function noteFoldHtml(id, value, placeholder, extraOnInput){
  const has = !!(value || '').trim();
  return `<div class="note-fold${has ? ' open has' : ''}" id="${id}Fold">
    <button type="button" class="note-head" onclick="toggleNoteFold('${id}')">${ic('pencil', 15)}<span>ملاحظات (اختياري)</span><i class="note-dot"></i><span class="note-chev">⌄</span></button>
    <div class="note-body"><textarea id="${id}" placeholder="${attrEscape(placeholder)}" oninput="noteInput('${id}');${extraOnInput || ''}">${escapeHtml(value || '')}</textarea></div>
  </div>`;
}
function toggleNoteFold(id){
  const f = document.getElementById(id + 'Fold');
  if(!f) return;
  const open = f.classList.toggle('open');
  if(open) setTimeout(() => document.getElementById(id)?.focus(), 60);
}
function noteInput(id){
  const f = document.getElementById(id + 'Fold'), t = document.getElementById(id);
  if(f && t) f.classList.toggle('has', !!t.value.trim());
}
// بعد تعبئة الخانة برمجيًا (مسودة/تعديل): نحدّث النقطة ونفتحها إن كان فيها نص
function syncNoteFold(id){
  const f = document.getElementById(id + 'Fold'), t = document.getElementById(id);
  if(!f || !t) return;
  const has = !!t.value.trim();
  f.classList.toggle('has', has);
  if(has) f.classList.add('open');
}
function resetNoteFold(id){
  const t = document.getElementById(id);
  if(t) t.value = '';
  document.getElementById(id + 'Fold')?.classList.remove('open', 'has');
}

// الملاحظة تُحفظ داخل نص القيد نفسه بعد فاصل ثابت، فلا يلزم تعديل Supabase
const NOTE_SEP = '\nملاحظة: ';
function withNote(content, note){
  const n = (note || '').trim();
  return n ? content + NOTE_SEP + n : content;
}
function splitNote(content){
  const c = content || '';
  const i = c.indexOf(NOTE_SEP);
  return i < 0 ? {main: c, note: ''} : {main: c.slice(0, i), note: c.slice(i + NOTE_SEP.length)};
}

function toDateStr(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function computeStreak(dateStrings){
  const set = new Set(dateStrings);
  const vac = getVacations();
  const cursor = new Date();
  if(!set.has(toDateStr(cursor))) cursor.setDate(cursor.getDate()-1);
  let streak = 0, guard = 0;
  while(guard++ < 4000){
    const ds = toDateStr(cursor);
    if(set.has(ds)) streak++;
    else if(!vac.has(ds)) break;     // يوم الإجازة لا يكسر السلسلة ولا يُحتسب فيها
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

const THEMES = ['void','dark','light'];
const THEME_ICON = {void:'⚫', dark:'🌙', light:'☀️'};
const THEME_NAME = {void:'أسود ورمادي', dark:'داكن دافئ', light:'ورقي فاتح'};
function currentTheme(){
  const t = localStorage.getItem('rihla_theme_v2');
  return THEMES.includes(t) ? t : 'void';
}
function applyTheme(){
  const t = currentTheme();
  document.body.classList.toggle('dark-mode', t === 'dark');
  document.body.classList.toggle('void-mode', t === 'void');
  const btn = document.getElementById('themeToggle');
  if(btn){ btn.innerHTML = ic({void:'circle', dark:'moon', light:'sun'}[t], 16); btn.title = 'المظهر: ' + THEME_NAME[t]; }
}
function toggleTheme(){
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  localStorage.setItem('rihla_theme_v2', next);
  applyTheme();
  if(typeof showToast === 'function') showToast('المظهر: ' + THEME_NAME[next]);
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

alter table entries add column if not exists book_id uuid references books(id) on delete set null;
alter table entries add column if not exists lesson_number int;
create policy "update own" on entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant update on entries to authenticated;
alter table books add column if not exists started_at date;
alter table books add column if not exists finished_at date;
notify pgrst, 'reload schema';</pre>
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

  // رابط استعادة كلمة السر من البريد: يفتح شاشة تعيين كلمة جديدة
  const hashIsRecovery = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((event) => {
    if(event === 'PASSWORD_RECOVERY') renderPasswordScreen('recovery');
  });

  const { data: { session } } = await sb.auth.getSession();
  if(hashIsRecovery && session){ renderPasswordScreen('recovery'); return; }
  if(!session){ renderAuth(); return; }
  await renderApp();
}

function resetRedirectUrl(){
  return location.origin + location.pathname;
}

async function sendResetEmail(){
  const email = document.getElementById('authEmail').value.trim();
  const msg = document.getElementById('authMsg');
  if(!email){ msg.style.color = 'var(--red)'; msg.textContent = 'اكتب بريدك في الخانة أعلاه أولاً'; return; }
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: resetRedirectUrl()});
  if(error){ msg.style.color = 'var(--red)'; msg.textContent = error.message; return; }
  msg.style.color = 'var(--green)';
  msg.textContent = 'إذا كان البريد مسجّلًا فقد أُرسل إليه رابط تعيين كلمة سر جديدة. تحقق من الوارد والبريد المزعج.';
}

function renderPasswordScreen(mode){
  const app = document.getElementById('app');
  const isRecovery = mode === 'recovery';
  app.innerHTML = `
  <div class="setup-screen">
    <h1>${isRecovery ? 'تعيين كلمة سر جديدة' : 'تغيير كلمة السر'}</h1>
    <p style="color:var(--ink-soft);font-size:.88rem">${isRecovery ? 'اكتب كلمة السر الجديدة لحسابك.' : 'اختر كلمة سر جديدة لحسابك الحالي.'}</p>
    <input id="newPass" type="password" placeholder="كلمة السر الجديدة (6 أحرف على الأقل)" autocomplete="new-password">
    <input id="newPass2" type="password" placeholder="أعد كتابة كلمة السر" autocomplete="new-password">
    <div id="passMsg" style="color:var(--red);font-size:.8rem;margin-bottom:8px"></div>
    <button class="primary" onclick="saveNewPassword('${mode}')" style="width:100%;margin-bottom:8px">حفظ كلمة السر</button>
    ${isRecovery ? '' : `<button class="ghost" onclick="renderApp()" style="width:100%">إلغاء</button>`}
  </div>`;
}

async function saveNewPassword(mode){
  const p1 = document.getElementById('newPass').value;
  const p2 = document.getElementById('newPass2').value;
  const msg = document.getElementById('passMsg');
  if(p1.length < 6){ msg.textContent = 'كلمة السر لا تقل عن 6 أحرف'; return; }
  if(p1 !== p2){ msg.textContent = 'كلمتا السر غير متطابقتين'; return; }
  const {error} = await sb.auth.updateUser({password: p1});
  if(error){ msg.textContent = error.message; return; }
  history.replaceState(null, '', location.pathname);
  await renderApp();
  showToast('تم تغيير كلمة السر ✓');
}

function renderAuth(){
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="setup-screen">
    <h1>الرحلة العلمية</h1>
    <p style="color:var(--ink-soft);font-size:.88rem">سجّل دخولك ببريدك حتى يبقى سجلك خاصًا فيك، حتى لو صار رابط الصفحة عام.</p>
    <input id="authEmail" type="email" placeholder="البريد الإلكتروني">
    <input id="authPass" type="password" placeholder="كلمة السر (6 أحرف على الأقل)">
    <input id="authHandle" type="text" placeholder="المعرّف المميز (عند إنشاء حساب جديد) مثل: talib_ilm">
    <div id="authMsg" style="color:var(--red);font-size:.8rem;margin-bottom:8px"></div>
    <button class="primary" onclick="signIn()" style="width:100%;margin-bottom:8px">دخول</button>
    <button class="ghost" onclick="signUp()" style="width:100%;margin-bottom:8px">إنشاء حساب جديد</button>
    <button class="ghost" onclick="sendResetEmail()" style="width:100%;border-style:dashed">نسيت كلمة السر؟</button>
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
  const handle = document.getElementById('authHandle').value.trim().toLowerCase().replace(/^@/, '');
  if(!email || password.length < 6 || !/^[a-z0-9_]{3,24}$/.test(handle)){
    document.getElementById('authMsg').textContent = 'أدخل بريدًا وكلمة سر، ومعرّفًا من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا أو _';
    return;
  }
  const {data, error} = await sb.auth.signUp({email, password, options:{data:{pending_handle:handle}}});
  if(error){ document.getElementById('authMsg').textContent = error.message; return; }
  if(data.session){ await renderApp(); }
  else { document.getElementById('authMsg').style.color = 'var(--green)'; document.getElementById('authMsg').textContent = 'تم إنشاء الحساب. تحقق من بريدك لتفعيله ثم سجّل دخولك.'; }
}

async function signOut(){
  await sb.auth.signOut();
  renderAuth();
}

async function renderApp(){
  await refreshBooksCache();
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="top">
      <div>
        <div class="title">الرحلة العلمية</div>
        <div class="hijri-note">سجلّك الشخصي لكل ما تحفظ وتقرأ وتستفيد</div>
      </div>
      <span style="display:flex;align-items:center;gap:8px">
        <button class="ghost" id="themeToggle" onclick="toggleTheme()" title="تغيير المظهر">⚫</button>
        <button class="ghost" id="readToggle" onclick="toggleReadMenu(event)" title="القراءة والعرض">${ic('eye', 16)}</button>
        <span id="status-pill">متصل</span>
        <button class="header-avatar" id="headerAvatar" onclick="switchTab('profile')" title="الحساب">👤</button>
      </span>
      <div id="readMenu" class="pop-menu" hidden>
        <div class="pm-title">حجم الخط</div>
        <div class="tag-choices" id="fsChoices">
          <button data-fs="14" onclick="setFontSize(14)">صغير</button>
          <button data-fs="16" onclick="setFontSize(16)">متوسط</button>
          <button data-fs="18" onclick="setFontSize(18)">كبير</button>
        </div>
        <label class="focus-check"><input type="checkbox" id="rdComfy" onchange="toggleReadPref('comfy', this.checked)"> قراءة مريحة (سطور أوسع وعمود أضيق)</label>
        <label class="focus-check"><input type="checkbox" id="rdCalm" onchange="toggleReadPref('calm', this.checked)"> تقليل الحركة</label>
      </div>
    </header>

    <div class="tabs-nav">
      <button class="tab-btn active" id="tabDaily" onclick="switchTab('daily')">السجل اليومي</button>
      <button class="tab-btn" id="tabPath" onclick="switchTab('path')">الطريق</button>
      <button class="tab-btn" id="tabFocus" onclick="switchTab('focus')">التركيز</button>
      <button class="tab-btn" id="tabStats" onclick="switchTab('stats')">الإحصائيات</button>
      <button class="tab-btn" id="tabPtree" onclick="switchTab('ptree')">التشجير</button>
    </div>

    <div id="dailyView"></div>
    <div id="pathView" style="display:none"></div>
    <div id="focusView" style="display:none"></div>
    <div id="statsView" style="display:none"></div>
    <div id="ptreeView" style="display:none"></div>
    <div id="profileView" style="display:none"></div>
  `;

  applyTheme();
  applyReadPrefs();
  renderDailyView();
  const savedTimer = readSavedTimer();
  renderFocusView();
  restoreTimer(savedTimer);
  renderProfileView();
  openProfile();
  const savedTab = localStorage.getItem(LAST_TAB_KEY);
  if(['path','focus','stats','ptree','profile'].includes(savedTab)) switchTab(savedTab);
  else restoreScroll('daily');
}

const LAST_TAB_KEY = 'rihla_last_tab';
const SCROLL_KEY = 'rihla_scroll';
let currentTab = 'daily', scrollMute = false, scrollToken = 0, scrollSaveTimer = null;
let scrollMap = {};
try { scrollMap = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}') || {}; } catch(e) {}

function saveScrollMap(){ try{ localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollMap)); }catch(e){} }

window.addEventListener('scroll', () => {
  if(scrollMute) return;
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => { scrollMap[currentTab] = Math.round(window.scrollY); saveScrollMap(); }, 200);
}, {passive:true});

// يعيدك إلى موضعك في التبويب بعد أن يكتمل تحميل محتواه
function restoreScroll(tab){
  const target = scrollMap[tab] || 0;
  const token = ++scrollToken;
  scrollMute = true;
  const done = () => setTimeout(() => { if(token === scrollToken) scrollMute = false; }, 300);
  if(!target){ window.scrollTo(0, 0); done(); return; }
  const attempt = n => {
    if(token !== scrollToken) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if(max >= target - 4 || n >= 6){ window.scrollTo(0, target); done(); }
    else setTimeout(() => attempt(n + 1), 250);
  };
  attempt(0);
}

function switchTab(tab){
  if(currentTab !== tab){ scrollMap[currentTab] = Math.round(window.scrollY); }
  currentTab = tab;
  try{ localStorage.setItem(LAST_TAB_KEY, tab); }catch(e){}
  saveScrollMap();
  if(document.body.classList.contains('zen')) toggleZen();
  if(tab==='path') currentSubjectId = null;
  const tabs = {daily:['tabDaily','dailyView'], path:['tabPath','pathView'], focus:['tabFocus','focusView'], stats:['tabStats','statsView'], ptree:['tabPtree','ptreeView'], profile:['tabProfile','profileView']};
  Object.entries(tabs).forEach(([k,[btn,view]])=>{
    document.getElementById(btn)?.classList.toggle('active', k===tab);
    document.getElementById(view).style.display = k===tab ? '' : 'none';
  });
  document.getElementById('headerAvatar')?.classList.toggle('active', tab==='profile');
  if(tab==='path') renderPathView();
  if(tab==='daily'){ loadEntries(); syncBooksUi(); }
  if(tab==='focus') syncBooksUi();
  if(tab==='stats') openStats();
  document.body.classList.toggle('wide-tab', tab==='ptree');
  if(tab==='ptree') openPtree();
  if(tab==='profile') openProfile();
  restoreScroll(tab);
}
