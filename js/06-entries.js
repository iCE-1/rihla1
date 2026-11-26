/* 06-entries.js — القيود: إضافة/تعديل/حذف، السجل الزمني، الوسوم، ملخص الشهر */

async function saveEntryRow(payload, id){
  const run = p => id
    ? sb.from('entries').update(p).eq('id', id)
    : sb.from('entries').insert(p);
  return run(payload);
}

async function addEntry(){
  const date = document.getElementById('dateInput').value || toDateStr(new Date());
  const book = booksCache.find(b => b.id === document.getElementById('entryBook').value) || null;
  const lessonNo = parseInt(normalizeDigits(document.getElementById('entryLesson').value)) || 0;
  if(!book){ alert('اختر الكتاب أولاً'); return; }
  if(!lessonNo){ alert('اكتب رقم ' + lessonUnit(book)); return; }
  const minutes = parseInt(normalizeDigits(document.getElementById('entryMinutes').value)) || 0;
  if(minutes <= 0){ alert('اكتب الوقت بالدقائق'); return; }
  const unit = lessonUnit(book);
  const review = document.getElementById('entryReview').checked;
  const tags = [book.name];
  if(review) tags.push('مراجعة');
  else if(unit === 'درس') tags.push(`درس: ${book.name} — الدرس ${lessonNo}`);
  const payload = {
    entry_date: date,
    type: 'tarkiz',
    content: withNote(`${review ? 'جلسة مراجعة' : 'جلسة تركيز'}: ${book.name} — ${unit} ${lessonNo} — ${minutes} دقيقة`, document.getElementById('entryNote').value),
    tags: tags.join(', '),
    focus_minutes: minutes,
    book_id: book.id,
    lesson_number: lessonNo
  };
  const {error} = await saveEntryRow(payload, editingEntryId);
  if(error){ alert('صار خطأ: '+error.message); return; }
  if(!review) await recordProgress(book, lessonNo);
  entryDraftClear();
  cancelEditEntry();
  await loadEntries();
}

function findBookIdFromTags(tags){
  const normalizedTags = new Set(splitTags(tags).map(normalizeLessonKey));
  const matches = booksCache.filter(book => normalizedTags.has(normalizeLessonKey(book.name)));
  // لا نخمن عند وجود كتابين بالاسم نفسه؛ يختاره المستخدم بنفسه عند التعديل.
  return matches.length === 1 ? matches[0].id : '';
}

function startEditEntry(id){
  const entry = entriesById.get(id);
  if(!entry) return;
  editingEntryId = id;
  const sel = document.getElementById('entryBook');
  // القيود القديمة قد تكون محفوظة قبل إضافة book_id؛ نستعيد الكتاب من الوسم إن أمكن.
  const linkedBookId = entry.book_id || findBookIdFromTags(entry.tags);
  sel.innerHTML = bookOptionsHtml(linkedBookId || '');
  sel.value = linkedBookId || '';
  document.getElementById('dateInput').value = entry.entry_date || '';
  onEntryBookChange();
  document.getElementById('entryLesson').value = entry.lesson_number || '';
  document.getElementById('entryMinutes').value = entry.focus_minutes || '';
  document.getElementById('entryNote').value = splitNote(entry.content).note;
  syncNoteFold('entryNote');
  document.getElementById('entryReview').checked = isReviewEntry(entry);
  document.getElementById('saveEntryButton').textContent = 'حفظ التعديلات';
  document.getElementById('cancelEditWrap').style.display = '';
  document.getElementById('box-entry')?.classList.remove('collapsed');
  document.querySelector('.entry-box').scrollIntoView({behavior:'smooth', block:'start'});
}

function cancelEditEntry(){
  editingEntryId = null;
  const sel = document.getElementById('entryBook');
  if(!sel) return;
  sel.innerHTML = bookOptionsHtml('');
  sel.value = '';
  document.getElementById('entryLesson').value = '';
  document.getElementById('entryMinutes').value = '';
  resetNoteFold('entryNote');
  document.getElementById('entryReview').checked = false;
  onEntryBookChange();
  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('saveEntryButton').textContent = 'حفظ جلسة التركيز';
  document.getElementById('cancelEditWrap').style.display = 'none';
}

