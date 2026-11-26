/* 05-focus.js — نظام التركيز: بومودورو، المؤقت الحر، ساعة التوقف، المنبّه، تسجيل الجلسات */

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
const BASE_TITLE = document.title;
let focusBookId = localStorage.getItem('rihla_focus_book') || '';
let focusLessonNo = localStorage.getItem('rihla_focus_lesson') || '';
let focusTagVal = localStorage.getItem('rihla_focus_tag') || '';
let focusNoteVal = localStorage.getItem('rihla_focus_note') || '';
let pmCfg = {work:25, short:5, long:15, rounds:4, free:20};
try { Object.assign(pmCfg, JSON.parse(localStorage.getItem('rihla_pm') || '{}')); } catch(e) {}

window.addEventListener('beforeunload', e => {
  if(timerRunning || stopwatchRunning){ e.preventDefault(); e.returnValue = ''; }
});

function savePmCfg(){
  const g = (id, def) => { const x = document.getElementById(id); return x ? (parseInt(normalizeDigits(x.value)) || def) : def; };
  pmCfg = {work:g('pmWork',pmCfg.work), short:g('pmShort',pmCfg.short), long:g('pmLong',pmCfg.long), rounds:g('pmRounds',pmCfg.rounds), free:g('freeMinutes',pmCfg.free)};
  localStorage.setItem('rihla_pm', JSON.stringify(pmCfg));
  if(!timerRunning && timerRemainingMs === 0) updateTimerDisplay();
}

function focusLinkHtml(){
  const b = booksCache.find(x => x.id === focusBookId);
  const unit = b ? lessonUnit(b) : 'درس';
  const done = b ? bookProgressPct(b).done : 0;
  return `
    <div class="field">
      <label>الكتاب (اختياري — يُحدَّث إنجازك في «الطريق» تلقائيًا)</label>
      <select id="focusBook" onchange="onFocusBookChange(this.value)">${bookOptionsHtml(focusBookId)}</select>
    </div>
    <div class="row2">
      <div class="field">
        <label>الوسم (اختياري)</label>
        <input id="focusTag" value="${attrEscape(focusTagVal)}" placeholder="مثل: مراجعة، حفظ" oninput="focusTagVal=this.value;localStorage.setItem('rihla_focus_tag',this.value);updateFocusTarget()">
      </div>
      <div class="field">
        <label id="focusLessonLabel">${unit === 'صفحة' ? 'رقم الصفحة' : 'رقم الدرس'}</label>
        <input id="focusLesson" type="text" inputmode="numeric" value="${attrEscape(focusLessonNo)}" ${b ? '' : 'disabled'} placeholder="${b ? 'مثل: ' + (done + 1) : 'اختر كتابًا أولاً'}" oninput="focusLessonNo=this.value;localStorage.setItem('rihla_focus_lesson',this.value);updateFocusTarget()">
      </div>
    </div>
    ${noteFoldHtml('focusNote', focusNoteVal, 'مثل: درستُ مبحث الفاعل، أو الفصل الثالث، أو شرح عبارة «...»', "focusNoteVal=this.value;localStorage.setItem('rihla_focus_note',this.value)")}
    <div class="hint" id="focusLessonHint" style="margin:-6px 0 14px">${b ? `وصلتَ حاليًا إلى ${unit} ${done}. يُسجَّل الإنجاز عند انتهاء الجلسة. اكتب «مراجعة» في الوسم إن كانت مراجعة، فلا تُحسب درسًا جديدًا.` : ''}</div>`;
}

function onFocusBookChange(id){
  focusBookId = id;
  focusLessonNo = '';
  localStorage.removeItem('rihla_focus_lesson');
  localStorage.setItem('rihla_focus_book', id);
  updateFocusLinkUi();
}

function updateFocusTarget(){
  const el = document.getElementById('focusTarget');
  if(!el) return;
  const b = booksCache.find(x => x.id === focusBookId);
  const n = parseInt(normalizeDigits(focusLessonNo)) || 0;
  const tag = focusTagVal.trim();
  const parts = [];
  if(b) parts.push(`📖 ${b.name}${n ? ' — ' + lessonUnit(b) + ' ' + n : ''}${isReviewText(tag) ? ' (مراجعة)' : ''}`);
  if(tag) parts.push('#' + tag);
  el.textContent = parts.join('  ·  ');
}

