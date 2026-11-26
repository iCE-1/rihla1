/* 09-stats.js — الإحصائيات: الرسوم البيانية SVG، المعدل الأسبوعي وتوقع إنهاء الكتب */

/* ============ الرسوم البيانية (SVG) ============ */

let statsMetric = 'lessons';
let _chartId = 0;
function setStatsMetric(m){ statsMetric = m; renderStatsView(); }

function niceStep(max){
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for(const m of [1, 2, 2.5, 5, 10]) if(m * mag >= raw) return m * mag;
  return 10 * mag;
}

// o: {values, labels, tips, goal, fmt, todayIdx, rtl}
function svgBarChart(o){
  const W = 360, H = 190, pl = 6, pr = 30, pt = 16, pb = 24;
  const n = o.values.length;
  const max0 = Math.max(1, ...o.values, o.goal || 0);
  const step = niceStep(max0);
  const top = step * 4;
  const innerH = H - pt - pb;
  const bw = (W - pl - pr) / n;
  const barW = Math.min(26, bw * 0.62);
  const yOf = v => H - pb - (v / top) * innerH;
  const fmt = o.fmt || (v => String(v));
  const id = 'chart' + (++_chartId);
  const grid = [0, 1, 2, 3, 4].map(k => {
    const v = step * k, y = yOf(v);
    return `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${W - pr + 5}" y="${(y + 3).toFixed(1)}">${fmt(Math.round(v * 10) / 10)}</text>`;
  }).join('');
  const bars = o.values.map((v, i) => {
    const xi = W - pr - (i + 1) * bw;                     // الأقدم يمينًا والأحدث يسارًا، كاتجاه القراءة العربية
    const x = xi + (bw - barW) / 2;
    const h = Math.max(v > 0 ? 2 : 0, (v / top) * innerH);
    const met = o.goal && v >= o.goal;
    const tip = attrEscape(o.tips ? o.tips[i] : String(v));
    const lbl = o.labels[i] ? `<text x="${(xi + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${o.labels[i]}</text>` : '';
    const val = (n <= 12 && v > 0) ? `<text class="val" x="${(xi + bw / 2).toFixed(1)}" y="${(yOf(v) - 3).toFixed(1)}" text-anchor="middle">${fmt(Math.round(v * 10) / 10)}</text>` : '';
    return `<g onclick="chartTip(this)" data-tip="${tip}">
      <rect class="hit" x="${xi.toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${innerH}"/>
      <rect class="cb${met ? ' met' : ''}${i === o.todayIdx ? ' today' : ''}" style="--i:${i}" x="${x.toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>
      ${val}${lbl}</g>`;
  }).join('');
  const goalLine = o.goal ? `<line class="goal" x1="${pl}" x2="${W - pr}" y1="${yOf(o.goal).toFixed(1)}" y2="${yOf(o.goal).toFixed(1)}"/><text class="goal-t" x="${pl + 2}" y="${(yOf(o.goal) - 3).toFixed(1)}">الهدف</text>` : '';
  return `<div class="chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${goalLine}${bars}</svg><div class="chart-tip">اضغط على عمود لعرض تفاصيله</div></div>`;
}

function chartTip(g){
  const box = g.closest('.chart');
  if(!box) return;
  box.querySelectorAll('g.sel').forEach(x => x.classList.remove('sel'));
  g.classList.add('sel');
  box.querySelector('.chart-tip').textContent = g.getAttribute('data-tip') || '';
}

function statsChartHtml(days, goal, dayLabel){
  const isMin = statsMetric === 'minutes';
  const values = days.map(x => isMin ? x.m : x.n);
  const tips = days.map(x => `${formatDate(x.ds)}: ${isMin ? focusHoursLabel(x.m) : x.n + ' ' + (x.n === 1 ? 'درس' : 'دروس')}`);
  return `<div class="tag-choices" style="margin:4px 0 8px">
      <button class="${!isMin ? 'active' : ''}" onclick="setStatsMetric('lessons')">الدروس</button>
      <button class="${isMin ? 'active' : ''}" onclick="setStatsMetric('minutes')">وقت التركيز (دقائق)</button>
    </div>
    ${svgBarChart({values, labels: days.map(dayLabel), tips, goal: isMin ? 0 : goal, todayIdx: days.length - 1, fmt: isMin ? (v => String(v)) : null})}
    ${(!isMin && goal) ? '<div class="hint">اللون الذهبي: يوم حققت فيه هدفك (' + goal + ' ' + (goal === 1 ? 'درس' : 'دروس') + ').</div>' : ''}`;
}