async function deleteEntry(id){
  const row = entriesById.get(id);
  if(!row) return;
  const {error} = await sb.from('entries').delete().eq('id', id);
  if(error){ alert('صار خطأ: ' + error.message); return; }
  await loadEntries();
  showToast('تم حذف القيد', 'info', {label:'تراجع', onClick: () => restoreEntries([row])});
}

async function restoreEntries(rows){
  const {error} = await sb.from('entries').insert(rows);
  if(error){ showToast('تعذّر التراجع: ' + error.message, 'warn'); return; }
  await loadEntries();
  showToast('تم التراجع ✓');
}

async function loadEntries(){
  let data = [], error = null;
  try{
    data = await fetchAllRows('entries', q => q.order('entry_date', {ascending:false}).order('created_at', {ascending:false}).order('id'));
  }catch(e){ error = e; }
  const timeline = document.getElementById('timeline');
  if(!timeline) return;
  if(error){ timeline.innerHTML = `<div class="empty">تعذّر تحميل السجل: ${error.message}</div>`; return; }
  entriesCache = data || [];
  entriesById = new Map(entriesCache.map(entry => [entry.id, entry]));
  renderStats(entriesCache);
  renderTimeline();
}

function mainTagOf(entry){
  return splitTags(entry.tags)[0] || 'بدون وسم';
}

async function deleteTagGroup(tag){
  const group = entriesCache.filter(e => mainTagOf(e) === tag);
  if(!group.length) return;
  const sessions = group.filter(e => e.type === 'tarkiz');
  const minutes = sessions.reduce((sum, e) => sum + (e.focus_minutes || 0), 0);
  const label = tag === 'بدون وسم' ? 'القيود بدون وسم' : `الوسم «${tag}»`;
  const details = `${group.length} قيد` + (sessions.length ? ` (منها ${sessions.length} جلسة تركيز بمجموع ${minutes} دقيقة)` : '');
  if(!confirm(`⚠️ تحذير\n\nسيتم حذف ${label} نهائيًا مع كل قيوده: ${details}.\n\nسيتغير ملخص الشهر ووقت التركيز. تقدّم الكتب في «الطريق» لا يتأثر.\nبعد الحذف يظهر زر «تراجع» لبضع ثوانٍ فقط.\n\nهل تريد المتابعة؟`)) return;
  const {error} = await sb.from('entries').delete().in('id', group.map(e => e.id));
  if(error){ alert('صار خطأ: ' + error.message); return; }
  collapsedTagGroups.delete(tag);
  localStorage.setItem('rihla_collapsed_tag_groups', JSON.stringify([...collapsedTagGroups]));
  showToast(`تم حذف ${group.length} قيد`, 'info', {label:'تراجع', onClick: () => restoreEntries(group)});
  await loadEntries();
}

let tagSearchTimer = null;
function onTagSearch(){
  clearTimeout(tagSearchTimer);
  tagSearchTimer = setTimeout(renderTimeline, 150);
}

