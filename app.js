/* Kế Toán Nói Tiếng Anh: logic chính (học thẻ, ôn tập theo lịch, kiểm tra, tập nói với AI). */
const CFG = window.APP_CONFIG || {};
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const canSpeak = 'speechSynthesis' in window;
function speak(t) { if (!canSpeak) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = 0.82; speechSynthesis.speak(u); } catch (e) {} }
function sayBtn(text) { const b = document.createElement('button'); b.className = 'btn-say'; b.type = 'button'; b.innerHTML = SPEAKER; b.setAttribute('aria-label', 'Nghe: ' + text); b.onclick = e => { e.stopPropagation(); speak(text); }; if (!canSpeak) b.hidden = true; return b; }
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ================= Tiến độ =================
   words[từ] = [mức 0..4, lần ôn gần nhất, số lần sai, số lần gặp, lúc sửa]  (thời gian tính bằng phút)
   Mức >= 2 là "đã thuộc". Lịch ôn: mức 1 sau 1 ngày, 2 sau 3 ngày, 3 sau 7 ngày, 4 sau 16 ngày. */
const MIN = () => Math.floor(Date.now() / 60000);
const DAY_MIN = 1440, INTERVAL = [0, 1, 3, 7, 16];
const B = 0, T = 1, W = 2, N = 3, U = 4;
function emptyState() { return { v: 1, words: {}, quizzes: [] }; }

let state = store.get('hta-state', null);
if (!state) {
  state = emptyState();
  const old = store.get('kt-boxes', null); // bản cũ chỉ lưu mức nhớ
  if (old) for (const [k, b] of Object.entries(old)) state.words[k] = [b, MIN(), 0, 1, MIN()];
}
const saveLocal = () => store.set('hta-state', state);

function mergeStates(a, b) {
  const out = emptyState();
  const keys = new Set([...Object.keys(a.words || {}), ...Object.keys(b.words || {})]);
  for (const k of keys) {
    const x = a.words?.[k], y = b.words?.[k];
    out.words[k] = !x ? y : !y ? x : ((y[U] || 0) > (x[U] || 0) ? y : x);
  }
  const seen = new Set();
  out.quizzes = [...(a.quizzes || []), ...(b.quizzes || [])]
    .filter(q => q && !seen.has(q.id) && seen.add(q.id))
    .sort((p, q) => p.ts - q.ts).slice(-60);
  return out;
}

const ALL = DAYS.flatMap((d, i) => d.w.map(w => ({ w, day: i })));
const rec = w => state.words[w[0]];
const level = w => rec(w)?.[B] ?? 0;
const learned = w => level(w) >= 2;
const studied = w => !!rec(w);
const isDue = w => { const r = rec(w); return !!r && MIN() >= r[T] + INTERVAL[r[B]] * DAY_MIN; };
const isWeak = w => { const r = rec(w); return !!r && (r[W] >= 2 || (r[B] === 0 && r[N] >= 2)); };
const dayDone = i => DAYS[i].w.every(learned);
const dayStarted = i => DAYS[i].w.some(studied);
const nextDay = () => { const i = DAYS.findIndex((_, i) => !dayDone(i)); return i < 0 ? DAYS.length - 1 : i; };

function mark(w, ok) {
  const k = w[0], r = state.words[k] || [0, 0, 0, 0, 0], now = MIN();
  const nb = ok ? Math.min(4, r[B] + 1) : 0;
  state.words[k] = [nb, now, r[W] + (ok ? 0 : 1), r[N] + 1, now];
  changed();
}
function changed() { saveLocal(); Sync.changed(); }

Sync.init({
  getState: () => state,
  setState(remote, opt = {}) {
    if (opt.replaceLocal) state = remote ? mergeStates(emptyState(), remote) : emptyState();
    else if (remote) state = mergeStates(state, remote);
    saveLocal(); refreshAll();
  }
});

