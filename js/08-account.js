/* 08-account.js — الحساب: الملف الشخصي، التقويم، الإنجازات، الأوسمة، ملخص السنة والخط الزمني */

/* ============ الإحصائيات ============ */

/* ============ الحساب، التقويم، والإنجازات ============ */

let profileCache = null;
let accountCreatedAt = null;

function initials(name){
  return (name || 'ط').trim().split(/\s+/).slice(0,2).map(x => x[0]).join('') || 'ط';
}

function focusHoursLabel(minutes){
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} س${m ? ' ' + m + ' د' : ''}` : `${m} د`;
}

function renderCalendar(entries){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstWeekday = new Date(y, m, 1).getDay();
  const studied = new Set((entries || []).filter(e => e.entry_date && e.entry_date.slice(0,7) === `${y}-${String(m+1).padStart(2,'0')}`).map(e => Number(e.entry_date.slice(8,10))));
  const labels = ['أحد','اثن','ثلا','أرب','خمي','جمع','سبت'];
  const cells = [];
  for(let i=0; i<firstWeekday; i++) cells.push('<div class="calendar-day empty-day"></div>');
  for(let day=1; day<=daysInMonth; day++){
    const active = studied.has(day);
    const today = day === now.getDate();
    cells.push(`<div class="calendar-day${active ? ' studied' : ''}${today ? ' today' : ''}" title="${active ? 'تمت الدراسة في هذا اليوم' : ''}">${arabicNumeral(day)}</div>`);
  }
  return `<div class="calendar-card"><div class="timeline-head"><h2>تقويم الدراسة — ${now.toLocaleDateString('ar-SA',{month:'long',year:'numeric'})}</h2></div><div class="calendar-grid">${labels.map(x=>`<div class="calendar-weekday">${x}</div>`).join('')}${cells.join('')}</div><div class="hint" style="margin-top:10px">الأخضر: يوم سجّلت فيه دراسة أو جلسة تركيز.</div></div>`;
}

function renderAchievements(entries, books){
  const focusMinutes = (entries || []).filter(e => e.type === 'tarkiz').reduce((s,e) => s + (Number(e.focus_minutes) || 0), 0);
  const sessions = (entries || []).filter(e => e.type === 'tarkiz').length;
  const completed = (books || []).filter(b => b.status === 'complete').length;
  const streak = computeStreak((entries || []).map(e => e.entry_date));
  const items = [
    {ok:sessions >= 1, icon:'⏱', title:'البداية المباركة', text:'سجّلت أول جلسة تركيز'},
    {ok:focusMinutes >= 600, icon:'⌛', title:'عشر ساعات تركيز', text:`أنجزت ${focusHoursLabel(focusMinutes)} من التركيز`},
    {ok:completed >= 1, icon:'📚', title:'ختم كتاب', text:'أكملت كتابًا واحدًا على الأقل'},
    {ok:streak >= 7, icon:'🔥', title:'أسبوع متصل', text:`أطول سلسلة حالية: ${streak} أيام`}
  ];
  items.push(
    {ok:focusMinutes >= 60, icon:'🌱', title:'ساعة صفاء', text:'أكملت ساعة تركيز'},
    {ok:sessions >= 10, icon:'🎯', title:'عشر جلسات', text:`سجّلت ${sessions} جلسة`},
    {ok:books.length >= 3, icon:'🧭', title:'ثلاثة كتب', text:`درست ${books.length} كتب`},
    {ok:focusMinutes >= 3000, icon:'🏆', title:'خمسون ساعة', text:`أنجزت ${focusHoursLabel(focusMinutes)}`}
  );
  return `<div class="achievement-card" id="achievementsCard"><button class="collapsible-title" onclick="toggleCollapse('achievementsCard')">سجل الإنجازات <span>⌄</span></button><div class="collapsible-body"><div class="achievements-grid">${items.map(x=>`<div class="achievement${x.ok?' unlocked':''}"><b>${x.icon} ${x.title}</b><small>${x.ok ? 'تم الإنجاز ✓ — ' : 'قيد الإنجاز — '}${x.text}</small></div>`).join('')}</div></div></div>`;
}

function toggleCollapse(id){ document.getElementById(id)?.classList.toggle('collapsed'); }

function studiedBooks(entries){
  const ids = new Set((entries || []).filter(e => e.book_id).map(e => e.book_id));
  return booksCache.filter(b => ids.has(b.id));
}

async function openProfile(){
  // كل مرة تفتح فيها الحساب تبدأ الأقسام كلها مطويّة
  pfState.edit = pfState.badges = pfState.stats = pfState.year = pfState.journey = pfState.locked = false;
  await Promise.all([refreshBooksCache(), loadEntries()]);
  const {data:{session}} = await sb.auth.getSession();
  accountCreatedAt = session?.user?.created_at || null;
  const {data, error} = await sb.from('profiles').select('display_name, handle, avatar_url, created_at, handle_changed_at').maybeSingle();
  if(!error) profileCache = data;
  if(!profileCache && session?.user?.user_metadata?.pending_handle){
    const res = await sb.from('profiles').insert({user_id:session.user.id, display_name:'', handle:session.user.user_metadata.pending_handle}).select().single();
    if(!res.error) profileCache = res.data;
  }
  renderProfileView();
}

async function saveProfile(){
  const display_name = document.getElementById('profileName').value.trim();
  const handle = document.getElementById('profileHandle').value.trim().toLowerCase().replace(/^@/, '');
  const avatar_url = document.getElementById('profileAvatar').value.trim();
  if(!display_name){ alert('اكتب اسمك أولًا'); return; }
  if(!/^[a-z0-9_]{3,24}$/.test(handle)){ alert('المعرّف من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا أو شرطة سفلية فقط.'); return; }
  if(profileCache?.handle && handle !== profileCache.handle && profileCache.handle_changed_at && Date.now() - new Date(profileCache.handle_changed_at).getTime() < 30 * 86400000){
    alert('يمكن تغيير المعرّف مرة كل 30 يومًا فقط.'); return;
  }
  if(avatar_url && !/^https:\/\//i.test(avatar_url)){ alert('ضع رابط صورة يبدأ بـ https:// أو اتركه فارغًا.'); return; }
  const {data:{session}} = await sb.auth.getSession();
  const {data, error} = await sb.from('profiles').upsert({user_id:session.user.id, display_name, handle, avatar_url:avatar_url || null}, {onConflict:'user_id'}).select().single();
  if(error){ showToast(error.code === '23505' ? 'هذا المعرّف مستخدم؛ اختر معرفًا آخر.' : 'تعذّر حفظ الحساب: ' + error.message, 'warn'); return; }
  profileCache = data;
  showToast('تم حفظ الحساب ✓');
  renderProfileView();
}

async function uploadAvatar(input){
  const file = input.files?.[0];
  if(!file) return;
  if(!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024){ alert('اختر صورة بحجم لا يتجاوز 2 ميغابايت.'); return; }
  const {data:{session}} = await sb.auth.getSession();
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi,'');
  const path = `${session.user.id}/avatar.${ext}`;
  const {error} = await sb.storage.from('profile-avatars').upload(path, file, {upsert:true, contentType:file.type});
  if(error){ showToast('تعذّر رفع الصورة: ' + error.message, 'warn'); return; }
  const {data} = sb.storage.from('profile-avatars').getPublicUrl(path);
  document.getElementById('profileAvatar').value = data.publicUrl;
  showToast('تم رفع الصورة؛ اضغط حفظ الحساب لتثبيتها.');
}

/* ============ صفحة الحساب: أوسمة وإحصائيات قابلة للطي ============ */

const pfState = {edit:false, badges:false, stats:false, year:false, journey:false, jdesc:false, locked:false, years:{}};

function pfToggle(key){
  pfState[key] = !pfState[key];
  document.getElementById('pf-' + key)?.classList.toggle('open', pfState[key]);
}
function pfToggleYear(y){
  pfState.years[y] = pfState.years[y] === false;   // الافتراضي مفتوح
  document.getElementById('pf-year-' + y)?.classList.toggle('open', pfState.years[y] !== false);
}

function pfDate(ds){
  return new Date(ds + 'T00:00:00').toLocaleDateString('ar-u-nu-latn-ca-gregory', {day:'numeric', month:'long', year:'numeric'});
}

// أطول سلسلة أيام متتالية + أول تاريخ بلغت فيه السلسلة كل طول
function pfLongestStreak(dates){
  const days = [...new Set((dates || []).filter(Boolean))].sort();
  const vac = getVacations();
  const DAY = 86400000;
  const bridged = (a, b) => {
    for(let x = a + DAY; x < b; x += DAY){
      if(!vac.has(new Date(x).toISOString().slice(0,10))) return false;
    }
    return true;
  };
  let best = 0, run = 0, prev = null;
  const reached = {};
  days.forEach(ds => {
    const t = Date.UTC(+ds.slice(0,4), +ds.slice(5,7) - 1, +ds.slice(8,10));
    run = (prev !== null && bridged(prev, t)) ? run + 1 : 1;
    prev = t;
    if(run > best) best = run;
    if(reached[run] === undefined) reached[run] = ds;
  });
  return {best, reached};
}

// أول تاريخ بلغ فيه المجموع التراكمي كل عتبة
function pfCumulative(items, thresholds){
  const out = {};
  let sum = 0;
  items.forEach(it => {
    sum += it.n;
    thresholds.forEach(t => { if(out[t] === undefined && sum >= t) out[t] = it.date; });
  });
  return out;
}

// تواريخ أول ظهور لكل درس/صفحة مختلفة (دون المراجعات)
function pfUnitItems(entries, books, wantPages){
  const isPagesById = new Map(books.map(b => [b.id, lessonUnit(b) === 'صفحة']));
  const seen = new Set();
  const out = [];
  entries
    .filter(e => e.book_id && e.lesson_number && !isReviewEntry(e) && isPagesById.get(e.book_id) === wantPages)
    .sort((a,b) => (a.entry_date || '').localeCompare(b.entry_date || ''))
    .forEach(e => {
      const k = e.book_id + ':' + e.lesson_number;
      if(seen.has(k)) return;
      seen.add(k);
      out.push({date:e.entry_date, n:1});
    });
  return out;
}

function pfComputeStats(entries, books){
  const tark = entries.filter(e => e.type === 'tarkiz');
  const focusMinutes = tark.reduce((s,e) => s + Math.max(0, Number(e.focus_minutes) || 0), 0);
  const dates = entries.map(e => e.entry_date);
  const {best, reached} = pfLongestStreak(dates);
  return {
    focusMinutes,
    sessions: tark.length,
    bestStreak: best,
    streakReached: reached,
    currentStreak: computeStreak(dates),
    booksRead: books.filter(b => b.status === 'complete').length,
    booksTotal: books.length,
    lessons: books.reduce((s,b) => s + (Number(b.completed_lessons) || 0), 0),
    pages: books.reduce((s,b) => s + (Number(b.completed_pages) || 0), 0)
  };
}

function pfBuildBadges(entries, books, st){
  const latest = entries.reduce((m,e) => (e.entry_date && e.entry_date > m) ? e.entry_date : m, '') || toDateStr(new Date());
  const tark = entries.filter(e => e.type === 'tarkiz')
    .sort((a,b) => (a.entry_date || '').localeCompare(b.entry_date || ''));
  const defs = [];
  const add = (kind, list, current, dateMap, fmtProgress) => {
    list.forEach(([t, title, content]) => {
      const earned = current >= t;
      defs.push({
        kind, title, content, earned,
        flame: kind === 'streak',
        date: earned ? (dateMap[t] || latest) : null,
        progress: fmtProgress(current, t)
      });
    });
  };

  add('streak',
    [[1,'وسام البداية',1],[5,'وسام الثبات',5],[10,'وسام الهمّة',10],[15,'وسام العزم',15],[30,'وسام الاستقامة',30],[60,'وسام الرسوخ',60],[100,'وسام الجبل',100]],
    st.bestStreak, st.streakReached,
    (c,t) => `${Math.min(c,t)}/${t} يوم`);

  add('focus',
    [[60,'ساعة صفاء',ic('clock',26)],[600,'عشر ساعات تركيز',ic('clock',26)],[3000,'خمسون ساعة',ic('trophy',26)],[6000,'مئة ساعة',ic('star',26)]],
    st.focusMinutes,
    pfCumulative(tark.map(e => ({date:e.entry_date, n:Math.max(0, Number(e.focus_minutes) || 0)})), [60,600,3000,6000]),
    (c,t) => `${Math.floor(Math.min(c,t)/60)}/${t/60} ساعة`);

  add('sessions',
    [[1,'أولى الجلسات',ic('target',26)],[10,'عشر جلسات',ic('target',26)],[50,'خمسون جلسة',ic('target',26)]],
    st.sessions,
    pfCumulative(tark.map(e => ({date:e.entry_date, n:1})), [1,10,50]),
    (c,t) => `${Math.min(c,t)}/${t} جلسة`);

  add('lessons',
    [[10,'عشرة دروس',ic('pencil',26)],[50,'خمسون درسًا',ic('pencil',26)],[100,'مئة درس',ic('pencil',26)],[250,'مئتان وخمسون درسًا',ic('pencil',26)]],
    st.lessons,
    pfCumulative(pfUnitItems(entries, books, false), [10,50,100,250]),
    (c,t) => `${Math.min(c,t)}/${t} درس`);

  add('pages',
    [[100,'مئة صفحة',ic('file',26)],[500,'خمسمئة صفحة',ic('file',26)],[1000,'ألف صفحة',ic('file',26)],[5000,'خمسة آلاف صفحة',ic('file',26)]],
    st.pages,
    pfCumulative(pfUnitItems(entries, books, true), [100,500,1000,5000]),
    (c,t) => `${Math.min(c,t)}/${t} صفحة`);

  // تاريخ ختم الكتاب: آخر قيد مرتبط به
  const lastEntry = new Map();
  entries.forEach(e => {
    if(e.book_id && e.entry_date && (!lastEntry.has(e.book_id) || e.entry_date > lastEntry.get(e.book_id))) lastEntry.set(e.book_id, e.entry_date);
  });
  const doneItems = books.filter(b => b.status === 'complete')
    .map(b => ({date:bookEnd(b) || lastEntry.get(b.id) || latest, n:1}))
    .sort((a,b) => a.date.localeCompare(b.date));
  add('books',
    [[1,'ختمة أولى',ic('book',26)],[3,'ثلاثة كتب',ic('book',26)],[5,'خمسة كتب',ic('book',26)],[10,'عشرة كتب',ic('book',26)]],
    st.booksRead,
    pfCumulative(doneItems, [1,3,5,10]),
    (c,t) => `${Math.min(c,t)}/${t} كتب`);

  return defs;
}

function pfBadgeHtml(b){
  return `<div class="pf-badge ${b.earned ? 'earned' : 'locked'}">
    <div class="pf-medal-wrap">${b.flame ? `<span class="pf-flame">${ic('flame', 16)}</span>` : ''}<div class="pf-medal"><b>${b.content}</b></div></div>
    <div class="pf-badge-name">${b.title}</div>
    <div class="pf-badge-date">${b.earned ? pfDate(b.date) : b.progress}</div>
  </div>`;
}

function pfStatRow(icon, label, valueHtml, sub){
  return `<div class="pf-stat"><div class="pf-stat-ic">${icon}</div><div class="pf-stat-tx"><div class="pf-stat-lbl">${label}</div>${sub ? `<div class="pf-stat-sub">${sub}</div>` : ''}</div><div class="pf-stat-val">${valueHtml}</div></div>`;
}

/* ============ ملخص السنة + الخط الزمني للرحلة (في الحساب) ============ */

const PF_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const PF_MONTHS_SHORT = ['ينا','فبر','مار','أبر','ماي','يون','يول','أغس','سبت','أكت','نوف','ديس'];
let pfYear = null;
function pfSetYear(y){ pfYear = y; renderProfileView(); }
function pfSetJourneyOrder(desc){ pfState.jdesc = !!desc; renderProfileView(); }

function pfYearSection(entries, books){
  const years = [...new Set(entries.map(e => (e.entry_date || '').slice(0,4)).filter(Boolean))].sort().reverse();
  let body;
  if(!years.length){
    body = '<div class="pf-empty">لا توجد قيود بعد لعرض ملخص السنة.</div>';
  } else {
    const cy = String(new Date().getFullYear());
    const Y = years.includes(pfYear) ? pfYear : (years.includes(cy) ? cy : years[0]);
    body = pfYearBody(entries, books, Y, years);
  }
  return `<div class="pf-sec${pfState.year ? ' open' : ''}" id="pf-year">
    <button class="pf-sec-head" onclick="pfToggle('year')"><span>ملخص السنة</span><span class="pf-chev">⌄</span></button>
    <div class="pf-body">${body}</div></div>`;
}

function pfYearBody(entries, books, Y, years){
  const ye = entries.filter(e => (e.entry_date || '').startsWith(Y));
  const tark = ye.filter(e => e.type === 'tarkiz');
  const fm = e => Math.max(0, Number(e.focus_minutes) || 0);
  const mins = tark.reduce((s,e) => s + fm(e), 0);
  const activeDays = new Set(ye.map(e => e.entry_date)).size;
  const bestStreak = pfLongestStreak(ye.map(e => e.entry_date)).best;

  // ما تقدّمتَ به هذه السنة: أعلى درس/صفحة بلغتها هذه السنة مطروحًا منه ما قبلها
  const isPages = new Map(books.map(b => [b.id, lessonUnit(b) === 'صفحة']));
  const mx = new Map();
  entries.forEach(e => {
    if(!e.book_id || !e.lesson_number || isReviewEntry(e) || !e.entry_date) return;
    const m = mx.get(e.book_id) || {before:0, inYear:0};
    if(e.entry_date < Y + '-01-01') m.before = Math.max(m.before, e.lesson_number);
    else if(e.entry_date.startsWith(Y)) m.inYear = Math.max(m.inYear, e.lesson_number);
    mx.set(e.book_id, m);
  });
  let lessons = 0, pages = 0;
  mx.forEach((m, id) => {
    if(!m.inYear) return;
    const g = Math.max(0, m.inYear - m.before);
    if(isPages.get(id)) pages += g; else lessons += g;
  });

  const act = bookActivity();
  const started = books.filter(b => bookStart(b).startsWith(Y)).length;
  const finished = books.filter(b => bookEnd(b).startsWith(Y)).length;

  const months = Array(12).fill(0);
  tark.forEach(e => { months[+e.entry_date.slice(5,7) - 1] += fm(e); });
  const bookById = new Map(books.map(b => [b.id, b]));
  const subj = new Map(), bk = new Map();
  tark.forEach(e => {
    const b = bookById.get(e.book_id || findBookIdFromTags(e.tags));
    if(!b) return;
    const sn = (b.subjects && b.subjects.name) || 'أخرى';
    subj.set(sn, (subj.get(sn) || 0) + fm(e));
    bk.set(b.name, (bk.get(b.name) || 0) + fm(e));
  });
  const top = (map, n) => [...map.entries()].sort((a,b) => b[1] - a[1]).slice(0, n);
  const topS = top(subj, 4), topB = top(bk, 3);
  const maxS = topS.length ? topS[0][1] : 1;
  const bestM = months.indexOf(Math.max(...months));
  const cell = (v, l) => `<div class="yr-cell"><b>${v}</b><span>${l}</span></div>`;
  const hoursVals = months.map(m => Math.round(m / 60 * 10) / 10);

  return `
    <div class="yr-years">${years.map(y => `<button class="${y === Y ? 'active' : ''}" onclick="pfSetYear('${y}')">${y}</button>`).join('')}</div>
    <div class="yr-grid">
      ${cell(focusHoursLabel(mins), 'وقت التركيز')}
      ${cell(tark.length, 'جلسة تركيز')}
      ${cell(activeDays, 'يوم دراسة')}
      ${cell(bestStreak, 'أطول مداومة (يوم)')}
      ${cell(lessons, 'درسًا تقدّمتَ فيها')}
      ${cell(pages, 'صفحة تقدّمتَ فيها')}
      ${cell(started, 'كتب بدأتَها')}
      ${cell(finished, 'كتب أتممتَها')}
    </div>
    <div class="yr-h">التركيز شهريًا (بالساعات)</div>
    ${svgBarChart({values: hoursVals, labels: PF_MONTHS_SHORT, tips: hoursVals.map((v, i) => `${PF_MONTHS[i]} ${Y}: ${focusHoursLabel(months[i])}`), goal: 0, todayIdx: (String(new Date().getFullYear()) === Y ? new Date().getMonth() : -1)})}
    ${mins ? `<div class="yr-note">أنشط شهر لك: <b>${PF_MONTHS[bestM]}</b> بـ ${focusHoursLabel(months[bestM])}.</div>` : ''}
    ${topS.length ? `<div class="yr-h">أكثر العلوم دراسةً</div><div class="yr-bars">${topS.map(([n, m]) => `<div class="yr-bar-row"><div class="t"><span>${escapeHtml(n)}</span><small>${focusHoursLabel(m)}</small></div><div class="yr-bar"><i style="width:${Math.round(m / maxS * 100)}%"></i></div></div>`).join('')}</div>` : ''}
    ${topB.length ? `<div class="yr-h">أكثر الكتب وقتًا</div><div class="yr-bars">${topB.map(([n, m]) => `<div class="yr-bar-row"><div class="t"><span>${escapeHtml(n)}</span><small>${focusHoursLabel(m)}</small></div></div>`).join('')}</div>` : ''}`;
}

function pfJourneySection(entries, books, badges){
  const all = entries.map(e => e.entry_date).filter(Boolean).sort();
  let body;
  if(!all.length){
    body = '<div class="pf-empty">ستظهر رحلتك هنا بعد أول قيد تسجله.</div>';
  } else {
    const today = toDateStr(new Date());
    const evs = [];
    evs.push({d:all[0], icon:'flag', t:'بداية الرحلة', s:'أول قيد سجّلته', strong:true});
    const act = bookActivity();
    books.forEach(b => {
      const st = bookStart(b), en = bookEnd(b);
      if(!st) return;
      const sn = (b.subjects && b.subjects.name) || '';
      evs.push({d:st, icon:'book', t:`بدأتَ دراسة «${escapeHtml(b.name)}»`, s:sn});
      if(en) evs.push({d:en, icon:'check', t:`أتممتَ «${escapeHtml(b.name)}»`, s:sn, strong:true});
    });
    badges.filter(x => x.earned && x.date).forEach(x => evs.push({d:x.date, icon:'trophy', t:`نلتَ ${x.title}`, s:'', strong:true}));
    const days = [...new Set(all)];
    for(let i = 1; i < days.length; i++){
      const gap = dayDiff(days[i - 1], days[i]) - 1;
      if(gap >= 14) evs.push({d:days[i], icon:'moon', t:`عدتَ بعد انقطاع ${daysWord(gap)}`, s:'', muted:true});
    }
    evs.sort((a, b) => a.d.localeCompare(b.d));
    if(pfState.jdesc) evs.reverse();
    const since = dayDiff(all[0], today) + 1;
    const month = d => new Date(d + 'T00:00:00').toLocaleDateString('ar-u-nu-latn-ca-gregory', {month:'long', year:'numeric'});
    let html = '', last = '';
    evs.forEach(e => {
      const m = month(e.d);
      if(m !== last){ html += `${last ? '</div>' : ''}<div class="jr-month">${m}</div><div class="jr-list">`; last = m; }
      html += `<div class="jr-ev${e.strong ? ' strong' : ''}${e.muted ? ' muted' : ''}"><span class="jr-dot">${ic(e.icon, 12)}</span><div class="jr-t">${e.t}</div><div class="jr-s">${pfDate(e.d)}${e.s ? ' · ' + escapeHtml(e.s) : ''}</div></div>`;
    });
    html += '</div>';
    const now = `<div class="jr-list jr-now" style="margin-top:6px"><div class="jr-ev"><span class="jr-dot">${ic('star', 12)}</span><div class="jr-t">اليوم</div><div class="jr-s">${pfDate(today)}</div></div></div>`;
    body = `
      <div class="jr-head">بدأتَ رحلتك في <b>${pfDate(all[0])}</b>، ومضى عليها <b>${daysWord(since)}</b>، ودرستَ في <b>${days.length}</b> منها.</div>
      <div class="jr-tools"><div class="tag-choices"><button class="${!pfState.jdesc ? 'active' : ''}" onclick="pfSetJourneyOrder(false)">من البداية</button><button class="${pfState.jdesc ? 'active' : ''}" onclick="pfSetJourneyOrder(true)">الأحدث أولًا</button></div></div>
      ${pfState.jdesc ? now : ''}${html}${pfState.jdesc ? '' : now}`;
  }
  return `<div class="pf-sec${pfState.journey ? ' open' : ''}" id="pf-journey">
    <button class="pf-sec-head" onclick="pfToggle('journey')"><span>الخط الزمني للرحلة</span><span class="pf-chev">⌄</span></button>
    <div class="pf-body">${body}</div></div>`;
}

function renderProfileView(){
  const el = document.getElementById('profileView');
  if(!el) return;
  const p = profileCache || {};
  const name = p.display_name || '';
  const handle = p.handle || '';
  const created = accountCreatedAt || p.created_at;
  const canChangeHandle = !p.handle_changed_at || (Date.now() - new Date(p.handle_changed_at).getTime()) >= 30 * 86400000;
  const nextHandleChange = p.handle_changed_at ? new Date(new Date(p.handle_changed_at).getTime() + 30 * 86400000).toLocaleDateString('ar-SA') : '';
  const avatar = p.avatar_url ? `<img class="avatar" src="${attrEscape(p.avatar_url)}" alt="صورة الحساب" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar',textContent:'${attrEscape(initials(name))}'}))">` : `<div class="avatar">${escapeHtml(initials(name))}</div>`;
  const header = document.getElementById('headerAvatar');
  if(header) header.innerHTML = p.avatar_url ? `<img src="${attrEscape(p.avatar_url)}" alt="الحساب" style="width:100%;height:100%;object-fit:cover">` : escapeHtml(initials(name));

  const entries = entriesCache || [];
  const books = booksCache || [];
  const st = pfComputeStats(entries, books);
  const badges = pfBuildBadges(entries, books, st);
  const earned = badges.filter(b => b.earned).sort((a,b) => b.date.localeCompare(a.date));
  const locked = badges.filter(b => !b.earned);

  const byYear = new Map();
  earned.forEach(b => {
    const y = b.date.slice(0,4);
    if(!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(b);
  });
  const yearsHtml = byYear.size ? [...byYear.entries()].map(([y, list]) => `
    <div class="pf-grp${pfState.years[y] === false ? '' : ' open'}" id="pf-year-${y}">
      <button class="pf-grp-head" onclick="pfToggleYear('${y}')"><span>${y}</span><span class="pf-chip">${list.length}</span><span class="pf-chev">⌄</span></button>
      <div class="pf-grp-body"><div class="pf-badges">${list.map(pfBadgeHtml).join('')}</div></div>
    </div>`).join('') : '<div class="pf-empty">لم تنل أي وسام بعد، سجّل أول جلسة تركيز لتبدأ.</div>';

  const lockedHtml = locked.length ? `
    <div class="pf-grp${pfState.locked ? ' open' : ''}" id="pf-locked">
      <button class="pf-grp-head" onclick="pfToggle('locked')"><span>لم تُنل بعد</span><span class="pf-chip">${locked.length}</span><span class="pf-chev">⌄</span></button>
      <div class="pf-grp-body"><div class="pf-badges">${locked.map(pfBadgeHtml).join('')}</div></div>
    </div>` : '';

  const statsHtml = [
    pfStatRow(ic('flame', 22), 'أفضل مداومة', `${st.bestStreak}<small>يوم</small>`, `المداومة الحالية: ${st.currentStreak} يوم`),
    pfStatRow(ic('book', 22), 'الكتب المقروءة', `${st.booksRead}`, st.booksTotal ? `من أصل ${st.booksTotal} كتاب في مكتبتك` : ''),
    pfStatRow(ic('pencil', 22), 'عدد الدروس', `${st.lessons}`, ''),
    pfStatRow(ic('file', 22), 'عدد الصفحات', `${st.pages}`, ''),
    pfStatRow(ic('clock', 22), 'إجمالي وقت التركيز', focusHoursLabel(st.focusMinutes), `${st.sessions} جلسة تركيز`)
  ].join('');

  const yearHtml = pfYearSection(entries, books);
  const journeyHtml = pfJourneySection(entries, books, badges);

  el.innerHTML = `
    <div class="pf-top">
      ${avatar}
      <div class="pf-id">
        <div class="pf-name">${name ? escapeHtml(name) : 'أكمل بيانات حسابك'}</div>
        <div class="pf-handle">${handle ? '@' + escapeHtml(handle) : 'اختر معرّفًا مميزًا'}</div>
      </div>
    </div>
    <div class="pf-since">${ic('calendar', 15)} <span>${created ? 'عضو منذ ' + pfDate(created.slice(0,10)) : ''}</span></div>
    <button class="pf-edit-btn" onclick="pfToggle('edit')">✎ تعديل</button>

    <div class="pf-edit-panel${pfState.edit ? ' open' : ''}" id="pf-edit">
      <div class="row2"><div class="field"><label>الاسم</label><input id="profileName" value="${attrEscape(name)}" placeholder="اسمك الظاهر"></div><div class="field"><label>المعرّف المميز</label><input id="profileHandle" value="${attrEscape(handle)}" placeholder="مثال: talib_ilm" ${canChangeHandle ? '' : 'disabled'}><div class="hint">${canChangeHandle ? 'يمكن تغيير المعرف مرة كل 30 يومًا.' : 'المعرّف ثابت حاليًا. التغيير التالي: ' + nextHandleChange}</div></div></div>
      <div class="field"><label>رابط الصورة (اختياري)</label><input id="profileAvatar" value="${attrEscape(p.avatar_url || '')}" placeholder="https://example.com/photo.jpg"></div>
      <div class="field"><label>أو ارفع صورة من الجهاز</label><input type="file" accept="image/*" onchange="uploadAvatar(this)"></div>
      <button class="primary" onclick="saveProfile()">حفظ الحساب</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="ghost" onclick="renderPasswordScreen('change')">تغيير كلمة السر</button><button class="ghost" onclick="signOut()">خروج</button></div>
    </div>

    <div class="pf-sec${pfState.badges ? ' open' : ''}" id="pf-badges">
      <button class="pf-sec-head" onclick="pfToggle('badges')"><span>الأوسمة</span><span class="pf-chip">${earned.length}</span><span class="pf-chev">⌄</span></button>
      <div class="pf-body">${yearsHtml}${lockedHtml}</div>
    </div>

    <div class="pf-sec${pfState.stats ? ' open' : ''}" id="pf-stats">
      <button class="pf-sec-head" onclick="pfToggle('stats')"><span>الإحصائيات</span><span class="pf-chev">⌄</span></button>
      <div class="pf-body"><div class="pf-stat-list">${statsHtml}</div></div>
    </div>
    ${yearHtml}
    ${journeyHtml}`;
}