function renderTimeline(){
  const timeline = document.getElementById('timeline');
  if(!timeline) return;
  const searchEl = document.getElementById('tagSearch');
  const tagSearch = searchEl ? searchEl.value.trim().replace(/^#/, '').toLowerCase() : '';
  let data = entriesCache;
  if(tagSearch){
    data = data.filter(e => (e.tags||'').toLowerCase().includes(tagSearch));
  }

  if(!data || data.length===0){
    timeline.innerHTML = tagSearch
      ? `<div class="empty">لا توجد قيود بهذا الوسم.</div>`
      : `<div class="empty">لا توجد قيود بعد. ابدأ رحلتك بتسجيل أول فائدة أو حفظ اليوم ⤴</div>`;
    return;
  }
  const groupedEntries = new Map();
  data.forEach(entry => {
    // أول وسم هو الوسم الرئيسي: يضع كل قيد في مجموعة واحدة من دون تكرار.
    const mainTag = mainTagOf(entry);
    if(!groupedEntries.has(mainTag)) groupedEntries.set(mainTag, []);
    groupedEntries.get(mainTag).push(entry);
  });

  const renderEntry = e => `
    <div class="day-entry">
      <button class="ghost del" onclick="deleteEntry('${e.id}')">حذف</button>
      ${e.type === 'tarkiz' ? `<button class="ghost edit" onclick="startEditEntry('${e.id}')">تعديل</button>` : ''}
      <div class="date">${formatDate(e.entry_date)} <span class="tag">${tagLabel(e.type)}</span></div>
      ${(() => { const s = splitNote(e.content); if(!s.note) return `<p>${escapeHtml(s.main)}</p>`; const first = s.note.split('\n')[0]; const pv = first.length > 46 ? first.slice(0, 46) + '…' : first; return `<p>${escapeHtml(s.main)}</p><details class="note-det"><summary>${ic('pencil', 12)}<span class="np">${escapeHtml(pv)}</span><span class="nl">ملاحظة</span></summary><div class="entry-note">${escapeHtml(s.note)}</div></details>`; })()}
      ${e.tags ? `<div class="tags-row">${splitTags(e.tags).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `;

  timeline.innerHTML = [...groupedEntries.entries()].map(([tag, entries]) => `
    <section class="tag-group${collapsedTagGroups.has(tag) ? ' collapsed' : ''}">
      <div class="tag-group-bar">
        <button type="button" class="tag-group-head" data-tag="${attrEscape(tag)}" onclick="toggleTagGroup(this)" aria-expanded="${!collapsedTagGroups.has(tag)}">
          <h3>${tag === 'بدون وسم' ? 'بدون وسم' : '#'+escapeHtml(tag)}</h3>
          <span style="display:flex;align-items:center;gap:8px"><span class="tag-group-count">${entries.length} ${entries.length===1 ? 'قيد' : 'قيود'}</span><span class="tag-group-chevron">⌄</span></span>
        </button>
        <button type="button" class="ghost" data-tag="${attrEscape(tag)}" onclick="deleteTagGroup(this.dataset.tag)" title="حذف الوسم وكل قيوده">🗑 حذف الوسم</button>
      </div>
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

function isReviewText(text){
  return /مراجع/.test(text || '');
}

function isReviewEntry(entry){
  return splitTags(entry.tags).some(isReviewText);
}

function lessonKeys(entries){
  const keys = new Set();
  (entries||[]).forEach(entry => {
    if(isReviewEntry(entry)) return;   // المراجعة ليست درسًا جديدًا
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

function renderStats(list){
  const entries = list || entriesCache || [];
  const streak = computeStreak(entries.map(e => e.entry_date));
  renderDailyGoal(entries);
  renderVacationBar();
  renderBackupReminder();
  renderBackupInfo();
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
          <span class="monthly-summary-brief">${lessonsCount} دروس · ${focusTimeLabel} تركيز${streak > 1 ? ' · 🔥 ' + streak : ''}</span>
          <span class="summary-chevron">⌄</span>
        </button>
        <div class="monthly-summary-content">
          <div>
            درست <b>${lessonsCount}</b> ${lessonsCount===1 ? 'درسًا' : 'دروس'}، ومجموع وقت التركيز <b>${focusTimeLabel}</b>.
            ${streak > 0 ? `<div style="margin-top:4px">🔥 سلسلة التسجيل المتتالية: <b>${streak}</b> ${streak===1 ? 'يوم' : 'أيام'}</div>` : ''}
            <div style="font-size:.75rem;color:var(--ink-soft);margin-top:5px">يُحتسب الدرس مرة واحدة ولو تكرر في عدة جلسات. اربط القيد أو جلسة التركيز بكتاب من «الطريق» وسيُحتسب تلقائيًا.</div>
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