function updateFocusLinkUi(){
  const input = document.getElementById('focusLesson');
  if(!input) return;
  const b = booksCache.find(x => x.id === focusBookId);
  input.value = focusLessonNo;
  input.disabled = !b;
  const hint = document.getElementById('focusLessonHint');
  if(!b){
    input.placeholder = 'اختر كتابًا أولاً';
    document.getElementById('focusLessonLabel').textContent = 'رقم الدرس';
    hint.textContent = '';
  } else {
    const unit = lessonUnit(b);
    const done = bookProgressPct(b).done;
    document.getElementById('focusLessonLabel').textContent = unit === 'صفحة' ? 'رقم الصفحة' : 'رقم الدرس';
    input.placeholder = 'مثل: ' + (done + 1);
    hint.textContent = `وصلتَ حاليًا إلى ${unit} ${done}. يُسجَّل الإنجاز عند انتهاء الجلسة. اكتب «مراجعة» في الوسم إن كانت مراجعة، فلا تُحسب درسًا جديدًا.`;
  }
  updateFocusTarget();
}

function collectFocusLink(){
  const b = booksCache.find(x => x.id === focusBookId) || null;
  const n = b ? (parseInt(normalizeDigits(focusLessonNo)) || 0) : 0;
  return {book: b, n, review: isReviewText(focusTagVal), note: focusNoteVal.trim()};
}

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
          <input id="pmWork" type="text" inputmode="numeric" value="${pmCfg.work}" onchange="savePmCfg()" ${dis}>
        </div>
        <div class="field">
          <label>مدة الاستراحة القصيرة (دقيقة)</label>
          <input id="pmShort" type="text" inputmode="numeric" value="${pmCfg.short}" onchange="savePmCfg()" ${dis}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>مدة الاستراحة الطويلة (دقيقة)</label>
          <input id="pmLong" type="text" inputmode="numeric" value="${pmCfg.long}" onchange="savePmCfg()" ${dis}>
        </div>
        <div class="field">
          <label>عدد الجولات قبل الاستراحة الطويلة</label>
          <input id="pmRounds" type="text" inputmode="numeric" value="${pmCfg.rounds}" onchange="savePmCfg()" ${dis}>
        </div>
      </div>
      <div class="focus-phase-label" id="phaseLabel">${POMODORO_PHASE_LABELS[pomodoroPhase]} — الجولة ${pomodoroRound}</div>
      ${ringHtml('--:--')}
      <div class="focus-target" id="focusTarget"></div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> أضف الجلسة تلقائيًا للسجل اليومي عند الانتهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
      <div class="hint" id="wakeHint" style="text-align:center;margin-top:10px"></div>
      <div class="zen-btn"><button class="ghost" onclick="toggleZen()">${ic('expand', 14)} وضع التركيز</button></div>
    `;
  } else if(timerMode === 'free'){
    panel.innerHTML = `
      <div class="field" style="max-width:200px">
        <label>عدد الدقائق</label>
        <input id="freeMinutes" type="text" inputmode="numeric" value="${pmCfg.free}" onchange="savePmCfg()" ${dis}>
      </div>
      ${ringHtml('--:--')}
      <div class="focus-target" id="focusTarget"></div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> أضف الجلسة تلقائيًا للسجل اليومي عند الانتهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
      <div class="hint" id="wakeHint" style="text-align:center;margin-top:10px"></div>
      <div class="zen-btn"><button class="ghost" onclick="toggleZen()">${ic('expand', 14)} وضع التركيز</button></div>
    `;
  } else {
    panel.innerHTML = `
      <div class="focus-phase-label">تبدأ من صفر وتستمر لين توقفها بنفسك</div>
      ${ringHtml('00:00')}
      <div class="focus-target" id="focusTarget"></div>
      <label class="focus-check"><input type="checkbox" id="autoLog" checked> سجّل الجلسة تلقائيًا بالسجل اليومي عند الإنهاء</label>
      <div class="focus-controls" id="focusControls"></div>
      <div id="focusBanner"></div>
      <div class="hint" id="wakeHint" style="text-align:center;margin-top:10px"></div>
      <div class="zen-btn"><button class="ghost" onclick="toggleZen()">${ic('expand', 14)} وضع التركيز</button></div>
    `;
  }
  panel.insertAdjacentHTML('afterbegin', focusLinkHtml());
  renderFocusControls();
  updateFocusTarget();
  if(timerMode === 'stopwatch'){
    updateStopwatchDisplay(stopwatchElapsedMs);
  } else {
    updateTimerDisplay();
  }
}

const RING_C = 2 * Math.PI * 100;
let timerTotalMs = 0;
let wakeLock = null;

function ringHtml(txt){
  return `<div class="focus-ring-wrap" id="focusRing" data-phase="${timerMode === 'pomodoro' ? pomodoroPhase : 'work'}">
    <svg class="focus-ring" viewBox="0 0 220 220" aria-hidden="true"><circle class="bg" cx="110" cy="110" r="100"/><circle class="fg" id="ringFg" cx="110" cy="110" r="100" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0"/></svg>
    <div class="focus-display" id="timerDisplay">${txt}</div>
  </div>`;
}
function setRing(frac){
  const fg = document.getElementById('ringFg');
  if(fg) fg.style.strokeDashoffset = (RING_C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1);
}

async function acquireWake(){
  try{
    if('wakeLock' in navigator && !wakeLock){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; updateWakeHint(); });
    }
  }catch(e){ wakeLock = null; }
  updateWakeHint();
}
function releaseWake(){
  try{ if(wakeLock) wakeLock.release(); }catch(e){}
  wakeLock = null;
  updateWakeHint();
}
function updateWakeHint(){
  const h = document.getElementById('wakeHint');
  if(h) h.innerHTML = (wakeLock && (timerRunning || stopwatchRunning)) ? ic('sun', 13) + ' الشاشة تبقى مضاءة أثناء الجلسة' : '';
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && (timerRunning || stopwatchRunning)) acquireWake();
});

function renderFocusControls(){
  if(timerRunning || stopwatchRunning) acquireWake(); else releaseWake();
  persistTimer();
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
  setRing((ms % 60000) / 60000);
  document.title = stopwatchRunning ? `${formatElapsed(ms)} • ${BASE_TITLE}` : BASE_TITLE;
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
  document.title = BASE_TITLE;
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

  const link = collectFocusLink();
  if(minutesDone >= 1 && shouldLog){
    await logFocusSession(minutesDone, 'ساعة توقف', tagVal, link);
  }
  if(link.book && link.n && !link.review){ await recordProgress(link.book, link.n); }

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
  timerTotalMs = timerRemainingMs;
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
  document.title = BASE_TITLE;
  renderFocusControls();
  disableFocusInputs(false);
}

function resetTimer(){
  timerTotalMs = 0;
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
  document.title = timerRunning ? `${mm}:${ss} • ${BASE_TITLE}` : BASE_TITLE;
  let frac = 1;
  if(timerRunning || timerRemainingMs > 0) frac = timerTotalMs > 0 ? timerRemainingMs / timerTotalMs : 1;
  setRing(frac);
}

async function onTimerComplete(){
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  document.title = BASE_TITLE;
  renderFocusControls();
  disableFocusInputs(false);
  playAlarm();

  const minutesDone = getPhaseDurationMinutes();
  const tagEl = document.getElementById('focusTag');
  const tagVal = tagEl ? tagEl.value.trim() : '';
  const autoLogEl = document.getElementById('autoLog');
  const shouldLog = autoLogEl ? autoLogEl.checked : true;
  const phaseLabel = timerMode === 'pomodoro' ? POMODORO_PHASE_LABELS[pomodoroPhase] : 'مؤقت حر';

  const isWork = (timerMode === 'free' || pomodoroPhase === 'work');
  const link = collectFocusLink();
  if(shouldLog && isWork){
    await logFocusSession(minutesDone, phaseLabel, tagVal, link);
  }
  if(isWork && link.book && link.n && !link.review){
    await recordProgress(link.book, link.n);
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

async function logFocusSession(minutes, phaseLabel, tag, link){
  const book = link && link.book;
  const n = (link && link.n) || 0;
  const review = !!(link && link.review) || isReviewText(tag);
  const parts = splitTags(tag);
  if(book && !parts.includes(book.name)) parts.push(book.name);
  let where = '';
  if(book){
    const unit = lessonUnit(book);
    where = ` — ${book.name}${n ? `، ${review ? 'مراجعة ' : ''}${unit} ${n}` : ''}`;
    if(n && unit === 'درس' && !review) parts.push(`درس: ${book.name} — الدرس ${n}`);
  }
  const payload = {
    entry_date: toDateStr(new Date()),
    type: 'tarkiz',
    content: withNote(`جلسة تركيز (${phaseLabel}): ${minutes} دقيقة${where}`, link && link.note),
    tags: parts.join(', '),
    focus_minutes: minutes,
    book_id: book ? book.id : null,
    lesson_number: n || null
  };
  const {error} = await saveEntryRow(payload);
  if(error){
    // لا نحفظ نسخة غير مربوطة بالكتاب؛ وإلا تختفي الجلسة من إحصائياته ولا يمكن تعديلها لاحقًا.
    showToast('تعذّر حفظ جلسة التركيز: ' + error.message, 'warn');
  } else if(link && link.note){
    // سُجّلت الملاحظة مع الجلسة؛ نفرّغ الخانة للجلسة التالية
    focusNoteVal = '';
    localStorage.removeItem('rihla_focus_note');
    resetNoteFold('focusNote');
  }
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
