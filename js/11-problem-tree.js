/* 11-problem-tree.js — تشجير المسائل (البادئة pt) */

/* =====================================================================
   صفحة تشجير المسائل  (البادئة pt)
   ===================================================================== */
const PT_W = 190, PT_H = 52, PT_X = 250, PT_Y = 84;
const PT_ZMIN = 0.12, PT_ZMAX = 2.5;

/* ---------- دوال نقية (قابلة للاختبار) ---------- */

function ptFormat(src){
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', list = false, para = [];
  const flushP = () => { if(para.length){ html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
  const closeL = () => { if(list){ html += '</ul>'; list = false; } };
  for(const raw of lines){
    const l = raw.trimEnd();
    let m;
    if(!l.trim()){ flushP(); closeL(); continue; }
    if((m = l.match(/^(#{1,3})\s+(.+)$/))){ flushP(); closeL(); const lv = m[1].length + 2; html += `<h${lv}>${inline(m[2])}</h${lv}>`; }
    else if((m = l.match(/^\s*[-*•]\s+(.+)$/))){ flushP(); if(!list){ html += '<ul>'; list = true; } html += '<li>' + inline(m[1]) + '</li>'; }
    else if((m = l.match(/^>\s?(.*)$/))){ flushP(); closeL(); html += '<blockquote>' + inline(m[1]) + '</blockquote>'; }
    else { closeL(); para.push(l); }
  }
  flushP(); closeL();
  return html;
}

// يبني فهرس الأبناء والجذور والعقد الظاهرة (غير المخفية بطيّ أحد الآباء)
function ptBuildIndex(nodes){
  const kids = new Map(), roots = [];
  nodes.forEach(n => {
    if(n.parent_id && nodes.has(n.parent_id)){
      if(!kids.has(n.parent_id)) kids.set(n.parent_id, []);
      kids.get(n.parent_id).push(n.id);
    } else roots.push(n.id);
  });
  const ord = (a, b) => {
    const A = nodes.get(a), B = nodes.get(b);
    return ((A.sort_order | 0) - (B.sort_order | 0)) || (A.y - B.y) || String(A.id).localeCompare(String(B.id));
  };
  kids.forEach(l => l.sort(ord));
  roots.sort(ord);
  const vis = [], seen = new Set(), stack = roots.slice().reverse();
  while(stack.length){
    const id = stack.pop();
    if(seen.has(id)) continue;
    seen.add(id); vis.push(id);
    const n = nodes.get(id);
    if(!n.collapsed){
      const l = kids.get(id);
      if(l) for(let i = l.length - 1; i >= 0; i--) stack.push(l[i]);
    }
  }
  return {kids, roots, vis};
}

function ptDescendants(kids, id){
  const out = [], stack = (kids.get(id) || []).slice(), seen = new Set([id]);
  while(stack.length){
    const c = stack.pop();
    if(seen.has(c)) continue;
    seen.add(c); out.push(c);
    (kids.get(c) || []).forEach(x => stack.push(x));
  }
  return out;
}

// ترتيب تلقائي: الجذر في اليمين والأبناء يمتدون يساراً، مع الحفاظ على الترتيب الرأسي الحالي بين الأشقاء
function ptTidy(nodes, kids, roots, rootX){
  const pos = new Map();
  let leaf = 0;
  const sorted = id => (kids.get(id) || []).slice().sort((a, b) => {
    const A = nodes.get(a), B = nodes.get(b);
    return (A.y - B.y) || ((A.sort_order | 0) - (B.sort_order | 0));
  });
  roots.forEach(r => {
    const stack = [{id:r, depth:0, list:sorted(r), ci:0, ys:[]}];
    const seen = new Set([r]);
    while(stack.length){
      const t = stack[stack.length - 1];
      if(t.ci < t.list.length){
        const c = t.list[t.ci++];
        if(seen.has(c)) continue;
        seen.add(c);
        stack.push({id:c, depth:t.depth + 1, list:sorted(c), ci:0, ys:[]});
      } else {
        stack.pop();
        const y = t.ys.length ? (t.ys[0] + t.ys[t.ys.length - 1]) / 2 : (leaf++) * PT_Y;
        pos.set(t.id, {x: rootX - t.depth * PT_X, y});
        if(stack.length) stack[stack.length - 1].ys.push(y);
      }
    }
    leaf += 0.5;
  });
  return pos;
}

function ptEdgePath(p, c){
  const sy = p.y + PT_H / 2, ey = c.y + PT_H / 2;
  let sx, ex;
  if(c.x < p.x){ sx = p.x; ex = c.x + PT_W; } else { sx = p.x + PT_W; ex = c.x; }
  const d = Math.max(40, Math.abs(ex - sx) / 2) * (ex < sx ? -1 : 1);
  return `M${sx} ${sy}C${sx + d} ${sy} ${ex - d} ${ey} ${ex} ${ey}`;
}

function ptUuid(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}

/* ---------- الحالة ---------- */

const PT = {
  trees:null, tree:null, nodes:new Map(), kids:new Map(), roots:[], vis:[],
  meta:new Map(), infoRows:new Map(), saved:new Set(), dirty:new Set(),
  sel:null, editing:null, editFresh:false, pan:{x:0, y:0}, zoom:1,
  panelOpen:false, panelTab:'definition', detailEdit:null, noteForm:null, openNotes:new Set(),
  chain:Promise.resolve(), t:0, vt:0, raf:0, viewDirty:false, status:'saved', warned:false,
  ptrs:new Map(), g:null, dragSub:true, infoTimers:{}
};

function ptFmtDate(s){
  try{
    const d = new Date(s);
    return d.toLocaleDateString('ar-u-nu-latn', {year:'numeric', month:'short', day:'numeric'}) + ' · ' + d.toLocaleTimeString('ar-u-nu-latn', {hour:'2-digit', minute:'2-digit'});
  }catch(e){ return ''; }
}
function ptRoot(){ return document.getElementById('ptreeView'); }
function ptErr(e){ return (e && (e.message || e.details)) || String(e); }
async function ptFetchAll(table, cols, build){
  const out = [];
  for(let from = 0; ; from += 1000){
    let q = sb.from(table).select(cols);
    if(build) q = build(q);
    q = q.order('id');
    const {data, error} = await q.range(from, from + 999);
    if(error) throw error;
    out.push(...(data || []));
    if(!data || data.length < 1000) break;
  }
  return out;
}

function openPtree(){
  if(PT.tree && document.getElementById('ptWs')){ ptDraw(); return; }
  ptHome();
}

/* ---------- قائمة الأشجار ---------- */

async function ptHome(){
  const root = ptRoot();
  if(!root) return;
  PT.tree = null;
  root.innerHTML = '<div class="empty">جاري التحميل…</div>';
  try{
    let res = await sb.from('pt_trees').select('id,name,created_at,updated_at,pt_nodes(count)').order('updated_at', {ascending:false});
    if(res.error) res = await sb.from('pt_trees').select('id,name,created_at,updated_at').order('updated_at', {ascending:false});
    if(res.error) throw res.error;
    PT.trees = res.data || [];
    const cards = PT.trees.map(t => {
      const n = Array.isArray(t.pt_nodes) && t.pt_nodes[0] ? t.pt_nodes[0].count : null;
      return `<div class="pt-card pt-tcard">
        <div onclick="ptOpen('${t.id}')"><b>${escapeHtml(t.name)}</b>
        <span class="pt-sub">${n != null ? n + ' عقدة · ' : ''}آخر تعديل ${ptFmtDate(t.updated_at)}</span></div>
        <div class="pt-tact"><button class="ghost" onclick="ptOpen('${t.id}')">فتح</button><button class="ghost" onclick="ptRenameTree('${t.id}')">إعادة تسمية</button><button class="ghost" onclick="ptDeleteTree('${t.id}')">حذف</button></div></div>`;
    }).join('');
    root.innerHTML = `<div class="pt-head"><h2>تشجير المسائل</h2><button class="primary" onclick="ptNewTree()">＋ شجرة جديدة</button></div>
      <p class="pt-hint">أنشئ شجرة وسمّها، ثم ابنِ عقدها وفروعها بنفسك وأضف التعريف والتفصيل والملاحظات لكل عقدة.</p>
      ${PT.trees.length ? `<div class="pt-grid">${cards}</div>` : '<div class="empty">لا توجد أشجار بعد. ابدأ بإنشاء شجرتك الأولى.</div>'}`;
  }catch(e){
    root.innerHTML = `<div class="empty">تعذّر التحميل: ${escapeHtml(ptErr(e))}<br><br>إن لم تكن شغّلت ملف SQL الخاص بالتشجير في Supabase فشغّله أولاً.<br><br><button class="primary" onclick="ptHome()">إعادة المحاولة</button></div>`;
  }
}

async function ptNewTree(){
  const name = (prompt('اسم الشجرة الجديدة:') || '').trim();
  if(!name) return;
  const {data, error} = await sb.from('pt_trees').insert({name: name.slice(0, 200)}).select().single();
  if(error){ showToast('تعذّر إنشاء الشجرة: ' + ptErr(error), 'warn'); return; }
  await ptOpen(data.id);
}
async function ptRenameTree(id){
  const t = (PT.trees || []).find(x => x.id === id) || PT.tree;
  const name = (prompt('الاسم الجديد للشجرة:', t ? t.name : '') || '').trim();
  if(!name) return;
  const {error} = await sb.from('pt_trees').update({name: name.slice(0, 200), updated_at: new Date().toISOString()}).eq('id', id);
  if(error){ showToast('تعذّرت إعادة التسمية: ' + ptErr(error), 'warn'); return; }
  if(PT.tree && PT.tree.id === id){ PT.tree.name = name.slice(0, 200); const el = document.getElementById('ptName'); if(el) el.textContent = PT.tree.name; }
  else ptHome();
}
async function ptDeleteTree(id){
  const t = (PT.trees || []).find(x => x.id === id);
  if(!confirm(`حذف شجرة «${t ? t.name : ''}» بكل عقدها ومعلوماتها نهائياً؟`)) return;
  const {error} = await sb.from('pt_trees').delete().eq('id', id);
  if(error){ showToast('تعذّر الحذف: ' + ptErr(error), 'warn'); return; }
  ptHome();
}

/* ---------- فتح شجرة ---------- */

async function ptOpen(id){
  const root = ptRoot();
  root.innerHTML = '<div class="empty">جاري فتح الشجرة…</div>';
  try{
    const tr = await sb.from('pt_trees').select('*').eq('id', id).single();
    if(tr.error) throw tr.error;
    const nodes = await ptFetchAll('pt_nodes', '*', q => q.eq('tree_id', id));
    const infos = await ptFetchAll('pt_infos', 'id,node_id,kind', q => q.eq('tree_id', id));
    PT.tree = tr.data;
    PT.nodes = new Map(nodes.map(n => [n.id, {id:n.id, tree_id:n.tree_id, parent_id:n.parent_id, title:n.title, x:Number(n.x), y:Number(n.y), collapsed:!!n.collapsed, sort_order:n.sort_order | 0}]));
    PT.saved = new Set(PT.nodes.keys());
    PT.dirty = new Set(); PT.meta = new Map(); PT.infoRows = new Map();
    infos.forEach(r => {
      const m = PT.meta.get(r.node_id) || {definition:false, detail:false, notes:0};
      if(r.kind === 'note') m.notes++; else m[r.kind] = true;
      PT.meta.set(r.node_id, m);
    });
    PT.sel = null; PT.editing = null; PT.panelOpen = false; PT.status = 'saved'; PT.warned = false; PT.g = null; PT.ptrs.clear();
    ptRender();
    const v = PT.tree.view || {};
    if(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && v.z > 0){ PT.pan = {x:v.x, y:v.y}; PT.zoom = Math.min(PT_ZMAX, Math.max(PT_ZMIN, v.z)); ptDraw(); }
    else ptFit();
  }catch(e){
    root.innerHTML = `<div class="empty">تعذّر فتح الشجرة: ${escapeHtml(ptErr(e))}<br><br><button class="ghost" onclick="ptHome()">رجوع</button></div>`;
  }
}

function ptRender(){
  ptRebuild();
  ptRoot().innerHTML = `
    <div class="pt-top">
      <button class="ghost" onclick="ptBack()">← الأشجار</button>
      <b id="ptName">${escapeHtml(PT.tree.name)}</b>
      <button class="ghost" onclick="ptRenameTree('${PT.tree.id}')" title="إعادة تسمية الشجرة">✎</button>
      <span class="pt-save" id="ptSave"></span>
    </div>
    <div class="pt-tools" id="ptTools">
      <button class="ghost" onclick="ptAddRoot()">＋ عقدة رئيسية</button>
      <button class="ghost" data-need="1" onclick="ptAddChild()">＋ فرع</button>
      <button class="ghost" data-need="1" onclick="ptAddSibling()">＋ شقيقة</button>
      <button class="ghost" data-need="1" onclick="ptRenameSel()">تسمية</button>
      <button class="ghost" data-need="1" onclick="ptMoveSel()">نقل إلى فرع</button>
      <button class="ghost" data-need="1" onclick="ptToggleSel()">طيّ / فتح</button>
      <button class="ghost" data-need="1" onclick="ptDeleteSel()">حذف</button>
      <button class="ghost" onclick="ptTidyAll()">ترتيب تلقائي</button>
      <label class="focus-check pt-chk"><input type="checkbox" id="ptSub" checked onchange="PT.dragSub=this.checked"> تحريك الفرع كاملاً</label>
    </div>
    <div class="pt-ws" id="ptWs">
      <div class="pt-world" id="ptWorld"><svg class="pt-edges" id="ptEdges" width="1" height="1"></svg><div id="ptNodes"></div></div>
      <div class="pt-zoom"><button class="ghost" onclick="ptZoomBtn(1.25)" title="تكبير">＋</button><button class="ghost" onclick="ptZoomBtn(0.8)" title="تصغير">−</button><button class="ghost" onclick="ptFit()" title="ملاءمة">⤢</button></div>
      <div class="pt-emptyhint" id="ptHint" hidden>مساحة العمل فارغة. اضغط «＋ عقدة رئيسية» للبدء.</div>
      <aside class="pt-panel" id="ptPanel" hidden></aside>
    </div>
    <p class="pt-hint">اسحب الخلفية للتحريك، وعجلة الفأرة أو القرص بإصبعين للتكبير. اسحب العقدة لتحريكها، وانقر مرتين لتسميتها.</p>`;
  ptBind();
  ptSetStatus(PT.status);
  ptToolsSync();
}

async function ptBack(){
  ptCommitEdit();
  clearTimeout(PT.t);
  await ptFlush();
  PT.tree = null;
  ptHome();
}

/* ---------- الفهرس والرسم ---------- */

function ptRebuild(){
  const ix = ptBuildIndex(PT.nodes);
  PT.kids = ix.kids; PT.roots = ix.roots; PT.vis = ix.vis;
}
function ptScheduleDraw(){ if(!PT.raf) PT.raf = requestAnimationFrame(ptDraw); }

function ptNodeHtml(n){
  const m = PT.meta.get(n.id) || {};
  const kids = PT.kids.get(n.id) || [];
  const tags = (m.definition ? `<button class="pt-tag" data-act="definition" data-id="${n.id}" title="التعريف">تعريف</button>` : '')
    + (m.detail ? `<button class="pt-tag" data-act="detail" data-id="${n.id}" title="تفصيل المسألة في الكتاب">تفصيل</button>` : '')
    + (m.notes ? `<button class="pt-tag" data-act="notes" data-id="${n.id}" title="الملاحظات">ملاحظات ${m.notes}</button>` : '');
  const title = PT.editing === n.id
    ? `<input class="pt-edit" maxlength="300" value="${attrEscape(n.title)}" onkeydown="ptEditKey(event)" onblur="ptCommitEdit()">`
    : `<div class="pt-title">${escapeHtml(n.title || 'بلا اسم')}</div>`;
  const tog = kids.length ? `<button class="pt-tog" data-act="toggle" data-id="${n.id}" title="${n.collapsed ? 'فتح الفرع' : 'طيّ الفرع'}">${n.collapsed ? '+' + ptCountDesc(n.id) : '−'}</button>` : '';
  const strip = (PT.sel === n.id && PT.editing !== n.id)
    ? `<div class="pt-addinfo"><button data-act="definition" data-id="${n.id}">التعريف</button><button data-act="detail" data-id="${n.id}">التفصيل</button><button data-act="notes" data-id="${n.id}">الملاحظات</button></div>` : '';
  return `<div class="pt-node${PT.sel === n.id ? ' sel' : ''}${n.collapsed ? ' col' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">${title}${tog}${tags ? `<div class="pt-tags">${tags}</div>` : ''}${strip}</div>`;
}
function ptCountDesc(id){ return ptDescendants(PT.kids, id).length; }

function ptDraw(){
  PT.raf = 0;
  PT.drawing = true;
  try{ ptDrawInner(); } finally { PT.drawing = false; }
}
function ptDrawInner(){
  const ws = document.getElementById('ptWs'), world = document.getElementById('ptWorld');
  if(!ws || !world || !PT.tree) return;
  const z = PT.zoom, w = ws.clientWidth, h = ws.clientHeight;
  world.style.transform = `translate(${PT.pan.x}px,${PT.pan.y}px) scale(${z})`;
  const x0 = -PT.pan.x / z - PT_W, y0 = -PT.pan.y / z - PT_H, x1 = (w - PT.pan.x) / z + PT_W, y1 = (h - PT.pan.y) / z + PT_H;
  const inRect = n => n.x <= x1 && n.x + PT_W >= x0 && n.y <= y1 && n.y + PT_H >= y0;
  let nh = '', eh = '';
  for(const id of PT.vis){
    const n = PT.nodes.get(id);
    const inside = inRect(n);
    if(inside) nh += ptNodeHtml(n);
    if(n.parent_id){
      const p = PT.nodes.get(n.parent_id);
      if(p && (inside || inRect(p))) eh += `<path d="${ptEdgePath(p, n)}"/>`;
    }
  }
  document.getElementById('ptEdges').innerHTML = eh;
  document.getElementById('ptNodes').innerHTML = nh;
  const hint = document.getElementById('ptHint');
  if(hint) hint.hidden = PT.nodes.size > 0;
  if(PT.editing){
    const inp = ws.querySelector('.pt-edit');
    if(inp){ inp.focus(); if(PT.editFresh){ inp.select(); PT.editFresh = false; } }
  }
}

function ptUsable(){
  const ws = document.getElementById('ptWs'), pn = document.getElementById('ptPanel');
  const u = {x0:0, y0:0, x1:ws.clientWidth, y1:ws.clientHeight};
  if(PT.panelOpen && pn && !pn.hidden){
    if(window.innerWidth > 700) u.x0 = pn.offsetWidth; else u.y1 = Math.max(120, ws.clientHeight - pn.offsetHeight);
  }
  return u;
}
function ptFit(){
  const ws = document.getElementById('ptWs');
  if(!ws) return;
  const list = PT.vis.map(id => PT.nodes.get(id));
  const u = ptUsable();
  if(!list.length){ PT.pan = {x: (u.x0 + u.x1) / 2 - PT_W / 2, y: (u.y0 + u.y1) / 2 - PT_H / 2}; PT.zoom = 1; ptDraw(); ptViewChanged(); return; }
  const minX = Math.min(...list.map(n => n.x)), maxX = Math.max(...list.map(n => n.x + PT_W));
  const minY = Math.min(...list.map(n => n.y)), maxY = Math.max(...list.map(n => n.y + PT_H));
  const w = (u.x1 - u.x0) || 800, h = (u.y1 - u.y0) || 500;
  const z = Math.min(PT_ZMAX, Math.max(PT_ZMIN, Math.min(w / (maxX - minX + 80), h / (maxY - minY + 100), 1.2)));
  PT.zoom = z;
  PT.pan = {x: u.x0 + (w - (maxX - minX) * z) / 2 - minX * z, y: u.y0 + (h - (maxY - minY) * z) / 2 - minY * z};
  ptDraw(); ptViewChanged();
}
function ptCenterOn(n){
  const ws = document.getElementById('ptWs');
  if(!ws) return;
  const u = ptUsable();
  const z = PT.zoom, sx = n.x * z + PT.pan.x, sy = n.y * z + PT.pan.y;
  if(sx < u.x0 + 20 || sy < u.y0 + 20 || sx + PT_W * z > u.x1 - 20 || sy + (PT_H + 40) * z > u.y1 - 10){
    PT.pan = {x: (u.x0 + u.x1) / 2 - (n.x + PT_W / 2) * z, y: (u.y0 + u.y1) / 2 - (n.y + PT_H / 2) * z};
    ptViewChanged();
  }
}
function ptZoomAt(cx, cy, f){
  const ws = document.getElementById('ptWs');
  const r = ws.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const nz = Math.min(PT_ZMAX, Math.max(PT_ZMIN, PT.zoom * f));
  const k = nz / PT.zoom;
  PT.pan = {x: px - (px - PT.pan.x) * k, y: py - (py - PT.pan.y) * k};
  PT.zoom = nz;
  ptScheduleDraw(); ptViewChanged();
}
function ptZoomBtn(f){
  const ws = document.getElementById('ptWs'), r = ws.getBoundingClientRect();
  ptZoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

/* ---------- التفاعل: سحب، تكبير، نقر ---------- */

function ptBind(){
  const ws = document.getElementById('ptWs');
  ws.addEventListener('pointerdown', ptDown);
  ws.addEventListener('pointermove', ptMove);
  ws.addEventListener('pointerup', ptUp);
  ws.addEventListener('pointercancel', ptUp);
  ws.addEventListener('wheel', ptWheel, {passive:false});
  ws.addEventListener('dblclick', ptDbl);
  ws.addEventListener('click', ptClick);
}
function ptNodeAt(e){
  let el = e.target.closest ? e.target.closest('.pt-node') : null;
  if(!el){ const t = document.elementFromPoint(e.clientX, e.clientY); el = t && t.closest ? t.closest('.pt-node') : null; }
  return el ? el.dataset.id : null;
}
function ptDown(e){
  if(e.target.closest('.pt-panel, .pt-zoom, .pt-edit')) return;
  if(PT.editing) ptCommitEdit();
  if(e.target.closest('[data-act]')) return;
  const ws = document.getElementById('ptWs');
  PT.ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(PT.ptrs.size === 2){
    const [a, b] = [...PT.ptrs.values()];
    PT.g = {type:'pinch', d:Math.hypot(a.x - b.x, a.y - b.y) || 1, z:PT.zoom, px:PT.pan.x, py:PT.pan.y, mx:(a.x + b.x) / 2, my:(a.y + b.y) / 2};
    return;
  }
  const id = ptNodeAt(e);
  if(id){
    ptSelect(id);
    PT.g = {type:'node', id, sx:e.clientX, sy:e.clientY, moved:false, ids:null, start:null};
  } else {
    PT.g = {type:'pan', sx:e.clientX, sy:e.clientY, px:PT.pan.x, py:PT.pan.y, moved:false};
  }
  try{ ws.setPointerCapture(e.pointerId); }catch(err){}
}
function ptMove(e){
  const g = PT.g;
  if(PT.ptrs.has(e.pointerId)) PT.ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(!g) return;
  if(g.type === 'pinch'){
    if(PT.ptrs.size < 2) return;
    const [a, b] = [...PT.ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const r = document.getElementById('ptWs').getBoundingClientRect();
    const nz = Math.min(PT_ZMAX, Math.max(PT_ZMIN, g.z * d / g.d));
    const k = nz / g.z;
    const cx = g.mx - r.left, cy = g.my - r.top;
    PT.zoom = nz;
    PT.pan = {x: (mx - r.left) - (cx - g.px) * k, y: (my - r.top) - (cy - g.py) * k};
    ptScheduleDraw(); ptViewChanged();
    return;
  }
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if(!g.moved && Math.hypot(dx, dy) < 5) return;
  g.moved = true;
  if(g.type === 'pan'){
    PT.pan = {x: g.px + dx, y: g.py + dy};
    ptScheduleDraw();
  } else if(g.type === 'node'){
    if(!g.ids){
      g.ids = (PT.dragSub && !e.shiftKey) ? [g.id, ...ptDescendants(PT.kids, g.id)] : [g.id];
      g.start = g.ids.map(id => { const n = PT.nodes.get(id); return {id, x:n.x, y:n.y}; });
    }
    const z = PT.zoom;
    g.start.forEach(s => { const n = PT.nodes.get(s.id); if(n){ n.x = Math.round((s.x + dx / z) * 10) / 10; n.y = Math.round((s.y + dy / z) * 10) / 10; } });
    ptScheduleDraw();
  }
}
function ptUp(e){
  PT.ptrs.delete(e.pointerId);
  const g = PT.g;
  try{ document.getElementById('ptWs').releasePointerCapture(e.pointerId); }catch(err){}
  if(!g) return;
  if(g.type === 'pinch'){ if(PT.ptrs.size < 2) PT.g = null; return; }
  PT.g = null;
  if(g.type === 'node' && g.moved && g.ids) ptMarkDirty(g.ids);
  if(g.type === 'pan'){
    if(g.moved) ptViewChanged();
    else { ptSelect(null); }
  }
}
function ptWheel(e){
  if(e.target.closest('.pt-panel')) return;
  e.preventDefault();
  if(PT.editing) ptCommitEdit();
  ptZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}
function ptDbl(e){
  if(e.target.closest('.pt-panel, .pt-zoom, [data-act]')) return;
  const id = ptNodeAt(e);
  if(id) ptStartEdit(id);
}
function ptClick(e){
  const b = e.target.closest('[data-act]');
  if(!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if(act === 'toggle'){ ptToggle(id); return; }
  ptOpenPanel(id, act);
}

function ptSelect(id){
  const prev = PT.sel;
  PT.sel = id;
  if(id !== prev) ptDraw();
  ptToolsSync();
  if(PT.panelOpen){
    if(id){ if(id !== prev){ PT.detailEdit = null; PT.noteForm = null; ptOpenPanel(id, PT.panelTab, true); } }
    else ptClosePanel();
  }
}
function ptToolsSync(){
  document.querySelectorAll('#ptTools [data-need]').forEach(b => { b.disabled = !PT.sel; });
}

/* ---------- حفظ تلقائي ---------- */

function ptSetStatus(s){
  PT.status = s;
  const el = document.getElementById('ptSave');
  if(!el) return;
  el.textContent = {saved:'محفوظ ✓', pending:'تعديلات قيد الحفظ…', saving:'جارٍ الحفظ…', error:'تعذّر الحفظ — سنعيد المحاولة'}[s] || '';
  el.className = 'pt-save ' + s;
}
function ptMarkDirty(ids){
  ids.forEach(id => { if(PT.nodes.has(id)) PT.dirty.add(id); });
  if(PT.dirty.size) ptSetStatus('pending');
  clearTimeout(PT.t);
  PT.t = setTimeout(ptFlush, 800);
}
function ptViewChanged(){
  PT.viewDirty = true;
  clearTimeout(PT.vt);
  PT.vt = setTimeout(ptFlush, 1500);
}
function ptFlush(){
  PT.chain = PT.chain.then(ptFlushNow).catch(() => {});
  return PT.chain;
}
async function ptFlushNow(){
  if(!PT.tree) return;
  const treeId = PT.tree.id;
  const ids = [...PT.dirty];
  PT.dirty.clear();
  const nodes = ids.map(id => PT.nodes.get(id)).filter(Boolean);
  const wantView = PT.viewDirty;
  if(!nodes.length && !wantView){ if(!PT.dirty.size && PT.status !== 'saved') ptSetStatus('saved'); return; }
  if(nodes.length) ptSetStatus('saving');
  const row = n => ({id:n.id, tree_id:n.tree_id, parent_id:n.parent_id, title:n.title, x:Math.round(n.x * 10) / 10, y:Math.round(n.y * 10) / 10, collapsed:!!n.collapsed, sort_order:n.sort_order | 0});
  const depth = n => { let d = 0, c = n, g = 0; while(c && c.parent_id && g++ < 100000){ c = PT.nodes.get(c.parent_id); if(c) d++; } return d; };
  try{
    const fresh = nodes.filter(n => !PT.saved.has(n.id)), old = nodes.filter(n => PT.saved.has(n.id));
    const byDepth = new Map();
    fresh.forEach(n => { const d = depth(n); if(!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(n); });
    for(const d of [...byDepth.keys()].sort((a, b) => a - b)){
      const arr = byDepth.get(d);
      for(let i = 0; i < arr.length; i += 200){
        const chunk = arr.slice(i, i + 200);
        const {error} = await sb.from('pt_nodes').upsert(chunk.map(row), {onConflict:'id'});
        if(error) throw error;
        chunk.forEach(n => PT.saved.add(n.id));
      }
    }
    for(let i = 0; i < old.length; i += 200){
      const {error} = await sb.from('pt_nodes').upsert(old.slice(i, i + 200).map(row), {onConflict:'id'});
      if(error) throw error;
    }
    PT.viewDirty = false;
    const patch = {updated_at: new Date().toISOString(), view: {x:Math.round(PT.pan.x), y:Math.round(PT.pan.y), z:Math.round(PT.zoom * 1000) / 1000}};
    const {error: e2} = await sb.from('pt_trees').update(patch).eq('id', treeId);
    if(e2) throw e2;
    PT.warned = false;
    ptSetStatus(PT.dirty.size ? 'pending' : 'saved');
  }catch(e){
    ids.forEach(id => { if(PT.nodes.has(id)) PT.dirty.add(id); });
    ptSetStatus('error');
    if(!PT.warned){ PT.warned = true; showToast('تعذّر حفظ الشجرة: ' + ptErr(e), 'warn'); }
    clearTimeout(PT.t);
    PT.t = setTimeout(ptFlush, 5000);
  }
}
window.addEventListener('beforeunload', e => { if(PT.tree && (PT.dirty.size || PT.status === 'error')){ e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if(document.hidden && PT.tree && PT.dirty.size) ptFlush(); });

/* ---------- العقد: إضافة، تسمية، حذف، نقل ---------- */

function ptChildSpot(parent){
  const sibs = (PT.kids.get(parent.id) || []).map(id => PT.nodes.get(id));
  return {x: parent.x - PT_X, y: sibs.length ? Math.max(...sibs.map(s => s.y)) + PT_Y : parent.y};
}
function ptRootSpot(){
  const all = [...PT.nodes.values()];
  if(!all.length) return {x:0, y:0};
  const first = PT.nodes.get(PT.roots[0]);
  return {x: first ? first.x : 0, y: Math.max(...all.map(n => n.y)) + PT_Y + 28};
}
function ptNextOrder(parentId){
  const sibs = parentId ? (PT.kids.get(parentId) || []) : PT.roots;
  return sibs.reduce((m, id) => Math.max(m, (PT.nodes.get(id).sort_order | 0)), 0) + 1;
}
function ptAddNode(parentId){
  ptCommitEdit();
  const parent = parentId ? PT.nodes.get(parentId) : null;
  const spot = parent ? ptChildSpot(parent) : ptRootSpot();
  const n = {id:ptUuid(), tree_id:PT.tree.id, parent_id:parentId || null, title:'عقدة جديدة', x:spot.x, y:spot.y, collapsed:false, sort_order:ptNextOrder(parentId)};
  PT.nodes.set(n.id, n);
  const dirty = [n.id];
  if(parent && parent.collapsed){ parent.collapsed = false; dirty.push(parent.id); }
  ptRebuild();
  PT.sel = n.id; PT.editing = n.id; PT.editFresh = true;
  ptMarkDirty(dirty);
  ptCenterOn(n);
  ptDraw();
  ptToolsSync();
}
function ptAddRoot(){ ptAddNode(null); }
function ptAddChild(){ if(PT.sel) ptAddNode(PT.sel); }
function ptAddSibling(){ if(PT.sel){ const n = PT.nodes.get(PT.sel); ptAddNode(n ? n.parent_id : null); } }
function ptStartEdit(id){
  if(!PT.nodes.has(id)) return;
  PT.sel = id; PT.editing = id; PT.editFresh = true;
  ptDraw(); ptToolsSync();
}
function ptRenameSel(){ if(PT.sel) ptStartEdit(PT.sel); }
function ptEditKey(e){
  if(e.key === 'Enter'){ e.preventDefault(); ptCommitEdit(); }
  else if(e.key === 'Escape'){ e.preventDefault(); PT.editing = null; ptDraw(); }
}
function ptCommitEdit(){
  const id = PT.editing;
  if(!id || PT.drawing) return;
  const inp = document.querySelector('#ptNodes .pt-edit');
  PT.editing = null;
  const n = PT.nodes.get(id);
  const val = inp ? inp.value.trim().slice(0, 300) : '';
  if(n && val && val !== n.title){
    n.title = val;
    ptMarkDirty([id]);
    const h = document.getElementById('ptPTitle');
    if(h && PT.sel === id) h.textContent = val;
  }
  ptDraw();
}
function ptToggle(id){
  const n = PT.nodes.get(id);
  if(!n || !(PT.kids.get(id) || []).length) return;
  n.collapsed = !n.collapsed;
  ptRebuild(); ptMarkDirty([id]); ptDraw();
}
function ptToggleSel(){ if(PT.sel) ptToggle(PT.sel); }

function ptDeleteSel(){
  const id = PT.sel, n = PT.nodes.get(id);
  if(!n) return;
  const desc = ptDescendants(PT.kids, id);
  const msg = desc.length
    ? `حذف «${n.title}» مع ${desc.length} من فروعها وكل التعريفات والتفصيلات والملاحظات المرتبطة بها؟`
    : `حذف «${n.title}» وكل ما يرتبط بها من معلومات؟`;
  if(!confirm(msg)) return;
  ptCommitEdit();
  const all = [id, ...desc];
  all.forEach(x => { PT.nodes.delete(x); PT.dirty.delete(x); PT.meta.delete(x); PT.infoRows.delete(x); PT.saved.delete(x); });
  PT.sel = null;
  if(PT.panelOpen) ptClosePanel();
  ptRebuild(); ptDraw(); ptToolsSync();
  const treeId = PT.tree.id;
  PT.chain = PT.chain.then(async () => {
    const {error} = await sb.from('pt_nodes').delete().eq('id', id);
    if(error){ showToast('تعذّر حذف العقدة: ' + ptErr(error), 'warn'); if(PT.tree && PT.tree.id === treeId) ptOpen(treeId); }
    else if(PT.tree) { await sb.from('pt_trees').update({updated_at: new Date().toISOString()}).eq('id', treeId); }
  }).catch(() => {});
}

function ptMoveSel(){
  const id = PT.sel, n = PT.nodes.get(id);
  if(!n) return;
  ptCommitEdit();
  const banned = new Set([id, ...ptDescendants(PT.kids, id)]);
  const depthOf = x => { let d = 0, c = PT.nodes.get(x), g = 0; while(c && c.parent_id && g++ < 100000){ c = PT.nodes.get(c.parent_id); d++; } return d; };
  const cand = [];
  const walk = [...PT.roots].reverse();
  const seen = new Set();
  while(walk.length){
    const x = walk.pop();
    if(seen.has(x) || banned.has(x)) continue;
    seen.add(x);
    cand.push({id:x, d:depthOf(x), t:PT.nodes.get(x).title});
    const l = PT.kids.get(x) || [];
    for(let i = l.length - 1; i >= 0; i--) walk.push(l[i]);
  }
  PT.moveCand = cand;
  const m = document.createElement('div');
  m.className = 'pt-modal'; m.id = 'ptModal';
  m.innerHTML = `<div class="pt-mbox"><h3>نقل «${escapeHtml(n.title)}» إلى…</h3>
    <input type="text" id="ptMq" placeholder="ابحث عن العقدة" oninput="ptMoveFilter()">
    <div class="pt-mlist" id="ptMlist"></div>
    <div class="pt-bar"><button class="ghost" onclick="ptMoveTo(null)">جعلها عقدة رئيسية</button><button class="ghost" onclick="ptMoveClose()">إلغاء</button></div></div>`;
  document.body.appendChild(m);
  ptMoveFilter();
}
function ptMoveFilter(){
  const q = (document.getElementById('ptMq').value || '').trim();
  const list = PT.moveCand.filter(c => !q || c.t.includes(q)).slice(0, 300);
  document.getElementById('ptMlist').innerHTML = list.length
    ? list.map(c => `<button class="pt-mi" style="padding-inline-start:${10 + Math.min(c.d, 12) * 14}px" onclick="ptMoveTo('${c.id}')">${escapeHtml(c.t || 'بلا اسم')}</button>`).join('')
    : '<div class="pt-hint">لا توجد عقدة مطابقة.</div>';
}
function ptMoveClose(){ const m = document.getElementById('ptModal'); if(m) m.remove(); PT.moveCand = null; }
function ptMoveTo(parentId){
  const id = PT.sel, n = PT.nodes.get(id);
  ptMoveClose();
  if(!n) return;
  if(parentId){
    const banned = new Set([id, ...ptDescendants(PT.kids, id)]);
    if(banned.has(parentId) || !PT.nodes.has(parentId)) return;
  }
  const parent = parentId ? PT.nodes.get(parentId) : null;
  if((n.parent_id || null) === (parentId || null)){ showToast('العقدة موضوعة في هذا الفرع أصلاً'); return; }
  const spot = parent ? ptChildSpot(parent) : ptRootSpot();
  const dx = spot.x - n.x, dy = spot.y - n.y;
  const ids = [id, ...ptDescendants(PT.kids, id)];
  ids.forEach(x => { const m = PT.nodes.get(x); m.x += dx; m.y += dy; });
  n.parent_id = parentId || null;
  n.sort_order = ptNextOrder(parentId);
  const dirty = ids.slice();
  if(parent && parent.collapsed){ parent.collapsed = false; dirty.push(parent.id); }
  ptRebuild(); ptMarkDirty(dirty); ptCenterOn(n); ptDraw();
}

function ptTidyAll(){
  if(!PT.nodes.size) return;
  if(!confirm('سيُعاد ترتيب مواضع كل العقد تلقائياً مع بقاء الفروع والمعلومات كما هي. متابعة؟')) return;
  ptCommitEdit();
  const first = PT.nodes.get(PT.roots[0]);
  const pos = ptTidy(PT.nodes, PT.kids, PT.roots, first ? first.x : 0);
  const baseY = Math.min(...[...PT.nodes.values()].map(n => n.y));
  pos.forEach((p, id) => { const n = PT.nodes.get(id); if(n){ n.x = p.x; n.y = p.y + baseY; } });
  ptMarkDirty([...pos.keys()]);
  ptFit();
}

/* ---------- اللوحة الجانبية: التعريف والتفصيل والملاحظات ---------- */

async function ptLoadInfos(nodeId){
  if(PT.infoRows.has(nodeId)) return PT.infoRows.get(nodeId);
  const {data, error} = await sb.from('pt_infos').select('*').eq('node_id', nodeId).order('sort_order').order('created_at');
  if(error) throw error;
  const rec = {definition:null, detail:null, notes:[]};
  (data || []).forEach(r => {
    if(r.kind === 'note') rec.notes.push({id:r.id, title:r.title, body:r.body});
    else rec[r.kind] = {id:r.id, body:r.body};
  });
  PT.infoRows.set(nodeId, rec);
  return rec;
}
function ptSyncMeta(nodeId){
  const rec = PT.infoRows.get(nodeId);
  if(!rec) return;
  PT.meta.set(nodeId, {definition:!!rec.definition, detail:!!rec.detail, notes:rec.notes.length});
  ptScheduleDraw();
}
async function ptOpenPanel(nodeId, tab, force){
  if(!PT.nodes.has(nodeId)) return;
  const normTab = tab === 'notes' ? 'notes' : (tab === 'detail' ? 'detail' : 'definition');
  const pnl = document.getElementById('ptPanel');
  const same = PT.panelOpen && PT.sel === nodeId && PT.panelTab === normTab && pnl && !pnl.hidden;
  if(same && !force) return;
  if(!same && !force){ PT.detailEdit = null; PT.noteForm = null; }
  PT.sel = nodeId; PT.panelOpen = true; PT.panelTab = normTab;
  document.querySelectorAll('#ptNodes .pt-node').forEach(el => el.classList.toggle('sel', el.dataset.id === nodeId));
  ptToolsSync();
  const panel = document.getElementById('ptPanel');
  panel.hidden = false;
  panel.innerHTML = '<div class="empty">جاري التحميل…</div>';
  try{
    await ptLoadInfos(nodeId);
    if(PT.sel === nodeId && PT.panelOpen){
      ptPanelRender();
      const nd = PT.nodes.get(nodeId);
      if(nd){ ptCenterOn(nd); ptDraw(); }
    }
  }catch(e){ panel.innerHTML = `<div class="empty">تعذّر التحميل: ${escapeHtml(ptErr(e))}</div>`; }
}
function ptClosePanel(){
  PT.panelOpen = false;
  Object.values(PT.infoTimers).forEach(t => t.fire && t.fire());
  const p = document.getElementById('ptPanel');
  if(p){ p.hidden = true; p.innerHTML = ''; }
}
function ptPanelTab(tab){ PT.panelTab = tab; PT.detailEdit = null; PT.noteForm = null; ptPanelRender(); }

function ptPanelRender(){
  const panel = document.getElementById('ptPanel');
  const n = PT.nodes.get(PT.sel), rec = PT.infoRows.get(PT.sel);
  if(!panel || !n || !rec) return;
  const tabs = [['definition', 'التعريف', rec.definition ? '●' : ''], ['detail', 'التفصيل في الكتاب', rec.detail ? '●' : ''], ['notes', 'الملاحظات', rec.notes.length ? rec.notes.length : '']];
  let body = '';
  if(PT.panelTab === 'definition'){
    body = `<textarea id="ptDef" class="pt-ta" placeholder="اكتب تعريف المسألة أو المصطلح" oninput="ptInfoInput('definition', this.value)">${escapeHtml(rec.definition ? rec.definition.body : '')}</textarea>
      <div class="pt-prow"><span class="pt-sub" id="ptDefS"></span>${rec.definition ? '<button class="ghost" onclick="ptDeleteInfo(\'definition\')">حذف التعريف</button>' : ''}</div>`;
  } else if(PT.panelTab === 'detail'){
    const has = rec.detail && rec.detail.body;
    const edit = PT.detailEdit == null ? !has : PT.detailEdit;
    body = edit
      ? `<div class="pt-fbar"><button class="ghost" onclick="ptFmt('b')"><b>ع</b></button><button class="ghost" onclick="ptFmt('h')">عنوان</button><button class="ghost" onclick="ptFmt('l')">قائمة</button><button class="ghost" onclick="ptFmt('q')">اقتباس</button></div>
         <textarea id="ptDet" class="pt-ta pt-tall" placeholder="اكتب شرح المسألة وتفصيلها كما ورد في الكتاب" oninput="ptInfoInput('detail', this.value)">${escapeHtml(rec.detail ? rec.detail.body : '')}</textarea>
         <div class="pt-prow"><span class="pt-sub" id="ptDetS"></span><button class="ghost" onclick="ptDetailView()">عرض</button></div>`
      : `<div class="pt-rich">${ptFormat(rec.detail.body)}</div>
         <div class="pt-prow"><button class="ghost" onclick="ptDetailEdit()">تحرير</button><button class="ghost" onclick="ptDeleteInfo('detail')">حذف التفصيل</button></div>`;
  } else {
    const f = PT.noteForm;
    const notes = rec.notes.map(nt => {
      if(f && f.id === nt.id) return ptNoteFormHtml(nt);
      const label = nt.title || (nt.body.length > 40 ? nt.body.slice(0, 40) + '…' : nt.body) || 'ملاحظة';
      return `<details class="pt-note" ${PT.openNotes.has(nt.id) ? 'open' : ''} ontoggle="ptNoteToggle('${nt.id}', this.open)"><summary>${escapeHtml(label)}</summary>
        <div class="pt-rich">${ptFormat(nt.body)}</div>
        <div class="pt-prow"><button class="ghost" onclick="ptNoteEdit('${nt.id}')">تعديل</button><button class="ghost" onclick="ptNoteDelete('${nt.id}')">حذف</button></div></details>`;
    }).join('');
    body = `${notes || '<div class="pt-hint">لا توجد ملاحظات بعد.</div>'}
      ${f && !f.id ? ptNoteFormHtml(null) : '<div class="pt-prow"><button class="ghost" onclick="ptNoteNew()">＋ ملاحظة جديدة</button></div>'}`;
  }
  panel.innerHTML = `<div class="pt-phead"><b id="ptPTitle">${escapeHtml(n.title)}</b><button class="ghost" onclick="ptClosePanel()" title="إغلاق">✕</button></div>
    <div class="tag-choices pt-ptabs">${tabs.map(([k, t, c]) => `<button class="${PT.panelTab === k ? 'active' : ''}" onclick="ptPanelTab('${k}')">${t}${c !== '' ? ' ' + c : ''}</button>`).join('')}</div>
    <div class="pt-pbody">${body}</div>`;
}

function ptInfoInput(kind, text){
  const nodeId = PT.sel;
  const key = nodeId + ':' + kind;
  const st = document.getElementById(kind === 'definition' ? 'ptDefS' : 'ptDetS');
  if(st) st.textContent = 'جارٍ الكتابة…';
  const prev = PT.infoTimers[key];
  if(prev) clearTimeout(prev.t);
  const fire = () => { clearTimeout(rec.t); delete PT.infoTimers[key]; ptSaveInfo(nodeId, kind, text); };
  const rec = {t:setTimeout(fire, 900), fire};
  PT.infoTimers[key] = rec;
}
function ptSaveInfo(nodeId, kind, text){
  PT.chain = PT.chain.then(() => ptDoSaveInfo(nodeId, kind, text)).catch(() => {});
  return PT.chain;
}
async function ptDoSaveInfo(nodeId, kind, text){
  const rec = PT.infoRows.get(nodeId);
  const mark = m => { const el = document.getElementById(kind === 'definition' ? 'ptDefS' : 'ptDetS'); if(el && PT.sel === nodeId) el.textContent = m; };
  if(!rec || !PT.nodes.has(nodeId)) return;
  const body = text.replace(/\s+$/, '');
  try{
    const cur = rec[kind];
    if(!body.trim()){
      if(cur){
        const {error} = await sb.from('pt_infos').delete().eq('id', cur.id);
        if(error) throw error;
        rec[kind] = null; ptSyncMeta(nodeId);
      }
      mark('محفوظ ✓'); return;
    }
    if(cur){
      if(cur.body === body){ mark('محفوظ ✓'); return; }
      const {error} = await sb.from('pt_infos').update({body, updated_at: new Date().toISOString()}).eq('id', cur.id);
      if(error) throw error;
      cur.body = body;
    } else {
      const {data, error} = await sb.from('pt_infos').insert({tree_id:PT.tree.id, node_id:nodeId, kind, body}).select().single();
      if(error) throw error;
      rec[kind] = {id:data.id, body};
      ptSyncMeta(nodeId);
    }
    mark('محفوظ ✓');
  }catch(e){ mark('تعذّر الحفظ'); showToast('تعذّر حفظ المعلومة: ' + ptErr(e), 'warn'); }
}
async function ptDeleteInfo(kind){
  const nodeId = PT.sel;
  if(!confirm(kind === 'definition' ? 'حذف التعريف؟' : 'حذف التفصيل؟')) return;
  const key = nodeId + ':' + kind;
  if(PT.infoTimers[key]){ clearTimeout(PT.infoTimers[key].t); delete PT.infoTimers[key]; }
  PT.chain = PT.chain.then(async () => {
    const rec = PT.infoRows.get(nodeId);
    if(rec && rec[kind]){
      const {error} = await sb.from('pt_infos').delete().eq('id', rec[kind].id);
      if(error){ showToast('تعذّر الحذف: ' + ptErr(error), 'warn'); return; }
      rec[kind] = null; ptSyncMeta(nodeId);
    }
    PT.detailEdit = null;
    if(PT.sel === nodeId && PT.panelOpen) ptPanelRender();
  }).catch(() => {});
}
function ptDetailEdit(){ PT.detailEdit = true; ptPanelRender(); const t = document.getElementById('ptDet'); if(t) t.focus(); }
function ptDetailView(){
  const key = PT.sel + ':detail';
  if(PT.infoTimers[key]) PT.infoTimers[key].fire();
  PT.chain = PT.chain.then(() => { PT.detailEdit = false; const rec = PT.infoRows.get(PT.sel); if(rec && !rec.detail) PT.detailEdit = null; if(PT.panelOpen) ptPanelRender(); });
}
function ptFmt(kind){
  const ta = document.getElementById('ptDet');
  if(!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  if(kind === 'b'){ ta.value = v.slice(0, s) + '**' + (v.slice(s, e) || 'نص') + '**' + v.slice(e); }
  else { const ls = v.lastIndexOf('\n', s - 1) + 1; ta.value = v.slice(0, ls) + (kind === 'h' ? '## ' : kind === 'l' ? '- ' : '> ') + v.slice(ls); }
  ta.focus();
  ptInfoInput('detail', ta.value);
}

function ptNoteToggle(id, open){ if(open) PT.openNotes.add(id); else PT.openNotes.delete(id); }
function ptNoteFormHtml(nt){
  return `<div class="pt-nform"><input type="text" id="ptNoteT" maxlength="200" placeholder="عنوان الملاحظة (اختياري)" value="${attrEscape(nt ? nt.title : '')}">
    <textarea id="ptNoteB" class="pt-ta" placeholder="نص الملاحظة">${escapeHtml(nt ? nt.body : '')}</textarea>
    <div class="pt-prow"><button class="primary" onclick="ptNoteSave('${nt ? nt.id : ''}')">حفظ</button><button class="ghost" onclick="ptNoteCancel()">إلغاء</button></div></div>`;
}
function ptNoteNew(){ PT.noteForm = {id:null}; ptPanelRender(); const t = document.getElementById('ptNoteT'); if(t) t.focus(); }
function ptNoteEdit(id){ PT.noteForm = {id}; ptPanelRender(); }
function ptNoteCancel(){ PT.noteForm = null; ptPanelRender(); }
async function ptNoteSave(id){
  const nodeId = PT.sel, rec = PT.infoRows.get(nodeId);
  const title = document.getElementById('ptNoteT').value.trim(), body = document.getElementById('ptNoteB').value.replace(/\s+$/, '');
  if(!title && !body.trim()){ showToast('اكتب عنواناً أو نصاً للملاحظة', 'warn'); return; }
  try{
    if(id){
      const {error} = await sb.from('pt_infos').update({title, body, updated_at: new Date().toISOString()}).eq('id', id);
      if(error) throw error;
      const nt = rec.notes.find(x => x.id === id); if(nt){ nt.title = title; nt.body = body; }
    } else {
      const {data, error} = await sb.from('pt_infos').insert({tree_id:PT.tree.id, node_id:nodeId, kind:'note', title, body, sort_order:rec.notes.length}).select().single();
      if(error) throw error;
      rec.notes.push({id:data.id, title, body});
      PT.openNotes.add(data.id);
    }
    PT.noteForm = null; ptSyncMeta(nodeId);
    if(PT.sel === nodeId && PT.panelOpen) ptPanelRender();
  }catch(e){ showToast('تعذّر حفظ الملاحظة: ' + ptErr(e), 'warn'); }
}
async function ptNoteDelete(id){
  if(!confirm('حذف هذه الملاحظة؟')) return;
  const nodeId = PT.sel, rec = PT.infoRows.get(nodeId);
  const {error} = await sb.from('pt_infos').delete().eq('id', id);
  if(error){ showToast('تعذّر الحذف: ' + ptErr(error), 'warn'); return; }
  rec.notes = rec.notes.filter(x => x.id !== id);
  PT.openNotes.delete(id);
  ptSyncMeta(nodeId);
  if(PT.sel === nodeId && PT.panelOpen) ptPanelRender();
}