/* ================= Thanh đồng bộ ================= */
function fmtTime(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + (new Date().toDateString() === d.toDateString() ? '' : ' ' + d.toLocaleDateString('vi-VN')); }
Sync.onChange(s => {
  const bar = $('sync'), txt = $('sync-text'), btn = $('sync-btn'), out = $('sync-out');
  if (!s.enabled) { bar.hidden = true; return; }
  bar.hidden = false; bar.dataset.state = s.status;
  out.hidden = !s.email;
  btn.hidden = false; btn.disabled = s.status === 'signing' || s.status === 'syncing';
  const msg = {
    local: ['Tiến độ đang lưu trên máy này. Đăng nhập Google để tự sao lưu vào Drive và học tiếp trên máy khác.', 'Đăng nhập Google'],
    signing: ['Đang mở cửa sổ đăng nhập Google…', 'Đăng nhập Google'],
    syncing: ['Đang đồng bộ với Google Drive…', 'Đồng bộ'],
    synced: ['Đã lưu vào Drive của ' + s.email + (s.lastSync ? ' lúc ' + fmtTime(s.lastSync) : '') + '.', null],
    expired: [(s.email ? s.email + ': ' : '') + 'phiên đăng nhập đã hết. Bấm để tiếp tục tự sao lưu' + (s.dirty ? ' (có bài mới chưa lưu lên Drive).' : '.'), 'Tiếp tục với Google'],
    offline: ['Mất mạng. Bài học vẫn được lưu trên máy và sẽ tự đẩy lên Drive khi có mạng.', 'Thử lại'],
    error: ['Chưa lưu được lên Drive. Bài học vẫn được lưu trên máy.', 'Thử lại']
  }[s.status] || ['', null];
  txt.textContent = msg[0];
  if (msg[1]) btn.textContent = msg[1]; else btn.hidden = true;
});
$('sync-btn').onclick = () => {
  const s = Sync.info();
  if (s.signedIn) Sync.flushNow(); else Sync.signIn().catch(() => {});
};
$('sync-out').onclick = () => {
  if (confirm('Đăng xuất và xoá tiến độ khỏi máy này?\n\nTiến độ trên Google Drive vẫn được giữ, lần sau đăng nhập sẽ lấy lại. Nên làm vậy nếu đây là máy dùng chung.')) Sync.forget();
};

/* ================= Tab ================= */
const views = ['cau', 'tu', 'kt', 'noi'];
function show(v) {
  if (!views.includes(v)) v = 'cau';
  views.forEach(x => { $('view-' + x).hidden = x !== v; $('tab-' + x).setAttribute('aria-selected', x === v); });
  store.set('kt-tab', v);
  if (v === 'kt' && !quiz) quizSetup();
  if (v === 'tu' && $('study').hidden) renderDays();
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => show(t.dataset.view));
function refreshAll() { if ($('study').hidden) renderDays(); else deckProgress(); if (!quiz) quizSetup(); }

/* ================= Câu cứu cánh ================= */
for (const [id, list] of Object.entries(PHRASES)) {
  const g = $(id);
  list.forEach(([en, vi]) => { const r = el('div', 'phrase'); const s = el('div', 'say'); s.append(sayBtn(en)); r.append(el('div', 'en', en), s, el('div', 'vi', vi)); g.append(r); });
}

