/* 07-goal-vacation.js — جلب الصفوف، الهدف اليومي، أيام الإجازة */

/* ============ جلب كل الصفوف (Supabase يقطع النتائج عند 1000) ============ */

async function fetchAllRows(table, build){
  const out = [];
  const size = 1000;
  for(let from = 0; ; from += size){
    let q = sb.from(table).select('*');
    if(build) q = build(q);
    const {data, error} = await q.range(from, from + size - 1);
    if(error) throw error;
    out.push(...(data || []));
    if(!data || data.length < size) break;
  }
  return out;
}

/* ============ الهدف اليومي (بالدروس) ============ */

function getDailyGoal(){
  return parseInt(localStorage.getItem('rihla_daily_goal') || '0') || 0;
}

function setDailyGoal(){
  const cur = getDailyGoal();
  const input = prompt('كم درسًا تريد إنجازه يوميًا؟ (اكتب 0 لإلغاء الهدف)', String(cur || 1));
  if(input === null) return;
  const n = Math.max(0, Math.min(50, parseInt(normalizeDigits(input)) || 0));
  localStorage.setItem('rihla_daily_goal', String(n));
  renderDailyGoal();
}

function entriesByDate(entries){
  const map = new Map();
  (entries || []).forEach(e => {
    if(!map.has(e.entry_date)) map.set(e.entry_date, []);
    map.get(e.entry_date).push(e);
  });
  return map;
}

function lessonsOnDate(byDate, dateStr){
  return lessonKeys(byDate.get(dateStr) || []).size;
}

function renderDailyGoal(entries){
  const el = document.getElementById('dailyGoal');
  if(!el) return;
  const goal = getDailyGoal();
  if(!goal){
    el.innerHTML = `<div class="goal-card"><div class="goal-row"><span>🎯 هدف اليوم</span><button class="ghost" onclick="setDailyGoal()">حدّد هدفك اليومي بالدروس</button></div></div>`;
    return;
  }
  const today = lessonsOnDate(entriesByDate(entries || entriesCache), toDateStr(new Date()));
  const pct = Math.min(100, Math.round(today / goal * 100));
  const done = today >= goal;
  el.innerHTML = `
    <div class="goal-card ${done ? 'goal-done' : ''}">
      <div class="goal-row">
        <span>🎯 هدف اليوم: <b>${today}</b> / ${goal} ${goal === 1 ? 'درس' : 'دروس'}</span>
        <button class="ghost" onclick="setDailyGoal()">تغيير</button>
      </div>
      <div class="sj-progress-bar" style="margin:8px 0 0"><div class="sj-progress-fill" style="width:${pct}%"></div></div>
      ${done ? '<div class="hint" style="color:var(--green)">أنجزت هدف اليوم، بارك الله فيك ✓</div>' : '<div class="hint">يُحسب كل درس مرة واحدة في اليوم. جلسات «مراجعة» لا تُحسب.</div>'}
    </div>`;
}

/* ============ أيام الإجازة: لا تكسر سلسلة المداومة ============ */

const VAC_KEY = 'rihla_vacations';
let vacOpen = false;

function getVacations(){
  try{ return new Set(JSON.parse(localStorage.getItem(VAC_KEY) || '[]')); }catch(e){ return new Set(); }
}
function saveVacations(set){
  try{ localStorage.setItem(VAC_KEY, JSON.stringify([...set].sort())); }catch(e){}
}
function vacNext(ds){
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + 1); return toDateStr(d);
}
function vacRanges(set){
  const out = [];
  [...set].sort().forEach(ds => {
    const last = out[out.length - 1];
    if(last && vacNext(last.to) === ds) last.to = ds; else out.push({from:ds, to:ds});
  });
  return out;
}
function vacRefresh(){
  renderStats(entriesCache);
  if(typeof renderProfileView === 'function') renderProfileView();
}
function toggleVacationToday(){
  const s = getVacations(), t = toDateStr(new Date());
  if(s.has(t)) s.delete(t); else s.add(t);
  saveVacations(s);
  vacRefresh();
}
function addVacationRange(){
  const f = document.getElementById('vacFrom')?.value;
  const t = document.getElementById('vacTo')?.value || f;
  if(!f){ showToast('اختر تاريخ البداية', 'warn'); return; }
  if(t < f){ showToast('تاريخ النهاية قبل البداية', 'warn'); return; }
  const s = getVacations();
  let d = f, n = 0;
  while(d <= t && n < 90){ s.add(d); d = vacNext(d); n++; }
  if(d <= t) showToast('الحد الأقصى ٩٠ يومًا في الإضافة الواحدة', 'warn');
  saveVacations(s);
  vacOpen = false;
  vacRefresh();
  showToast('تمت إضافة الإجازة ✓');
}
function removeVacationRange(from, to){
  const s = getVacations();
  let d = from;
  while(d <= to){ s.delete(d); d = vacNext(d); }
  saveVacations(s);
  vacRefresh();
}
function renderVacationBar(){
  const el = document.getElementById('vacationBar');
  if(!el) return;
  const set = getVacations();
  const today = toDateStr(new Date());
  const isVac = set.has(today);
  const cut = new Date(); cut.setDate(cut.getDate() - 30);
  const ranges = vacRanges(set).filter(r => r.to >= toDateStr(cut));
  const fmt = ds => new Date(ds + 'T00:00:00').toLocaleDateString('ar-u-nu-latn-ca-gregory', {day:'numeric', month:'short'});
  el.innerHTML = `
    <div class="vac-bar">
      <button class="vac-pill${isVac ? ' on' : ''}" onclick="toggleVacationToday()" title="يوم الإجازة لا يكسر سلسلة المداومة ولا يُحتسب فيها">${ic('umbrella', 14)} ${isVac ? 'اليوم إجازة ✓' : 'اليوم إجازة'}</button>
      <button class="vac-link" onclick="vacOpen=!vacOpen;renderVacationBar()">${vacOpen ? 'إغلاق' : 'جدولة أيام'}</button>
      ${ranges.map(r => `<span class="vac-chip" title="اضغط لإلغاء هذه الإجازة" onclick="removeVacationRange('${r.from}','${r.to}')">${fmt(r.from)}${r.to !== r.from ? ' ← ' + fmt(r.to) : ''} ✕</span>`).join('')}
    </div>
    ${vacOpen ? `<div class="vac-panel"><div class="row2"><div class="field"><label>من</label><input type="date" id="vacFrom" value="${today}"></div><div class="field"><label>إلى</label><input type="date" id="vacTo" value="${today}"></div></div><button class="primary" onclick="addVacationRange()">إضافة الإجازة</button><div class="hint">يوم الإجازة لا يكسر سلسلة المداومة، ولا يُحتسب يومًا فيها.</div></div>` : ''}`;
}
