/* Polyglot Studio — เครื่องมือจัดการคลังคำศัพท์
   1) เติมข้อมูลที่ขาด (คำแปล / คำอ่าน / ระดับ CEFR) ทีละคำ พร้อมโหมดตั้งระดับด่วน
   2) แก้ไขหลายรายการพร้อมกันในหน้าคลังคำศัพท์ (ระดับ / หมวด / แท็ก / สถานะ / ลบ) พร้อมย้อนกลับ
   3) ตรวจคำซ้ำ คำไม่มีหมวด ช่องภาษาที่ว่าง พร้อมปุ่มรวมรายการ
   4) เสนอคำอ่านญี่ปุ่นจากพจนานุกรมออฟไลน์ (JMdict) — ผู้ใช้ต้องยืนยันก่อนบันทึกเสมอ ไม่เดา
   5) คำที่ลืมบ่อย (leech) พร้อมโหมดฝึกเฉพาะกลุ่ม
   ต้องโหลดหลัง study-features.js */
(function () {
  'use strict';
  const PGH = window.PG;
  if (!PGH) { try { console.warn('[polyglot] vocab-tools.js ต้องโหลดหลัง study-features.js'); } catch (e) {} return; }
  const { cleanTags, speakText, scheduleSM2, wordText } = PGH;
  const h = value => esc(value);
  const trim = value => String(value ?? '').trim();
  const norm = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const hasKanji = value => /[㐀-䶿一-鿿]/.test(String(value || ''));
  const nowIso = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const STATUSES = [['learning', 'กำลังเรียน'], ['practicing', 'กำลังฝึก'], ['review', 'ต้องทบทวน'], ['mastered', 'จำได้แม่นแล้ว']];
  const LANG_NAME = Object.fromEntries(LANGS);

  [['fill', 'เติมข้อมูลที่ขาด'], ['quality', 'ตรวจคุณภาพข้อมูล'], ['leeches', 'คำที่ลืมบ่อย']]
    .forEach(([id, label]) => { if (!VIEWS.some(item => item[0] === id)) VIEWS.push([id, label]); });
  if (!Array.isArray(S.dupIgnore)) S.dupIgnore = [];

  // ---------- บันทึกแบบหน่วงเวลา (ใช้ตอนกดตั้งระดับรัว ๆ ไม่ให้ต้องเขียน localStorage ทุกครั้ง) ----------
  let saveTimer = 0;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 350); };
  const flushSave = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; save(); } };
  addEventListener('pagehide', flushSave);
  addEventListener('hashchange', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

  // ---------- ย้อนกลับการแก้ไขล่าสุด ----------
  let lastUndo = null;
  function rememberUndo(label, editedWords, removed = []) {
    lastUndo = { label, edits: editedWords.map(clone), removed: removed.map(r => ({ index: r.index, word: clone(r.word) })) };
  }
  function undoLast() {
    if (!lastUndo) return false;
    const undo = lastUndo; lastUndo = null;
    const byId = new Map(S.words.map(w => [w.id, w]));
    undo.edits.forEach(before => {
      const current = byId.get(before.id);
      if (current) { Object.keys(current).forEach(k => { if (!(k in before)) delete current[k]; }); Object.assign(current, before); }
      else S.words.push(before);
    });
    undo.removed.sort((a, b) => a.index - b.index).forEach(r => {
      if (!S.words.some(w => w.id === r.word.id)) S.words.splice(Math.min(r.index, S.words.length), 0, r.word);
    });
    save();
    return true;
  }
  // แก้ไขกลุ่มคำตาม id: บันทึกสำเนาก่อนแก้เพื่อให้ย้อนกลับได้
  function applyToIds(ids, label, mutate) {
    const targets = S.words.filter(w => ids.has(w.id));
    if (!targets.length) return 0;
    rememberUndo(label, targets);
    const stamp = nowIso();
    let changed = 0;
    targets.forEach(w => { if (mutate(w)) { w.updatedAt = stamp; changed++; } });
    save();
    return changed;
  }

  // ---------- สไตล์ ----------
  const style = document.createElement('style');
  style.textContent = `
    #view [hidden]{display:none!important}
    .bulk-bar{padding:12px 14px;margin-bottom:12px}
    .bulk-row,.bulk-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .bulk-actions{margin-top:12px;padding-top:12px;border-top:1px dashed hsl(var(--border))}
    .bulk-check{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600}
    .bulk-count{font-size:12px;color:hsl(var(--muted-foreground))}
    .bulk-group{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 8px;border:1px solid hsl(var(--border));border-radius:12px}
    .bulk-group label{font:10px var(--app-font-mono);text-transform:uppercase;letter-spacing:.08em;color:hsl(var(--muted-foreground))}
    .bulk-group .select,.bulk-group .field{width:auto;min-width:110px;padding:7px 9px;min-height:36px}
    .bulk-group .button{min-height:36px;padding:6px 12px}
    .vocab-table .vc-main{position:relative;padding-left:36px}
    .bulk-cb{position:absolute;left:10px;top:16px;width:17px;height:17px;accent-color:hsl(var(--primary))}
    .vocab-table tr.bulk-selected td{background:hsl(var(--primary) / .07)}
    .fill-card{max-width:760px;text-align:left!important}
    .fill-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:14px}
    .fill-chips{display:flex;gap:5px;flex-wrap:wrap}
    .fill-missing{border-color:hsl(var(--accent))!important;background:hsl(var(--accent) / .12)!important}
    .fill-levels{display:flex;gap:6px;flex-wrap:wrap}
    .fill-levels label{cursor:pointer}
    .fill-levels input{position:absolute;opacity:0;pointer-events:none}
    .fill-levels span{display:inline-flex;min-width:48px;justify-content:center;padding:9px 12px;border:1px solid hsl(var(--border));border-radius:10px;font-weight:700;font-size:13px;background:hsl(var(--card))}
    .fill-levels input:checked+span{border-color:hsl(var(--primary));background:hsl(var(--primary) / .12);color:hsl(var(--primary))}
    .fill-levels input:focus-visible+span{outline:2px solid hsl(var(--ring));outline-offset:2px}
    .fill-level-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0 6px}
    .fill-level-buttons .button{min-height:64px;font-size:20px;flex-direction:column;gap:2px}
    .fill-level-buttons .button.current{outline:2px solid hsl(var(--primary))}
    .fill-lines{display:grid;gap:4px;margin-top:6px;font-size:15px;line-height:1.5}
    .fill-lines small{color:hsl(var(--muted-foreground));font:10px var(--app-font-mono);margin-right:6px}
    .gap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;margin:12px 0}
    .gap-grid label{display:flex;gap:8px;align-items:center;padding:9px 11px;border:1px solid hsl(var(--border));border-radius:11px;font-size:12px;cursor:pointer;background:hsl(var(--card))}
    .gap-grid label.off{opacity:.45}
    .gap-grid .tag{margin-left:auto}
    .fill-progress{height:8px;border-radius:99px;background:hsl(var(--muted));overflow:hidden;margin-bottom:12px}
    .fill-progress>div{height:100%;background:hsl(var(--primary));transition:width .2s}
    .q-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    .dup-group{margin-bottom:12px}
    .dup-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .dup-table td{vertical-align:top}
    .miss-chip{display:inline-flex;border-radius:999px;padding:2px 8px;background:hsl(var(--accent) / .22);font-size:10px;margin:2px 3px 2px 0}
    .kana-row{display:grid;grid-template-columns:auto minmax(80px,1fr) minmax(130px,1.2fr) minmax(140px,2fr);gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid hsl(var(--border))}
    .kana-row .jp{font-size:20px;font-weight:700}
    .kana-ok{color:#2c7a4b}.kana-warn{color:#a8651d}
    .leech-row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px;border:1px solid hsl(var(--border));border-radius:13px;background:hsl(var(--card));margin-bottom:8px;flex-wrap:wrap}
    .leech-meta{font-size:11px;color:hsl(var(--muted-foreground));margin-top:4px}
    @media(max-width:700px){.kana-row{grid-template-columns:auto 1fr}.kana-row>*:nth-child(n+3){grid-column:2}.fill-level-buttons{grid-template-columns:repeat(3,minmax(0,1fr))}.bulk-group{width:100%}.bulk-group .select,.bulk-group .field{flex:1}}
  `;
  document.head.appendChild(style);

  const datalistOptions = values => values.map(v => `<option value="${h(v)}"></option>`).join('');
  const allCategories = () => cols();

  // =====================================================================
  // 2) แก้ไขหลายรายการพร้อมกัน
  // =====================================================================
  const bulkSel = new Set();

  function filteredWords() {
    const day = today();
    let words = S.words.filter(match).filter(w => filter === 'all' || (filter === 'fav' ? w.favorite : (window.pgDueWords ? pgDueIds().has(w.id) : w.last !== day)));
    const level = document.querySelector('#vlevel')?.value || '';
    if (level) words = words.filter(w => (w.level || '') === level);
    const tag = document.querySelector('#vtag')?.value || '';
    if (tag) words = words.filter(w => cleanTags(w.tags).includes(tag));
    return words;
  }

  function bulkBarHtml() {
    return `<div id="bulk-bar" class="panel bulk-bar">
      <div class="bulk-row">
        <label class="bulk-check"><input type="checkbox" id="bulk-visible"> เลือกที่แสดงอยู่</label>
        <button type="button" class="button button-outline" id="bulk-filtered">เลือกทุกคำที่ตรงตัวกรอง (<span id="bulk-filtered-n">0</span>)</button>
        <span class="bulk-count" id="bulk-count">ยังไม่ได้เลือกคำ — ติ๊กที่หน้าคำเพื่อแก้หลายรายการพร้อมกัน</span>
        <button type="button" class="button button-outline" id="bulk-clear" hidden>ล้างที่เลือก</button>
        <button type="button" class="button button-soft" id="bulk-undo" hidden></button>
      </div>
      <div class="bulk-actions" id="bulk-actions" hidden>
        <div class="bulk-group"><label for="bulk-level">ระดับ</label><select class="select" id="bulk-level"><option value="">— เลือก —</option>${LEVELS.map(l => `<option>${l}</option>`).join('')}<option value="__clear__">ล้างระดับ</option></select><button type="button" class="button button-primary" id="bulk-level-go">ตั้งระดับ</button></div>
        <div class="bulk-group"><label for="bulk-cat">หมวด</label><input class="field" id="bulk-cat" list="bulk-cat-list" placeholder="ชื่อหมวด (ว่าง = ล้างหมวด)" autocomplete="off"><datalist id="bulk-cat-list">${datalistOptions(allCategories())}</datalist><button type="button" class="button button-primary" id="bulk-cat-go">ตั้งหมวด</button></div>
        <div class="bulk-group"><label for="bulk-status">สถานะ</label><select class="select" id="bulk-status">${STATUSES.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select><button type="button" class="button button-primary" id="bulk-status-go">ตั้งสถานะ</button></div>
        <div class="bulk-group"><label for="bulk-tag">แท็ก</label><input class="field" id="bulk-tag" placeholder="เช่น อาหาร, งาน" autocomplete="off"><button type="button" class="button button-primary" id="bulk-tag-add">เพิ่ม</button><button type="button" class="button button-outline" id="bulk-tag-del">เอาออก</button></div>
        <div class="bulk-group"><button type="button" class="button button-danger" id="bulk-delete">ลบที่เลือก</button></div>
      </div></div>`;
  }

  function refreshAfterBulk(full) {
    if (full) vocab(); else { list(); }
  }

  function updateBulkUi() {
    const bar = document.querySelector('#bulk-bar');
    if (!bar) return;
    const live = new Set(S.words.map(w => w.id));
    [...bulkSel].forEach(id => { if (!live.has(id)) bulkSel.delete(id); });
    const count = bulkSel.size;
    const countEl = bar.querySelector('#bulk-count');
    countEl.textContent = count ? `เลือกแล้ว ${count.toLocaleString()} คำ` : 'ยังไม่ได้เลือกคำ — ติ๊กที่หน้าคำเพื่อแก้หลายรายการพร้อมกัน';
    bar.querySelector('#bulk-actions').hidden = !count;
    bar.querySelector('#bulk-clear').hidden = !count;
    const undo = bar.querySelector('#bulk-undo');
    undo.hidden = !lastUndo;
    if (lastUndo) undo.textContent = `↩ ย้อนกลับ: ${lastUndo.label}`;
    const boxes = [...document.querySelectorAll('#vlist .bulk-cb')];
    const checked = boxes.filter(box => bulkSel.has(box.dataset.bid)).length;
    const visible = bar.querySelector('#bulk-visible');
    visible.checked = boxes.length > 0 && checked === boxes.length;
    visible.indeterminate = checked > 0 && checked < boxes.length;
    bar.querySelector('#bulk-filtered-n').textContent = filteredWords().length.toLocaleString();
  }

  function decorateBulkRows() {
    document.querySelectorAll('#vlist tbody tr').forEach(tr => {
      const id = tr.dataset.wordId;
      const main = tr.querySelector('.vc-main');
      if (!id || !main) return;
      let box = main.querySelector('.bulk-cb');
      if (!box) {
        main.insertAdjacentHTML('afterbegin', `<input type="checkbox" class="bulk-cb" aria-label="เลือกคำนี้" data-bid="${h(id)}">`);
        box = main.querySelector('.bulk-cb');
        box.addEventListener('change', () => {
          if (box.checked) bulkSel.add(id); else bulkSel.delete(id);
          tr.classList.toggle('bulk-selected', box.checked);
          updateBulkUi();
        });
      }
      box.checked = bulkSel.has(id);
      tr.classList.toggle('bulk-selected', box.checked);
    });
    updateBulkUi();
  }

  function installBulkBar() {
    const vlist = document.querySelector('#vlist');
    if (!vlist || document.querySelector('#bulk-bar')) return;
    vlist.insertAdjacentHTML('beforebegin', bulkBarHtml());
    const $b = sel => document.querySelector('#bulk-bar ' + sel);
    $b('#bulk-visible').onchange = event => {
      document.querySelectorAll('#vlist .bulk-cb').forEach(box => {
        box.checked = event.target.checked;
        if (box.checked) bulkSel.add(box.dataset.bid); else bulkSel.delete(box.dataset.bid);
        box.closest('tr')?.classList.toggle('bulk-selected', box.checked);
      });
      updateBulkUi();
    };
    $b('#bulk-filtered').onclick = () => { filteredWords().forEach(w => bulkSel.add(w.id)); decorateBulkRows(); };
    $b('#bulk-clear').onclick = () => { bulkSel.clear(); decorateBulkRows(); };
    $b('#bulk-undo').onclick = () => {
      const label = lastUndo?.label;
      if (undoLast()) { toast(`ย้อนกลับแล้ว: ${label}`); refreshAfterBulk(true); }
    };
    $b('#bulk-level-go').onclick = () => {
      const value = $b('#bulk-level').value;
      if (!value) return toast('เลือกระดับก่อนนะ');
      const level = value === '__clear__' ? '' : value;
      const n = applyToIds(bulkSel, level ? `ตั้งระดับ ${level}` : 'ล้างระดับ', w => { if ((w.level || '') === level) return false; w.level = level; return true; });
      toast(`${level ? 'ตั้งระดับ ' + level : 'ล้างระดับ'} ให้ ${n.toLocaleString()} คำแล้ว`); refreshAfterBulk(false);
    };
    $b('#bulk-cat-go').onclick = () => {
      const value = trim($b('#bulk-cat').value);
      if (!value && !confirm(`ล้างหมวดของ ${bulkSel.size.toLocaleString()} คำที่เลือกใช่ไหม?`)) return;
      const n = applyToIds(bulkSel, value ? `ตั้งหมวด “${value}”` : 'ล้างหมวด', w => { if (trim(w.category) === value) return false; w.category = value; return true; });
      toast(`${value ? 'ตั้งหมวด “' + value + '”' : 'ล้างหมวด'} ให้ ${n.toLocaleString()} คำแล้ว`); refreshAfterBulk(true);
    };
    $b('#bulk-status-go').onclick = () => {
      const value = $b('#bulk-status').value, name = STATUSES.find(s => s[0] === value)?.[1] || value;
      const n = applyToIds(bulkSel, `ตั้งสถานะ ${name}`, w => { if ((w.workStatus || 'learning') === value) return false; w.workStatus = value; return true; });
      toast(`ตั้งสถานะ “${name}” ให้ ${n.toLocaleString()} คำแล้ว`); refreshAfterBulk(false);
    };
    const tagOp = remove => {
      const tags = cleanTags($b('#bulk-tag').value);
      if (!tags.length) return toast('พิมพ์แท็กก่อนนะ (คั่นหลายแท็กด้วยจุลภาค)');
      const n = applyToIds(bulkSel, `${remove ? 'เอาแท็กออก' : 'เพิ่มแท็ก'} ${tags.join(', ')}`, w => {
        const before = cleanTags(w.tags);
        const after = remove ? before.filter(t => !tags.includes(t)) : cleanTags([...before, ...tags]);
        if (after.length === before.length && after.every((t, i) => t === before[i])) return false;
        w.tags = after; return true;
      });
      toast(`${remove ? 'เอาแท็กออกจาก' : 'เพิ่มแท็กให้'} ${n.toLocaleString()} คำแล้ว`); refreshAfterBulk(true);
    };
    $b('#bulk-tag-add').onclick = () => tagOp(false);
    $b('#bulk-tag-del').onclick = () => tagOp(true);
    $b('#bulk-delete').onclick = () => {
      const count = bulkSel.size;
      if (!count || !confirm(`ลบ ${count.toLocaleString()} คำที่เลือกใช่ไหม?\n(กด “ย้อนกลับ” ได้ทันทีหลังลบ แต่ถ้าปิดหน้านี้จะย้อนกลับไม่ได้)`)) return;
      const removed = [];
      S.words.forEach((w, index) => { if (bulkSel.has(w.id)) removed.push({ index, word: w }); });
      rememberUndo(`ลบ ${count.toLocaleString()} คำ`, [], removed);
      S.words = S.words.filter(w => !bulkSel.has(w.id));
      bulkSel.clear();
      save();
      toast(`ลบ ${count.toLocaleString()} คำแล้ว`); refreshAfterBulk(true);
    };
  }

  const previousVocab = vocab;
  vocab = function () { previousVocab.apply(this, arguments); installBulkBar(); decorateBulkRows(); };
  const previousList = list;
  list = function () { previousList.apply(this, arguments); decorateBulkRows(); };

  // =====================================================================
  // 1) เติมข้อมูลที่ขาด
  // =====================================================================
  const GAPS = [
    { id: 'th', label: 'ไม่มีคำแปลไทย', test: w => !trim(w.th) },
    { id: 'en', label: 'ไม่มีคำแปลอังกฤษ', test: w => !trim(w.en) },
    { id: 'cn', label: 'ไม่มีภาษาจีน', test: w => !trim(w.cn) },
    { id: 'jp', label: 'ไม่มีภาษาญี่ปุ่น', test: w => !trim(w.jp) },
    { id: 'kr', label: 'ไม่มีภาษาเกาหลี', test: w => !trim(w.kr) },
    { id: 'cnr', label: 'จีนยังไม่มีพินอิน', test: w => !!trim(w.cn) && !trim(w.cnr) },
    { id: 'jpr', label: 'ญี่ปุ่น (มีคันจิ) ยังไม่มีคำอ่าน', test: w => hasKanji(w.jp) && !(trim(w.jpKana) || trim(w.jpFurigana) || trim(w.jpr)) },
    { id: 'krr', label: 'เกาหลียังไม่มีคำอ่าน', test: w => !!trim(w.kr) && !trim(w.krr) },
    { id: 'level', label: 'ยังไม่ได้กำหนดระดับ CEFR', test: w => !trim(w.level) },
    { id: 'category', label: 'ไม่มีหมวดหมู่', test: w => !trim(w.category) }
  ];
  const GAP_BY_ID = Object.fromEntries(GAPS.map(g => [g.id, g]));
  const fillState = { gaps: new Set(['th', 'en']), cat: '', mode: 'form', queue: null, pos: 0, edited: 0 };

  const wordById = id => S.words.find(w => w.id === id);
  const effectiveGaps = () => fillState.mode === 'level' ? new Set(['level']) : fillState.gaps;
  function fillCandidates() {
    const gaps = effectiveGaps();
    return S.words.filter(w => {
      if (fillState.cat === '-' ? trim(w.category) : (fillState.cat && trim(w.category) !== fillState.cat)) return false;
      for (const id of gaps) if (GAP_BY_ID[id].test(w)) return true;
      return false;
    }).sort(byOrder);
  }

  function fillView() {
    view.innerHTML = pageHead('เติมข้อมูลที่ขาด', 'ไล่เติมคำแปล คำอ่าน และระดับ CEFR ทีละคำ กดบันทึกแล้วไปคำถัดไปได้เลย') + '<div id="fill-body"></div>';
    if (fillState.queue) renderFillCard(); else renderFillSetup();
  }

  function renderFillSetup() {
    const body = document.querySelector('#fill-body');
    const counts = Object.fromEntries(GAPS.map(g => [g.id, S.words.filter(g.test).length]));
    const levelMode = fillState.mode === 'level';
    body.innerHTML = `<section class="panel panel-pad study-panel">
      <div class="quiz-grid">
        <div><label class="section-kicker" for="fill-mode">โหมด</label><select class="select" id="fill-mode"><option value="form" ${levelMode ? '' : 'selected'}>ฟอร์มเต็ม — แก้คำแปล คำอ่าน หมวด และระดับ</option><option value="level" ${levelMode ? 'selected' : ''}>ตั้งระดับด่วน — กดปุ่ม A1–C2 แล้วข้ามไปคำถัดไปทันที</option></select></div>
        <div><label class="section-kicker" for="fill-cat">เฉพาะหมวด</label><select class="select" id="fill-cat"><option value="">ทุกหมวดหมู่</option>${allCategories().map(c => `<option value="${h(c)}" ${fillState.cat === c ? 'selected' : ''}>${h(c)}</option>`).join('')}<option value="-" ${fillState.cat === '-' ? 'selected' : ''}>ไม่มีหมวดหมู่</option></select></div>
      </div>
      <div id="fill-gaps" ${levelMode ? 'hidden' : ''}>
        <p class="section-kicker" style="margin-top:16px">คัดเฉพาะคำที่ … (ติ๊กได้หลายข้อ คำที่ตรงข้อใดข้อหนึ่งจะเข้าคิว)</p>
        <div class="gap-grid">${GAPS.map(g => `<label><input type="checkbox" data-gap="${g.id}" ${fillState.gaps.has(g.id) ? 'checked' : ''}> ${g.label} <span class="tag">${counts[g.id].toLocaleString()}</span></label>`).join('')}</div>
      </div>
      <p class="study-meta" id="fill-count" style="font-size:13px"></p>
      <div class="study-actions"><button class="button button-primary" id="fill-start">เริ่มเติม</button></div>
      <p class="study-meta">ระบบไม่เดาคำแปลหรือระดับให้ ทุกช่องมาจากสิ่งที่คุณพิมพ์หรือกดเองเท่านั้น · ไฟล์ <code>missing-translations.csv</code> คือรายการเดียวกับ “ไม่มีคำแปลไทย/อังกฤษ”</p></section>`;
    const refreshCount = () => {
      const n = fillCandidates().length;
      body.querySelector('#fill-count').textContent = n ? `ตรงเงื่อนไข ${n.toLocaleString()} คำ` : 'ไม่มีคำที่ตรงเงื่อนไขนี้แล้ว 🎉';
      body.querySelector('#fill-start').disabled = !n;
    };
    body.querySelector('#fill-mode').onchange = event => { fillState.mode = event.target.value; renderFillSetup(); };
    body.querySelector('#fill-cat').onchange = event => { fillState.cat = event.target.value; refreshCount(); };
    body.querySelectorAll('[data-gap]').forEach(box => box.onchange = () => {
      if (box.checked) fillState.gaps.add(box.dataset.gap); else fillState.gaps.delete(box.dataset.gap);
      refreshCount();
    });
    body.querySelector('#fill-start').onclick = () => {
      fillState.queue = fillCandidates().map(w => w.id);
      fillState.pos = 0; fillState.edited = 0;
      renderFillCard();
    };
    refreshCount();
  }

  const fillField = (id, label, value, missing, extra = '') => `<div class="form-field"><label for="ff-${id}">${label}</label><input class="field ${missing ? 'fill-missing' : ''}" id="ff-${id}" name="${id}" value="${h(value || '')}" autocomplete="off" ${extra}></div>`;

  function renderFillCard() {
    const body = document.querySelector('#fill-body');
    if (!body || !fillState.queue) return;
    flushSave();
    const total = fillState.queue.length;
    while (fillState.pos < total && !wordById(fillState.queue[fillState.pos])) fillState.pos++;
    if (fillState.pos >= total) return renderFillDone();
    const w = wordById(fillState.queue[fillState.pos]);
    const gaps = effectiveGaps();
    const isMissing = id => gaps.has(id) && GAP_BY_ID[id].test(w);
    const pct = Math.round(fillState.pos / total * 100);
    const progress = `<div class="fill-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${fillState.pos}"><div style="width:${pct}%"></div></div>`;
    const top = `<div class="fill-top"><span class="tag">คำที่ ${fillState.pos + 1} / ${total.toLocaleString()} · แก้แล้ว ${fillState.edited.toLocaleString()}</span><button type="button" class="button button-outline" id="fill-quit" style="min-height:34px;padding:6px 12px">เปลี่ยนเงื่อนไข</button></div>`;

    if (fillState.mode === 'level') {
      const lines = LANGS.map(([code, name]) => trim(w[code]) ? `<div><small>${name}</small>${h(w[code])}${trim(w[code + 'r']) ? ` <span class="study-meta">(${h(w[code + 'r'])})</span>` : ''}</div>` : '').join('');
      body.innerHTML = `${progress}<section class="panel study-card fill-card">${top}
        <div class="study-front" style="margin:4px 0">${h(w.en || w.th || w.jp || w.cn || w.kr)}</div>
        <div class="fill-lines">${lines}</div>
        <div class="study-meta">${h(w.category || 'ไม่มีหมวดหมู่')}</div>
        <div class="fill-level-buttons">${LEVELS.map((l, i) => `<button type="button" class="button button-outline ${w.level === l ? 'current' : ''}" data-level="${l}">${l}<kbd class="study-key">${i + 1}</kbd></button>`).join('')}</div>
        <div class="study-actions" style="justify-content:space-between"><button type="button" class="button button-outline" id="fill-back">← ก่อนหน้า</button><button type="button" class="button button-soft" id="fill-skip">ข้าม <kbd class="study-key">Space</kbd></button></div>
        <div class="study-meta study-keyhint">คีย์ลัด: <kbd class="study-key">1</kbd>–<kbd class="study-key">6</kbd> ตั้ง A1–C2 และไปคำถัดไป · <kbd class="study-key">Space</kbd> / <kbd class="study-key">→</kbd> ข้าม · <kbd class="study-key">←</kbd> ย้อนกลับ</div></section>`;
      body.querySelectorAll('[data-level]').forEach(button => button.onclick = () => setLevelQuick(w, button.dataset.level));
    } else {
      const chips = GAPS.filter(g => g.test(w) && g.id !== 'level' && g.id !== 'category').map(g => `<span class="miss-chip">${g.label}</span>`).join('');
      const currentLevel = trim(w.level);
      body.innerHTML = `${progress}<form class="panel study-card fill-card" id="fill-form" autocomplete="off">${top}
        <div class="fill-chips" style="margin-bottom:12px">${chips || '<span class="study-meta">คำนี้มีข้อมูลพื้นฐานครบแล้ว</span>'}</div>
        <div class="form-grid">
          ${fillField('th', 'ไทย', w.th, isMissing('th'))}${fillField('en', 'อังกฤษ', w.en, isMissing('en'))}
          ${fillField('cn', 'จีน', w.cn, isMissing('cn'))}${fillField('cnr', 'จีน · พินอิน', w.cnr, isMissing('cnr'))}
          ${fillField('jp', 'ญี่ปุ่น', w.jp, isMissing('jp'))}${fillField('jpKana', 'ญี่ปุ่น · คำอ่านฮิรางานะ', w.jpKana, isMissing('jpr'), 'placeholder="ひらがな"')}
          ${fillField('jpr', 'ญี่ปุ่น · โรมาจิ (ถ้ามี)', w.jpr, false)}${fillField('kr', 'เกาหลี', w.kr, isMissing('kr'))}
          ${fillField('krr', 'เกาหลี · คำอ่าน', w.krr, isMissing('krr'))}${fillField('category', 'หมวดหมู่', w.category, isMissing('category'), 'list="ff-cat-list"')}
        </div><datalist id="ff-cat-list">${datalistOptions(allCategories())}</datalist>
        <div class="form-field" style="margin-top:14px"><span class="section-kicker">ระดับ CEFR</span><div class="fill-levels"><label><input type="radio" name="level" value="" ${currentLevel ? '' : 'checked'}><span>—</span></label>${LEVELS.map(l => `<label><input type="radio" name="level" value="${l}" ${currentLevel === l ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
        <div class="study-actions" style="justify-content:space-between;margin-top:18px"><span style="display:flex;gap:8px"><button type="button" class="button button-outline" id="fill-back">← ก่อนหน้า</button><button type="button" class="button button-soft" id="fill-skip">ข้าม</button></span><button type="submit" class="button button-primary">บันทึกแล้วไปคำถัดไป ✓</button></div>
        <div class="study-meta study-keyhint">กด <kbd class="study-key">Enter</kbd> ในช่องใดก็ได้เพื่อบันทึกแล้วไปคำถัดไป</div></form>`;
      const first = body.querySelector('.fill-missing') || body.querySelector('input.field');
      if (first && !matchMedia('(pointer:coarse)').matches) first.focus();
      body.querySelector('#fill-form').onsubmit = event => {
        event.preventDefault();
        const form = event.target;
        const values = Object.fromEntries(['th', 'en', 'cn', 'cnr', 'jp', 'jpKana', 'jpr', 'kr', 'krr', 'category'].map(k => [k, trim(form.elements[k].value)]));
        values.level = form.elements.level.value;
        let changed = false;
        Object.entries(values).forEach(([k, v]) => { if (trim(w[k]) !== v) { w[k] = v; changed = true; } });
        if (changed) {
          if (values.jpKana && hasKanji(w.jp) && !trim(w.jpFurigana)) w.jpFurigana = values.jpKana;
          w.updatedAt = nowIso(); fillState.edited++; save();
        }
        fillState.pos++; renderFillCard();
      };
    }
    body.querySelector('#fill-back').onclick = () => { fillState.pos = Math.max(0, fillState.pos - 1); renderFillCard(); };
    body.querySelector('#fill-skip').onclick = () => { fillState.pos++; renderFillCard(); };
    body.querySelector('#fill-quit').onclick = () => { flushSave(); fillState.queue = null; renderFillSetup(); };
  }

  function setLevelQuick(word, level) {
    if ((word.level || '') !== level) { word.level = level; word.updatedAt = nowIso(); fillState.edited++; saveSoon(); }
    fillState.pos++;
    renderFillCard();
  }

  function renderFillDone() {
    flushSave();
    const body = document.querySelector('#fill-body');
    const remaining = fillCandidates().length;
    body.innerHTML = `<section class="panel panel-pad study-panel"><div class="empty-state"><h3>จบคิวแล้ว 🎉</h3><p>แก้ไขไป ${fillState.edited.toLocaleString()} คำ จากทั้งหมด ${fillState.queue.length.toLocaleString()} คำในคิวนี้${remaining ? ` · ยังเหลือคำที่ตรงเงื่อนไขอีก ${remaining.toLocaleString()} คำ (ที่ข้ามไว้หรือยังเติมไม่ครบ)` : ''}</p>
      <div class="study-actions" style="justify-content:center">${remaining ? '<button class="button button-primary" id="fill-again">เริ่มคิวใหม่ด้วยเงื่อนไขเดิม</button>' : ''}<button class="button button-outline" id="fill-setup">เปลี่ยนเงื่อนไข</button><a class="button button-soft" href="#vocab">เปิดคลังคำศัพท์</a></div></div></section>`;
    const again = body.querySelector('#fill-again');
    if (again) again.onclick = () => { fillState.queue = fillCandidates().map(w => w.id); fillState.pos = 0; fillState.edited = 0; renderFillCard(); };
    body.querySelector('#fill-setup').onclick = () => { fillState.queue = null; renderFillSetup(); };
  }

  document.addEventListener('keydown', event => {
    if (route() !== 'fill' || !fillState.queue || fillState.mode !== 'level') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (/^[1-6]$/.test(event.key)) {
      const word = wordById(fillState.queue[fillState.pos]);
      if (word) { event.preventDefault(); setLevelQuick(word, LEVELS[Number(event.key) - 1]); }
    } else if (event.key === ' ' || event.key === 'ArrowRight') {
      if (target?.matches?.('button, a')) return;
      event.preventDefault(); fillState.pos++; renderFillCard();
    } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
      if (target?.matches?.('button, a')) return;
      event.preventDefault(); fillState.pos = Math.max(0, fillState.pos - 1); renderFillCard();
    }
  });

  // =====================================================================
  // 3) + 4) ตรวจคุณภาพข้อมูล และเสนอคำอ่านญี่ปุ่น
  // =====================================================================
  const qState = { tab: 'dup', dupMode: 'strict', dupLimit: 20, catSel: new Set(), catLimit: 100, gapLimit: 100, gapLangs: new Set(['th', 'en', 'cn', 'jp', 'kr']), kanaLimit: 100, kana: null, kanaLoading: false };
  const DUP_MODES = [['strict', 'ไทย + อังกฤษ เหมือนกันทั้งคู่ (ปลอดภัยที่สุด)'], ['th', 'ภาษาไทยเหมือนกัน'], ['en', 'ภาษาอังกฤษเหมือนกัน'], ['jp', 'ภาษาญี่ปุ่นเหมือนกัน'], ['cn', 'ภาษาจีนเหมือนกัน'], ['kr', 'ภาษาเกาหลีเหมือนกัน']];
  let currentGroups = [];

  function dupKeyFn(mode) {
    if (mode === 'strict') return w => { const a = norm(w.th), b = norm(w.en); return a || b ? a + '␟' + b : ''; };
    return w => norm(w[mode]);
  }
  function dupGroups(mode) {
    const keyOf = dupKeyFn(mode), groups = new Map(), ignored = new Set(S.dupIgnore || []);
    S.words.forEach(w => { const key = keyOf(w); if (!key) return; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(w); });
    return [...groups.entries()].filter(([key, words]) => words.length > 1 && !ignored.has(mode + '|' + key))
      .map(([key, words]) => ({ key, words })).sort((a, b) => b.words.length - a.words.length || a.key.localeCompare(b.key));
  }
  const MERGE_TEXT = ['th', 'en', 'cn', 'jp', 'kr', 'cnr', 'jpr', 'krr', 'jpKana', 'jpKanji', 'jpFurigana', 'category', 'level', 'colorTag'];
  const filledCount = w => ['th', 'en', 'cn', 'jp', 'kr', 'category', 'level', 'note'].filter(k => trim(w[k])).length;
  const progressScore = w => (Number(w.repetitions) || 0) * 100 + (Array.isArray(w.reviewHistory) ? w.reviewHistory.length : 0) * 10 + filledCount(w) + (w.favorite ? 1 : 0);
  const bestOf = words => [...words].sort((a, b) => progressScore(b) - progressScore(a) || byOrder(a, b))[0];

  // รวมคำซ้ำเข้ารายการที่เลือก: เติมช่องว่าง, รวมแท็ก/ประวัติ/ตัวนับ, ค่าที่ขัดกันถูกจดไว้ในโน้ตไม่ให้หายเงียบ ๆ
  function mergeInto(keeper, others) {
    const conflicts = [];
    const bestProgress = bestOf([keeper, ...others]);
    others.forEach(other => {
      MERGE_TEXT.forEach(k => {
        if (!trim(keeper[k]) && trim(other[k])) keeper[k] = other[k];
        else if (['th', 'en', 'cn', 'jp', 'kr'].includes(k) && trim(other[k]) && norm(other[k]) !== norm(keeper[k])) conflicts.push(`${k}: ${trim(other[k])}`);
      });
      if (trim(other.note) && !String(keeper.note || '').includes(trim(other.note))) keeper.note = [trim(keeper.note), trim(other.note)].filter(Boolean).join(' / ');
      keeper.favorite = !!(keeper.favorite || other.favorite);
      keeper.tags = cleanTags([...cleanTags(keeper.tags), ...cleanTags(other.tags)]);
      keeper.lapses = (Number(keeper.lapses) || 0) + (Number(other.lapses) || 0);
      keeper.quizWrong = (Number(keeper.quizWrong) || 0) + (Number(other.quizWrong) || 0);
      if (other.createdAt && (!keeper.createdAt || other.createdAt < keeper.createdAt)) keeper.createdAt = other.createdAt;
      if (!keeper.workStatus || (keeper.workStatus === 'learning' && other.workStatus && other.workStatus !== 'learning')) keeper.workStatus = other.workStatus || keeper.workStatus;
      keeper.order = Math.min(Number(keeper.order) || 0, Number(other.order) || 0);
    });
    if (bestProgress && bestProgress !== keeper) {
      ['easeFactor', 'intervalDays', 'repetitions', 'dueAt', 'lastReviewed', 'last', 'introducedAt'].forEach(k => { if (bestProgress[k] !== undefined) keeper[k] = bestProgress[k]; });
    }
    const history = [keeper, ...others].flatMap(w => Array.isArray(w.reviewHistory) ? w.reviewHistory : []);
    keeper.reviewHistory = history.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-30);
    if (conflicts.length) keeper.note = [trim(keeper.note), `รวมจากรายการซ้ำ → ${[...new Set(conflicts)].join('; ')}`].filter(Boolean).join(' / ');
    keeper.updatedAt = nowIso();
  }
  function mergeGroups(plan, label) { // plan: [{keeper, others}]
    const removeIds = new Set(plan.flatMap(p => p.others.map(w => w.id)));
    const removed = [];
    S.words.forEach((w, index) => { if (removeIds.has(w.id)) removed.push({ index, word: w }); });
    rememberUndo(label, plan.map(p => p.keeper), removed);
    plan.forEach(p => mergeInto(p.keeper, p.others));
    S.words = S.words.filter(w => !removeIds.has(w.id));
    save();
    return removeIds.size;
  }

  function qualityView() {
    const dupCount = dupGroups('strict').length;
    const noCat = S.words.filter(w => !trim(w.category)).length;
    const tabs = [['dup', `คำซ้ำ (${dupCount})`], ['cat', `ไม่มีหมวด (${noCat.toLocaleString()})`], ['gaps', 'ช่องภาษาที่ว่าง'], ['kana', 'คำอ่านญี่ปุ่น']];
    view.innerHTML = pageHead('ตรวจคุณภาพข้อมูล', 'หาคำซ้ำ คำที่ไม่มีหมวด ช่องภาษาที่ยังว่าง และเติมคำอ่านญี่ปุ่นจากพจนานุกรมในเครื่อง') +
      `<div class="q-tabs" role="tablist">${tabs.map(([id, label]) => `<button class="button ${qState.tab === id ? 'button-primary' : 'button-outline'}" role="tab" aria-selected="${qState.tab === id}" data-qtab="${id}">${label}</button>`).join('')}<button class="button button-soft" id="q-undo" ${lastUndo ? '' : 'hidden'}>↩ ย้อนกลับ: ${h(lastUndo?.label || '')}</button></div><div id="q-body"></div>`;
    view.querySelectorAll('[data-qtab]').forEach(button => button.onclick = () => { qState.tab = button.dataset.qtab; qualityView(); });
    view.querySelector('#q-undo').onclick = () => { const label = lastUndo?.label; if (undoLast()) { toast(`ย้อนกลับแล้ว: ${label}`); qualityView(); } };
    ({ dup: renderDupTab, cat: renderCatTab, gaps: renderGapTab, kana: renderKanaTab })[qState.tab]();
  }

  const fieldSummary = w => [w.th, w.en, w.cn, w.jp, w.kr].filter(Boolean).map(h).join(' · ');

  function renderDupTab() {
    const body = document.querySelector('#q-body');
    currentGroups = dupGroups(qState.dupMode);
    const shown = currentGroups.slice(0, qState.dupLimit);
    const strict = qState.dupMode === 'strict';
    const extra = currentGroups.reduce((n, g) => n + g.words.length - 1, 0);
    body.innerHTML = `<section class="panel panel-pad"><div class="quiz-grid"><div><label class="section-kicker" for="dup-mode">ถือว่าซ้ำเมื่อ</label><select class="select" id="dup-mode">${DUP_MODES.map(([id, label]) => `<option value="${id}" ${qState.dupMode === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:end;gap:8px;flex-wrap:wrap">${strict && currentGroups.length ? '<button class="button button-primary" id="dup-merge-all">รวมทุกกลุ่ม</button>' : ''}${S.dupIgnore.length ? `<button class="button button-outline" id="dup-reset-ignore">แสดงกลุ่มที่ซ่อนไว้ (${S.dupIgnore.length})</button>` : ''}</div></div>
      <p class="study-meta">${currentGroups.length ? `พบ ${currentGroups.length.toLocaleString()} กลุ่ม (ซ้ำเกิน ${extra.toLocaleString()} รายการ)` : 'ไม่พบคำซ้ำตามเงื่อนไขนี้ 🎉'}${strict ? '' : ' · ภาษาเดียวที่เหมือนกันอาจเป็นคนละความหมายได้ (เช่น คำพ้องรูป) ตรวจดูก่อนรวมทีละกลุ่ม และกด “ไม่ใช่คำซ้ำ” ถ้าตั้งใจให้แยกกัน'}</p></section>
      <div id="dup-list" style="margin-top:12px">${shown.map((group, gi) => dupGroupHtml(group, gi)).join('')}</div>
      ${currentGroups.length > shown.length ? `<button class="button button-outline" id="dup-more" style="margin:8px auto;display:flex">แสดงเพิ่ม (เหลืออีก ${(currentGroups.length - shown.length).toLocaleString()} กลุ่ม)</button>` : ''}`;
    body.querySelector('#dup-mode').onchange = event => { qState.dupMode = event.target.value; qState.dupLimit = 20; renderDupTab(); };
    const more = body.querySelector('#dup-more'); if (more) more.onclick = () => { qState.dupLimit += 20; renderDupTab(); };
    const reset = body.querySelector('#dup-reset-ignore'); if (reset) reset.onclick = () => { S.dupIgnore = []; save(); qualityView(); };
    const all = body.querySelector('#dup-merge-all');
    if (all) all.onclick = () => {
      const plan = currentGroups.map(group => { const keeper = bestOf(group.words); return { keeper, others: group.words.filter(w => w !== keeper) }; });
      const removing = plan.reduce((n, p) => n + p.others.length, 0);
      if (!confirm(`รวมคำซ้ำ ${plan.length.toLocaleString()} กลุ่ม (ลบรายการที่ซ้ำ ${removing.toLocaleString()} รายการ)?\nระบบเก็บรายการที่มีความคืบหน้าการเรียนมากที่สุดไว้ และย้อนกลับได้จนกว่าจะปิดหน้านี้`)) return;
      const n = mergeGroups(plan, `รวมคำซ้ำ ${plan.length} กลุ่ม`);
      toast(`รวมแล้ว ลบรายการซ้ำ ${n.toLocaleString()} รายการ`); qualityView();
    };
    body.querySelectorAll('[data-merge]').forEach(button => button.onclick = () => {
      const gi = Number(button.dataset.merge), group = currentGroups[gi];
      const keepId = body.querySelector(`input[name="keep-${gi}"]:checked`)?.value;
      const keeper = group.words.find(w => w.id === keepId) || bestOf(group.words);
      const n = mergeGroups([{ keeper, others: group.words.filter(w => w !== keeper) }], 'รวมคำซ้ำ 1 กลุ่ม');
      toast(`รวมแล้ว ลบรายการซ้ำ ${n} รายการ`); qualityView();
    });
    body.querySelectorAll('[data-ignore]').forEach(button => button.onclick = () => {
      S.dupIgnore.push(qState.dupMode + '|' + currentGroups[Number(button.dataset.ignore)].key); save(); qualityView();
    });
  }
  function dupGroupHtml(group, gi) {
    const best = bestOf(group.words);
    return `<article class="panel panel-pad dup-group"><div class="dup-head"><strong>${h(group.words[0].th || group.words[0].en || group.words[0][qState.dupMode] || '')}</strong><span class="tag">${group.words.length} รายการ</span></div>
      <div class="table-wrap"><table class="vocab-table dup-table"><tbody>${group.words.map(w => `<tr><td style="width:34px"><input type="radio" name="keep-${gi}" value="${h(w.id)}" ${w === best ? 'checked' : ''} aria-label="เก็บรายการนี้"></td>
        <td><div class="thai-word">${h(w.th || w.en)}</div><div class="translation">${h(w.en)}</div></td>
        <td><div class="translation" style="font-size:12px">${[w.cn, w.jp, w.kr].filter(Boolean).map(h).join(' · ') || '—'}</div></td>
        <td><div class="translation">${h(w.category || 'ไม่มีหมวดหมู่')}${w.level ? ' · ' + h(w.level) : ''}</div></td>
        <td><div class="translation">ทบทวน ${Number(w.repetitions) || 0} ครั้ง · ลืม ${(Number(w.lapses) || 0) + (Number(w.quizWrong) || 0)}${w.favorite ? ' · ♥' : ''}</div></td></tr>`).join('')}</tbody></table></div>
      <div class="study-actions"><button class="button button-primary" data-merge="${gi}">รวมเป็นรายการเดียว (เก็บอันที่เลือก)</button><button class="button button-outline" data-ignore="${gi}">ไม่ใช่คำซ้ำ</button></div></article>`;
  }

  function renderCatTab() {
    const body = document.querySelector('#q-body');
    const words = S.words.filter(w => !trim(w.category)).sort(byOrder);
    [...qState.catSel].forEach(id => { if (!words.some(w => w.id === id)) qState.catSel.delete(id); });
    const shown = words.slice(0, qState.catLimit);
    body.innerHTML = `<section class="panel panel-pad"><div class="bulk-row"><label class="bulk-check"><input type="checkbox" id="cat-all"> เลือกทั้งหมด (${words.length.toLocaleString()} คำ)</label>
      <div class="bulk-group"><label for="cat-name">หมวด</label><input class="field" id="cat-name" list="cat-list" placeholder="ชื่อหมวดที่จะตั้งให้" autocomplete="off"><datalist id="cat-list">${datalistOptions(allCategories())}</datalist><button class="button button-primary" id="cat-go">ตั้งหมวดให้ที่เลือก</button></div>
      <span class="bulk-count" id="cat-count"></span><button class="button button-outline" id="cat-open">ดูในคลังคำศัพท์</button></div></section>
      <section class="panel panel-pad" style="margin-top:12px">${words.length ? shown.map(w => `<label class="leech-row" style="cursor:pointer;margin-bottom:6px"><span style="display:flex;gap:10px;align-items:center"><input type="checkbox" data-cat-id="${h(w.id)}" ${qState.catSel.has(w.id) ? 'checked' : ''}><span><div class="word-main">${h(w.th || w.en || w.jp)}</div><div class="word-meta">${fieldSummary(w)}</div></span></span></label>`).join('') : '<div class="empty-state"><h3>ทุกคำมีหมวดแล้ว 🎉</h3></div>'}
      ${words.length > shown.length ? `<button class="button button-outline" id="cat-more" style="margin:8px auto;display:flex">แสดงเพิ่ม (เหลืออีก ${(words.length - shown.length).toLocaleString()} คำ)</button>` : ''}</section>`;
    const update = () => {
      body.querySelector('#cat-count').textContent = qState.catSel.size ? `เลือกแล้ว ${qState.catSel.size.toLocaleString()} คำ` : '';
      const all = body.querySelector('#cat-all'); all.checked = words.length > 0 && qState.catSel.size === words.length; all.indeterminate = qState.catSel.size > 0 && qState.catSel.size < words.length;
    };
    body.querySelectorAll('[data-cat-id]').forEach(box => box.onchange = () => { if (box.checked) qState.catSel.add(box.dataset.catId); else qState.catSel.delete(box.dataset.catId); update(); });
    body.querySelector('#cat-all').onchange = event => {
      if (event.target.checked) words.forEach(w => qState.catSel.add(w.id)); else qState.catSel.clear();
      body.querySelectorAll('[data-cat-id]').forEach(box => { box.checked = qState.catSel.has(box.dataset.catId); }); update();
    };
    const more = body.querySelector('#cat-more'); if (more) more.onclick = () => { qState.catLimit += 100; renderCatTab(); };
    body.querySelector('#cat-open').onclick = () => { colF = '-'; location.hash = '#vocab'; };
    body.querySelector('#cat-go').onclick = () => {
      const value = trim(body.querySelector('#cat-name').value);
      if (!value) return toast('พิมพ์ชื่อหมวดก่อนนะ');
      if (!qState.catSel.size) return toast('ติ๊กเลือกคำก่อนนะ');
      const n = applyToIds(qState.catSel, `ตั้งหมวด “${value}”`, w => { w.category = value; return true; });
      qState.catSel.clear(); toast(`ตั้งหมวด “${value}” ให้ ${n.toLocaleString()} คำแล้ว`); qualityView();
    };
    update();
  }

  const LANG_FIELDS = ['th', 'en', 'cn', 'jp', 'kr'];
  function renderGapTab() {
    const body = document.querySelector('#q-body');
    const counts = Object.fromEntries(LANG_FIELDS.map(k => [k, S.words.filter(w => !trim(w[k])).length]));
    const needed = [...qState.gapLangs];
    const incomplete = needed.length ? S.words.filter(w => needed.some(k => !trim(w[k]))).sort(byOrder) : [];
    const shown = incomplete.slice(0, qState.gapLimit);
    body.innerHTML = `<div class="stat-grid">${LANG_FIELDS.map(k => `<div class="panel stat-card"><div class="stat-top">ว่าง: ${LANG_NAME[k]}</div><div class="stat-value">${counts[k].toLocaleString()}</div><div class="stat-foot"><a href="#fill" data-fill-gap="${k}">เติมช่องนี้ →</a></div></div>`).join('')}</div>
      <section class="panel panel-pad" style="margin-top:12px"><div class="section-title"><h2>คำที่ข้อมูลไม่ครบ · ${incomplete.length.toLocaleString()} คำ</h2><button class="button button-outline" id="gap-export" ${incomplete.length ? '' : 'disabled'}>ส่งออกรายการเป็น CSV</button></div>
      <p class="section-kicker">นับว่าไม่ครบเมื่อช่องที่ติ๊กไว้ว่างอย่างน้อยหนึ่งช่อง</p>
      <div class="gap-grid">${LANG_FIELDS.map(k => `<label><input type="checkbox" data-gap-lang="${k}" ${qState.gapLangs.has(k) ? 'checked' : ''}> ${LANG_NAME[k]}</label>`).join('')}</div>
      ${shown.map(w => `<div class="leech-row"><div><div class="word-main">${h(w.th || w.en || w.jp || w.cn || w.kr)}</div><div class="word-meta">${fieldSummary(w)}</div><div>${needed.filter(k => !trim(w[k])).map(k => `<span class="miss-chip">ขาด${LANG_NAME[k]}</span>`).join('')}</div></div><span class="tag">${h(w.category || 'ไม่มีหมวด')}</span></div>`).join('') || '<div class="empty-state"><h3>ไม่มีคำที่ข้อมูลไม่ครบ 🎉</h3></div>'}
      ${incomplete.length > shown.length ? `<button class="button button-outline" id="gap-more" style="margin:8px auto;display:flex">แสดงเพิ่ม (เหลืออีก ${(incomplete.length - shown.length).toLocaleString()} คำ)</button>` : ''}</section>`;
    body.querySelectorAll('[data-gap-lang]').forEach(box => box.onchange = () => { if (box.checked) qState.gapLangs.add(box.dataset.gapLang); else qState.gapLangs.delete(box.dataset.gapLang); qState.gapLimit = 100; renderGapTab(); });
    body.querySelectorAll('[data-fill-gap]').forEach(link => link.onclick = () => { fillState.mode = 'form'; fillState.gaps = new Set([link.dataset.fillGap]); fillState.cat = ''; fillState.queue = null; });
    const more = body.querySelector('#gap-more'); if (more) more.onclick = () => { qState.gapLimit += 100; renderGapTab(); };
    body.querySelector('#gap-export').onclick = async () => {
      const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const rows = [['id', 'th', 'en', 'cn', 'jp', 'kr', 'category', 'missing'], ...incomplete.map(w => [w.id, w.th, w.en, w.cn, w.jp, w.kr, w.category, needed.filter(k => !trim(w[k])).join(',')])];
      try { await saveFile('missing-translations.csv', '﻿' + rows.map(r => r.map(quote).join(',')).join('\r\n')); toast(`ส่งออก ${incomplete.length.toLocaleString()} คำแล้ว`); }
      catch (error) { if (error?.code !== 'declined') toast('บันทึกไฟล์ไม่สำเร็จ'); }
    };
  }

  // ---- คำอ่านญี่ปุ่นจากพจนานุกรม: เสนอให้เลือก ไม่เติมเอง ----
  const stripEnd = value => trim(value).replace(/[\s。、．，.!！?？]+$/u, '');
  function buildKanaSuggestions(entries) {
    const index = new Map();
    entries.forEach(entry => {
      const readings = (Array.isArray(entry.readings) && entry.readings.length ? entry.readings : [entry.reading]).filter(Boolean);
      if (!readings.length) return;
      new Set([entry.headword, ...(entry.forms || [])].filter(Boolean)).forEach(form => {
        if (!index.has(form)) index.set(form, []);
        index.get(form).push({ entry, readings });
      });
    });
    const suggestions = [];
    S.words.forEach(w => {
      const jp = stripEnd(w.jp);
      if (!jp || !hasKanji(jp) || trim(w.jpKana) || trim(w.jpFurigana)) return;
      const hits = index.get(jp);
      if (!hits) return;
      const options = new Map();
      hits.forEach(({ entry, readings }) => readings.forEach(reading => {
        if (!options.has(reading)) options.set(reading, { reading, meanings: [], source: entry.source || '' });
        (entry.meanings || []).forEach(m => { const o = options.get(reading); if (!o.meanings.includes(m)) o.meanings.push(m); });
      }));
      const en = norm(w.en);
      const meaningHit = !!en && [...options.values()].some(o => o.meanings.some(m => { const mm = norm(m); return mm === en || (mm.length > 2 && en.length > 2 && (mm.includes(en) || en.includes(mm))); }));
      suggestions.push({ id: w.id, jp, options: [...options.values()], meaningHit });
    });
    return suggestions.sort((a, b) => Number(b.meaningHit) - Number(a.meaningHit) || (a.options.length - b.options.length));
  }
  async function loadKana() {
    qState.kanaLoading = true;
    try {
      const entries = await PGH.loadDictionary();
      const jmdict = entries.filter(e => e.source === 'JMdict').length;
      qState.kana = { entries: entries.length, jmdict, suggestions: buildKanaSuggestions(entries), pending: S.words.filter(w => hasKanji(w.jp) && !trim(w.jpKana) && !trim(w.jpFurigana)).length };
    } catch (error) { qState.kana = { entries: 0, jmdict: 0, suggestions: [], pending: 0, error: true }; }
    qState.kanaLoading = false;
    if (route() === 'quality' && qState.tab === 'kana') renderKanaTab();
  }
  function renderKanaTab() {
    const body = document.querySelector('#q-body');
    if (!qState.kana) { body.innerHTML = '<section class="panel panel-pad"><p class="study-meta">กำลังอ่านพจนานุกรมในเครื่อง…</p></section>'; if (!qState.kanaLoading) loadKana(); return; }
    const info = qState.kana, list = info.suggestions, shown = list.slice(0, qState.kanaLimit);
    const easy = s => s.meaningHit && s.options.length === 1;
    body.innerHTML = `<section class="panel panel-pad"><div class="study-notice">ระบบเทียบคำญี่ปุ่นในคลังกับพจนานุกรมที่เก็บไว้ในเครื่อง (${info.entries.toLocaleString()} รายการ${info.jmdict ? ` · JMdict ${info.jmdict.toLocaleString()}` : ' · ยังไม่ได้นำเข้า JMdict'}) แล้วเสนอคำอ่านเฉพาะคำที่ตรงตัวอักษรทุกตัว <strong>ไม่เดา ไม่เติมให้เอง</strong> — คุณต้องติ๊กและกดยืนยันก่อนจึงจะบันทึก คำที่เป็นประโยคยาวจะไม่มีข้อเสนอ</div>
      <p class="study-meta">คำญี่ปุ่นที่มีคันจิแต่ยังไม่มีคำอ่าน ${info.pending.toLocaleString()} คำ · มีข้อเสนอจากพจนานุกรม ${list.length.toLocaleString()} คำ${info.jmdict ? '' : ' · นำเข้าไฟล์ JMdict JSON ที่หน้า “พจนานุกรมออฟไลน์” เพื่อให้เจอคำมากขึ้น'}</p>
      <div class="study-actions"><button class="button button-outline" id="kana-tick-easy" ${list.some(easy) ? '' : 'disabled'}>ติ๊กที่ความหมายตรงและมีคำอ่านเดียว</button><button class="button button-outline" id="kana-untick">ล้างที่ติ๊ก</button><button class="button button-primary" id="kana-apply">ยืนยันที่ติ๊กไว้</button><a class="button button-soft" href="#dictionary">พจนานุกรมออฟไลน์</a><button class="button button-soft" id="kana-reload">โหลดใหม่</button></div></section>
      <section class="panel panel-pad" style="margin-top:12px">${shown.length ? shown.map((s, i) => { const w = wordById(s.id); return `<div class="kana-row"><input type="checkbox" data-kana="${i}" aria-label="ใช้คำอ่านนี้"><div class="jp">${h(s.jp)}</div>
        <div>${s.options.length === 1 ? `<strong>${h(s.options[0].reading)}</strong>` : `<select class="select" data-kana-select="${i}"><option value="">เลือกคำอ่าน…</option>${s.options.map(o => `<option value="${h(o.reading)}">${h(o.reading)}</option>`).join('')}</select>`}</div>
        <div><div class="translation" style="font-size:12px">พจนานุกรม: ${h([...new Set(s.options.flatMap(o => o.meanings))].slice(0, 4).join('; '))}</div><div class="translation">ในคลัง: ${h(w?.en || '')} ${h(w?.th || '')} <span class="${s.meaningHit ? 'kana-ok' : 'kana-warn'}">${s.meaningHit ? '✓ ความหมายตรงกัน' : '• ตรวจความหมายก่อนยืนยัน'}</span></div></div></div>`; }).join('') : '<div class="empty-state"><h3>ยังไม่มีข้อเสนอคำอ่าน</h3><p>นำเข้า JMdict ที่หน้า “พจนานุกรมออฟไลน์” แล้วกลับมากด “โหลดใหม่”</p></div>'}
      ${list.length > shown.length ? `<button class="button button-outline" id="kana-more" style="margin:8px auto;display:flex">แสดงเพิ่ม (เหลืออีก ${(list.length - shown.length).toLocaleString()} คำ)</button>` : ''}</section>`;
    const chosenReading = i => { const s = list[i], select = body.querySelector(`[data-kana-select="${i}"]`); return s.options.length === 1 ? s.options[0].reading : (select ? select.value : ''); };
    body.querySelectorAll('[data-kana-select]').forEach(select => select.onchange = () => { body.querySelector(`[data-kana="${select.dataset.kanaSelect}"]`).checked = !!select.value; });
    body.querySelector('#kana-tick-easy').onclick = () => body.querySelectorAll('[data-kana]').forEach(box => { box.checked = easy(list[Number(box.dataset.kana)]); });
    body.querySelector('#kana-untick').onclick = () => body.querySelectorAll('[data-kana]').forEach(box => { box.checked = false; });
    body.querySelector('#kana-reload').onclick = () => { qState.kana = null; renderKanaTab(); };
    const more = body.querySelector('#kana-more'); if (more) more.onclick = () => { qState.kanaLimit += 100; renderKanaTab(); };
    body.querySelector('#kana-apply').onclick = () => {
      const picks = [...body.querySelectorAll('[data-kana]:checked')].map(box => ({ s: list[Number(box.dataset.kana)], reading: chosenReading(Number(box.dataset.kana)) }));
      const missingChoice = picks.filter(p => !p.reading).length;
      const ready = picks.filter(p => p.reading);
      if (!ready.length) return toast(missingChoice ? 'เลือกคำอ่านจากรายการก่อนนะ' : 'ยังไม่ได้ติ๊กคำ');
      const byReading = new Map(ready.map(p => [p.s.id, p]));
      const n = applyToIds(new Set(byReading.keys()), `เติมคำอ่านญี่ปุ่น ${ready.length} คำ`, w => {
        const pick = byReading.get(w.id);
        w.jpKana = pick.reading; w.jpFurigana = pick.reading;
        if (!trim(w.jpKanji)) w.jpKanji = pick.s.jp;
        return true;
      });
      toast(`เติมคำอ่านให้ ${n.toLocaleString()} คำแล้ว${missingChoice ? ` (ข้าม ${missingChoice} คำที่ยังไม่ได้เลือกคำอ่าน)` : ''}`);
      qState.kana = null; qualityView();
    };
  }

  // =====================================================================
  // 5) คำที่ลืมบ่อย (leech)
  // =====================================================================
  const THRESHOLDS = [2, 3, 4, 5, 8, 10];
  const leechCount = w => (Number(w.lapses) || 0) + (Number(w.quizWrong) || 0);
  const leechThreshold = () => { const n = Number(S.settings?.leechThreshold); return n > 0 ? n : 3; };
  const leechState = { limit: 50, drill: null, src: 'jp', dst: 'th' };
  const leechWords = () => S.words.filter(w => leechCount(w) >= leechThreshold()).sort((a, b) => leechCount(b) - leechCount(a) || (Number(b.lapses) || 0) - (Number(a.lapses) || 0));

  function leechView() {
    view.innerHTML = pageHead('คำที่ลืมบ่อย', 'คำที่ตอบผิดหรือกดว่า “จำไม่ได้” ซ้ำหลายครั้ง แยกไว้ให้ฝึกเป็นพิเศษ') + '<div id="leech-body"></div>';
    if (leechState.drill) renderLeechDrill(); else renderLeechList();
  }
  function renderLeechList() {
    const body = document.querySelector('#leech-body');
    const words = leechWords(), shown = words.slice(0, leechState.limit);
    const langSel = (id, value) => `<select class="select" id="${id}" style="width:auto;min-height:38px">${LANGS.map(l => `<option value="${l[0]}" ${l[0] === value ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>`;
    body.innerHTML = `<section class="panel panel-pad"><div class="bulk-row"><label class="bulk-check">นับเป็น “ลืมบ่อย” เมื่อผิด/ลืมรวมตั้งแต่ <select class="select" id="leech-th" style="width:auto;min-height:36px;padding:4px 8px">${[...new Set([...THRESHOLDS, leechThreshold()])].sort((a, b) => a - b).map(n => `<option value="${n}" ${n === leechThreshold() ? 'selected' : ''}>${n}</option>`).join('')}</select> ครั้ง</label>
      <span class="tag">${words.length.toLocaleString()} คำ</span></div>
      <p class="study-meta">นับจาก “จำไม่ได้” ในการทบทวน + ข้อที่ตอบผิดในแบบทดสอบ</p>
      <div class="bulk-row" style="margin-top:8px"><span class="section-kicker">ฝึกจาก</span>${langSel('leech-src', leechState.src)}<span class="section-kicker">ตอบเป็น</span>${langSel('leech-dst', leechState.dst)}
      <button class="button button-primary" id="leech-drill" ${words.length ? '' : 'disabled'}>ฝึกคำที่ลืมบ่อย</button><button class="button button-outline" id="leech-tag" ${words.length ? '' : 'disabled'}>ติดแท็ก “leech” ให้ทุกคำ</button></div></section>
      <section style="margin-top:12px">${shown.length ? shown.map(w => `<div class="leech-row" data-leech="${h(w.id)}"><div><div class="word-main">${h(wordText(w, 'jp') || w.th || w.en)}</div><div class="word-meta">${[w.th, w.en, w.cn, w.kr].filter(Boolean).map(h).join(' · ')}</div>
        <div class="leech-meta">ลืมตอนทบทวน ${Number(w.lapses) || 0} ครั้ง · ตอบผิดในแบบทดสอบ ${Number(w.quizWrong) || 0} ครั้ง${w.last ? ' · ล่าสุด ' + h(w.last) : ''}${cleanTags(w.tags).includes('leech') ? ' · แท็ก leech' : ''}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="tag">รวม ${leechCount(w)}</span><button class="mini-action" data-say="${h(w.id)}" title="ฟังเสียงอ่าน" aria-label="ฟังเสียงอ่าน">🔊</button><button class="button button-outline" data-find="${h(w.id)}" style="min-height:34px;padding:6px 10px">เปิดในคลัง</button><button class="button button-soft" data-reset="${h(w.id)}" style="min-height:34px;padding:6px 10px" title="ล้างตัวนับผิด/ลืมของคำนี้">จำได้แล้ว · รีเซ็ต</button></div></div>`).join('') : '<div class="empty-state"><h3>ยังไม่มีคำที่ลืมบ่อย 🎉</h3><p>เมื่อมีคำที่จำไม่ได้หรือตอบผิดซ้ำถึงเกณฑ์ จะมาแสดงที่นี่</p></div>'}
      ${words.length > shown.length ? `<button class="button button-outline" id="leech-more" style="margin:8px auto;display:flex">แสดงเพิ่ม (เหลืออีก ${(words.length - shown.length).toLocaleString()} คำ)</button>` : ''}</section>`;
    body.querySelector('#leech-th').onchange = event => { S.settings.leechThreshold = Number(event.target.value); save(); leechState.limit = 50; renderLeechList(); };
    body.querySelector('#leech-src').onchange = event => { leechState.src = event.target.value; };
    body.querySelector('#leech-dst').onchange = event => { leechState.dst = event.target.value; };
    const more = body.querySelector('#leech-more'); if (more) more.onclick = () => { leechState.limit += 50; renderLeechList(); };
    body.querySelector('#leech-drill').onclick = () => { leechState.drill = { ids: leechWords().map(w => w.id), pos: 0, reveal: false, done: 0 }; renderLeechDrill(); };
    body.querySelector('#leech-tag').onclick = () => {
      const ids = new Set(leechWords().map(w => w.id));
      const n = applyToIds(ids, 'ติดแท็ก leech', w => { const tags = cleanTags(w.tags); if (tags.includes('leech')) return false; w.tags = [...tags, 'leech']; return true; });
      toast(n ? `ติดแท็ก leech ให้ ${n.toLocaleString()} คำแล้ว (ค้นหา/กรองแท็กได้ในคลังคำศัพท์)` : 'ทุกคำมีแท็ก leech อยู่แล้ว'); renderLeechList();
    };
    body.querySelectorAll('[data-say]').forEach(button => button.onclick = () => {
      const w = wordById(button.dataset.say); if (!w) return;
      const lang = trim(w.jp) ? 'jp' : (trim(w.en) ? 'en' : 'th');
      speakText(w[lang === 'jp' && trim(w.jpKana) ? 'jpKana' : lang], lang);
    });
    body.querySelectorAll('[data-find]').forEach(button => button.onclick = () => {
      const w = wordById(button.dataset.find); if (!w) return;
      q = w.th || w.en || w.jp || ''; colF = ''; filter = 'all'; location.hash = '#vocab';
    });
    body.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => {
      const w = wordById(button.dataset.reset); if (!w) return;
      if (!confirm('ล้างตัวนับ “ลืม/ตอบผิด” ของคำนี้ใช่ไหม? (ตารางทบทวนยังอยู่ตามเดิม)')) return;
      w.lapses = 0; w.quizWrong = 0; w.updatedAt = nowIso(); save(); renderLeechList();
    });
  }
  function renderLeechDrill() {
    const body = document.querySelector('#leech-body'), drill = leechState.drill;
    if (!body || !drill) return;
    while (drill.pos < drill.ids.length && !wordById(drill.ids[drill.pos])) drill.pos++;
    if (drill.pos >= drill.ids.length) {
      body.innerHTML = `<section class="panel panel-pad study-panel"><div class="empty-state"><h3>ฝึกครบแล้ว 🎉</h3><p>ฝึกไป ${drill.done} คำ ระบบบันทึกวันทบทวนครั้งถัดไปให้ตามคะแนนที่คุณให้</p><div class="study-actions" style="justify-content:center"><button class="button button-primary" id="drill-exit">กลับไปรายการ</button></div></div></section>`;
      body.querySelector('#drill-exit').onclick = () => { leechState.drill = null; renderLeechList(); };
      return;
    }
    const w = wordById(drill.ids[drill.pos]);
    const front = wordText(w, leechState.src), back = wordText(w, leechState.dst) || 'ยังไม่มีคำแปลที่บันทึกไว้';
    body.innerHTML = `<section class="panel panel-pad study-panel"><div class="fill-top"><span class="tag">คำที่ ${drill.pos + 1} / ${drill.ids.length} · รวมผิด/ลืม ${leechCount(w)}</span><button class="button button-outline" id="drill-exit" style="min-height:34px;padding:6px 12px">หยุดฝึก</button></div>
      <div class="panel study-card"><div class="eyebrow">โจทย์</div><div class="study-front">${h(front)}</div>${drill.reveal ? `<div class="study-back">${h(back)}${w.jpKana && leechState.dst === 'jp' ? `<div class="study-meta">${h(w.jpKana)}</div>` : ''}</div>` : '<div class="study-meta">ลองนึกความหมายก่อนกดดูเฉลย</div>'}
      <div class="study-actions" style="justify-content:center"><button class="button button-outline" id="drill-say">🔊 ฟัง</button><button class="button button-outline" id="drill-reveal">${drill.reveal ? 'ซ่อนเฉลย' : 'ดูเฉลย'} <kbd class="study-key">Space</kbd></button></div>
      ${drill.reveal ? `<div class="study-rating"><button class="button button-outline" data-q="0">จำไม่ได้ <kbd class="study-key">1</kbd></button><button class="button button-outline" data-q="3">ยาก <kbd class="study-key">2</kbd></button><button class="button button-primary" data-q="4">จำได้ <kbd class="study-key">3</kbd></button><button class="button button-soft" data-q="5">ง่ายมาก <kbd class="study-key">4</kbd></button></div>` : ''}</div></section>`;
    body.querySelector('#drill-exit').onclick = () => { leechState.drill = null; renderLeechList(); };
    body.querySelector('#drill-say').onclick = () => speakText(leechState.src === 'jp' && trim(w.jpKana) ? w.jpKana : front, leechState.src);
    body.querySelector('#drill-reveal').onclick = () => { drill.reveal = !drill.reveal; renderLeechDrill(); };
    body.querySelectorAll('[data-q]').forEach(button => button.onclick = () => {
      scheduleSM2(w, Number(button.dataset.q)); // บันทึกลง SM-2 เหมือนการทบทวนปกติ
      drill.done++; drill.pos++; drill.reveal = false; renderLeechDrill();
    });
  }
  document.addEventListener('keydown', event => {
    if (route() !== 'leeches' || !leechState.drill || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.target?.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (event.key === ' ') { const b = document.querySelector('#drill-reveal'); if (b) { event.preventDefault(); b.click(); } }
    else if (/^[1-4]$/.test(event.key)) { const b = document.querySelector(`[data-q="${['0', '3', '4', '5'][Number(event.key) - 1]}"]`); if (b) { event.preventDefault(); b.click(); } }
  });

  // =====================================================================
  // ต่อเข้ากับ router
  // =====================================================================
  const previousRender = render;
  render = function () {
    const current = route();
    if (current === 'fill') { nav(); q = ''; fillView(); return; }
    if (current === 'quality') { nav(); q = ''; qualityView(); return; }
    if (current === 'leeches') { nav(); q = ''; leechView(); return; }
    previousRender();
  };
  window.PGVocabTools = { fillState, qState, leechState, dupGroups, mergeInto, buildKanaSuggestions, leechWords, filteredWords, bulkSel, applyToIds, undoLast };
  render();
})();