/* ================= Thẻ từ vựng ================= */
let mode = null, current = null, flipped = false, recent = [], sessionDone = 0;
const deckName = { due: 'Ôn tập đến hạn', weak: 'Từ hay sai', review: 'Ôn lại tất cả từ đã học' };
function deck() {
  if (mode === 'due') return ALL.filter(x => isDue(x.w)).map(x => x.w);
  if (mode === 'weak') return ALL.filter(x => isWeak(x.w)).map(x => x.w);
  if (mode === 'review') return ALL.filter(x => studied(x.w)).map(x => x.w);
  return DAYS[mode].w;
}
function pick() {
  const d = deck(); if (!d.length) return null;
  const pool = d.length > 5 ? d.filter(w => !recent.includes(w[0])) : d;
  const weight = w => ({ 0: 8, 1: 5, 2: 3, 3: 1.5, 4: 0.6 })[level(w)] * (isWeak(w) ? 1.6 : 1);
  let total = pool.reduce((s, w) => s + weight(w), 0), r = Math.random() * total;
  for (const w of pool) { r -= weight(w); if (r <= 0) return w; }
  return pool[0];
}
function renderDays() {
  const box = $('days'); box.replaceChildren();
  const nd = nextDay();
  MONTHS.forEach((mt, m) => {
    const det = el('details', 'month'); if (Math.floor(nd / 30) === m) det.open = true;
    const doneM = DAYS.slice(m * 30, m * 30 + 30).filter((_, k) => dayDone(m * 30 + k)).length;
    const sum = el('summary'); sum.append(el('span', 'mtitle', mt), el('span', 'mcount', doneM + '/30 ngày')); det.append(sum);
    const grid = el('div', 'days');
    for (let i = m * 30; i < m * 30 + 30; i++) {
      const d = DAYS[i], n = d.w.filter(learned).length;
      const b = el('button', 'day' + (dayDone(i) ? ' done' : '') + (i === nd ? ' next' : '')); b.type = 'button';
      const top = el('div', 'dtop'); top.append(el('span', 'dnum', 'Ngày ' + (i + 1)), el('span', 'dstate', dayDone(i) ? '✓ Xong' : (i === nd ? 'Hôm nay' : '')));
      const bar = el('div', 'bar'); const fill = el('span'); fill.style.width = (n / d.w.length * 100) + '%'; bar.append(fill);
      b.append(top, el('span', 'dtitle', d.t), bar, el('span', 'dcount', n + '/15 từ'));
      b.onclick = () => openDeck(i); grid.append(b);
    }
    det.append(grid); box.append(det);
  });
  const total = ALL.filter(x => learned(x.w)).length;
  $('st-thuoc').textContent = 'Đã thuộc: ' + total + '/' + ALL.length + ' từ';
  $('st-ngay').textContent = 'Hoàn thành: ' + DAYS.filter((_, i) => dayDone(i)).length + '/90 ngày';

  // Bài hôm nay: ôn từ đến hạn trước, rồi mới học ngày mới
  const t = $('today'); t.replaceChildren();
  const due = ALL.filter(x => isDue(x.w) && level(x.w) > 0).length;
  const weak = ALL.filter(x => isWeak(x.w)).length;
  t.append(el('span', 'eyebrow', 'Bài hôm nay'));
  if (due >= 5) {
    t.append(el('h2', null, 'Bước 1: ôn ' + due + ' từ đến hạn'),
      el('p', 'muted', 'Ôn đúng lúc sắp quên giúp nhớ lâu hơn nhiều. Ôn xong rồi học ngày ' + (nd + 1) + '.'));
    const g1 = el('button', 'btn primary', 'Ôn ' + due + ' từ'); g1.onclick = () => openDeck('due');
    const g2 = el('button', 'btn', 'Bỏ qua, học ngày ' + (nd + 1)); g2.onclick = () => openDeck(nd);
    const r = el('div', 'row'); r.append(g1, g2); t.append(r);
  } else {
    t.append(el('h2', null, 'Ngày ' + (nd + 1) + ' · ' + DAYS[nd].t),
      el('p', 'muted', '15 từ. Lật từng thẻ, đọc to theo loa, rồi tự chấm "Nhớ rồi" hoặc "Chưa nhớ". Mỗi từ cần nhớ 2 lần mới tính là đã thuộc.'));
    const go = el('button', 'btn primary', 'Học ngày ' + (nd + 1)); go.onclick = () => openDeck(nd); t.append(go);
  }
  $('b-due').hidden = due === 0; $('b-due').textContent = 'Ôn từ đến hạn (' + due + ')';
  $('b-weak').hidden = weak === 0; $('b-weak').textContent = 'Luyện từ hay sai (' + weak + ')';
  $('b-review').disabled = !ALL.some(x => studied(x.w));
}
function openDeck(m) {
  mode = m; recent = []; sessionDone = 0;
  $('pick-day').hidden = true; $('study').hidden = false;
  $('deck-title').textContent = typeof m === 'string' ? deckName[m] : 'Ngày ' + (m + 1) + ' · ' + DAYS[m].t;
  next(); window.scrollTo({ top: 0 });
}
function closeDeck() { $('study').hidden = true; $('pick-day').hidden = false; renderDays(); }
function deckProgress() {
  const d = deck();
  if (typeof mode === 'number') {
    const n = d.filter(learned).length;
    $('deck-prog').textContent = n + '/' + d.length + ' từ đã thuộc';
    $('deck-done').hidden = !dayDone(mode);
  } else {
    $('deck-prog').textContent = mode === 'review' ? d.filter(learned).length + '/' + d.length + ' từ đã thuộc' : 'Còn ' + d.length + ' từ · đã ôn ' + sessionDone;
    $('deck-done').hidden = true;
  }
}
function renderCard() {
  const c = $('card'); c.replaceChildren();
  if (!current) {
    c.append(el('div', 'meaning', 'Xong rồi!'), el('p', 'muted', mode === 'due' ? 'Bạn đã ôn hết các từ đến hạn hôm nay.' : 'Không còn từ nào trong nhóm này.'));
    $('b-nho').disabled = $('b-chua').disabled = true; deckProgress(); return;
  }
  const [w, ipa, hint, mean, ex] = current;
  const top = el('div', 'row'); top.style.justifyContent = 'center'; top.style.flex = 'none';
  const sb = sayBtn(w); sb.style.flex = 'none'; top.append(sb);
  c.append(el('div', 'word', w)); if (ipa) c.append(el('div', 'ipa', ipa)); if (hint) c.append(el('div', 'hint', 'Đọc gần giống: ' + hint)); c.append(top);
  if (isWeak(current)) c.append(el('div', 'tag', 'Từ bạn hay sai'));
  if (flipped) { c.append(el('div', 'meaning', mean)); if (ex) { const sb2 = sayBtn(ex); sb2.style.margin = '0 auto'; c.append(el('div', 'ex', ex), sb2); } }
  else c.append(el('div', 'tap', 'Bấm vào thẻ để xem nghĩa'));
  $('b-nho').disabled = !flipped; $('b-chua').disabled = !flipped;
  deckProgress();
}
function next() { current = pick(); if (current) { recent.push(current[0]); if (recent.length > 5) recent.shift(); } flipped = false; renderCard(); }
const card = $('card');
card.onclick = () => { if (current && !flipped) { flipped = true; renderCard(); speak(current[0]); } };
card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.onclick(); } };
$('b-nho').onclick = () => { mark(current, true); sessionDone++; next(); };
$('b-chua').onclick = () => { mark(current, false); sessionDone++; next(); };
$('b-back').onclick = closeDeck; $('b-back2').onclick = closeDeck;
$('b-quizday').onclick = () => { const d = mode; closeDeck(); show('kt'); quizSetup(String(d)); };
$('b-review').onclick = () => openDeck('review');
$('b-due').onclick = () => openDeck('due');
$('b-weak').onclick = () => openDeck('weak');

