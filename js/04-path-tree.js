/* 04-path-tree.js — «الطريق»: شجرة العلوم، السحب والإفلات، العلوم والكتب (إضافة/تعديل/حذف) */

/* ============ الطريق: شجرة العلوم ============ */

let trSubs = [], trOpen = null, trPresetDone = false, trDrawn = false, trPop = null;
const TR_STATUS = {in_progress:{ic:'●', cls:'cur'}, complete:{ic:'✓', cls:'done'}, todo:{ic:'○', cls:'todo'}};
const TR_TWIGS = [
  'M10 38 C15 30,19 22,26 8 M20 37 C24 45,28 51,34 57',
  'M12 37 C16 31,21 25,28 18 M24 35 C28 43,31 49,35 54',
  'M12 36 C16 28,20 20,24 8 M18 38 C22 46,27 52,32 58'
];
const TR_TIPS = [[[26,8],[34,57]], [[28,18],[35,54]], [[24,8],[32,58]]];
const TR_TRUNK = '<svg class="tr-trunk" viewBox="0 0 40 400" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="trBark" x1="0" x2="1"><stop offset="0" stop-color="#0e0e0e"/><stop offset=".45" stop-color="#2b2b2b"/><stop offset=".72" stop-color="#1b1b1b"/><stop offset="1" stop-color="#0c0c0c"/></linearGradient></defs><path d="M17 0 C16 80,12 130,9 210 S3 330,0 400 L40 400 C37 330,31 290,30 210 S24 80,23 0 Z" fill="url(#trBark)"/><path d="M20 0 C19 100,16 200,14 400 M24 10 C25 120,27 260,30 400 M17 40 C14 160,12 280,8 400" fill="none" stroke="#080808" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".85"/><path d="M40 400 C37 330,31 290,30 210 S24 80,23 0" fill="none" stroke="#6a6a6a" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".35"/></svg>';
const TR_ROOTS = '<svg class="tr-roots" viewBox="0 0 170 40" aria-hidden="true"><path stroke-width="7" d="M85 0 C85 12,52 15,14 38 M85 0 C85 12,118 15,156 38"/><path stroke-width="5" d="M85 0 C83 16,80 27,73 40 M85 0 C87 16,90 27,98 40"/><path stroke-width="3" d="M60 22 C52 26,44 28,36 36 M110 22 C118 26,126 28,134 36"/></svg>';

async function renderPathView(){
  const el = document.getElementById('pathView');
  if(!el) return;
  if(!document.getElementById('treeWrap')){
    const fx = Array.from({length:16}, (_, i) => `<i style="left:${(i * 29 + 7) % 96}%;--t:${(9 + (i % 5) * 2.2).toFixed(1)}s;--dl:-${(i * 1.9).toFixed(1)}s"></i>`).join('');
    el.innerHTML = `
      <div class="timeline-head">
        <h2>الطريق</h2>
        <button class="primary" onclick="openAddSubjectForm()">+ إضافة علم مخصص</button>
      </div>
      <div id="subjectFormWrap"></div>
      <div class="tree-hint">اضغط على غصن أي علم لتفتح كتبه، واضغط مطولًا لتحريكه وترتيبه.</div>
      <div class="tree-legend"><span><i class="lg-cur"></i>تدرسه الآن</span><span><i class="lg-done"></i>مكتمل</span><span><i class="lg-todo"></i>لم يبدأ</span><span>غصن أسمك = إنجاز أكثر</span><span>غصن خافت = علم مهمل</span></div>
      <div class="tree-stage">
        <div id="treeWrap" class="tree-wrap"><div class="empty tree-empty">جاري التحميل...</div></div>
        <div class="tr-fx" aria-hidden="true">${fx}</div>
      </div>`;
    trDrawn = false;
  }
  await trLoad();
}

