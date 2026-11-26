/* 02-helpers.js — مساعدات: الأيقونات، التواريخ، نشاط الكتب، وضع القراءة والتركيز البصري، الحفظ التلقائي للمسودة */

/* ============ مساعدات: أيقونات موحّدة، تواريخ، نشاط الكتب ============ */

const IC = {
  flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  pencil:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  circle:'<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  umbrella:'<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-1.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98 1.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  star:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  expand:'<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  grip:'<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
  close:'<path d="M18 6 6 18M6 6l12 12"/>'
};
function ic(name, size){
  const s = size || 18;
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ''}</svg>`;
}

function dayDiff(a, b){
  const t = s => Date.UTC(+s.slice(0,4), +s.slice(5,7) - 1, +s.slice(8,10));
  return Math.round((t(b) - t(a)) / 86400000);
}
function daysWord(n){
  if(n === 1) return 'يوم';
  if(n === 2) return 'يومان';
  if(n <= 10) return n + ' أيام';
  return n + ' يومًا';
}
function agoLabel(ds){
  const d = dayDiff(ds, toDateStr(new Date()));
  if(d <= 0) return 'اليوم';
  if(d === 1) return 'أمس';
  if(d === 2) return 'قبل يومين';
  if(d <= 10) return `قبل ${d} أيام`;
  if(d < 30) return `قبل ${d} يومًا`;
  if(d < 60) return 'قبل شهر';
  if(d < 365){ const m = Math.round(d / 30); return m === 2 ? 'قبل شهرين' : (m <= 10 ? `قبل ${m} أشهر` : `قبل ${m} شهرًا`); }
  const y = Math.floor(d / 365);
  return y === 1 ? 'قبل سنة' : (y === 2 ? 'قبل سنتين' : `قبل ${y} سنوات`);
}

// نشاط كل كتاب: أول دراسة وآخر دراسة ووقت التركيز (مخزَّن مؤقتًا حتى تتغير البيانات)
let _bam = {e:null, b:null, map:null};
function bookActivity(){
  if(_bam.e === entriesCache && _bam.b === booksCache) return _bam.map;
  const map = new Map();
  (entriesCache || []).forEach(e => {
    const bid = e.book_id || findBookIdFromTags(e.tags);
    if(!bid || !e.entry_date) return;
    let a = map.get(bid);
    if(!a){ a = {first:e.entry_date, last:e.entry_date, minutes:0, sessions:0}; map.set(bid, a); }
    if(e.entry_date < a.first) a.first = e.entry_date;
    if(e.entry_date > a.last) a.last = e.entry_date;
    if(e.type === 'tarkiz'){ a.minutes += Math.max(0, Number(e.focus_minutes) || 0); a.sessions++; }
  });
  _bam = {e:entriesCache, b:booksCache, map};
  return map;
}

// سطر: تاريخ البداية + آخر دراسة + مدة الانقطاع
function bookStart(b){
  return b.started_at || (bookActivity().get(b.id) || {}).first || '';
}
function bookEnd(b){
  if(b.finished_at) return b.finished_at;
  return b.status === 'complete' ? ((bookActivity().get(b.id) || {}).last || '') : '';
}

// سطر: تاريخ البداية + الانتهاء (أو آخر دراسة) + مدة الانقطاع
function bookTimeHtml(b){
  const a = bookActivity().get(b.id);
  const start = bookStart(b), end = bookEnd(b);
  if(!a && !start && !end) return '<div class="bk-time"><span>لم تُسجَّل جلسة بعد</span></div>';
  const parts = [];
  if(start) parts.push(`<span>${ic('calendar', 12)} بدأتَه ${pfDate(start)}</span>`);
  if(end){
    parts.push(`<span>أتممتَه ${pfDate(end)}</span>`);
    if(start && end >= start) parts.push(`<span>استغرق ${daysWord(dayDiff(start, end) + 1)}</span>`);
  } else if(a){
    parts.push(`<span>آخر دراسة ${agoLabel(a.last)}</span>`);
    const gap = dayDiff(a.last, toDateStr(new Date()));
    if(b.status !== 'complete' && gap >= 7) parts.push(`<span class="gap${gap >= 14 ? ' bad' : ''}">انقطاع ${daysWord(gap)}</span>`);
  }
  return `<div class="bk-time">${parts.join('')}</div>`;
}

/* ============ وضع القراءة والتركيز البصري ============ */

function readPref(k, def){ const v = localStorage.getItem('rihla_' + k); return v === null ? def : v; }
function applyReadPrefs(){
  const fs = parseInt(readPref('fs', '16')) || 16;
  document.documentElement.style.fontSize = fs + 'px';
  document.body.classList.toggle('comfy', readPref('comfy', '0') === '1');
  document.body.classList.toggle('calm', readPref('calm', '0') === '1');
  document.querySelectorAll('#fsChoices button').forEach(b => b.classList.toggle('active', +b.dataset.fs === fs));
  const c = document.getElementById('rdComfy'); if(c) c.checked = readPref('comfy', '0') === '1';
  const m = document.getElementById('rdCalm'); if(m) m.checked = readPref('calm', '0') === '1';
}
function setFontSize(px){ localStorage.setItem('rihla_fs', String(px)); applyReadPrefs(); }
function toggleReadPref(k, on){ localStorage.setItem('rihla_' + k, on ? '1' : '0'); applyReadPrefs(); }
function toggleReadMenu(e){
  if(e) e.stopPropagation();
  const m = document.getElementById('readMenu');
  if(!m) return;
  m.hidden = !m.hidden;
  if(!m.hidden) applyReadPrefs();
}
document.addEventListener('click', e => {
  const m = document.getElementById('readMenu');
  if(m && !m.hidden && !e.target.closest('#readMenu') && !e.target.closest('#readToggle')) m.hidden = true;
});

// وضع التركيز البصري: شاشة كاملة لا يظهر فيها إلا المؤقت
function toggleZen(){
  const on = !document.body.classList.contains('zen');
  document.body.classList.toggle('zen', on);
  document.getElementById('zenExit')?.remove();
  if(on){
    const b = document.createElement('button');
    b.id = 'zenExit'; b.className = 'zen-exit'; b.title = 'خروج'; b.innerHTML = ic('close', 16);
    b.onclick = toggleZen;
    document.body.appendChild(b);
    window.scrollTo(0, 0);
  }
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('zen')) toggleZen(); });

// تأثير موجة على الأزرار الرئيسية
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('button.primary');
  if(!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 650);
});

/* ============ الحفظ التلقائي: مسودة القيد + حقول التركيز + المؤقت الجاري ============ */

const DRAFT_KEY = 'rihla_entry_draft';
let draftTimer = null;
function entryDraftSave(){
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if(editingEntryId) return;
    const g = id => document.getElementById(id);
    if(!g('entryBook')) return;
    const d = {book:g('entryBook').value, lesson:g('entryLesson').value, minutes:g('entryMinutes').value, note:g('entryNote').value, review:g('entryReview').checked};
    try{
      if(d.book || d.lesson || d.minutes || d.note || d.review){
        localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        const ind = g('draftInd');
        if(ind){ ind.innerHTML = ic('check', 12) + ' حُفظت المسودة'; ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1500); }
      } else localStorage.removeItem(DRAFT_KEY);
    }catch(e){}
  }, 400);
}
function entryDraftRestore(){
  try{
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if(!d) return;
    const g = id => document.getElementById(id);
    if(d.book && [...g('entryBook').options].some(o => o.value === d.book)) g('entryBook').value = d.book;
    onEntryBookChange();
    if(d.lesson) g('entryLesson').value = d.lesson;
    if(d.minutes) g('entryMinutes').value = d.minutes;
    if(d.note){ g('entryNote').value = d.note; syncNoteFold('entryNote'); }
    g('entryReview').checked = !!d.review;
  }catch(e){}
}
function entryDraftClear(){ try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} }

function persistTimer(){
  try{
    if(timerMode === 'stopwatch' || (!timerRunning && timerRemainingMs <= 0)){ localStorage.removeItem('rihla_timer'); return; }
    localStorage.setItem('rihla_timer', JSON.stringify({mode:timerMode, phase:pomodoroPhase, round:pomodoroRound, total:timerTotalMs, running:timerRunning, endAt:timerEndAt, remaining:timerRemainingMs}));
  }catch(e){}
}
function readSavedTimer(){ try{ return JSON.parse(localStorage.getItem('rihla_timer') || 'null'); }catch(e){ return null; } }
function restoreTimer(st){
  if(!st || (st.mode !== 'pomodoro' && st.mode !== 'free')) return;
  timerMode = st.mode;
  pomodoroPhase = st.phase || 'work';
  pomodoroRound = st.round || 1;
  timerTotalMs = st.total || 0;
  if(st.running){
    const left = (st.endAt || 0) - Date.now();
    timerRemainingMs = Math.max(0, left);
    renderFocusView();
    if(left > 0){ runTimer(); showToast('استُؤنفت جلسة التركيز التي كانت جارية'); }
    else { onTimerComplete(); showToast('انتهت جلسة تركيزك أثناء غيابك'); }
  } else if(st.remaining > 0){
    timerRemainingMs = st.remaining;
    renderFocusView();
  }
}