/* ================= Kiểm tra: độ khó tăng theo mức nhớ của từng từ =================
   Mức 0-1: xem từ chọn nghĩa / nghe chọn từ.  Mức 2: xem nghĩa chọn từ / nghe chọn từ.
   Mức 3-4: tự gõ từ tiếng Anh (xem nghĩa hoặc nghe). */
const QN = 10;
let quiz = null;
function quizScopes() {
  const sel = $('q-scope'), prev = sel.value; sel.replaceChildren();
  const started = DAYS.map((_, i) => i).filter(dayStarted);
  const any = started.length > 0;
  $('q-empty').hidden = any; $('q-setup').hidden = !any;
  if (!any) return;
  const add = (v, t) => { const o = el('option', null, t); o.value = v; sel.append(o); };
  add('smart', 'Bài kiểm tra theo tiến độ của bạn (khuyên dùng)');
  add('all', 'Tất cả từ đã học (' + ALL.filter(x => studied(x.w)).length + ' từ)');
  const last7 = started.slice(-7);
  if (started.length > 1) add('recent', '7 ngày học gần nhất (ngày ' + (last7[0] + 1) + '–' + (last7[last7.length - 1] + 1) + ')');
  if (ALL.some(x => isWeak(x.w))) add('weak', 'Chỉ những từ hay sai');
  started.slice().reverse().forEach(i => add(String(i), 'Ngày ' + (i + 1) + ' · ' + DAYS[i].t));
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  const last = state.quizzes[state.quizzes.length - 1];
  $('q-last').textContent = last ? 'Lần kiểm tra gần nhất: ' + last.score + '/' + last.n + ' (' + new Date(last.ts).toLocaleDateString('vi-VN') + ').' : '';
}
function quizPool(scope) {
  if (scope === 'all') return ALL.filter(x => studied(x.w));
  if (scope === 'weak') return ALL.filter(x => isWeak(x.w));
  if (scope === 'recent') { const s = DAYS.map((_, i) => i).filter(dayStarted).slice(-7); return ALL.filter(x => s.includes(x.day)); }
  if (scope === 'smart') return ALL.filter(x => studied(x.w));
  return ALL.filter(x => x.day === +scope);
}
function smartPick(pool, n) {
  // ưu tiên: từ hay sai, từ đến hạn, từ mức thấp; vẫn trộn ngẫu nhiên
  const score = x => (isWeak(x.w) ? 3 : 0) + (isDue(x.w) ? 2 : 0) + (4 - level(x.w)) * 0.5 + Math.random() * 2;
  return pool.slice().sort((a, b) => score(b) - score(a)).slice(0, n);
}
function quizSetup(scope) {
  quizScopes(); if (scope && [...$('q-scope').options].some(o => o.value === scope)) $('q-scope').value = scope;
  $('q-run').hidden = true; $('q-end').hidden = true; quiz = null;
}
function makeQ(item) {
  const lv = level(item.w);
  let types = lv <= 1 ? ['en-vi', 'en-vi', 'listen'] : lv === 2 ? ['vi-en', 'listen'] : ['type', 'type', 'listen-type'];
  if (!canSpeak) types = types.filter(t => !t.startsWith('listen')); if (!types.length) types = ['type'];
  const type = types[Math.floor(Math.random() * types.length)];
  const same = ALL.filter(x => x.day === item.day && x.w[0] !== item.w[0]);
  const other = ALL.filter(x => x.day !== item.day);
  const wrong = shuffle(same).slice(0, 3); while (wrong.length < 3) { const o = other[Math.floor(Math.random() * other.length)]; if (!wrong.includes(o)) wrong.push(o); }
  return { item, type, opts: shuffle([item, ...wrong]) };
}
function startQuiz() {
  const scope = $('q-scope').value, pool = quizPool(scope);
  if (!pool.length) { $('q-msg').textContent = 'Không có từ nào trong phạm vi này. Hãy chọn phạm vi khác.'; return; }
  $('q-msg').textContent = '';
  const n = Math.min(QN, pool.length);
  const items = scope === 'smart' ? shuffle(smartPick(pool, n)) : shuffle(pool).slice(0, n);
  quiz = { qs: items.map(makeQ), i: 0, right: 0, wrong: [] };
  $('q-setup').hidden = true; $('q-end').hidden = true; $('q-run').hidden = false;
  renderQ();
}
const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
function dist(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function renderQ() {
  const q = quiz.qs[quiz.i], box = $('q-box'); box.replaceChildren();
  $('q-prog').textContent = 'Câu ' + (quiz.i + 1) + '/' + quiz.qs.length;
  $('q-bar').style.width = (quiz.i / quiz.qs.length * 100) + '%';
  const ask = el('div', 'qask');
  const k = q.item.w[0];
  if (q.type === 'en-vi') { ask.append(el('span', 'muted', 'Từ này nghĩa là gì?'), el('div', 'qword', k)); const s = sayBtn(k); s.style.margin = '0 auto'; ask.append(s); }
  else if (q.type === 'vi-en' || q.type === 'type') { ask.append(el('span', 'muted', q.type === 'type' ? 'Gõ từ tiếng Anh có nghĩa là:' : 'Tiếng Anh của từ này là gì?'), el('div', 'qword', q.item.w[3])); }
  else { ask.append(el('span', 'muted', q.type === 'listen' ? 'Nghe và chọn từ đúng' : 'Nghe rồi gõ lại từ bạn nghe được')); const s = sayBtn(k); s.classList.add('big'); s.style.margin = '0 auto'; ask.append(s); setTimeout(() => speak(k), 150); }
  box.append(ask);
  if (q.type === 'type' || q.type === 'listen-type') {
    const f = el('form', 'qtype');
    const inp = el('input'); inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false; inp.placeholder = 'Gõ từ tiếng Anh…'; inp.setAttribute('aria-label', 'Câu trả lời');
    const ok = el('button', 'btn primary', 'Kiểm tra'); ok.type = 'submit';
    const skip = el('button', 'btn', 'Không nhớ'); skip.type = 'button';
    const hintB = el('button', 'btn', 'Gợi ý chữ đầu'); hintB.type = 'button';
    hintB.onclick = () => { inp.value = k.slice(0, Math.max(1, Math.ceil(k.length / 4))); inp.focus(); q.hinted = true; };
    f.onsubmit = e => { e.preventDefault(); if (!inp.value.trim()) return; inp.disabled = true; [ok, skip, hintB].forEach(b => b.disabled = true); checkTyped(inp.value); };
    skip.onclick = () => { inp.disabled = true; [ok, skip, hintB].forEach(b => b.disabled = true); finishAnswer(false, ''); };
    const r = el('div', 'row'); r.append(ok, hintB, skip);
    f.append(inp, r); box.append(f); setTimeout(() => inp.focus(), 50);
  } else {
    const list = el('div', 'qopts');
    q.opts.forEach(o => {
      const b = el('button', 'qopt', q.type === 'en-vi' ? o.w[3] : o.w[0]); b.type = 'button';
      b.onclick = () => { [...list.children].forEach((x, idx) => { x.disabled = true; if (q.opts[idx] === q.item) x.classList.add('ok'); }); if (o !== q.item) b.classList.add('no'); finishAnswer(o === q.item); };
      list.append(b);
    });
    box.append(list);
  }
  $('q-next').hidden = true;
}
function checkTyped(v) {
  const k = quiz.qs[quiz.i].item.w[0], a = norm(v), t = norm(k);
  if (a === t) return finishAnswer(true, '');
  if (t.length > 4 && dist(a, t) === 1) return finishAnswer(true, 'Gần đúng, chú ý chính tả: ' + k);
  finishAnswer(false, 'Bạn gõ: ' + v);
}
function finishAnswer(ok, note) {
  const q = quiz.qs[quiz.i], k = q.item.w[0];
  if (ok) quiz.right++; else quiz.wrong.push(q.item);
  mark(q.item.w, ok);
  const fb = el('div', 'qfb' + (ok ? '' : ' fix'));
  fb.append(el('b', null, ok ? 'Đúng rồi!' : 'Chưa đúng.'));
  if (note) fb.append(el('span', null, note));
  const r = el('div', 'head'); r.append(el('span', null, k + ' = ' + q.item.w[3]), sayBtn(k)); fb.append(r);
  if (q.item.w[4]) fb.append(el('span', 'muted', q.item.w[4]));
  $('q-box').append(fb);
  if (!ok || !q.type.startsWith('listen')) speak(k);
  $('q-next').hidden = false; $('q-next').focus();
}
function endQuiz() {
  $('q-run').hidden = true; $('q-end').hidden = false;
  const n = quiz.qs.length, s = quiz.right;
  state.quizzes.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), score: s, n });
  state.quizzes = state.quizzes.slice(-60); changed();
  $('q-score').textContent = s + '/' + n;
  $('q-verdict').textContent = s === n ? 'Xuất sắc! Lần sau các từ này sẽ được hỏi khó hơn (tự gõ từ).' : s >= n * 0.7 ? 'Tốt lắm. Ôn thêm vài từ sai là chắc.' : 'Không sao, sai nhiều lúc đầu là bình thường. Học lại các từ sai rồi kiểm tra lần nữa.';
  const wl = $('q-wrong'); wl.replaceChildren();
  if (quiz.wrong.length) {
    wl.append(el('h3', null, 'Các từ cần ôn lại'));
    quiz.wrong.forEach(x => { const r = el('div', 'phrase'); const sd = el('div', 'say'); sd.append(sayBtn(x.w[0])); r.append(el('div', 'en', x.w[0]), sd, el('div', 'vi', x.w[3])); wl.append(r); });
    const p = el('p', 'muted', 'Các từ này đã được đưa về "chưa thuộc" để xuất hiện lại nhiều hơn khi học thẻ, và AI sẽ lồng chúng vào bài Tập nói.'); p.style.fontSize = '.9rem'; wl.append(p);
  }
  $('q-bar').style.width = '100%';
  quiz = null;
}
$('q-start').onclick = startQuiz;
$('q-next').onclick = () => { if (!quiz) return; quiz.i++; if (quiz.i >= quiz.qs.length) endQuiz(); else renderQ(); };
$('q-again').onclick = () => quizSetup();
$('q-gotu').onclick = () => show('tu');