let statsRange = 7;

async function openStats(){
  const el = document.getElementById('statsView');
  if(el && !el.innerHTML) el.innerHTML = '<div class="empty">جاري التحميل...</div>';
  await Promise.all([refreshBooksCache(), loadEntries()]);
  renderStatsView();
}

function setStatsRange(n){
  statsRange = n;
  renderStatsView();
}

// مدة متبقية بصيغة مقروءة، بالأيام حتى أسبوعين ثم بالأسابيع ثم بالأشهر
function humanDays(n){
  if(n <= 0) return 'اليوم';
  if(n < 14) return daysWord(n);
  if(n < 60){
    const w = Math.floor(n / 7), d = n % 7;
    const wTxt = w === 2 ? 'أسبوعان' : w + ' أسابيع';
    return d ? `${wTxt} و${daysWord(d)}` : wTxt;
  }
  const m = Math.round(n / 30.4);
  return `${m} ${m <= 10 ? 'أشهر' : 'شهرًا'}`;
}
function weekdayName(d){ return d.toLocaleDateString('ar', {weekday:'long'}); }

function renderStatsView(){
  const el = document.getElementById('statsView');
  if(!el) return;
  const byDate = entriesByDate(entriesCache);
  const goal = getDailyGoal();
  const days = [];
  const now = new Date();
  for(let i = statsRange - 1; i >= 0; i--){
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    days.push({ds, d, idx: statsRange - 1 - i, n: lessonsOnDate(byDate, ds), m: (byDate.get(ds) || []).filter(e => e.type === 'tarkiz').reduce((s,e) => s + Math.max(0, Number(e.focus_minutes) || 0), 0)});
  }
  const total = days.reduce((sum, x) => sum + x.n, 0);
  const avg = Math.round(total / statsRange * 10) / 10;
  const best = days.reduce((a, b) => b.n > a.n ? b : a, days[0]);
  const max = Math.max(1, ...days.map(x => x.n));
  const firstDay = days[0].ds;
  const focusSessions = entriesCache.filter(e => e.type === 'tarkiz' && e.entry_date >= firstDay);
  const focusMinutes = focusSessions.reduce((sum, e) => sum + Math.max(0, Number(e.focus_minutes) || 0), 0);
  const focusLabel = focusMinutes >= 60
    ? `${Math.floor(focusMinutes / 60)}س ${focusMinutes % 60}د`
    : `${focusMinutes}د`;
  const dayLabel = x => statsRange === 7
    ? x.d.toLocaleDateString('ar', {weekday:'short'})
    : (x.idx % 5 === 0 || x.idx === statsRange - 1 ? arabicNumeral(x.d.getDate()) : '');

  // سرعة كل كتاب: الدروس المختلفة في آخر ٧ أيام (اليوم و٦ أيام قبله)، وتُقارَن بالأسبوع الذي قبله
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 6);
  const cutoffStr = toDateStr(cutoff);
  const prevCut = new Date(now); prevCut.setDate(prevCut.getDate() - 13);
  const prevCutStr = toDateStr(prevCut);
  const lessonsByBook = new Map();   // هذا الأسبوع
  const prevByBook = new Map();      // الأسبوع الماضي
  const bookByName = new Map(booksCache.map(b => [normalizeLessonKey(b.name), b.id]));
  const addLesson = (bookId, n, ds) => {
    const target = ds >= cutoffStr ? lessonsByBook : prevByBook;
    if(!target.has(bookId)) target.set(bookId, new Set());
    target.get(bookId).add(n);
  };
  entriesCache.forEach(e => {
    if(e.entry_date < prevCutStr || isReviewEntry(e)) return;
    if(e.book_id && e.lesson_number){ addLesson(e.book_id, e.lesson_number, e.entry_date); return; }
    // قيود غير مرتبطة بالكتاب: نقرأ الوسم «درس: اسم الكتاب — الدرس 12»
    splitTags(e.tags).forEach(tag => {
      const m = tag.match(/^درس\s*:\s*(.+?)\s*[—–-]\s*الدرس\s*(\d+)\s*$/);
      if(!m) return;
      const bookId = bookByName.get(normalizeLessonKey(m[1]));
      if(bookId) addLesson(bookId, parseInt(m[2]), e.entry_date);
    });
  });

  // مقارنة إجمالية: هذا الأسبوع مقابل الأسبوع الماضي
  let thisWeek = 0, lastWeek = 0;
  for(let i = 0; i < 7; i++){
    const d1 = new Date(now); d1.setDate(d1.getDate() - i);
    const d2 = new Date(now); d2.setDate(d2.getDate() - 7 - i);
    thisWeek += lessonsOnDate(byDate, toDateStr(d1));
    lastWeek += lessonsOnDate(byDate, toDateStr(d2));
  }
  const diffWeek = thisWeek - lastWeek;
  const weekTrend = diffWeek === 0
    ? '<span class="fc-trend">مثل الأسبوع الماضي</span>'
    : `<span class="fc-trend ${diffWeek > 0 ? 'up' : 'down'}">${diffWeek > 0 ? '▲ +' : '▼ −'}${arabicNumeral(Math.abs(diffWeek))} عن الأسبوع الماضي (${arabicNumeral(lastWeek)})</span>`;
  const weekCmpHtml = `<div class="week-cmp">${ic('calendar', 14)}<span>آخر ٧ أيام: <b>${arabicNumeral(thisWeek)}</b> ${thisWeek === 1 ? 'درس' : 'دروس'}</span>${weekTrend}</div>`;

  const current = booksCache.filter(b => b.status === 'in_progress');
  const items = current.map(b => {
    const p = bookProgressPct(b);
    const isPages = lessonUnit(b) === 'صفحة';
    const it = {b, p, isPages, daysLeft: null, eta: null};
    if(isPages || !p.total || p.done >= p.total) return it;
    const count = lessonsByBook.has(b.id) ? lessonsByBook.get(b.id).size : 0;
    const prevCount = prevByBook.has(b.id) ? prevByBook.get(b.id).size : 0;
    it.count = count; it.prevCount = prevCount;
    if(!count) return it;
    it.remaining = p.total - p.done;
    // معدل أسبوعي = دروس آخر ٧ أيام. الأيام المتبقية = المتبقي ÷ (المعدل ÷ ٧) مقرّبة للأعلى
    it.daysLeft = Math.ceil(it.remaining * 7 / count);
    it.eta = new Date(now); it.eta.setDate(it.eta.getDate() + it.daysLeft);
    return it;
  });
  // الأقرب إنهاءً أولًا، ثم من لا توقع له
  items.sort((x, y) => (x.daysLeft === null) - (y.daysLeft === null) || (x.daysLeft - y.daysLeft));

  const booksHtml = items.length ? items.map(it => {
    const {b, p, isPages} = it;
    let forecast, cls = '';
    if(isPages){
      forecast = '<div class="forecast">كتاب بالصفحات: التوقع متاح للمتون والدروس فقط.</div>';
    } else if(!p.total){
      forecast = '<div class="forecast">حدّد عدد الدروس الكلي للكتاب ليظهر التوقع.</div>';
    } else if(p.done >= p.total){
      forecast = '<div class="forecast">أتممت دروس هذا الكتاب.</div>';
      cls = ' fc-soon';
    } else if(it.daysLeft === null){
      cls = ' fc-idle';
      forecast = `<div class="fc-idle-msg">لم تسجّل درسًا من هذا الكتاب في آخر ٧ أيام، فلا يمكن حساب الموعد. سجّل درسًا ليظهر التوقع.</div>
        <div class="fc-grid"><div class="fc-chip"><b>${arabicNumeral(p.total - p.done)}</b><span>${p.unit === 'درس' ? 'درسًا متبقيًا' : 'متبقٍّ'}</span></div></div>`;
    } else {
      if(it.daysLeft <= 14) cls = ' fc-soon';
      const diff = it.count - it.prevCount;
      const trend = it.prevCount === 0 && diff > 0 ? ''
        : diff === 0 ? '<span class="fc-trend">ثابت</span>'
        : `<span class="fc-trend ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${arabicNumeral(Math.abs(diff))} عن الأسبوع الماضي</span>`;
      forecast = `
        <div class="fc-grid">
          <div class="fc-chip"><b>${arabicNumeral(it.count)}</b><span>درس في الأسبوع (آخر ٧ أيام)</span></div>
          <div class="fc-chip"><b>${arabicNumeral(it.remaining)}</b><span>${it.remaining === 1 ? 'درس متبقٍّ' : 'دروس متبقية'}</span></div>
          <div class="fc-chip"><b>${humanDays(it.daysLeft)}</b><span>المدة المتبقية</span></div>
          <div class="fc-chip eta"><b>${weekdayName(it.eta)} ${pfDate(toDateStr(it.eta))}</b><span>موعد الانتهاء المتوقع ${trend}</span></div>
        </div>
        <div class="fc-note">الحساب: ${arabicNumeral(it.remaining)} ÷ (${arabicNumeral(it.count)} ÷ ٧) = ${arabicNumeral(Math.round(it.remaining * 7 / it.count * 10) / 10)} يومًا، يُقرَّب للأعلى. يتغيّر الموعد كلما تغيّر نشاط أسبوعك.</div>`;
    }
    return `
      <div class="book-stat${cls}">
        <div class="cb-row"><div class="sj-name" style="margin-bottom:0">${escapeHtml(b.name)}</div><div class="cb-pct">${p.pct}%</div></div>
        <div class="cb-sub">${p.done} / ${p.total} ${p.unit}</div>
        ${bookTimeHtml(b)}
        <div class="sj-progress-bar" style="margin-bottom:0"><div class="sj-progress-fill" style="width:${p.pct}%"></div></div>
        ${forecast}
      </div>`;
  }).join('') : `<div class="empty" style="padding:26px 20px">لا يوجد كتاب تدرسه الآن.</div>`;

  const firstEta = items.find(it => it.daysLeft !== null);
  const nextHtml = firstEta
    ? `<div class="fc-next">${ic('flag', 14)} أقرب كتاب تنهيه: <b>${escapeHtml(firstEta.b.name)}</b>، بعد <b>${humanDays(firstEta.daysLeft)}</b> (${weekdayName(firstEta.eta)} ${pfDate(toDateStr(firstEta.eta))}).</div>`
    : '';

  el.innerHTML = `
    <div class="stats-row" style="margin-bottom:22px">
      <div class="stat"><span class="num">${focusSessions.length}</span><span class="lbl">جلسات تركيز</span></div>
      <div class="stat"><span class="num">${focusLabel}</span><span class="lbl">وقت التركيز</span></div>
      <div class="stat"><span class="num">${total}</span><span class="lbl">دروس جديدة</span></div>
    </div>
    <div class="timeline-head">
      <h2>الدروس</h2>
      <div class="tag-choices">
        <button class="${statsRange === 7 ? 'active' : ''}" onclick="setStatsRange(7)">٧ أيام</button>
        <button class="${statsRange === 30 ? 'active' : ''}" onclick="setStatsRange(30)">٣٠ يومًا</button>
      </div>
    </div>
    ${statsChartHtml(days, goal, dayLabel)}
    <div class="stat-line">
      في آخر ${statsRange === 7 ? 'سبعة أيام' : 'ثلاثين يومًا'}: <b>${total}</b> ${total === 1 ? 'درس' : 'دروس'}،
      بمعدل <b>${avg}</b> درس في اليوم${best.n > 0 ? `، وأفضل يوم ${formatDate(best.ds)} (${best.n})` : ''}.
    </div>
    ${weekCmpHtml}
    <div class="hint">تُحتسب دروس المتون فقط، وكل درس مرة واحدة في اليوم، ولا تُحتسب الجلسات الموسومة «مراجعة».</div>

    <div class="timeline-head" style="margin-top:28px"><h2>الكتب الجارية والتوقع</h2></div>
    <div class="hint" style="margin:-2px 0 10px">يُحسب المعدل على آخر ٧ أيام (اليوم و٦ أيام قبله)، ويُحدَّد موعد الانتهاء باليوم من الدروس المتبقية.</div>
    ${nextHtml}
    ${booksHtml}
  `;
}