async function trLoad(){
  if(!trPresetDone){ await ensurePresetSubjects(); trPresetDone = true; }
  const {data, error} = await sb.from('subjects').select('*').order('sort_order').order('created_at');
  const wrap = document.getElementById('treeWrap');
  if(!wrap) return;
  if(error){ wrap.innerHTML = `<div class="empty tree-empty">تعذّر التحميل: ${escapeHtml(error.message)}</div>`; return; }
  await refreshBooksCache();
  if(!entriesCache.length) await loadEntries();
  trSubs = [...(data || [])].sort((a,b) => ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  if(trOpen && !trSubs.some(s => s.id === trOpen)){ trOpen = null; currentSubjectId = null; }
  trDraw();
}

// العلوم التي فيها كتاب جارٍ (نقطة ذهبية) تبقى في الأعلى، مع حفظ الترتيب اليدوي داخل كل مجموعة
function trPartition(){
  const hasCur = s => booksCache.some(b => b.subject_id === s.id && b.status === 'in_progress');
  const next = [...trSubs.filter(hasCur), ...trSubs.filter(s => !hasCur(s))];
  const changed = next.some((s, i) => s.id !== trSubs[i].id);
  trSubs = next;
  return changed;
}

async function loadSubjectsGrid(){ await trLoad(); }

async function loadBooks(){
  await refreshBooksCache();
  renderCurrentBooks();
  trDraw();
}

function trDraw(){
  const wrap = document.getElementById('treeWrap');
  if(!wrap) return;
  if(!trSubs.length){ wrap.innerHTML = '<div class="empty tree-empty">لا توجد علوم بعد.</div>'; return; }
  trPartition();
  const grow = !trDrawn;
  trDrawn = true;
  wrap.innerHTML = `${TR_TRUNK}${trSubs.map((s,i) => trRowHtml(s, i, grow)).join('')}${TR_ROOTS}`;
}

function trLastActivity(books){
  const ids = new Set(books.map(b => b.id));
  let m = '';
  (entriesCache || []).forEach(e => { if(e.book_id && ids.has(e.book_id) && e.entry_date > m) m = e.entry_date; });
  return m;
}

// غصن مخروطي: سميك عند الجذع ورفيع عند الطرف، وسُمكه يزيد مع الإنجاز
function trBranchSvg(i, grow, avg, n){
  // السُّمك أوضح الآن: من رفيع جدًا (٠٪) إلى غليظ (١٠٠٪)
  const t0 = n ? 5 + avg * 0.17 : 4;
  const t1 = n ? 2 + avg * 0.045 : 1.6;
  const tm = (t0 + t1) / 2;
  const f = v => v.toFixed(1);
  const lv = Math.round(34 + avg * 0.4);
  const limb = `M0 ${f(38 - t0/2)} C22 ${f(38 - t0/2)},32 ${f(30 - tm/2)},56 ${f(30 - tm/2)} C80 ${f(30 - tm/2)},86 ${f(30 - t1/2)},100 ${f(30 - t1/2)} L100 ${f(30 + t1/2)} C86 ${f(30 + t1/2)},80 ${f(30 + tm/2)},56 ${f(30 + tm/2)} C32 ${f(30 + tm/2)},22 ${f(38 + t0/2)},0 ${f(38 + t0/2)} Z`;
  return `<svg class="tr-branch${grow ? ' grow' : ''}" style="--d:${(i * 0.12).toFixed(2)}s;--lv:rgb(${lv},${lv},${lv});--lvo:rgb(${lv + 22},${lv + 22},${lv + 22})" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
    <g class="sway" style="--sd:-${((i * 1.3) % 8).toFixed(1)}s">
      <path class="twig" d="${TR_TWIGS[i % 3]}"/>
      <path class="limb" d="${limb}"/>
      <path class="limb2" d="M0 ${f(38 - t0/2 + 1)} C22 ${f(38 - t0/2 + 1)},32 ${f(30 - tm/2 + 1)},56 ${f(30 - tm/2 + 1)} C80 ${f(30 - tm/2 + 1)},86 ${f(30 - t1/2 + 1)},100 ${f(30 - t1/2 + 1)}"/>
    </g>
  </svg>`;
}

// ثمار على أطراف الأغصان: ذهبية متوهجة لما تدرسه الآن، بيضاء لما أنهيته
function trFruits(i, cur, done){
  const tips = TR_TIPS[i % 3];
  const mk = (t, cls) => `<span class="tr-fruit ${cls}" style="--x:${t[0]}%;--y:${(t[1] / 60 * 100).toFixed(1)}%"></span>`;
  const out = [];
  if(cur) out.push(mk(tips[0], 'gold'));
  if(done) out.push(mk(tips[1], 'white'));
  return out.length ? `<div class="tr-fruits">${out.join('')}</div>` : '';
}

function trDotsHtml(books){
  const order = {complete:0, in_progress:1, todo:2};
  const list = [...books].sort((a,b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const shown = list.slice(0, 10);
  const cls = s => s === 'complete' ? 'd-done' : (s === 'in_progress' ? 'd-cur' : '');
  return `<span class="tr-dots">${shown.map(b => `<i class="${cls(b.status)}"></i>`).join('')}${list.length > 10 ? `<small>+${list.length - 10}</small>` : ''}</span>`;
}

function trRowHtml(s, i, grow){
  const side = i % 2 === 0 ? 'r' : 'l';
  const books = booksCache.filter(b => b.subject_id === s.id);
  const pcts = books.map(b => bookProgressPct(b).pct);
  const avg = pcts.length ? Math.round(pcts.reduce((a,c) => a + c, 0) / pcts.length) : 0;
  const cur = books.filter(b => b.status === 'in_progress').length;
  const done = books.filter(b => b.status === 'complete').length;
  const last = trLastActivity(books);
  const stale = books.length > 0 && (!last || (Date.now() - new Date(last + 'T00:00:00').getTime()) > 30 * 86400000);
  const open = trOpen === s.id;
  const cls = ['tr-row', side, grow ? 'intro' : '', open ? 'open' : '', cur ? 'has-cur' : '', (books.length && done === books.length) ? 'full' : '', stale ? 'stale' : '', books.length ? '' : 'bare'].filter(Boolean).join(' ');
  return `<div class="${cls}" id="tr-${s.id}" style="--d:${(i * 0.12).toFixed(2)}s">
    ${trBranchSvg(i, grow, avg, books.length)}
    ${trFruits(i, cur, done)}
    <button class="tr-node" onclick="trToggle('${s.id}')" onpointerdown="trPressStart(event,'${s.id}')" aria-expanded="${open}">
      <span class="tr-name">${escapeHtml(s.name)}</span>
      <span class="tr-meta">${books.length ? books.length + ' كتاب/متن · ' + avg + '%' : 'لا كتب بعد'}</span>
      ${books.length ? trDotsHtml(books) : ''}
    </button>
    ${open ? trPanelHtml(s, books, avg) : ''}
  </div>`;
}

function trPanelHtml(s, books, avg){
  const matn = books.filter(b => (b.kind || 'matn') === 'matn');
  const pg = books.filter(b => (b.kind || 'matn') === 'book');
  const sum = (a, k) => a.reduce((t,b) => t + (b[k] || 0), 0);
  const bd = [
    matn.length ? `${sum(matn,'completed_lessons')}/${sum(matn,'total_lessons')} درس` : '',
    pg.length ? `${sum(pg,'completed_pages')}/${sum(pg,'total_pages')} صفحة` : ''
  ].filter(Boolean).join(' · ');
  const isCustom = !PRESET_SUBJECTS.includes(s.name);
  const rank = {in_progress:0, todo:1, complete:2};
  const curLevels = new Set(books.filter(b => b.status === 'in_progress').map(b => b.level || 1));
  const sorted = [...books].sort((a,b) =>
    ((curLevels.has(a.level || 1) ? 0 : 1) - (curLevels.has(b.level || 1) ? 0 : 1)) ||
    ((a.level || 1) - (b.level || 1)) ||
    ((Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const byLevel = new Map();
  sorted.forEach(b => { const l = b.level || 1; if(!byLevel.has(l)) byLevel.set(l, []); byLevel.get(l).push(b); });
  const levelsHtml = [...byLevel.entries()].map(([l, list]) =>
    `<div class="tr-level"><div class="tr-lvl-title">المستوى ${arabicNumeral(l)}</div>${list.map(trBookHtml).join('')}</div>`).join('');
  return `<div class="tr-panel${trPop === s.id ? ' pop' : ''}">
    <div class="tr-panel-head">
      <span>متوسط الإنجاز ${avg}%${bd ? ' — ' + bd : ''}</span>
      <span class="tr-actions"><button onclick="trAddBook('${s.id}')">+ إضافة كتاب</button>${isCustom ? `<button onclick="deleteSubject('${s.id}')">حذف العلم</button>` : ''}</span>
    </div>
    <div id="bookFormWrap"></div>
    <div class="tr-books">${levelsHtml || '<div class="tr-none">لسا ما أضفت كتب لهذا العلم. أضف أول كتاب أو متن ⤴</div>'}</div>
  </div>`;
}

function trBookHtml(b){
  const p = bookProgressPct(b);
  const st = TR_STATUS[b.status] || TR_STATUS.todo;
  const kind = (b.kind || 'matn') === 'book' ? 'كتاب' + ((b.volumes || 1) > 1 ? ' ' + arabicNumeral(b.volumes) + ' مجلدات' : '') : 'متن';
  return `<div class="tr-book ${st.cls}" data-id="${b.id}">
    <div class="tr-book-top"><span class="tr-dot">${st.ic}</span><span class="tr-book-name">${escapeHtml(b.name)}</span><span class="tr-pct">${p.pct}%</span><span class="tr-bgrip" onpointerdown="bkDragStart(event,'${b.id}')" title="اسحب لإعادة ترتيب الكتب">${ic('grip', 16)}</span></div>
    <div class="tr-book-sub">${STATUS_LABELS[b.status] || ''} · ${kind} · ${p.done}/${p.total} ${p.unit}</div>
    ${bookTimeHtml(b)}
    ${b.current_lesson ? `<div class="tr-book-cur">${ic('pencil', 12)} ${escapeHtml(b.current_lesson)}</div>` : ''}
    <div class="tr-bar"><i style="width:${p.pct}%"></i></div>
    <div class="tr-actions"><button onclick="quickProgress('${b.id}')">＋ سجّل تقدّمي</button><button onclick="trEditBook('${b.id}')">تعديل</button><button onclick="deleteBook('${b.id}')">حذف</button></div>
  </div>`;
}

function trToggle(id){
  if(trSuppressClick) return;      // النقرة التي تعقب السحب لا تفتح العلم
  trOpen = trOpen === id ? null : id;
  const s = trSubs.find(x => x.id === id);
  currentSubjectId = trOpen;
  currentSubjectName = (trOpen && s) ? s.name : '';
  trPop = trOpen;
  trDraw();
  trPop = null;
  if(trOpen) document.getElementById('tr-' + id)?.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function trAddBook(id){
  currentSubjectId = id;
  openBookForm();
  document.getElementById('bookFormWrap')?.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function trEditBook(id){
  const b = booksCache.find(x => x.id === id);
  if(!b) return;
  currentSubjectId = b.subject_id;
  openBookForm(b);
  document.getElementById('bookFormWrap')?.scrollIntoView({behavior:'smooth', block:'nearest'});
}


/* ---- سحب الأغصان لإعادة الترتيب (ضغط مطوّل ثم سحب) ---- */

let trDrag = null, trSuppressClick = false;
document.addEventListener('touchmove', e => { if((trDrag || bkDrag) && e.cancelable) e.preventDefault(); }, {passive:false});

function trPressStart(e, id){
  if(e.button !== undefined && e.button !== 0) return;
  const x0 = e.clientX, y0 = e.clientY;
  const mv = ev => { if(Math.hypot(ev.clientX - x0, ev.clientY - y0) > 9) detach(); };
  const detach = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', detach);
    window.removeEventListener('pointercancel', detach);
  };
  const timer = setTimeout(() => { detach(); trBeginDrag(id, y0); }, 380);
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', detach);
  window.addEventListener('pointercancel', detach);
}

function trBeginDrag(id, y){
  const wrap = document.getElementById('treeWrap');
  if(!wrap) return;
  if(trOpen){ trOpen = null; currentSubjectId = null; trDraw(); }   // نطوي اللوحة المفتوحة ليسهل السحب
  const rows = [...wrap.querySelectorAll('.tr-row')];
  const idx = trSubs.findIndex(s => s.id === id);
  if(idx < 0 || !rows[idx]) return;
  trDrag = {idx, cur: idx, el: rows[idx], rows, rects: rows.map(r => ({top: r.offsetTop, h: r.offsetHeight})), startY: y, y, startScroll: window.scrollY, raf: 0};
  rows[idx].classList.add('dragging');
  wrap.classList.add('is-dragging');
  if(navigator.vibrate) navigator.vibrate(18);
  window.addEventListener('pointermove', trDragMove);
  window.addEventListener('pointerup', trDragEnd);
  window.addEventListener('pointercancel', trDragEnd);
  trDrag.raf = requestAnimationFrame(trDragLoop);
}

function trDragMove(e){ if(trDrag) trDrag.y = e.clientY; }

function trDragLoop(){
  const d = trDrag;
  if(!d) return;
  const vh = window.innerHeight;
  if(d.y < 90) window.scrollBy(0, -10);
  else if(d.y > vh - 90) window.scrollBy(0, 10);
  const dy = (d.y - d.startY) + (window.scrollY - d.startScroll);
  const h0 = d.rects[d.idx].h;
  d.el.style.transform = `translateY(${dy}px) scale(1.02)`;
  const center = d.rects[d.idx].top + h0 / 2 + dy;
  let ni = d.idx;
  d.rects.forEach((r, k) => {
    if(k === d.idx) return;
    const c = r.top + r.h / 2;
    if(k < d.idx && center < c) ni = Math.min(ni, k);
    if(k > d.idx && center > c) ni = Math.max(ni, k);
  });
  d.rows.forEach((r, k) => {
    if(k === d.idx) return;
    let sh = 0;
    if(ni > d.idx && k > d.idx && k <= ni) sh = -h0;
    else if(ni < d.idx && k >= ni && k < d.idx) sh = h0;
    r.style.transform = sh ? `translateY(${sh}px)` : '';
  });
  d.cur = ni;
  d.raf = requestAnimationFrame(trDragLoop);
}

function trDragEnd(){
  const d = trDrag;
  if(!d) return;
  cancelAnimationFrame(d.raf);
  window.removeEventListener('pointermove', trDragMove);
  window.removeEventListener('pointerup', trDragEnd);
  window.removeEventListener('pointercancel', trDragEnd);
  trDrag = null;
  trSuppressClick = true;
  setTimeout(() => { trSuppressClick = false; }, 350);
  document.getElementById('treeWrap')?.classList.remove('is-dragging');
  d.rows.forEach(r => { r.style.transform = ''; });
  if(d.cur !== d.idx){
    const [m] = trSubs.splice(d.idx, 1);
    trSubs.splice(d.cur, 0, m);
    const forced = trPartition();
    trSaveOrder();
    if(forced) showToast('العلوم التي فيها نقطة ذهبية تبقى في الأعلى');
  }
  trDraw();
}

async function trSaveOrder(){
  const jobs = [];
  trSubs.forEach((s, i) => {
    const so = i * 10;
    if(s.sort_order !== so){
      s.sort_order = so;
      jobs.push(sb.from('subjects').update({sort_order: so}).eq('id', s.id));
    }
  });
  if(!jobs.length) return;
  const res = await Promise.all(jobs);
  const bad = res.find(r => r.error);
  if(bad) showToast('تعذّر حفظ الترتيب: ' + bad.error.message, 'warn');
  else showToast('تم حفظ ترتيب الأغصان ✓');
}


/* ---- ترتيب الكتب بالسحب والإفلات (داخل المستوى نفسه) ---- */

let bkDrag = null;

function bkDragStart(e, id){
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget.closest('.tr-book');
  const lvl = el && el.closest('.tr-level');
  if(!el || !lvl) return;
  const items = [...lvl.querySelectorAll('.tr-book')];
  if(items.length < 2){ showToast('أضف كتابًا آخر في هذا المستوى لتتمكن من الترتيب'); return; }
  const idx = items.indexOf(el);
  bkDrag = {idx, cur: idx, el, items, ids: items.map(x => x.dataset.id), rects: items.map(x => ({top: x.offsetTop, h: x.offsetHeight})), startY: e.clientY, y: e.clientY, startScroll: window.scrollY, raf: 0};
  el.classList.add('bk-dragging');
  if(navigator.vibrate) navigator.vibrate(12);
  window.addEventListener('pointermove', bkDragMove);
  window.addEventListener('pointerup', bkDragEnd);
  window.addEventListener('pointercancel', bkDragEnd);
  bkDrag.raf = requestAnimationFrame(bkDragLoop);
}

function bkDragMove(e){ if(bkDrag) bkDrag.y = e.clientY; }

function bkDragLoop(){
  const d = bkDrag;
  if(!d) return;
  if(d.y < 90) window.scrollBy(0, -10);
  else if(d.y > window.innerHeight - 90) window.scrollBy(0, 10);
  const dy = (d.y - d.startY) + (window.scrollY - d.startScroll);
  const h0 = d.rects[d.idx].h + 9;
  d.el.style.transform = `translateY(${dy}px)`;
  const center = d.rects[d.idx].top + d.rects[d.idx].h / 2 + dy;
  let ni = d.idx;
  d.rects.forEach((r, k) => {
    if(k === d.idx) return;
    const c = r.top + r.h / 2;
    if(k < d.idx && center < c) ni = Math.min(ni, k);
    if(k > d.idx && center > c) ni = Math.max(ni, k);
  });
  d.items.forEach((it, k) => {
    if(k === d.idx) return;
    let sh = 0;
    if(ni > d.idx && k > d.idx && k <= ni) sh = -h0;
    else if(ni < d.idx && k >= ni && k < d.idx) sh = h0;
    it.style.transform = sh ? `translateY(${sh}px)` : '';
  });
  d.cur = ni;
  d.raf = requestAnimationFrame(bkDragLoop);
}

async function bkDragEnd(){
  const d = bkDrag;
  if(!d) return;
  cancelAnimationFrame(d.raf);
  window.removeEventListener('pointermove', bkDragMove);
  window.removeEventListener('pointerup', bkDragEnd);
  window.removeEventListener('pointercancel', bkDragEnd);
  bkDrag = null;
  d.items.forEach(it => { it.style.transform = ''; });
  d.el.classList.remove('bk-dragging');
  if(d.cur === d.idx) return;
  const ids = [...d.ids];
  const [m] = ids.splice(d.idx, 1);
  ids.splice(d.cur, 0, m);
  const jobs = [];
  ids.forEach((id, i) => {
    const b = booksCache.find(x => x.id === id);
    const so = (i + 1) * 10;
    if(b && b.sort_order !== so){ b.sort_order = so; jobs.push(sb.from('books').update({sort_order: so}).eq('id', id)); }
  });
  trDraw();
  if(!jobs.length) return;
  const res = await Promise.all(jobs);
  const bad = res.find(r => r.error);
  if(bad) showToast('تعذّر حفظ ترتيب الكتب: ' + bad.error.message, 'warn');
  else showToast('تم حفظ ترتيب الكتب ✓');
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
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="ghost" onclick="quickProgress('${b.id}')">＋ سجّل تقدّمي</button>
        <button class="ghost" data-book="${dataAttr}" onclick="openBookForm(JSON.parse(this.getAttribute('data-book')))">تعديل</button>
      </div>
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
          <input id="bkName" value="${attrEscape(b.name)}" placeholder="مثل: الآجرومية">
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
          <input id="bkCurrent" value="${attrEscape(b.current_lesson||'')}" placeholder="أي ملاحظة تحب تسجلها">
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>تاريخ البداية (اختياري)</label>
          <input id="bkStart" type="date" value="${attrEscape(b.started_at || '')}">
        </div>
        <div class="field">
          <label>تاريخ الانتهاء (اختياري)</label>
          <input id="bkEnd" type="date" value="${attrEscape(b.finished_at || '')}">
        </div>
      </div>
      <div class="hint" style="margin:-6px 0 14px">اتركهما فارغين ليُحسبا تلقائيًا من جلساتك: البداية من أول جلسة، والانتهاء من آخر جلسة عند ختم الكتاب.</div>
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
    started_at: document.getElementById('bkStart') ? document.getElementById('bkStart').value : '',
    finished_at: document.getElementById('bkEnd') ? document.getElementById('bkEnd').value : '',
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
  const sv = document.getElementById('bkStart').value;
  const fv = document.getElementById('bkEnd').value;
  if(sv && fv && fv < sv){ alert('تاريخ الانتهاء قبل تاريخ البداية'); return; }
  const existingBook = id ? booksCache.find(x => x.id === id) : null;
  if(sv || fv || (existingBook && ('started_at' in existingBook || 'finished_at' in existingBook))){
    payload.started_at = sv || null;
    payload.finished_at = fv || null;
  }
  let error;
  if(id){
    ({error} = await sb.from('books').update(payload).eq('id', id));
  } else {
    ({error} = await sb.from('books').insert(payload));
  }
  if(error){
    if(/started_at|finished_at/.test(error.message || '')){
      alert('لحفظ تاريخ البداية والنهاية أضف العمودين مرة واحدة في Supabase (SQL Editor):\n\nalter table books add column if not exists started_at date;\nalter table books add column if not exists finished_at date;\nnotify pgrst, \'reload schema\';');
    } else alert('صار خطأ: '+error.message);
    return;
  }
  document.getElementById('bookFormWrap').innerHTML = '';
  editingBookId = null;
  await loadBooks();
}

async function deleteBook(id){
  if(!confirm('حذف هذا الكتاب؟')) return;
  const book = booksCache.find(b => b.id === id);
  const linkedRes = await sb.from('entries').select('id').eq('book_id', id);
  const linked = (linkedRes.data || []).map(x => x.id);
  const {error} = await sb.from('books').delete().eq('id', id);
  if(error){ alert('صار خطأ: ' + error.message); return; }
  await loadBooks();
  if(book) showToast(`تم حذف «${book.name}»`, 'info', {label:'تراجع', onClick: () => restoreBook(book, linked)});
}

async function restoreBook(book, entryIds){
  const {subjects, ...row} = book;
  const {error} = await sb.from('books').insert(row);
  if(error){ showToast('تعذّر التراجع: ' + error.message, 'warn'); return; }
  if(entryIds.length) await sb.from('entries').update({book_id: book.id}).in('id', entryIds);
  await loadBooks();
  await loadEntries();
  showToast('تم التراجع ✓');
}