/* ================= Tập nói với AI ================= */
let scene = null, history = [], busy = false;
const chat = $('chat'), hintsBox = $('hints'), input = $('input'), send = $('send'), scenBox = $('scen');
const aiReady = () => !!CFG.AI_ENDPOINT;
SCENES.forEach(s => { const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.append(el('h3', null, s.title), el('span', 'who', s.who)); b.onclick = () => start(s, b); scenBox.append(b); });

/* Từ để AI lồng vào hội thoại: ưu tiên từ hay sai, rồi từ mới học gần đây. */
function focusWords() {
  const weak = ALL.filter(x => isWeak(x.w)).map(x => x.w[0]);
  const recentW = ALL.filter(x => studied(x.w)).sort((a, b) => rec(b.w)[T] - rec(a.w)[T]).map(x => x.w[0]);
  return [...new Set([...shuffle(weak).slice(0, 5), ...recentW.slice(0, 10)])].slice(0, 8);
}
function addAI(d) { const m = el('div', 'msg ai'); const head = el('div', 'head'); head.append(el('span', 'en', d.reply), sayBtn(d.reply)); m.append(head); if (d.reply_vi) m.append(el('span', 'vi', d.reply_vi)); chat.append(m); speak(d.reply); }
function addMe(t) { const m = el('div', 'msg me'); m.append(el('span', null, t)); chat.append(m); }
function addFb(f) {
  if (!f) return; const b = el('div', 'fb' + (f.ok ? '' : ' fix'));
  b.append(el('b', null, f.ok ? 'Tốt lắm!' : 'Nói thế này sẽ rõ hơn:'));
  if (f.better) { const r = el('div', 'head'); r.append(el('span', null, f.better), sayBtn(f.better)); b.append(r); }
  if (f.note_vi) b.append(el('span', 'muted', f.note_vi));
  chat.append(b);
}
function setHints(list) {
  hintsBox.replaceChildren(); if (!list || !list.length) return;
  hintsBox.append(el('span', 'muted', 'Gợi ý (bấm để chép vào ô trả lời):'));
  list.slice(0, 2).forEach(h => { const b = el('button', null, h); b.type = 'button'; b.onclick = () => { input.value = h; input.focus(); }; hintsBox.append(b); });
}
function setBusy(v) { busy = v; send.disabled = v || !scene; input.disabled = v || !scene; }
function notice(t, withLogin) {
  const n = el('div', 'notice'); n.append(el('p', null, t));
  if (withLogin) { const b = el('button', 'btn primary', 'Đăng nhập Google'); b.style.marginTop = '10px'; b.onclick = () => Sync.signIn().then(() => { n.remove(); if (scene) turn(); }).catch(() => {}); n.append(b); }
  chat.append(n);
}
async function turn() {
  const tok = Sync.accessToken();
  if (!tok) { notice('Phần tập nói dùng AI trả phí nên cần đăng nhập Google để dùng. Bấm nút dưới đây (chỉ mất vài giây).', !!CFG.GOOGLE_CLIENT_ID); return; }
  setBusy(true); const t = el('p', 'typing', scene.who.split(' · ')[0] + ' đang trả lời…'); chat.append(t);
  try {
    const r = await fetch(CFG.AI_ENDPOINT.replace(/\/$/, '') + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ scene: scene.id, history: history.slice(-30), focus: focusWords() })
    });
    const d = await r.json().catch(() => ({}));
    t.remove();
    if (!r.ok) throw { status: r.status, msg: d.error };
    addFb(d.feedback); addAI(d); history.push({ who: 'ai', text: d.reply }); setHints(d.hints);
  } catch (e) {
    t.remove();
    const m = e && e.status === 401 ? 'Phiên đăng nhập đã hết. Hãy bấm "Tiếp tục với Google" ở đầu trang rồi gửi lại.'
      : e && e.status === 403 ? 'Tài khoản Gmail này chưa được phép dùng phần Tập nói. Hãy nhờ người quản lý app thêm email của bạn.'
      : e && e.status === 429 ? 'Bạn đã dùng hết lượt tập nói hôm nay. Mai quay lại nhé!'
      : 'Không nhận được trả lời từ AI. Hãy kiểm tra mạng rồi bấm Gửi lại.';
    notice(m, false);
  }
  setBusy(false); chat.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function start(s, btn) {
  if (busy) return;
  scenBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn));
  scene = s; history = []; chat.replaceChildren(); hintsBox.replaceChildren(); $('restart').hidden = false;
  if (!aiReady()) { $('ai-off').hidden = false; chat.append(el('p', 'muted', 'Chưa bật AI cho app này.')); setBusy(false); input.disabled = send.disabled = true; return; }
  const fw = focusWords();
  if (fw.length) chat.append(el('p', 'muted', 'AI sẽ cố lồng vào hội thoại vài từ bạn đang học: ' + fw.join(', ') + '.'));
  setBusy(false); turn();
}
async function submit() {
  const v = input.value.trim(); if (!v || busy || !scene) return;
  input.value = ''; addMe(v); history.push({ who: 'me', text: v.slice(0, 500) }); hintsBox.replaceChildren(); turn();
}
send.onclick = submit;
input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
$('restart').onclick = () => { if (scene) start(scene, [...scenBox.children][SCENES.indexOf(scene)]); };
if (!aiReady()) $('ai-off').hidden = false;

renderDays();
show(store.get('kt-tab', 'cau'));
