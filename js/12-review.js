/* 12-review.js — «المراجعة والتكرار»: جدولة التكرار المتباعد للدروس والوحدات، التقييم، التقويم، الإحصائيات */

const RV_SCHED_KEY = 'rihla_review_schedule';
const RV_AUTO_KEY = 'rihla_review_autofrom';
const RV_DEFAULT = [1, 3, 7, 14, 30, 60, 90];
const RV_RES = {strong:'متقن', medium:'متوسط', weak:'ضعيف', postponed:'تأجيل'};
const RV = {items:[], units:[], logs:[], loaded:false, missing:false, err:'', tab:'today', cal:null, calDay:null, view:null, more:null, snooze:null, draft:null};

const RV_SQL = `-- شغّله مرة واحدة في Supabase ← SQL Editor
create table if not exists review_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  lessons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  kind text not null check (kind in ('lesson','unit')),
  book_id text,
  lesson_number int,
  unit_id uuid references review_units(id) on delete cascade,
  base_date date not null,
  schedule jsonb not null default '[1,3,7,14,30,60,90]'::jsonb,
  step int not null default 0,
  next_due date,
  status text not null default 'active' check (status in ('active','paused','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists review_items_lesson_uq on review_items (user_id, book_id, lesson_number) where kind = 'lesson';
create unique index if not exists review_items_unit_uq on review_items (unit_id) where kind = 'unit';
create table if not exists review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  item_id uuid references review_items(id) on delete cascade,
  reviewed_on date not null,
  due_on date,
  step int,
  result text not null check (result in ('strong','medium','weak','postponed')),
  next_due date,
  created_at timestamptz not null default now()
);
alter table review_units enable row level security;
alter table review_items enable row level security;
alter table review_logs enable row level security;
create policy "own review_units" on review_units for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own review_items" on review_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own review_logs" on review_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

/* ---------- أدوات التاريخ والجدول ---------- */
function rvEsc(s){ return escapeHtml(String(s == null ? '' : s)); }
function rvToday(){ return toDateStr(new Date()); }
function rvDate(ds){ const p = ds.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function rvAdd(ds, n){ const p = ds.split('-').map(Number); return toDateStr(new Date(p[0], p[1]-1, p[2] + n)); }
function rvDiff(a, b){
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1]-1, pb[2]) - Date.UTC(pa[0], pa[1]-1, pa[2])) / 864e5);
}
function rvCleanSched(a){
  return [...new Set(a.map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 3650).map(Math.round))].sort((x, y) => x - y);
}
function rvParseSched(str){ return rvCleanSched(normalizeDigits(str || '').split(/[\s,،;؛]+/).filter(Boolean)); }
function rvDefaultSchedule(){
  try{ const a = JSON.parse(localStorage.getItem(RV_SCHED_KEY) || 'null'); if(Array.isArray(a) && a.length) return rvCleanSched(a); }catch(e){}
  return RV_DEFAULT.slice();
}
function rvAutoFrom(){
  let v = null;
  try{ v = localStorage.getItem(RV_AUTO_KEY); }catch(e){}
  if(!v){ v = rvAdd(rvToday(), -30); try{ localStorage.setItem(RV_AUTO_KEY, v); }catch(e){} }
  return v;
}
function rvSame(a, b){ return String(a) === String(b); }
function rvBookName(id){ const b = booksCache.find(x => rvSame(x.id, id)); return b ? b.name : 'كتاب محذوف'; }
function rvLessonTitle(bid, n){
  const b = booksCache.find(x => rvSame(x.id, bid));
  return `${rvBookName(bid)} — ${b ? lessonUnit(b) : 'درس'} ${arabicNumeral(n)}`;
}
function rvToast(msg, warn){ showToast(msg, warn ? 'warn' : undefined); }
function rvFail(e){ console.error(e); rvToast('تعذّر الحفظ: ' + ((e && e.message) || e), true); }

/* ---------- الدروس المدروسة (من سجل القيود) ---------- */
function rvEntryKey(e, byName){
  if(e.book_id && e.lesson_number) return e.book_id + ':' + e.lesson_number;
  const tags = splitTags(e.tags);
  for(const tag of tags){
    const m = tag.match(/^درس\s*:\s*(.+?)\s*[—–-]\s*الدرس\s*(\d+)\s*$/);
    if(!m) continue;
    const bid = byName.get(normalizeLessonKey(m[1]));
    if(bid) return bid + ':' + parseInt(m[2]);
  }
  return null;
}
function rvByName(){ return new Map(booksCache.map(b => [normalizeLessonKey(b.name), b.id])); }
function rvStudied(){
  const m = new Map(), byName = rvByName();
  const pageBooks = new Set(booksCache.filter(b => (b.kind || 'matn') === 'book').map(b => String(b.id)));
  entriesCache.forEach(e => {
    if(!e.entry_date || isReviewEntry(e)) return;
    const k = rvEntryKey(e, byName);
    if(!k) return;
    const i = k.lastIndexOf(':'), bid = k.slice(0, i), n = Number(k.slice(i + 1));
    if(pageBooks.has(String(bid))) return;
    let s = m.get(k);
    if(!s){ s = {key:k, bookId:bid, n, first:e.entry_date, last:e.entry_date, count:0}; m.set(k, s); }
    if(e.entry_date < s.first) s.first = e.entry_date;
    if(e.entry_date > s.last) s.last = e.entry_date;
    s.count++;
  });
  return m;
}

/* ---------- بناء عناصر المراجعة ---------- */
function rvStartStep(base, sched, today){
  let idx = -1;
  sched.forEach((o, i) => { if(rvAdd(base, o) <= today) idx = i; });
  return idx < 0 ? 0 : idx;
}
function rvItems(){
  const today = rvToday(), st = rvStudied(), out = [], seen = new Set();
  RV.items.forEach(r => {
    const sched = Array.isArray(r.schedule) && r.schedule.length ? r.schedule : rvDefaultSchedule();
    if(r.kind === 'lesson'){
      const k = r.book_id + ':' + r.lesson_number;
      seen.add(k);
      out.push({id:r.id, kind:'lesson', key:k, bookId:r.book_id, n:r.lesson_number, base:r.base_date, schedule:sched,
        step:r.step, due:r.next_due, status:r.status, persisted:true, title:rvLessonTitle(r.book_id, r.lesson_number), studied:st.get(k) || null});
    }else{
      const u = RV.units.find(x => x.id === r.unit_id);
      if(!u) return;
      out.push({id:r.id, kind:'unit', unit:u, unitId:u.id, base:r.base_date, schedule:sched,
        step:r.step, due:r.next_due, status:r.status, persisted:true, title:u.name});
    }
  });
  const sched = rvDefaultSchedule(), autoFrom = rvAutoFrom();
  st.forEach(s => {
    if(seen.has(s.key) || s.first < autoFrom) return;
    const step = rvStartStep(s.first, sched, today);
    out.push({id:'v:' + s.key, kind:'lesson', key:s.key, bookId:s.bookId, n:s.n, base:s.first, schedule:sched, step,
      due:rvAdd(s.first, sched[step]), status:'active', persisted:false, title:rvLessonTitle(s.bookId, s.n), studied:s});
  });
  return out;
}
function rvState(it, today){
  if(it.status === 'paused') return 'paused';
  if(it.status === 'done' || !it.due) return 'done';
  const d = rvDiff(today, it.due);
  return d < 0 ? 'overdue' : d === 0 ? 'today' : 'upcoming';
}

/* ---------- خوارزمية التقييم ---------- */
function rvNext(it, res, today){
  const off = it.schedule, last = off.length - 1, cur = Math.min(it.step, last);
  if(res === 'strong'){
    let ns = cur + 1;
    while(ns <= last && rvAdd(it.base, off[ns]) <= today) ns++;      // تُتخطّى المواعيد التي فاتت
    if(ns > last) return {step:off.length, due:null, status:'done'};
    return {step:ns, due:rvAdd(it.base, off[ns]), status:'active'};
  }
  if(res === 'medium'){
    const ns = Math.min(cur + 1, last);
    const gap = ns > cur ? off[ns] - off[cur] : (last > 0 ? off[last] - off[last - 1] : off[last]);
    return {step:ns, due:rvAdd(today, Math.max(2, Math.round(gap / 2))), status:'active'};
  }
  return {step:Math.max(0, cur - 1), due:rvAdd(today, 1), status:'active'};
}

/* ---------- الحفظ ---------- */
async function rvPersist(it, patch){
  patch.updated_at = new Date().toISOString();
  if(it.persisted){
    const {data, error} = await sb.from('review_items').update(patch).eq('id', it.id).select().single();
    if(error) throw error;
    const i = RV.items.findIndex(r => r.id === it.id);
    if(i >= 0) RV.items[i] = data;
    return data;
  }
  const row = Object.assign({kind:'lesson', book_id:String(it.bookId), lesson_number:it.n, base_date:it.base,
    schedule:it.schedule, step:it.step, next_due:it.due, status:it.status}, patch);
  const {data, error} = await sb.from('review_items').insert(row).select().single();
  if(error) throw error;
  RV.items.push(data);
  return data;
}
async function rvLog(itemId, obj){
  const {data, error} = await sb.from('review_logs').insert(Object.assign({item_id:itemId}, obj)).select().single();
  if(error) throw error;
  RV.logs.unshift(data);
}
function rvFind(id){ return rvItems().find(x => x.id === id); }

async function rvRate(id, res){
  const it = rvFind(id); if(!it) return;
  const today = rvToday(), r = rvNext(it, res, today);
  try{
    const row = await rvPersist(it, {step:r.step, next_due:r.due, status:r.status});
    await rvLog(row.id, {reviewed_on:today, due_on:it.due, step:it.step, result:res, next_due:r.due});
    rvToast(r.status === 'done' ? 'أتممت جدول التكرار لهذا العنصر ✓' : `سُجّل «${RV_RES[res]}» — المراجعة القادمة ${pfDate(r.due)}`);
  }catch(e){ rvFail(e); }
  RV.snooze = null; RV.more = null;
  rvRender();
}
function rvToggleSnooze(id){ RV.snooze = RV.snooze === id ? null : id; rvRender(); }
async function rvPostpone(id, days){
  const it = rvFind(id); if(!it) return;
  const today = rvToday(), due = rvAdd(today, days);
  try{
    const row = await rvPersist(it, {next_due:due});
    await rvLog(row.id, {reviewed_on:today, due_on:it.due, step:it.step, result:'postponed', next_due:due});
    rvToast(`أُجّلت إلى ${pfDate(due)}`);
  }catch(e){ rvFail(e); }
  RV.snooze = null;
  rvRender();
}
async function rvSetStatus(id, status){
  const it = rvFind(id); if(!it) return;
  if(status === 'done' && !confirm('إنهاء التكرار لهذا العنصر؟ يمكنك استئنافه لاحقًا من «المزيد».')) return;
  const patch = {status};
  if(status === 'active'){
    const last = it.schedule.length - 1;
    if(it.step > last) patch.step = last;
    if(!it.due || it.due < rvToday()) patch.next_due = rvToday();
  }
  try{ await rvPersist(it, patch); }catch(e){ rvFail(e); }
  rvRender();
}
async function rvSaveEdit(id){
  const it = rvFind(id); if(!it) return;
  const sched = rvParseSched(document.getElementById('rvSch-' + id).value);
  if(!sched.length){ rvToast('اكتب أيامًا صحيحة مفصولة بفواصل، مثل: 1، 3، 7', true); return; }
  const dateIn = document.getElementById('rvDue-' + id).value;
  const schedChanged = JSON.stringify(sched) !== JSON.stringify(it.schedule);
  const step = Math.min(it.step, sched.length - 1);
  let due = it.due;
  if(dateIn && dateIn !== it.due) due = dateIn;
  else if(schedChanged) due = rvAdd(it.base, sched[step]);
  const patch = {schedule:sched, step, next_due:due};
  if(it.status === 'done' && due) patch.status = 'active';
  try{ await rvPersist(Object.assign({}, it, {schedule:sched, step}), patch); rvToast('حُفظت المواعيد'); }catch(e){ rvFail(e); }
  rvRender();
}
function rvToggleView(id){ RV.view = RV.view === id ? null : id; rvRender(); }
function rvToggleMore(id){ RV.more = RV.more === id ? null : id; rvRender(); }

/* ---------- الانتقال إلى الدرس أو الكتاب ---------- */
function rvGoBook(bookId){
  const b = booksCache.find(x => rvSame(x.id, bookId));
  switchTab('path');
  if(!b || !b.subject_id) return;
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    try{
      if(typeof trSubs !== 'undefined' && trSubs.find(s => rvSame(s.id, b.subject_id))){
        clearInterval(t);
        if(!rvSame(trOpen, b.subject_id)) trToggle(b.subject_id);
      }
    }catch(e){ clearInterval(t); }
    if(tries > 20) clearInterval(t);
  }, 300);
}

/* ---------- الوحدات ---------- */
async function rvEnsureUnitItems(){
  const have = new Set(RV.items.filter(r => r.kind === 'unit').map(r => r.unit_id));
  const sched = rvDefaultSchedule();
  for(const u of RV.units){
    if(have.has(u.id)) continue;
    const base = u.created_at ? toDateStr(new Date(u.created_at)) : rvToday();
    const {data, error} = await sb.from('review_items').insert({kind:'unit', unit_id:u.id, base_date:base, schedule:sched, step:0, next_due:rvAdd(base, sched[0]), status:'active'}).select().single();
    if(!error && data) RV.items.push(data);
  }
}
function rvDraftOpen(id){
  const u = id ? RV.units.find(x => x.id === id) : null;
  RV.draft = {id:id || null, name:u ? u.name : '', keys:new Set(u ? u.lessons.map(l => l.b + ':' + l.n) : []), book:null};
  RV.tab = 'units';
  rvRender();
  document.getElementById('rvEditor')?.scrollIntoView({behavior:'smooth', block:'start'});
}
function rvDraftClose(){ RV.draft = null; rvRender(); }
function rvDraftRefresh(){ const el = document.getElementById('rvEditor'); if(el) el.innerHTML = rvEditorHtml(); }
function rvDraftBook(v){ RV.draft.book = v; rvDraftRefresh(); }
function rvDraftToggle(key, on){
  if(on) RV.draft.keys.add(key); else RV.draft.keys.delete(key);   // المجموعة تمنع تكرار الدرس نفسه
  rvDraftRefresh();
}
function rvDraftAll(on){
  const sel = RV.draft.book;
  [...rvStudied().values()].filter(s => rvSame(s.bookId, sel)).forEach(s => { if(on) RV.draft.keys.add(s.key); else RV.draft.keys.delete(s.key); });
  rvDraftRefresh();
}
async function rvSaveUnit(){
  const d = RV.draft, name = (d.name || '').trim();
  if(!name){ rvToast('اكتب اسم الوحدة', true); return; }
  if(!d.keys.size){ rvToast('اختر درسًا واحدًا على الأقل', true); return; }
  const order = new Map(booksCache.map((b, i) => [String(b.id), i]));
  const lessons = [...d.keys].map(k => { const i = k.lastIndexOf(':'); return {b:k.slice(0, i), n:Number(k.slice(i + 1))}; })
    .sort((x, y) => (order.get(String(x.b)) ?? 999) - (order.get(String(y.b)) ?? 999) || x.n - y.n);
  try{
    if(d.id){
      const {data, error} = await sb.from('review_units').update({name, lessons}).eq('id', d.id).select().single();
      if(error) throw error;
      const i = RV.units.findIndex(u => u.id === d.id); if(i >= 0) RV.units[i] = data;
      rvToast('حُدّثت الوحدة');
    }else{
      const {data, error} = await sb.from('review_units').insert({name, lessons}).select().single();
      if(error) throw error;
      RV.units.push(data);
      await rvEnsureUnitItems();
      rvToast('أُنشئت الوحدة، وأول مراجعة لها غدًا');
    }
    RV.draft = null;
  }catch(e){ rvFail(e); }
  rvRender();
}
async function rvDeleteUnit(id){
  const u = RV.units.find(x => x.id === id); if(!u) return;
  if(!confirm(`حذف الوحدة «${u.name}» وسجل مراجعاتها؟ الدروس نفسها لا تتأثر.`)) return;
  try{
    const {error} = await sb.from('review_units').delete().eq('id', id);
    if(error) throw error;
    RV.units = RV.units.filter(x => x.id !== id);
    const gone = RV.items.filter(r => r.unit_id === id).map(r => r.id);
    RV.items = RV.items.filter(r => r.unit_id !== id);
    RV.logs = RV.logs.filter(l => !gone.includes(l.item_id));
    rvToast('حُذفت الوحدة');
  }catch(e){ rvFail(e); }
  rvRender();
}

/* ---------- إضافة درس سابق يدويًا + الإعدادات ---------- */
function rvAddFill(){
  const bs = document.getElementById('rvAddBook'), ls = document.getElementById('rvAddLesson');
  if(!bs || !ls) return;
  const have = new Set(rvItems().filter(i => i.kind === 'lesson').map(i => i.key));
  const list = [...rvStudied().values()].filter(s => rvSame(s.bookId, bs.value) && !have.has(s.key)).sort((a, b) => a.n - b.n);
  ls.innerHTML = list.map(s => `<option value="${rvEsc(s.key)}">الدرس ${arabicNumeral(s.n)} — ${pfDate(s.first)}</option>`).join('') || '<option value="">لا دروس</option>';
}
async function rvAddLesson(){
  const key = document.getElementById('rvAddLesson').value;
  const s = rvStudied().get(key);
  if(!s){ rvToast('اختر درسًا', true); return; }
  if(RV.items.some(r => r.kind === 'lesson' && (r.book_id + ':' + r.lesson_number) === key)){ rvToast('هذا الدرس مضاف مسبقًا', true); return; }
  const sched = rvDefaultSchedule(), step = rvStartStep(s.first, sched, rvToday());
  const due = [rvAdd(s.first, sched[step]), rvToday()].sort().pop();
  try{
    await rvPersist({persisted:false, bookId:s.bookId, n:s.n, base:s.first, schedule:sched, step, due, status:'active'}, {});
    rvToast('أُضيف الدرس إلى المراجعة');
  }catch(e){ rvFail(e); }
  rvRender();
}
function rvSaveSettings(){
  const sched = rvParseSched(document.getElementById('rvSchedIn').value);
  if(!sched.length){ rvToast('اكتب أيامًا صحيحة مفصولة بفواصل', true); return; }
  const af = document.getElementById('rvAutoIn').value;
  try{
    localStorage.setItem(RV_SCHED_KEY, JSON.stringify(sched));
    if(af) localStorage.setItem(RV_AUTO_KEY, af);
  }catch(e){}
  rvToast('حُفظ الجدول الافتراضي');
  rvRender();
}
function rvResetSettings(){
  try{ localStorage.removeItem(RV_SCHED_KEY); }catch(e){}
  rvToast('عاد الجدول الافتراضي'); rvRender();
}
function rvCopySql(){
  try{ navigator.clipboard.writeText(RV_SQL).then(() => rvToast('نُسخ الكود ✓')); }
  catch(e){ const t = document.getElementById('rvSqlBox'); if(t){ const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
}

/* ---------- العرض ---------- */
function rvSetTab(t){ RV.tab = t; RV.view = null; RV.more = null; RV.snooze = null; rvRender(); }
function rvPickDay(ds){ RV.calDay = RV.calDay === ds ? null : ds; rvRender(); }
function rvCalMove(d){
  const cur = RV.cal || rvToday().slice(0, 7), p = cur.split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1 + d, 1);
  RV.cal = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  RV.calDay = null; rvRender();
}

function rvRateBtns(id){
  return ['strong', 'medium', 'weak'].map(r => `<button class="rv-rate ${r}" onclick="rvRate('${id}','${r}')">${RV_RES[r]}</button>`).join('');
}
function rvCardHtml(it, opt){
  opt = opt || {};
  const today = rvToday(), st = rvState(it, today), len = it.schedule.length;
  const diff = it.due ? rvDiff(today, it.due) : 0;
  let due;
  if(st === 'overdue') due = `متأخرة ${humanDays(-diff)}`;
  else if(st === 'today') due = 'مستحقة اليوم';
  else if(st === 'upcoming') due = `بعد ${humanDays(diff)} — ${weekdayName(rvDate(it.due))} ${pfDate(it.due)}`;
  else if(st === 'paused') due = 'التكرار متوقف' + (it.due ? ` (الموعد المحفوظ ${pfDate(it.due)})` : '');
  else due = 'انتهى التكرار';
  const stepTxt = st === 'done' ? `أتممت ${arabicNumeral(len)} مراجعات` : `المراجعة ${arabicNumeral(Math.min(it.step, len - 1) + 1)} من ${arabicNumeral(len)}`;
  const meta = it.kind === 'unit'
    ? `وحدة من ${arabicNumeral(it.unit.lessons.length)} ${it.unit.lessons.length === 1 ? 'درس' : 'دروس'} · أُنشئت ${pfDate(it.base)}`
    : `درسته ${pfDate(it.base)}`;
  const due_actions = (st === 'overdue' || st === 'today') && !opt.compact
    ? `<div class="rv-actions">${rvRateBtns(it.id)}<button class="ghost" onclick="rvToggleSnooze('${it.id}')">تأجيل</button></div>` : '';
  const snooze = RV.snooze === it.id
    ? `<div class="rv-actions rv-snooze"><span class="hint">أجّل إلى:</span><button class="ghost" onclick="rvPostpone('${it.id}',1)">غدًا</button><button class="ghost" onclick="rvPostpone('${it.id}',3)">بعد ٣ أيام</button><button class="ghost" onclick="rvPostpone('${it.id}',7)">بعد أسبوع</button></div>` : '';
  const tools = opt.compact ? '' : `<div class="rv-actions rv-tools"><button class="ghost" onclick="rvToggleView('${it.id}')">${it.kind === 'unit' ? 'عرض الدروس' : 'عرض الدرس'}</button><button class="ghost" onclick="rvToggleMore('${it.id}')">المزيد</button>${opt.extra || ''}</div>`;
  return `<div class="book-stat rv-card rv-${st}">
    <div class="cb-row"><div class="sj-name" style="margin-bottom:0">${rvEsc(it.title)}${it.kind === 'unit' ? ' <span class="rv-kind">وحدة</span>' : ''}</div><div class="cb-pct" style="font-size:1rem">${arabicNumeral(Math.min(it.step, len - 1) + (st === 'done' ? 0 : 1))}/${arabicNumeral(len)}</div></div>
    <div class="cb-sub">${meta} · ${stepTxt}</div>
    <div class="rv-due rv-due-${st}">${due}</div>
    ${due_actions}${snooze}${tools}
    ${RV.view === it.id ? rvViewHtml(it) : ''}${RV.more === it.id ? rvMoreHtml(it) : ''}
  </div>`;
}
function rvViewHtml(it){
  if(it.kind === 'unit'){
    const rows = it.unit.lessons.map(l => `<div class="rv-line"><span>${rvEsc(rvLessonTitle(l.b, l.n))}</span><button class="ghost" onclick="rvGoBook('${rvEsc(l.b)}')">فتح الكتاب</button></div>`).join('');
    return `<div class="rv-panel"><div class="rv-ptitle">دروس الوحدة</div>${rows || '<div class="hint">لا دروس.</div>'}</div>`;
  }
  const byName = rvByName();
  const es = entriesCache.filter(e => !isReviewEntry(e) && rvEntryKey(e, byName) === it.key)
    .sort((a, b) => a.entry_date < b.entry_date ? 1 : -1).slice(0, 6);
  const rows = es.map(e => `<div class="rv-line"><span>${pfDate(e.entry_date)}</span><span class="rv-snip">${rvEsc(String(e.content || '').split('\n')[0].slice(0, 110))}</span></div>`).join('');
  return `<div class="rv-panel"><div class="rv-ptitle">سجل دراسة هذا الدرس</div>${rows || '<div class="hint">لا قيود.</div>'}<div class="rv-actions"><button class="ghost" onclick="rvGoBook('${rvEsc(it.bookId)}')">فتح الكتاب في «الطريق»</button></div></div>`;
}
function rvMoreHtml(it){
  const logs = RV.logs.filter(l => l.item_id === it.id).slice(0, 8);
  const logRows = logs.map(l => `<div class="rv-line"><span>${pfDate(l.reviewed_on)}</span><span class="rv-res rv-res-${l.result}">${RV_RES[l.result]}</span></div>`).join('');
  const resume = it.status !== 'active';
  return `<div class="rv-panel">
    <div class="rv-ptitle">تسجيل مراجعة الآن</div>
    <div class="rv-actions">${rvRateBtns(it.id)}</div>
    <div class="rv-ptitle">تعديل المواعيد</div>
    <div class="field"><label>أيام التكرار بعد ${it.kind === 'unit' ? 'إنشاء الوحدة' : 'يوم الدرس'} (${pfDate(it.base)})، مفصولة بفواصل</label><input id="rvSch-${it.id}" value="${it.schedule.join('، ')}"></div>
    <div class="field"><label>موعد المراجعة القادمة</label><input type="date" id="rvDue-${it.id}" value="${it.due || ''}"></div>
    <div class="rv-actions"><button class="primary" onclick="rvSaveEdit('${it.id}')">حفظ التعديل</button>
      ${resume ? `<button class="ghost" onclick="rvSetStatus('${it.id}','active')">استئناف التكرار</button>` : `<button class="ghost" onclick="rvSetStatus('${it.id}','paused')">إيقاف مؤقت</button>`}
      ${it.status !== 'done' ? `<button class="ghost" onclick="rvSetStatus('${it.id}','done')">إنهاء التكرار</button>` : ''}</div>
    ${logRows ? `<div class="rv-ptitle">آخر المراجعات</div>${logRows}` : ''}
  </div>`;
}

function rvTodayHtml(items){
  const today = rvToday();
  const over = items.filter(i => rvState(i, today) === 'overdue').sort((a, b) => a.due < b.due ? -1 : 1);
  const now = items.filter(i => rvState(i, today) === 'today');
  const doneToday = RV.logs.filter(l => l.reviewed_on === today && l.result !== 'postponed').length;
  const soon = items.filter(i => { const s = rvState(i, today); return s === 'upcoming' && rvDiff(today, i.due) <= 7; }).length;
  const stat = (n, l) => `<div class="stat"><span class="num">${arabicNumeral(n)}</span><span class="lbl">${l}</span></div>`;
  let h = `<div class="stats-row" style="margin-bottom:14px">${stat(now.length, 'مستحقة اليوم')}${stat(over.length, 'متأخرة')}${stat(soon, 'خلال ٧ أيام')}${stat(doneToday, 'أُنجزت اليوم')}</div>
    <div class="hint" style="margin:0 0 14px">متقن: الموعد التالي في الجدول · متوسط: موعد أقرب (نصف الفترة) · ضعيف: مراجعة غدًا وتراجع خطوة.</div>`;
  if(over.length) h += `<div class="timeline-head"><h2>متأخرة</h2></div>` + over.map(i => rvCardHtml(i)).join('');
  if(now.length) h += `<div class="timeline-head" style="margin-top:18px"><h2>اليوم</h2></div>` + now.map(i => rvCardHtml(i)).join('');
  if(!over.length && !now.length) h += `<div class="empty">لا مراجعات مستحقة اليوم. ${doneToday ? 'أحسنت، أنجزت مراجعات اليوم.' : 'سجّل دروسًا جديدة وستظهر مراجعاتها هنا تلقائيًا.'}</div>`;
  return h;
}
function rvUpcomingHtml(items){
  const today = rvToday();
  const up = items.filter(i => rvState(i, today) === 'upcoming').sort((a, b) => a.due < b.due ? -1 : 1);
  const groups = new Map();
  up.forEach(i => { if(!groups.has(i.due)) groups.set(i.due, []); groups.get(i.due).push(i); });
  let h = '';
  groups.forEach((list, ds) => {
    const diff = rvDiff(today, ds);
    h += `<div class="timeline-head" style="margin-top:14px"><h2>${weekdayName(rvDate(ds))} ${pfDate(ds)}</h2><span class="hint">بعد ${humanDays(diff)}</span></div>` + list.map(i => rvCardHtml(i)).join('');
  });
  if(!up.length) h += '<div class="empty">لا مراجعات قادمة.</div>';
  const inactive = items.filter(i => ['paused', 'done'].includes(rvState(i, today)));
  if(inactive.length) h += `<details class="rv-set"><summary>متوقفة أو منتهية (${arabicNumeral(inactive.length)})</summary>${inactive.map(i => rvCardHtml(i)).join('')}</details>`;
  h += rvAddLessonHtml(items) + rvSettingsHtml();
  return h;
}
function rvAddLessonHtml(items){
  const have = new Set(items.filter(i => i.kind === 'lesson').map(i => i.key));
  const left = [...rvStudied().values()].filter(s => !have.has(s.key));
  if(!left.length) return '';
  const ids = [...new Set(left.map(s => String(s.bookId)))];
  return `<details class="rv-set"><summary>إضافة درس سبق إلى المراجعة (${arabicNumeral(left.length)})</summary>
    <div class="field"><label>الكتاب</label><select id="rvAddBook" onchange="rvAddFill()">${ids.map(b => `<option value="${rvEsc(b)}">${rvEsc(rvBookName(b))}</option>`).join('')}</select></div>
    <div class="field"><label>الدرس</label><select id="rvAddLesson"></select></div>
    <button class="primary" onclick="rvAddLesson()">إضافة</button>
    <div class="hint">يبدأ الجدول من تاريخ دراسة الدرس، وتُتخطّى المواعيد التي فاتت.</div></details>`;
}
function rvSettingsHtml(){
  return `<details class="rv-set"><summary>جدول التكرار الافتراضي</summary>
    <div class="field"><label>الأيام بعد تاريخ الدرس أو إنشاء الوحدة، مفصولة بفواصل</label><input id="rvSchedIn" value="${rvDefaultSchedule().join('، ')}"></div>
    <div class="field"><label>إدراج الدروس المدروسة تلقائيًا ابتداءً من تاريخ</label><input type="date" id="rvAutoIn" value="${rvAutoFrom()}"></div>
    <div class="rv-actions"><button class="primary" onclick="rvSaveSettings()">حفظ</button><button class="ghost" onclick="rvResetSettings()">الجدول الافتراضي</button></div>
    <div class="hint">يسري على الدروس والوحدات الجديدة، وعلى الدروس التي لم تُراجَع بعد. أما ما سُجّل له تقدّم فيحتفظ بجدوله ويُعدَّل من «المزيد» في بطاقته.</div></details>`;
}

function rvEditorHtml(){
  const d = RV.draft; if(!d) return '';
  const st = rvStudied(), vals = [...st.values()];
  const bookIds = [...new Set(vals.map(s => String(s.bookId)))];
  const sel = d.book || bookIds[0] || '';
  const lessons = vals.filter(s => rvSame(s.bookId, sel)).sort((a, b) => a.n - b.n);
  const other = new Map();
  RV.units.filter(u => u.id !== d.id).forEach(u => u.lessons.forEach(l => { if(!other.has(l.b + ':' + l.n)) other.set(l.b + ':' + l.n, u.name); }));
  const chips = [...d.keys].map(k => { const i = k.lastIndexOf(':'); return {k, bid:k.slice(0, i), n:Number(k.slice(i + 1))}; })
    .sort((a, b) => rvBookName(a.bid).localeCompare(rvBookName(b.bid), 'ar') || a.n - b.n)
    .map(c => `<span class="rv-chip">${rvEsc(rvLessonTitle(c.bid, c.n))}<button onclick="rvDraftToggle('${rvEsc(c.k)}',false)" aria-label="إزالة">×</button></span>`).join('');
  const rows = lessons.map(s => `<label class="rv-check"><input type="checkbox" ${d.keys.has(s.key) ? 'checked' : ''} onchange="rvDraftToggle('${rvEsc(s.key)}',this.checked)"> <span>الدرس ${arabicNumeral(s.n)} <small>(${pfDate(s.first)})${other.has(s.key) ? ` · في وحدة «${rvEsc(other.get(s.key))}»` : ''}</small></span></label>`).join('');
  return `<div class="book-stat rv-editor">
    <div class="sj-name">${d.id ? 'تعديل الوحدة' : 'وحدة جديدة'}</div>
    <div class="field"><label>اسم الوحدة (باب أو فصل)</label><input value="${rvEsc(d.name)}" oninput="RV.draft.name=this.value" placeholder="مثال: باب الطهارة"></div>
    <div class="rv-ptitle">دروس الوحدة (${arabicNumeral(d.keys.size)})</div>
    <div class="rv-chips">${chips || '<span class="hint">لم تختر دروسًا بعد.</span>'}</div>
    ${bookIds.length ? `<div class="field"><label>اختر من دروس الكتاب</label><select onchange="rvDraftBook(this.value)">${bookIds.map(b => `<option value="${rvEsc(b)}" ${rvSame(b, sel) ? 'selected' : ''}>${rvEsc(rvBookName(b))}</option>`).join('')}</select></div>
    <div class="rv-actions"><button class="ghost" onclick="rvDraftAll(true)">تحديد الكل</button><button class="ghost" onclick="rvDraftAll(false)">إلغاء الكل</button></div>
    <div class="rv-checks">${rows}</div>` : '<div class="empty">لا دروس مسجلة بعد. سجّل دروسك من السجل اليومي أولًا.</div>'}
    <div class="rv-actions" style="margin-top:12px"><button class="primary" onclick="rvSaveUnit()">${d.id ? 'حفظ التعديل' : 'إنشاء الوحدة'}</button><button class="ghost" onclick="rvDraftClose()">إلغاء</button></div>
  </div>`;
}
function rvUnitsHtml(items){
  const units = items.filter(i => i.kind === 'unit');
  let h = `<div class="timeline-head"><h2>الوحدات العلمية</h2><button class="primary" onclick="rvDraftOpen()">+ وحدة جديدة</button></div>
    <div class="hint" style="margin:-6px 0 12px">اجمع عدة دروس سبقت دراستها في باب أو فصل، لتتكرر مراجعتها كوحدة واحدة بجدول مستقل عن الدروس المفردة.</div>
    <div id="rvEditor">${rvEditorHtml()}</div>`;
  h += units.map(u => rvCardHtml(u, {extra:`<button class="ghost" onclick="rvDraftOpen('${u.unitId}')">تعديل الوحدة</button><button class="ghost" onclick="rvDeleteUnit('${u.unitId}')">حذف</button>`})).join('');
  if(!units.length && !RV.draft) h += '<div class="empty">لا وحدات بعد.</div>';
  return h;
}
function rvCalendarHtml(items){
  const today = rvToday(), cur = RV.cal || today.slice(0, 7), p = cur.split('-').map(Number);
  const first = new Date(p[0], p[1] - 1, 1).getDay(), dim = new Date(p[0], p[1], 0).getDate();
  const map = new Map(), get = ds => { if(!map.has(ds)) map.set(ds, {due:[], done:[]}); return map.get(ds); };
  items.forEach(i => { if(i.status === 'active' && i.due) get(i.due).due.push(i); });
  RV.logs.forEach(l => { if(l.result !== 'postponed') get(l.reviewed_on).done.push(l); });
  const labels = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
  const cells = [];
  for(let i = 0; i < first; i++) cells.push('<div></div>');
  for(let d = 1; d <= dim; d++){
    const ds = cur + '-' + String(d).padStart(2, '0'), v = map.get(ds) || {due:[], done:[]};
    const od = v.due.length && ds < today;
    cells.push(`<button class="rv-day${ds === today ? ' today' : ''}${od ? ' od' : ''}${v.due.length ? ' has' : ''}${RV.calDay === ds ? ' sel' : ''}" onclick="rvPickDay('${ds}')"><span>${arabicNumeral(d)}</span>${v.due.length ? `<i class="rv-pill due">${arabicNumeral(v.due.length)}</i>` : ''}${v.done.length ? `<i class="rv-pill done">${arabicNumeral(v.done.length)}</i>` : ''}</button>`);
  }
  const title = new Date(p[0], p[1] - 1, 1).toLocaleDateString('ar-u-ca-gregory', {month:'long', year:'numeric'});
  let h = `<div class="rv-calhead"><button class="ghost" onclick="rvCalMove(-1)">‹ السابق</button><h2>${title}</h2><button class="ghost" onclick="rvCalMove(1)">التالي ›</button></div>
    <div class="calendar-grid">${labels.map(l => `<div class="calendar-weekday" style="text-align:center">${l}</div>`).join('')}${cells.join('')}</div>
    <div class="hint" style="margin:8px 0 14px"><i class="rv-pill due">٠</i> مراجعات مستحقة · <i class="rv-pill done">٠</i> مراجعات أُنجزت · الإطار الأحمر: متأخرة</div>`;
  if(RV.calDay){
    const v = map.get(RV.calDay) || {due:[], done:[]};
    h += `<div class="timeline-head"><h2>${weekdayName(rvDate(RV.calDay))} ${pfDate(RV.calDay)}</h2></div>`;
    h += v.due.map(i => rvCardHtml(i, {compact:true})).join('');
    h += v.done.map(l => { const it = items.find(i => i.id === l.item_id); return `<div class="rv-line rv-logline"><span>${rvEsc(it ? it.title : 'عنصر محذوف')}</span><span class="rv-res rv-res-${l.result}">${RV_RES[l.result]}</span></div>`; }).join('');
    if(!v.due.length && !v.done.length) h += '<div class="empty">لا مراجعات في هذا اليوم.</div>';
  }
  return h;
}
function rvStatsHtml(items){
  const today = rvToday();
  const logs = RV.logs.filter(l => l.result !== 'postponed'), total = logs.length;
  const by = {strong:0, medium:0, weak:0};
  logs.forEach(l => { if(by[l.result] !== undefined) by[l.result]++; });
  const pct = n => total ? Math.round(n * 100 / total) : 0;
  const onTime = logs.filter(l => l.due_on && l.reviewed_on <= l.due_on).length;
  const week = logs.filter(l => l.reviewed_on >= rvAdd(today, -6)).length;
  const days = new Set(logs.map(l => l.reviewed_on));
  let streak = 0, sd = days.has(today) ? today : rvAdd(today, -1);
  while(days.has(sd)){ streak++; sd = rvAdd(sd, -1); }
  const cnt = {active:0, paused:0, done:0};
  items.forEach(i => cnt[i.status]++);
  const stat = (n, l) => `<div class="stat"><span class="num">${n}</span><span class="lbl">${l}</span></div>`;
  const series = []; for(let i = 13; i >= 0; i--){ const ds = rvAdd(today, -i); series.push({ds, n:logs.filter(l => l.reviewed_on === ds).length}); }
  const mx = Math.max(1, ...series.map(s => s.n));
  const bars = series.map(s => `<div class="rv-bar" title="${pfDate(s.ds)}: ${s.n}"><b style="height:${Math.round(s.n * 100 / mx)}%"></b><span>${arabicNumeral(Number(s.ds.slice(8)))}</span></div>`).join('');
  const dist = ['strong', 'medium', 'weak'].map(r => `<div class="rv-dist"><span>${RV_RES[r]}</span><div class="sj-progress-bar"><div class="sj-progress-fill rv-fill-${r}" style="width:${pct(by[r])}%"></div></div><span>${arabicNumeral(pct(by[r]))}٪</span></div>`).join('');
  const recent = RV.logs.slice(0, 30).map(l => { const it = items.find(i => i.id === l.item_id); return `<div class="rv-line rv-logline"><span>${pfDate(l.reviewed_on)} — ${rvEsc(it ? it.title : 'عنصر محذوف')}</span><span class="rv-res rv-res-${l.result}">${RV_RES[l.result]}</span></div>`; }).join('');
  return `<div class="stats-row" style="margin-bottom:18px">${stat(arabicNumeral(total), 'مراجعة منجزة')}${stat(arabicNumeral(week), 'آخر ٧ أيام')}${stat(arabicNumeral(pct(by.strong)) + '٪', 'نسبة الإتقان')}${stat(arabicNumeral(total ? Math.round(onTime * 100 / total) : 0) + '٪', 'في الموعد')}${stat(arabicNumeral(streak), 'أيام متتالية')}${stat(arabicNumeral(cnt.active) + ' / ' + arabicNumeral(cnt.paused + cnt.done), 'نشطة / متوقفة ومنتهية')}</div>
    <div class="timeline-head"><h2>توزيع التقييمات</h2></div>${total ? dist : '<div class="empty">لا مراجعات مسجلة بعد.</div>'}
    <div class="timeline-head" style="margin-top:22px"><h2>آخر ١٤ يومًا</h2></div><div class="rv-bars">${bars}</div>
    <div class="timeline-head" style="margin-top:22px"><h2>سجل المراجعات</h2></div>${recent || '<div class="empty">السجل فارغ.</div>'}`;
}

function rvMissingHtml(){
  return `<div class="timeline-head"><h2>المراجعة والتكرار</h2></div>
    <div class="book-stat"><div class="sj-name">خطوة واحدة قبل البدء</div>
    <div class="cb-sub" style="line-height:1.9">تحتاج هذه الصفحة إلى ثلاثة جداول في قاعدة بياناتك. انسخ الكود ثم الصقه في Supabase ← SQL Editor وشغّله مرة واحدة، ثم ارجع واضغط «تحققت».</div>
    <pre class="rv-sql" id="rvSqlBox">${rvEsc(RV_SQL)}</pre>
    <div class="rv-actions"><button class="primary" onclick="rvCopySql()">نسخ الكود</button><button class="ghost" onclick="openReview()">تحققت، أعد المحاولة</button></div></div>`;
}

function rvRender(){
  const el = document.getElementById('reviewView'); if(!el) return;
  if(RV.missing){ el.innerHTML = rvMissingHtml(); return; }
  if(RV.err && !RV.loaded){ el.innerHTML = `<div class="timeline-head"><h2>المراجعة والتكرار</h2></div><div class="empty">تعذّر التحميل: ${rvEsc(RV.err)}<br><br><button class="ghost" onclick="openReview()">أعد المحاولة</button></div>`; return; }
  const items = rvItems(), today = rvToday();
  const dueN = items.filter(i => ['overdue', 'today'].includes(rvState(i, today))).length;
  const tabs = [['today', 'اليوم' + (dueN ? ` (${arabicNumeral(dueN)})` : '')], ['upcoming', 'القادمة'], ['units', 'الوحدات'], ['cal', 'التقويم'], ['stats', 'الإحصائيات']];
  const body = RV.tab === 'upcoming' ? rvUpcomingHtml(items) : RV.tab === 'units' ? rvUnitsHtml(items) : RV.tab === 'cal' ? rvCalendarHtml(items) : RV.tab === 'stats' ? rvStatsHtml(items) : rvTodayHtml(items);
  el.innerHTML = `<div class="timeline-head"><h2>المراجعة والتكرار</h2></div>
    <div class="tag-choices rv-subnav">${tabs.map(([k, l]) => `<button class="${RV.tab === k ? 'active' : ''}" onclick="rvSetTab('${k}')">${l}</button>`).join('')}</div>
    ${body}`;
  if(document.getElementById('rvAddBook')) rvAddFill();
}

async function openReview(){
  const el = document.getElementById('reviewView'); if(!el) return;
  if(!RV.loaded) el.innerHTML = '<div class="empty">جاري التحميل...</div>';
  try{
    await Promise.all([refreshBooksCache(), loadEntries()]);
    RV.missing = false; RV.err = '';
    const [units, items, logs] = await Promise.all([
      fetchAllRows('review_units', q => q.order('created_at')),
      fetchAllRows('review_items'),
      fetchAllRows('review_logs', q => q.order('created_at', {ascending:false}))
    ]);
    RV.units = units; RV.items = items; RV.logs = logs; RV.loaded = true;
    await rvEnsureUnitItems();
  }catch(e){
    const msg = ((e && e.message) || '') + ' ' + ((e && e.code) || '');
    if(/review_|42P01|schema cache|does not exist/i.test(msg)) RV.missing = true; else RV.err = msg;
  }
  rvRender();
}
