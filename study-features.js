/* Polyglot Studio: spaced repetition, tests, statistics, offline dictionary,
   starter collections, vocabulary metadata, and Japanese worksheet controls. */
(function () {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const localDay = (date = new Date()) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const cleanTags = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[,，]/))
    .map(tag => String(tag).trim()).filter(Boolean))];
  const wordText = (word, lang) => String(word?.[lang] || (lang === 'jp' ? word?.jpKanji : '') || word?.th || word?.en || '').trim();

  // Keep SM-2 fields alongside the vocabulary, so they travel with JSON backups.
  S.words.forEach(word => {
    if (!Array.isArray(word.reviewHistory)) word.reviewHistory = [];
    if (!Number.isFinite(Number(word.easeFactor))) word.easeFactor = 2.5;
    if (!Number.isFinite(Number(word.intervalDays))) word.intervalDays = 0;
    if (!Number.isFinite(Number(word.repetitions))) word.repetitions = 0;
    if (!Number.isFinite(Number(word.lapses))) word.lapses = 0;
    if (!Number.isFinite(Number(word.quizWrong))) word.quizWrong = 0;
    if (!word.dueAt) word.dueAt = word.last ? localDay(new Date(Date.now() + DAY)) : localDay();
    word.tags = cleanTags(word.tags);
    if (word.jpKana == null) word.jpKana = '';
    if (word.jpKanji == null) word.jpKanji = '';
    if (word.jpFurigana == null) word.jpFurigana = '';
  });
  if (!S.studyLog || typeof S.studyLog !== 'object') S.studyLog = {};
  save();

  // Cards that were never studied are "new". Only a limited number of them enter the queue each day,
  // so a fresh 5,000-word library does not show up as 5,000 overdue reviews.
  const NEW_LIMITS = [5, 10, 20, 30, 50, 100, 9999];
  const newLimit = () => { const n = Number(S.newPerDay); return Number.isFinite(n) && n >= 0 ? n : 20; };
  const isNewWord = word => !word.introducedAt && !(Number(word.repetitions) > 0) && !word.last
    && !(Array.isArray(word.reviewHistory) && word.reviewHistory.length) && !(Number(word.lapses) > 0);
  const introducedToday = () => S.words.filter(word => word.introducedAt === localDay()).length;
  const dueWords = () => {
    const day = localDay();
    const learned = S.words.filter(word => !isNewWord(word) && (!word.dueAt || word.dueAt <= day))
      .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')));
    const room = Math.max(0, newLimit() - introducedToday());
    const fresh = room ? S.words.filter(isNewWord).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)).slice(0, room) : [];
    return [...learned, ...fresh];
  };
  window.pgDueWords = dueWords;
  const markStudy = (word, quality, source = 'review') => {
    const day = localDay();
    word.reviewHistory ||= [];
    if (!word.introducedAt) word.introducedAt = day;
    word.reviewHistory.push({ date: day, quality, source });
    if (word.reviewHistory.length > 30) word.reviewHistory = word.reviewHistory.slice(-30);
    S.studyLog[day] = (Number(S.studyLog[day]) || 0) + 1;
  };
  const scheduleSM2 = (word, quality) => {
    let ease = Number(word.easeFactor) || 2.5;
    let repetitions = Number(word.repetitions) || 0;
    let interval = Number(word.intervalDays) || 0;
    if (quality < 3) {
      repetitions = 0;
      interval = 1;
      word.lapses = (Number(word.lapses) || 0) + 1;
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.max(1, Math.round(interval * ease));
      repetitions++;
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    word.easeFactor = Number(ease.toFixed(2));
    word.repetitions = repetitions;
    word.intervalDays = interval;
    word.lastReviewed = localDay();
    word.last = today();
    word.dueAt = localDay(new Date(Date.now() + interval * DAY));
    markStudy(word, quality, 'review');
    save();
  };

  const styles = document.createElement('style');
  styles.textContent = `
    .study-panel{max-width:900px;margin:0 auto}
    .study-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .study-card{max-width:620px;margin:18px auto;padding:24px;text-align:center}
    .study-front{font:700 clamp(28px,7vw,48px) var(--app-font-serif);overflow-wrap:anywhere;margin:12px 0}
    .study-back{font-size:18px;line-height:1.7}
    .study-meta{font-size:12px;color:hsl(var(--muted-foreground));margin-top:8px}
    .study-rating{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:18px}
    .study-rating button{min-width:0;padding:12px 5px}
    .study-filter{max-width:190px}
    .study-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
    .study-tag{display:inline-flex;border-radius:999px;padding:3px 8px;background:#edf2ed;color:#36594b;font-size:10px}
    .jp-extra-grid{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .study-bars{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:5px;align-items:end;height:140px;padding:12px 8px 4px;border-bottom:1px solid hsl(var(--border));overflow-x:auto}
    .study-bar-col{height:100%;min-width:18px;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:5px}
    .study-bar{width:100%;max-width:30px;min-height:2px;border-radius:5px 5px 0 0;background:#4a8b70}
    .study-bar-count{font-size:10px;color:hsl(var(--muted-foreground))}
    .study-bar-label{font-size:9px;color:hsl(var(--muted-foreground));white-space:nowrap}
    .quiz-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .quiz-match{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .quiz-match button{width:100%;min-width:0;text-align:left;white-space:normal}
    .quiz-match button.selected{outline:2px solid #3d8267}
    .quiz-match button.matched{opacity:.48;pointer-events:none}
    .dict-results{display:grid;gap:8px;margin-top:14px}
    .dict-entry{padding:12px 14px}
    .dict-head{font-size:22px;font-weight:700}
    .dict-reading{color:hsl(var(--muted-foreground));margin-left:8px}
    .dict-meaning{font-size:13px;line-height:1.55;margin-top:4px}
    .study-key{display:inline-block;min-width:1.5em;padding:0 5px;border:1px solid hsl(var(--border));border-bottom-width:2px;border-radius:5px;background:hsl(var(--card));font:500 11px/1.6 var(--app-font-mono);text-align:center;color:inherit;opacity:.85}
    .study-keyhint{display:none}
    @media(hover:hover) and (pointer:fine){.study-keyhint{display:block}}
    .study-notice{padding:10px 12px;border-radius:10px;background:#eef5f0;color:#355a49;font-size:12px;line-height:1.5}
    @media(max-width:650px){.study-rating{grid-template-columns:repeat(2,minmax(0,1fr))}.jp-extra-grid{grid-template-columns:1fr}.quiz-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(styles);

  // Extend the vocabulary form, tag search, metadata, and CSV export.
  let tagFilter = '';
  const addVocabularyFields = () => {
    const form = document.querySelector('#addf');
    const grid = form?.querySelector('.form-grid');
    if (!grid) return;
    if (!grid.querySelector('#a-jp-kana')) {
      grid.insertAdjacentHTML('beforeend', `
        <div class="form-field"><label for="a-jp-kana">ภาษาญี่ปุ่น · ฮิรางานะ</label><input class="field" id="a-jp-kana" placeholder="ひらがな"></div>
        <div class="form-field"><label for="a-jp-kanji">ภาษาญี่ปุ่น · คันจิ</label><input class="field" id="a-jp-kanji" placeholder="漢字"></div>
        <div class="form-field"><label for="a-jp-furigana">ภาษาญี่ปุ่น · ฟุริงานะ</label><input class="field" id="a-jp-furigana" placeholder="かんじ"></div>
        <div class="form-field"><label for="a-tags">แท็ก</label><input class="field" id="a-tags" placeholder="เช่น อาหาร, สถานที่, ผู้คน"></div>`);
    }
    if (form.dataset.studyFieldsBound) return;
    form.dataset.studyFieldsBound = '1';
    const previous = form.onsubmit;
    form.onsubmit = function (event) {
      const meta = {
        jpKana: this.querySelector('#a-jp-kana')?.value.trim() || '',
        jpKanji: this.querySelector('#a-jp-kanji')?.value.trim() || '',
        jpFurigana: this.querySelector('#a-jp-furigana')?.value.trim() || '',
        tags: cleanTags(this.querySelector('#a-tags')?.value || '')
      };
      const ids = new Set(S.words.map(w => w.id));
      const result = previous ? previous.call(this, event) : undefined;
      const added = S.words.find(w => !ids.has(w.id));
      if (added) {
        Object.assign(added, meta);
        added.dueAt ||= localDay();
        added.reviewHistory ||= [];
        added.easeFactor ||= 2.5;
        added.intervalDays ||= 0;
        added.repetitions ||= 0;
        added.lapses ||= 0;
        added.quizWrong ||= 0;
        save();
        vocab();
      }
      return result;
    };
  };
  const oldVocab = vocab;
  vocab = function () {
    oldVocab();
    addVocabularyFields();
    const toolbar = document.querySelector('.toolbar');
    if (toolbar && !document.querySelector('#vtag')) {
      const tags = [...new Set(S.words.flatMap(w => cleanTags(w.tags)))].sort((a, b) => a.localeCompare(b));
      const select = document.createElement('select');
      select.id = 'vtag';
      select.className = 'select study-filter';
      select.setAttribute('aria-label', 'กรองตามแท็ก');
      select.innerHTML = '<option value="">ทุกแท็ก</option>' + tags.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
      select.value = tagFilter;
      toolbar.appendChild(select);
      select.onchange = () => { tagFilter = select.value; list(); };
    }
    const csv = document.querySelector('#expc');
    if (csv) csv.onclick = async () => {
      const keys = ['th','en','cn','jp','kr','jpKana','jpKanji','jpFurigana','category','tags','level','workStatus','note','colorTag','createdAt','updatedAt','dueAt','easeFactor','intervalDays','repetitions','lapses','quizWrong','order'];
      const quote = value => '"' + String(Array.isArray(value) ? value.join('; ') : (value ?? '')).replace(/"/g, '""') + '"';
      const rows = [keys, ...S.words.filter(match).map(word => keys.map(key => word[key] ?? ''))];
      try { await saveFile('polyglot-vocab.csv', '\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n')); toast(`${rows.length - 1} words exported.`); }
      catch (error) { if (error?.code !== 'declined') toast('บันทึกไฟล์ CSV ไม่สำเร็จ'); }
    };
    const visibleRows = document.querySelectorAll('#vlist tr[data-word-id]');
    visibleRows.forEach(row => {
      const word = S.words.find(w => w.id === row.dataset.wordId);
      const cell = row.querySelector('.vc-langs');
      if (word && cell && !cell.querySelector('.study-tags') && cleanTags(word.tags).length) {
        cell.insertAdjacentHTML('beforeend', `<div class="study-tags">${cleanTags(word.tags).map(t => `<span class="study-tag">${escHtml(t)}</span>`).join('')}</div>`);
      }
    });
  };
  const oldList = list;
  list = function () {
    const original = S.words;
    if (tagFilter) S.words = original.filter(word => cleanTags(word.tags).includes(tagFilter));
    try { oldList(); } finally { S.words = original; }
  };

  // Spaced repetition view — four user-rated SM-2 outcomes.
  let reviewOrder = [];
  let reviewedThisSession = new Set();
  let showReviewAnswer = false;
  let reviewSource = 'jp';
  let reviewTarget = 'th';
  function reviewView() {
    const due = dueWords().filter(word => !reviewedThisSession.has(word.id));
    if (!reviewOrder.length) reviewOrder = due.map(word => word.id);
    const current = reviewOrder.map(id => S.words.find(word => word.id === id)).find(word =>
      word && !reviewedThisSession.has(word.id) && (!word.dueAt || word.dueAt <= localDay()));
    const dueList = dueWords(), dueCount = dueList.length, dueNew = dueList.filter(isNewWord).length;
    const select = (id, value) => `<select class="select" id="${id}">${LANGS.map(lang => `<option value="${lang[0]}" ${lang[0] === value ? 'selected' : ''}>${lang[1]}</option>`).join('')}</select>`;
    view.innerHTML = pageHead('ทบทวนวันนี้', 'ให้คะแนนว่าจำแต่ละคำได้แค่ไหน ระบบ SM-2 จะกำหนดวันทบทวนครั้งถัดไปให้อัตโนมัติ') +
      `<section class="panel panel-pad study-panel"><div class="quiz-grid">${select('review-source', reviewSource)}${select('review-target', reviewTarget)}</div>
       <p class="study-meta" style="margin-top:10px">ต้องทบทวนวันนี้ ${dueCount} คำ (คำใหม่ ${dueNew}) · ทบทวนในรอบนี้แล้ว ${reviewedThisSession.size} คำ · คำใหม่ต่อวัน <select class="select" id="review-new-limit" style="width:auto;display:inline-block;min-height:36px;padding:2px 8px">${NEW_LIMITS.map(n => `<option value="${n}" ${n === newLimit() ? 'selected' : ''}>${n === 9999 ? 'ไม่จำกัด' : n}</option>`).join('')}</select></p>
       ${current ? `<div class="panel study-card"><div class="eyebrow">โจทย์</div><div class="study-front">${escHtml(wordText(current, reviewSource))}</div>
       ${showReviewAnswer ? `<div class="study-back">${escHtml(wordText(current, reviewTarget) || 'ยังไม่มีคำแปลที่บันทึกไว้')}${current.jpFurigana ? `<div class="study-meta">ふりがな: ${escHtml(current.jpFurigana)}</div>` : ''}</div>` : '<div class="study-meta">ลองนึกความหมายก่อนกดดูเฉลย</div>'}
       <div class="study-actions" style="justify-content:center"><button class="button button-outline" id="review-reveal">${showReviewAnswer ? 'ซ่อนเฉลย' : 'ดูเฉลย'}</button></div>
       ${showReviewAnswer ? `<div class="study-rating"><button class="button button-outline" data-quality="0">จำไม่ได้ <kbd class="study-key">1</kbd></button><button class="button button-outline" data-quality="3">ยาก <kbd class="study-key">2</kbd></button><button class="button button-primary" data-quality="4">จำได้ <kbd class="study-key">3</kbd></button><button class="button button-soft" data-quality="5">ง่ายมาก <kbd class="study-key">4</kbd></button></div>` : ''}
       <div class="study-meta">ระบบจะคำนวณวันทบทวนถัดไปจากคะแนนที่คุณให้</div>
       <div class="study-meta study-keyhint">คีย์ลัด: <kbd class="study-key">Space</kbd> พลิกการ์ด · <kbd class="study-key">1</kbd>–<kbd class="study-key">4</kbd> ให้คะแนน · <kbd class="study-key">S</kbd> ฟังคำถาม · <kbd class="study-key">D</kbd> ฟังคำตอบ</div></div>` :
       `<div class="empty-state"><h3>${dueCount ? 'ทบทวนครบรอบนี้แล้ว 🎉' : 'ตอนนี้ไม่มีคำที่ต้องทบทวน 🎉'}</h3><p>${dueCount ? `ยังเหลืออีก ${dueCount} คำ จะเริ่มรอบใหม่หรือพักก่อนก็ได้` : 'คำที่ถึงกำหนดทบทวนจะมาแสดงที่นี่'}</p><div class="study-actions" style="justify-content:center"><button class="button button-outline" id="review-restart">เริ่มรอบใหม่</button><a class="button button-primary" href="#vocab">เปิดคลังคำศัพท์</a></div></div>`}
       </section>`;
    document.querySelector('#review-new-limit').onchange = event => { S.newPerDay = Number(event.target.value); save(); reviewOrder = []; reviewView(); };
    document.querySelector('#review-source').onchange = event => { reviewSource = event.target.value; reviewView(); };
    document.querySelector('#review-target').onchange = event => { reviewTarget = event.target.value; reviewView(); };
    const reveal = document.querySelector('#review-reveal');
    if (reveal) reveal.onclick = () => { showReviewAnswer = !showReviewAnswer; reviewView(); };
    document.querySelectorAll('[data-quality]').forEach(button => button.onclick = () => {
      const word = S.words.find(item => item.id === current.id);
      scheduleSM2(word, Number(button.dataset.quality));
      reviewedThisSession.add(word.id);
      showReviewAnswer = false;
      reviewOrder = dueWords().filter(item => !reviewedThisSession.has(item.id)).map(item => item.id);
      reviewView();
    });
    const restart = document.querySelector('#review-restart');
    if (restart) restart.onclick = () => { reviewedThisSession = new Set(); reviewOrder = dueWords().map(word => word.id); showReviewAnswer = false; reviewView(); };
  }

  // Keyboard shortcuts on the review page: Space flips the card, 1–4 rate it, S / D read the front / back aloud.
  document.addEventListener('keydown', event => {
    if (route() !== 'review' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (target && target !== document.body && target !== document.documentElement) {
      // Never steal keys from form fields, buttons, links or an open dialog.
      if (target.matches?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    }
    if (document.querySelector('.modal-backdrop')) return;
    const key = event.key;
    if (key === ' ' || key === 'Spacebar') {
      const reveal = document.querySelector('#review-reveal');
      if (reveal) { event.preventDefault(); reveal.click(); }
      return;
    }
    if (/^[1-4]$/.test(key)) {
      const quality = ['0', '3', '4', '5'][Number(key) - 1];
      const button = document.querySelector(`[data-quality="${quality}"]`);
      if (button) { event.preventDefault(); button.click(); }
      return;
    }
    const speak = key === 's' || key === 'S' ? '#pg-say-front' : key === 'd' || key === 'D' ? '#pg-say-back' : '';
    if (speak) { const button = document.querySelector(speak); if (button) { event.preventDefault(); button.click(); } }
  });

  // Practice quiz: spelling, four choices, or matching pairs; no network required.
  let quizState = null;
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function quizView() {
    const modes = [['spell','พิมพ์คำตอบ'],['mcq','เลือก 4 ตัวเลือก'],['match','จับคู่คำ']];
    view.innerHTML = pageHead('แบบทดสอบ', 'ฝึกจากคำศัพท์ของคุณเอง ทั้งพิมพ์คำตอบ เลือกตอบ และจับคู่ ใช้งานออฟไลน์ได้') +
      `<section class="panel panel-pad study-panel"><div class="study-actions">${modes.map(([id, label]) => `<button class="button ${quizState?.mode === id ? 'button-primary' : 'button-outline'}" data-mode="${id}">${label}</button>`).join('')}</div>
      <div class="quiz-grid" style="margin-top:14px"><div><label class="section-kicker" for="quiz-src">ภาษาของโจทย์</label><select class="select" id="quiz-src">${LANGS.map(lang => `<option value="${lang[0]}" ${lang[0] === (quizState?.src || 'jp') ? 'selected' : ''}>${lang[1]}</option>`).join('')}</select></div>
      <div><label class="section-kicker" for="quiz-dst">ภาษาของคำตอบ</label><select class="select" id="quiz-dst">${LANGS.map(lang => `<option value="${lang[0]}" ${lang[0] === (quizState?.dst || 'en') ? 'selected' : ''}>${lang[1]}</option>`).join('')}</select></div></div>
      <div class="study-actions"><button class="button button-primary" id="quiz-start">เริ่ม / เริ่มใหม่</button></div>
      <div id="quiz-round"></div></section>`;
    document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
      quizState = { ...(quizState || {}), mode: button.dataset.mode };
      quizView();
    });
    document.querySelector('#quiz-start').onclick = () => {
      const src = document.querySelector('#quiz-src').value, dst = document.querySelector('#quiz-dst').value;
      const eligible = S.words.filter(word => wordText(word, src) && wordText(word, dst));
      if (eligible.length < 2) { toast('ต้องมีคำศัพท์อย่างน้อย 2 คำที่มีทั้งสองภาษาที่เลือก'); return; }
      quizState = { mode: quizState?.mode || 'spell', src, dst, words: shuffle(eligible).slice(0, Math.min(10, eligible.length)), index: 0, score: 0, selectedLeft: null, selectedRight: null, matched: new Set(), round: 0 };
      renderQuizRound();
    };
    if (quizState?.words) renderQuizRound();
  }
  function renderQuizRound() {
    const root = document.querySelector('#quiz-round');
    if (!root || !quizState?.words) return;
    const word = quizState.words[quizState.index];
    if (quizState.mode === 'match') return renderMatchRound(root);
    if (!word) {
      root.innerHTML = `<div class="empty-state"><h3>จบรอบแล้ว</h3><p>คะแนน ${quizState.score} / ${quizState.words.length}</p><button class="button button-outline" id="quiz-again">เล่นอีกรอบ</button></div>`;
      root.querySelector('#quiz-again').onclick = () => { quizState = null; quizView(); };
      return;
    }
    const prompt = wordText(word, quizState.src), answer = wordText(word, quizState.dst);
    const progress = `<p class="study-meta">ข้อ ${quizState.index + 1} / ${quizState.words.length} · คะแนน ${quizState.score}</p>`;
    if (quizState.mode === 'spell') {
      root.innerHTML = `${progress}<div class="panel study-card"><div class="study-front">${escHtml(prompt)}</div><form id="spell-form"><input class="field" id="spell-answer" autocomplete="off" placeholder="พิมพ์คำแปล"><button class="button button-primary" style="margin-top:12px">ตรวจคำตอบ</button></form><div id="spell-result" class="study-meta"></div></div>`;
      root.querySelector('#spell-form').onsubmit = event => {
        event.preventDefault();
        const typed = root.querySelector('#spell-answer').value.trim().toLocaleLowerCase();
        const correct = typed === answer.trim().toLocaleLowerCase();
        root.querySelector('#spell-result').innerHTML = `${correct ? 'ถูกต้อง ✓' : 'เฉลย: ' + escHtml(answer)} <button class="button button-outline" id="spell-next">ข้อต่อไป</button>`;
        if (correct) { quizState.score++; markStudy(word, 4, 'quiz'); } else word.quizWrong = (word.quizWrong || 0) + 1;
        save();
        root.querySelector('#spell-next').onclick = () => { quizState.index++; renderQuizRound(); };
      };
    } else {
      const choices = shuffle([word, ...shuffle(quizState.words.filter(item => item.id !== word.id)).slice(0, 3)]);
      root.innerHTML = `${progress}<div class="panel study-card"><div class="study-front">${escHtml(prompt)}</div><div style="display:grid;gap:8px">${choices.map((item, i) => `<button class="button button-outline" data-answer="${i}">${escHtml(wordText(item, quizState.dst))}</button>`).join('')}</div><div id="mcq-result" class="study-meta"></div></div>`;
      root.querySelectorAll('[data-answer]').forEach((button, i) => button.onclick = () => {
        root.querySelectorAll('[data-answer]').forEach(item => item.disabled = true);
        const correct = choices[i].id === word.id;
        if (correct) { quizState.score++; markStudy(word, 4, 'quiz'); } else word.quizWrong = (word.quizWrong || 0) + 1;
        save();
        root.querySelector('#mcq-result').innerHTML = `${correct ? 'ถูกต้อง ✓' : `เฉลย: ${escHtml(answer)}`} <button class="button button-outline" id="mcq-next">ข้อต่อไป</button>`;
        root.querySelector('#mcq-next').onclick = () => { quizState.index++; renderQuizRound(); };
      });
    }
  }
  function renderMatchRound(root) {
    if (!quizState.pairs || quizState.index >= quizState.pairs.length) {
      const available = S.words.filter(word => wordText(word, quizState.src) && wordText(word, quizState.dst));
      if (available.length < 2) { root.innerHTML = '<p class="study-meta">เพิ่มคำศัพท์ที่มีคำแปลอีกหน่อยเพื่อเล่นจับคู่</p>'; return; }
      quizState.pairs = shuffle(available).slice(0, Math.min(4, available.length));
      quizState.rightOrder = shuffle(quizState.pairs);
      quizState.index = 0;
      quizState.matched = new Set();
      quizState.selectedLeft = null;
      quizState.selectedRight = null;
    }
    root.innerHTML = `<p class="study-meta">จับคู่คำให้ถูก · คะแนน ${quizState.score}</p><div class="quiz-match">
      <div>${quizState.pairs.map(item => `<button class="button button-outline ${quizState.matched.has(item.id) ? 'matched' : ''} ${quizState.selectedLeft === item.id ? 'selected' : ''}" data-left="${escHtml(item.id)}">${escHtml(wordText(item, quizState.src))}</button>`).join('')}</div>
      <div>${quizState.rightOrder.map(item => `<button class="button button-outline ${quizState.matched.has(item.id) ? 'matched' : ''} ${quizState.selectedRight === item.id ? 'selected' : ''}" data-right="${escHtml(item.id)}">${escHtml(wordText(item, quizState.dst))}</button>`).join('')}</div></div>
      <div class="study-actions"><button class="button button-primary" id="match-next" ${quizState.matched.size < quizState.pairs.length ? 'disabled' : ''}>ชุดต่อไป</button></div>`;
    root.querySelectorAll('[data-left]').forEach(button => button.onclick = () => { quizState.selectedLeft = button.dataset.left; checkMatch(root); });
    root.querySelectorAll('[data-right]').forEach(button => button.onclick = () => { quizState.selectedRight = button.dataset.right; checkMatch(root); });
    root.querySelector('#match-next').onclick = () => { quizState.pairs = null; quizState.index = 0; renderMatchRound(root); };
  }
  function checkMatch(root) {
    if (!quizState.selectedLeft || !quizState.selectedRight) return renderMatchRound(root);
    if (quizState.selectedLeft === quizState.selectedRight) {
      const word = S.words.find(item => item.id === quizState.selectedLeft);
      quizState.matched.add(word.id);
      quizState.score++;
      markStudy(word, 4, 'quiz');
      save();
    } else {
      const missed = S.words.find(item => item.id === quizState.selectedLeft);
      if (missed) { missed.quizWrong = (missed.quizWrong || 0) + 1; save(); }
    }
    quizState.selectedLeft = null;
    quizState.selectedRight = null;
    renderMatchRound(root);
  }

  // Curated starter lists are deliberately samples, not claims of complete JLPT coverage.
  const PACKS = [
    { id: 'jlpt-n5-sample', name: 'JLPT N5 · starter sample', level: 'JLPT N5', category: 'JLPT N5', rows: [
      ['私','わたし','I; me','ฉัน'],['人','ひと','person','คน'],['学校','がっこう','school','โรงเรียน'],['先生','せんせい','teacher','ครู'],['学生','がくせい','student','นักเรียน'],
      ['友達','ともだち','friend','เพื่อน'],['今日','きょう','today','วันนี้'],['明日','あした','tomorrow','พรุ่งนี้'],['水','みず','water','น้ำ'],['食べる','たべる','to eat','กิน'],
      ['行く','いく','to go','ไป'],['見る','みる','to see; to watch','ดู']
    ]},
    { id: 'jlpt-n4-sample', name: 'JLPT N4 · starter sample', level: 'JLPT N4', category: 'JLPT N4', rows: [
      ['必要','ひつよう','necessary','จำเป็น'],['経験','けいけん','experience','ประสบการณ์'],['説明','せつめい','explanation','คำอธิบาย'],['準備','じゅんび','preparation','การเตรียมตัว'],
      ['決める','きめる','to decide','ตัดสินใจ'],['続ける','つづける','to continue','ทำต่อ'],['間に合う','まにあう','to be in time','ทันเวลา'],['心配','しんぱい','worry; concern','กังวล'],
      ['残念','ざんねん','unfortunate','น่าเสียดาย'],['場所','ばしょ','place','สถานที่'],['最近','さいきん','recently','เมื่อเร็ว ๆ นี้'],['特別','とくべつ','special','พิเศษ']
    ]},
    { id: 'daily-japanese', name: 'ญี่ปุ่นในชีวิตประจำวัน · ชุดเริ่มต้น', level: 'ชีวิตประจำวัน', category: 'ญี่ปุ่นในชีวิตประจำวัน', rows: [
      ['おはよう','おはよう','good morning','สวัสดีตอนเช้า'],['お願いします','おねがいします','please','กรุณา'],['ありがとう','ありがとう','thank you','ขอบคุณ'],['すみません','すみません','excuse me; sorry','ขอโทษ'],
      ['駅','えき','station','สถานี'],['病院','びょういん','hospital','โรงพยาบาล'],['食堂','しょくどう','cafeteria','โรงอาหาร'],['切符','きっぷ','ticket','ตั๋ว'],
      ['いくら','いくら','how much','ราคาเท่าไร'],['おいしい','おいしい','delicious','อร่อย'],['家族','かぞく','family','ครอบครัว'],['仕事','しごと','work; job','งาน']
    ]}
  ];
  function packsView() {
    view.innerHTML = pageHead('ชุดคำศัพท์', 'นำเข้าชุดเริ่มต้นได้ในคลิกเดียว ชุด JLPT เป็นตัวอย่างขนาดย่อมที่คุณเพิ่มเองต่อได้') +
      `<div class="dashboard-grid">${PACKS.map(pack => `<section class="panel panel-pad"><div class="eyebrow">${escHtml(pack.level)}</div><h2 style="margin:6px 0">${escHtml(pack.name)}</h2><p class="subtitle">คำศัพท์ภาษาญี่ปุ่น ${pack.rows.length} คำ พร้อมฮิรางานะ ความหมายอังกฤษและไทย</p><button class="button button-primary" data-pack="${pack.id}">นำเข้าชุดนี้</button></section>`).join('')}
      <section class="panel panel-pad"><h2>นำเข้าไฟล์ของคุณเอง</h2><p class="subtitle">ไปที่ คลังคำศัพท์ → นำเข้าไฟล์ เพื่อนำเข้าไฟล์สำรอง CSV / JSON หรือรายการคำจาก JMdict</p><a class="button button-outline" href="#vocab">เปิดคลังคำศัพท์</a></section></div>`;
    view.querySelectorAll('[data-pack]').forEach(button => button.onclick = () => {
      const pack = PACKS.find(item => item.id === button.dataset.pack);
      let added = 0;
      pack.rows.forEach((row, index) => {
        const [kanji, kana, en, th] = row;
        const exists = S.words.some(word => word.jp === kanji || word.jpKana === kana || (word.en || '').toLocaleLowerCase() === en.toLocaleLowerCase());
        if (exists) return;
        const stamp = new Date().toISOString();
        S.words.push({
          id: `pack-${pack.id}-${Date.now()}-${index}`, th, en, jp: kanji, jpKana: kana, jpKanji: kanji,
          jpFurigana: kana, cn: '', kr: '', category: pack.category, level: pack.level,
          tags: [pack.level, 'Japanese'], favorite: false, last: '', dueAt: localDay(),
          repetitions: 0, intervalDays: 0, easeFactor: 2.5, lapses: 0, quizWrong: 0,
          reviewHistory: [], createdAt: stamp, updatedAt: stamp, order: S.words.length
        });
        added++;
      });
      save();
      toast(`${added} words added; existing words were left unchanged.`);
      packsView();
    });
  }

  // Simple in-app bar history and frequent-forgetting report.
  // localStorage holds roughly 5 million characters per origin; show how much of it is used.
  function storageUsagePercent() {
    try { return Math.min(100, Math.round(((localStorage.getItem('pg:v1') || '').length / 5000000) * 100)); } catch (e) { return 0; }
  }
  function statsView() {
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - (13 - i));
      const key = localDay(date);
      return { key, count: Number(S.studyLog[key]) || 0 };
    });
    const max = Math.max(1, ...days.map(day => day.count));
    let streak = 0;
    const todayKey = localDay();
    const startedToday = !!S.studyLog[todayKey];
    for (let i = 0; ; i++) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const key = localDay(date);
      if (!S.studyLog[key] && !(i === 0 && !startedToday)) break;
      if (S.studyLog[key]) streak++;
    }
    const weak = [...S.words].map(word => ({ word, count: (Number(word.lapses) || 0) + (Number(word.quizWrong) || 0) }))
      .filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 8);
    const totalReviews = Object.values(S.studyLog).reduce((sum, count) => sum + (Number(count) || 0), 0);
    view.innerHTML = pageHead('แผนการเรียนและสถิติ', 'ดูสตรีกการเรียน ปริมาณการทบทวน และคำที่ควรทบทวนซ้ำ') +
      `<div class="stat-grid"><div class="panel stat-card"><div class="stat-top">เรียนติดต่อกัน</div><div class="stat-value">${streak} วัน</div><div class="stat-foot">นับจากการทบทวนและแบบทดสอบที่บันทึกไว้</div></div>
      <div class="panel stat-card"><div class="stat-top">จำนวนครั้งที่ฝึกทั้งหมด</div><div class="stat-value">${totalReviews}</div><div class="stat-foot">การทบทวนและข้อสอบที่ตอบถูก</div></div>
      <div class="panel stat-card"><div class="stat-top">ถึงกำหนดทบทวน</div><div class="stat-value">${dueWords().length}</div><div class="stat-foot">กำหนดโดย SM-2</div></div>
      <div class="panel stat-card"><div class="stat-top">จำนวนคำศัพท์</div><div class="stat-value">${S.words.length}</div><div class="stat-foot">คำที่เก็บไว้ในเครื่องนี้ · พื้นที่เก็บข้อมูลใช้ไป ${storageUsagePercent()}%</div></div></div>
      <section class="panel panel-pad"><div class="section-title"><h2>คำที่ฝึก · 14 วันที่ผ่านมา</h2><a class="button button-soft" href="#review">เริ่มทบทวน</a></div>
      <div class="study-bars" role="img" aria-label="จำนวนการทบทวนรายวัน 14 วันล่าสุด">${days.map(day => `<div class="study-bar-col" title="${day.key}: ${day.count}"><span class="study-bar-count">${day.count || ''}</span><div class="study-bar" style="height:${Math.max(2, day.count / max * 90)}%"></div><span class="study-bar-label">${day.key.slice(5)}</span></div>`).join('')}</div></section>
      <section class="panel panel-pad" style="margin-top:15px"><div class="section-title"><h2>คำที่มักตอบผิด</h2><span style="display:flex;gap:8px;align-items:center"><span class="tag">${weak.length} คำ</span><a class="button button-soft" href="#leeches">ดูคำที่ลืมบ่อยทั้งหมด</a></span></div>
      ${weak.length ? `<div class="review-list">${weak.map(item => `<div class="review-row"><div><div class="word-main">${escHtml(item.word.jp || item.word.th || item.word.en)}</div><div class="word-meta">${escHtml(item.word.en || item.word.th || '')}</div></div><span class="tag">ผิด ${item.count} ครั้ง</span></div>`).join('')}</div>` : '<p class="subtitle">ยังไม่มีคำที่ตอบผิด ผลจากแบบทดสอบและการทบทวนจะมาสร้างรายการนี้</p>'}</section>`;
  }

  // Offline dictionary: small starter set plus a browser-side JMdict JSON importer.
  const DICT_STARTER = [
    ['水','みず','water','น้ำ'],['猫','ねこ','cat','แมว'],['犬','いぬ','dog','สุนัข'],['食べる','たべる','to eat','กิน'],['飲む','のむ','to drink','ดื่ม'],
    ['行く','いく','to go','ไป'],['見る','みる','to see; watch','ดู'],['友達','ともだち','friend','เพื่อน'],['学校','がっこう','school','โรงเรียน'],['駅','えき','station','สถานี'],
    ['本','ほん','book','หนังสือ'],['今日','きょう','today','วันนี้'],['明日','あした','tomorrow','พรุ่งนี้'],['ありがとう','ありがとう','thank you','ขอบคุณ'],['こんにちは','こんにちは','hello; good afternoon','สวัสดี'],
    ['家族','かぞく','family','ครอบครัว'],['人','ひと','person','คน'],['大きい','おおきい','big; large','ใหญ่'],['小さい','ちいさい','small','เล็ก'],['おいしい','おいしい','delicious','อร่อย'],
    ['時間','じかん','time; hour','เวลา'],['仕事','しごと','work; job','งาน'],['場所','ばしょ','place','สถานที่'],['電車','でんしゃ','train','รถไฟ'],['食べ物','たべもの','food','อาหาร']
  ].map((row, i) => ({ id: `starter-${i}`, headword: row[0], reading: row[1], meanings: [row[2], row[3]], source: 'พจนานุกรมเริ่มต้น' }));
  const DICT_DB = 'polyglot-offline-dictionary';
  let dictionaryEntries = [];
  let dictionaryReady = false;
  let dictionaryOperation = 0;
  function openDictionaryDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable'));
      const request = indexedDB.open(DICT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open dictionary storage'));
    });
  }
  async function dictionaryGetAll() {
    const db = await openDictionaryDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction('entries', 'readonly').objectStore('entries').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async function dictionaryWrite(entries, replace = false) {
    const db = await openDictionaryDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      if (replace) store.clear();
      entries.forEach((entry, index) => store.put({ ...entry, id: String(entry.id || `${Date.now()}-${index}`) }));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save dictionary')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Dictionary save was cancelled')); };
    });
  }
  async function loadDictionary() {
    const operation = ++dictionaryOperation;
    try {
      let entries = await dictionaryGetAll();
      if (operation !== dictionaryOperation) return;
      if (!entries.length) {
        await dictionaryWrite(DICT_STARTER, true);
        if (operation !== dictionaryOperation) return;
        entries = [...DICT_STARTER];
      }
      dictionaryEntries = entries;
      dictionaryReady = true;
    } catch (error) {
      if (operation !== dictionaryOperation) return;
      try { dictionaryEntries = JSON.parse(localStorage.getItem('pg:offline-dict') || '[]'); } catch (_) { dictionaryEntries = []; }
      if (!dictionaryEntries.length) dictionaryEntries = [...DICT_STARTER];
      dictionaryReady = true;
    }
  }
  function normalizeJMdict(payload) {
    let entries = Array.isArray(payload) ? payload : (payload?.words || payload?.entries || payload?.data || []);
    if (!Array.isArray(entries)) entries = Object.values(entries || {});
    return entries.map((entry, index) => {
      const kanji = entry.kanji || entry.k_ele || entry.kEle || [];
      const readings = entry.kana || entry.r_ele || entry.rEle || entry.readings || [];
      const firstText = (items, keys) => {
        const first = Array.isArray(items) ? items[0] : items;
        if (typeof first === 'string') return first;
        for (const key of keys) if (first && first[key]) return String(first[key]);
        return '';
      };
      const headword = firstText(kanji, ['text','keb','expression']) || firstText(readings, ['text','reb']) || String(entry.word || '');
      const reading = firstText(readings, ['text','reb','kana']);
      // Keep every written form and reading so the reading-suggestion tool can match alternates too.
      const allTexts = (items, keys) => (Array.isArray(items) ? items : (items ? [items] : [])).map(item => {
        if (typeof item === 'string') return item;
        for (const key of keys) if (item && item[key]) return String(item[key]);
        return '';
      }).filter(Boolean).slice(0, 8);
      const forms = allTexts(kanji, ['text','keb','expression']);
      const allReadings = allTexts(readings, ['text','reb','kana']);
      const senses = entry.sense || entry.senses || [];
      const meanings = [];
      (Array.isArray(senses) ? senses : [senses]).forEach(sense => {
        const glosses = sense?.gloss || sense?.glosses || sense?.meaning || [];
        (Array.isArray(glosses) ? glosses : [glosses]).forEach(gloss => {
          const text = typeof gloss === 'string' ? gloss : (gloss?.text || gloss?.value || gloss?.gloss || '');
          if (text && !meanings.includes(String(text))) meanings.push(String(text));
        });
      });
      return { id: `jmdict-${entry.id || index}-${headword}`, headword, reading, forms, readings: allReadings, meanings: meanings.slice(0, 8), source: 'JMdict' };
    }).filter(entry => entry.headword && entry.meanings.length);
  }
  function dictionaryView() {
    view.innerHTML = pageHead('พจนานุกรมออฟไลน์', 'ค้นหาคำภาษาญี่ปุ่นที่เก็บไว้ในเครื่อง นำเข้าไฟล์ JSON จาก JMdict เพื่อเพิ่มคำได้มากขึ้น ข้อมูลที่นำเข้าจะเก็บใน IndexedDB ของเครื่องนี้') +
      `<section class="panel panel-pad study-panel"><div class="study-notice">พจนานุกรมเริ่มต้นมี ${DICT_STARTER.length} คำที่ใช้บ่อย ไม่ได้แนบ JMdict ฉบับเต็มมาด้วย หากมีไฟล์ JMdict JSON ที่ได้รับอนุญาตให้ใช้ ให้นำเข้าด้านล่างเพื่อค้นหาแบบออฟไลน์</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><input class="field" id="dict-query" placeholder="ค้นหา ญี่ปุ่น / คำอ่าน / อังกฤษ / ไทย" aria-label="ค้นหาในพจนานุกรมออฟไลน์" style="flex:1;min-width:220px"><label class="button button-outline" for="dict-file" style="margin:0">นำเข้า JMdict JSON</label><input id="dict-file" type="file" accept=".json,application/json" hidden></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><select class="select" id="dict-mode" style="max-width:180px"><option value="merge">รวมกับของเดิม</option><option value="replace">แทนที่ทั้งหมด</option></select><span class="study-meta" id="dict-status">กำลังโหลดพจนานุกรม…</span></div><div class="dict-results" id="dict-results"></div></section>`;
    const input = document.querySelector('#dict-query');
    const fileInput = document.querySelector('#dict-file');
    const status = document.querySelector('#dict-status');
    const results = document.querySelector('#dict-results');
    const renderEntries = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const found = dictionaryEntries.filter(entry => !query || [entry.headword, entry.reading, ...(entry.meanings || [])].some(value => String(value || '').toLocaleLowerCase().includes(query))).slice(0, 100);
      status.textContent = `เก็บไว้ในเครื่อง ${dictionaryEntries.length.toLocaleString()} รายการ · แสดง ${found.length} รายการ`;
      results.innerHTML = found.length ? found.map(entry => `<article class="panel dict-entry"><span class="dict-head">${escHtml(entry.headword)}</span><span class="dict-reading">${escHtml(entry.reading || '')}</span><div class="dict-meaning">${(entry.meanings || []).map(escHtml).join(' · ')}</div></article>`).join('') : '<div class="empty-state"><h3>ไม่พบรายการที่ตรงกัน</h3><p>ลองสะกดแบบอื่น หรือนำเข้าไฟล์ JMdict JSON</p></div>';
    };
    input.oninput = renderEntries;
    fileInput.disabled = true;
    loadDictionary().then(() => {
      if (document.querySelector('#dict-file') === fileInput) fileInput.disabled = false;
      renderEntries();
    });
    fileInput.onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!dictionaryReady) { toast('รอให้พจนานุกรมโหลดเสร็จก่อนนะ'); return; }
      status.textContent = 'กำลังอ่านและบันทึกพจนานุกรม…';
      try {
        const parsed = normalizeJMdict(JSON.parse(await file.text()));
        if (!parsed.length) throw new Error('อ่านรายการไม่ได้เลย');
        const replace = document.querySelector('#dict-mode').value === 'replace';
        const operation = ++dictionaryOperation;
        await dictionaryWrite(parsed, replace);
        if (operation !== dictionaryOperation) return;
        dictionaryEntries = replace ? parsed : [...dictionaryEntries, ...parsed];
        if (!replace) {
          const byHeadword = new Map();
          dictionaryEntries.forEach(entry => byHeadword.set(`${entry.headword}|${entry.reading}`, entry));
          dictionaryEntries = [...byHeadword.values()];
        }
        dictionaryReady = true;
        toast(`นำเข้าพจนานุกรม ${parsed.length.toLocaleString()} รายการแล้ว`);
        renderEntries();
      } catch (error) {
        status.textContent = 'นำเข้าไม่สำเร็จ ตรวจสอบว่าเป็นไฟล์ JSON จาก JMdict / JMdict-Simplified';
        toast('นำเข้าไฟล์พจนานุกรมนี้ไม่ได้');
      }
      event.target.value = '';
    };
  }

  const EXTRA_ROUTES = [
    ['review', 'ทบทวนวันนี้'], ['quiz', 'แบบทดสอบ'], ['dictionary', 'พจนานุกรมออฟไลน์'],
    ['stats', 'แผนการเรียนและสถิติ'], ['packs', 'ชุดคำศัพท์']
  ];
  EXTRA_ROUTES.forEach(([id, label]) => { if (!VIEWS.some(item => item[0] === id)) VIEWS.push([id, label]); });
  // ---- Daily goal, badges and spoken words (ported from the React build) ----
  S.settings = Object.assign({ dailyGoal: 10, speech: true, speechRate: 1 }, S.settings || {});
  if (!Array.isArray(S.badges)) S.badges = [];
  const BADGES = [
    ['first', 'ก้าวแรก', 'ทบทวนครบ 1 ครั้ง', m => m.total >= 1],
    ['ten', 'สิบคำแรก', 'จำได้แล้ว 10 คำ', m => m.learned >= 10],
    ['hundred', 'คลังกำลังโต', 'จำได้แล้ว 100 คำ', m => m.learned >= 100],
    ['master', 'นักเก็บคำศัพท์', 'จำได้แล้ว 1,000 คำ', m => m.learned >= 1000],
    ['streak7', 'ติดต่อกัน 7 วัน', 'เรียนต่อเนื่อง 7 วัน', m => m.streak >= 7],
    ['streak30', 'ติดต่อกัน 30 วัน', 'เรียนต่อเนื่อง 30 วัน', m => m.streak >= 30]
  ];
  const SPEECH_LOCALE = { th: 'th-TH', en: 'en-US', cn: 'zh-CN', jp: 'ja-JP', kr: 'ko-KR' };
  const studyMetrics = () => {
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (S.studyLog[localDay(d)]) streak++; else if (i > 0) break;
    }
    return {
      streak,
      total: Object.values(S.studyLog).reduce((a, b) => a + (Number(b) || 0), 0),
      learned: S.words.filter(w => (Number(w.repetitions) || 0) >= 1).length,
      today: Number(S.studyLog[localDay()]) || 0
    };
  };
  const checkBadges = () => {
    const m = studyMetrics();
    const fresh = BADGES.filter(b => b[3](m) && !S.badges.includes(b[0]));
    if (!fresh.length) return;
    S.badges.push(...fresh.map(b => b[0])); save();
    if (typeof toast === 'function') toast('🏅 ได้รับเหรียญ: ' + fresh.map(b => b[1]).join(', '));
  };
  const speakText = (text, lang) => {
    if (!S.settings.speech || !('speechSynthesis' in window)) {
      if (typeof toast === 'function') toast('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน หรือปิดไว้ในหน้าสถิติ');
      return;
    }
    const u = new SpeechSynthesisUtterance(String(text || ''));
    u.lang = SPEECH_LOCALE[lang] || 'en-US';
    u.rate = Number(S.settings.speechRate) || 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
  const goalBar = () => {
    const m = studyMetrics(), goal = Math.max(1, Number(S.settings.dailyGoal) || 10);
    const pct = Math.min(100, Math.round(m.today / goal * 100));
    return `<div id="pg-goal" class="panel panel-pad" style="margin-bottom:15px"><div class="section-title"><h2>เป้าหมายวันนี้</h2><span class="tag">${m.today} / ${goal} ครั้ง${m.today >= goal ? ' ✓' : ''}</span></div>
      <div style="height:10px;border-radius:99px;background:hsl(var(--muted));overflow:hidden"><div style="width:${pct}%;height:100%;background:hsl(var(--primary));transition:width .3s"></div></div></div>`;
  };
  function enhanceReview() {
    checkBadges();
    const panel = view.querySelector('.study-panel');
    if (!panel) return;
    view.querySelector('#pg-goal')?.remove();
    panel.insertAdjacentHTML('beforebegin', goalBar());
    const front = panel.querySelector('.study-front'), back = panel.querySelector('.study-back');
    const add = (el, lang, id) => {
      if (!el || !el.textContent.trim()) return;
      const b = document.createElement('button');
      b.className = 'button button-soft'; b.id = id; b.type = 'button';
      b.textContent = '🔊'; b.title = 'ฟังเสียงอ่าน'; b.setAttribute('aria-label', 'ฟังเสียงอ่าน');
      b.style.marginLeft = '10px';
      b.onclick = () => speakText(el.firstChild ? el.firstChild.textContent : el.textContent, lang);
      el.appendChild(b);
    };
    add(front, view.querySelector('#review-source')?.value, 'pg-say-front');
    if (back && !back.textContent.includes('ยังไม่มีคำแปล')) add(back, view.querySelector('#review-target')?.value, 'pg-say-back');
  }
  function enhanceStats() {
    checkBadges();
    const m = studyMetrics();
    const goals = [5, 10, 20, 30, 50, 100];
    if (!goals.includes(S.settings.dailyGoal)) goals.push(S.settings.dailyGoal);
    view.querySelector('#pg-extra')?.remove();
    const html = `<div id="pg-extra">${goalBar()}
      <section class="panel panel-pad" style="margin-bottom:15px"><div class="section-title"><h2>เหรียญรางวัล</h2><span class="tag">${S.badges.length} / ${BADGES.length}</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${BADGES.map(b => { const on = S.badges.includes(b[0]); return `<div class="panel" style="padding:12px;text-align:center;opacity:${on ? 1 : .45}"><div style="font-size:26px">${on ? '🏅' : '🔒'}</div><strong>${b[1]}</strong><div class="study-meta">${b[2]}</div></div>`; }).join('')}</div></section>
      <section class="panel panel-pad" style="margin-bottom:15px"><div class="section-title"><h2>ตั้งค่าการเรียน</h2></div>
      <div class="quiz-grid"><label>เป้าหมายต่อวัน<select class="select" id="pg-goal-select">${goals.sort((a, b) => a - b).map(g => `<option value="${g}" ${g === S.settings.dailyGoal ? 'selected' : ''}>${g} ครั้ง</option>`).join('')}</select></label>
      <label>เสียงอ่านออกเสียง<select class="select" id="pg-speech-on"><option value="1" ${S.settings.speech ? 'selected' : ''}>เปิด</option><option value="0" ${S.settings.speech ? '' : 'selected'}>ปิด</option></select></label>
      <label>ความเร็วเสียง<select class="select" id="pg-speech-rate">${[.6, .8, 1, 1.2].map(r => `<option value="${r}" ${Number(S.settings.speechRate) === r ? 'selected' : ''}>${r}x</option>`).join('')}</select></label></div></section></div>`;
    const head = view.querySelector('.stat-grid');
    if (!head) return;
    head.insertAdjacentHTML('beforebegin', html);
    view.querySelector('#pg-goal-select').onchange = e => { S.settings.dailyGoal = Number(e.target.value); save(); statsView(); };
    view.querySelector('#pg-speech-on').onchange = e => { S.settings.speech = e.target.value === '1'; save(); };
    view.querySelector('#pg-speech-rate').onchange = e => { S.settings.speechRate = Number(e.target.value); save(); };
  }
  const baseReviewView = reviewView, baseStatsView = statsView;
  reviewView = function () { baseReviewView.apply(this, arguments); enhanceReview(); };
  statsView = function () { baseStatsView.apply(this, arguments); enhanceStats(); };

  const previousRender = render;
  render = function () {
    const current = route();
    if (current === 'review') { nav(); reviewView(); return; }
    if (current === 'quiz') { nav(); quizView(); return; }
    if (current === 'dictionary') { nav(); dictionaryView(); return; }
    if (current === 'stats') { nav(); statsView(); return; }
    if (current === 'packs') { nav(); packsView(); return; }
    previousRender();
  };

  // Add font, script-display, and ready-made background controls to the existing studios.
  if (typeof TOOLS !== 'undefined') {
    TOOLS.handwriting=patchTool(TOOLS.handwriting,
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>',
      '<script src="html2canvas.min.js" onerror="var s=document.createElement(\'script\');s.src=\'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js\';document.head.appendChild(s)"></script>'
    );
    TOOLS.handwriting=patchTool(TOOLS.handwriting,
      '</head>',
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet"></head>'
    );
    const japaneseControls = `
(function(){
  const extras=document.getElementById('polyglotWorksheetExtras');
  if(!extras||document.getElementById('pgJapaneseWorksheetControls'))return;
  extras.insertAdjacentHTML('beforeend','<hr style="margin:16px 0;border:0;border-top:1px solid #d8e0dc"><h4 style="margin:0 0 8px">🇯🇵 ใบงานภาษาญี่ปุ่น</h4><label>แสดงภาษาญี่ปุ่นเป็น</label><select id="pgJpDisplay"><option value="kana">ฮิรางานะ</option><option value="kanji">คันจิ</option><option value="furigana">คันจิ + ฟุริงานะ</option></select><label>ฟอนต์ญี่ปุ่นฟรี</label><select id="pgJpFont"><option value="noto">Noto Sans JP</option><option value="klee">Klee One</option><option value="yomogi">Yomogi</option></select><p style="font-size:12px;color:#64748b;margin-top:6px">ใช้ข้อมูลภาษาญี่ปุ่นจากคลังคำศัพท์ ฟอนต์โหลดจาก Google Fonts เมื่อออนไลน์ และใช้ฟอนต์ของระบบเมื่อออฟไลน์</p>');
  const display=document.getElementById('pgJpDisplay'),font=document.getElementById('pgJpFont');
  const storageKey='pgJapaneseWorksheetPrefs';
  try{const p=JSON.parse(localStorage.getItem(storageKey)||'{}');if(p.display)display.value=p.display;if(p.font)font.value=p.font}catch(e){}
  const style=document.createElement('style');style.textContent='.pg-jp-font-noto .example-main,.pg-jp-font-noto .char-example{font-family:\"Noto Sans JP\",sans-serif!important}.pg-jp-font-klee .example-main,.pg-jp-font-klee .char-example{font-family:\"Klee One\",sans-serif!important}.pg-jp-font-yomogi .example-main,.pg-jp-font-yomogi .char-example{font-family:\"Yomogi\",sans-serif!important}.pg-jp-furigana ruby{ruby-position:over}.pg-jp-furigana rt{font:normal 9px sans-serif}';document.head.appendChild(style);
  let sourceLanguage='';
  addEventListener('message',e=>{if(e.data&&e.data.polyglot==='apply')sourceLanguage=e.data.payload.lang||''});
  const oldRender=render;
  const savePrefs=()=>{try{localStorage.setItem(storageKey,JSON.stringify({display:display.value,font:font.value}))}catch(e){}};
  render=function(){
    const field=document.getElementById('wordsInput'),original=field.value,mode=display.value;
    const rows=original.split(/\\r?\\n/);
    const transformed=rows.map(line=>{
      const parts=line.split('|');if(sourceLanguage!=='jp'||parts.length<6)return line;
      const main=parts[0]||'',kana=parts[5]||main,kanji=parts[6]||main,reading=parts[7]||kana||parts[1]||'';
      parts[0]=mode==='kana'?kana:kanji;
      parts[1]=mode==='furigana'?reading:(mode==='kanji'?'':parts[1]);
      return parts.join('|');
    }).join('\\n');
    field.value=transformed;
    try{oldRender()}finally{field.value=original}
    document.body.classList.remove('pg-jp-font-noto','pg-jp-font-klee','pg-jp-font-yomogi','pg-jp-furigana');
    if(sourceLanguage==='jp'){
      document.body.classList.add('pg-jp-font-'+font.value);
      if(mode==='furigana')document.body.classList.add('pg-jp-furigana');
      const sourceRows=original.split(/\\r?\\n/).filter(x=>x.trim());
      document.querySelectorAll('.word-group').forEach((group,index)=>{
        const parts=(sourceRows[index]||'').split('|'),kanji=parts[6]||parts[0]||'',reading=parts[7]||parts[5]||parts[1]||'';
        const title=group.querySelector('.example-main');
        if(mode==='furigana'&&title&&kanji&&reading)title.innerHTML='<ruby>'+String(kanji).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))+'<rt>'+String(reading).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))+'</rt></ruby>';
      });
    }
    savePrefs();
  };
  display.addEventListener('change',render);font.addEventListener('change',render);
  const originalMessage=window.onmessage;
  render();
})();`;
    const injectFrame = (html, code) => patchTool(html, '</body>', '<script>' + code + '</' + 'script></body>');
    TOOLS.handwriting = injectFrame(TOOLS.handwriting, japaneseControls);
    const handwritingLayoutControls = `
(function(){
  const $=id=>document.getElementById(id);
  const pageCount=$('wordsPerPage');
  const activitySelect=$('worksheetMode');
  const cardPosition=$('cardPos');
  if(!pageCount||!activitySelect||!cardPosition||document.getElementById('layoutPresetsWrap'))return;

  if(!pageCount.querySelector('option[value="3"]')){
    const four=pageCount.querySelector('option[value="4"]');
    if(four)four.insertAdjacentHTML('beforebegin','<option value="3">3 คำ (กะทัดรัด)</option>');
  }

  const styleField=$('style').parentElement;
  const pageCountField=pageCount.parentElement;
  const fontStyleField=$('fontStyle').parentElement;
  const traceCardColorWrap=$('traceCardColor').parentElement;
  const vocabularyPreset=$('preset');
  const vocabularyPresetLabel=vocabularyPreset?.previousElementSibling;
  styleField.id='traceStyleField';
  pageCountField.id='wordsPerPageField';
  fontStyleField.id='fontStyleField';
  traceCardColorWrap.id='traceCardColorWrap';
  if(vocabularyPreset&&vocabularyPresetLabel?.tagName==='LABEL'){
    const vocabularyPresetWrap=document.createElement('div');
    vocabularyPresetWrap.id='wordPresetField';
    vocabularyPresetLabel.parentElement.insertBefore(vocabularyPresetWrap,vocabularyPresetLabel);
    vocabularyPresetWrap.append(vocabularyPresetLabel,vocabularyPreset);
  }

  const style=document.createElement('style');
  style.textContent=[
    '#layoutPresetsWrap{margin:0 0 14px;padding:12px;border:1px solid #d6dfd9;border-radius:12px;background:#f8faf7}',
    '#layoutPresetsWrap .preset-heading{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}',
    '#layoutPresetsWrap .preset-heading strong{font-size:14px;color:#294c40}',
    '#layoutPresetsWrap .preset-heading small{font-size:11px;color:#607568;line-height:1.45}',
    '#layoutPresetsWrap .preset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '#layoutPresetsWrap .worksheet-preset{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;width:100%;min-width:0;min-height:58px;padding:8px 10px;border:1px solid #d9e3dc;border-radius:10px;background:#fff;color:#294c40;text-align:left;white-space:normal;font-size:13px}',
    '#layoutPresetsWrap .worksheet-preset small{color:#607568;font-size:11px}',
    '#layoutPresetsWrap .worksheet-preset[aria-pressed="true"]{border-color:#285b4f;background:#eef7f1;box-shadow:0 0 0 2px rgba(40,91,79,.12)}',
    '.worksheet-export-intro{grid-column:1/-1;display:flex;flex-direction:column;gap:3px;padding:0 2px 4px}',
    '.worksheet-export-intro strong{font-size:14px;color:#374151}',
    '.worksheet-export-intro span{font-size:12px;color:#64748b;line-height:1.45}',
    '.btn-row button:not(.btn-reset){min-width:0;white-space:normal;line-height:1.3;overflow-wrap:anywhere}',
    '.controls [hidden],#layoutPresetsWrap[hidden],#cardOptsWrap [hidden]{display:none!important}',
    '@media(max-width:600px){#layoutPresetsWrap .preset-grid{gap:6px}#layoutPresetsWrap .worksheet-preset{padding:8px;font-size:12px}}'
  ].join('');
  document.head.appendChild(style);

  const presets=[
    {words:1,position:'left',title:'เต็มหน้า',detail:'1 คำ · ตัวอย่างซ้าย'},
    {words:1,position:'top',title:'หน้าใหญ่แนวนอน',detail:'1 คำ · ตัวอย่างบน'},
    {words:2,position:'left',title:'แบบมาตรฐาน',detail:'2 คำ · ตัวอย่างซ้าย'},
    {words:2,position:'right',title:'ตัวอย่างด้านขวา',detail:'2 คำ · ตัวอย่างขวา'},
    {words:3,position:'top',title:'แบบกะทัดรัด',detail:'3 คำ · ตัวอย่างบน'},
    {words:3,position:'bottom',title:'ตัวอย่างด้านล่าง',detail:'3 คำ · ตัวอย่างล่าง'},
    {words:4,position:'top',title:'ประหยัดกระดาษ',detail:'4 คำ · ตัวอย่างบน'},
    {words:4,position:'hide',title:'เน้นฝึกเขียน',detail:'4 คำ · ซ่อนตัวอย่าง'}
  ];
  const presetWrap=document.createElement('section');
  presetWrap.id='layoutPresetsWrap';
  presetWrap.innerHTML='<div class="preset-heading"><strong>ชุดตารางคัดสำเร็จรูป</strong><small>แตะเพื่อเลือกจำนวนคำต่อหน้าและตำแหน่งตัวอย่าง</small></div><div class="preset-grid" role="group" aria-label="ชุดตารางคัดสำเร็จรูป"></div>';
  const presetGrid=presetWrap.querySelector('.preset-grid');
  presets.forEach(preset=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='worksheet-preset';
    button.dataset.words=String(preset.words);
    button.dataset.position=preset.position;
    button.setAttribute('aria-pressed','false');
    button.innerHTML='<strong>'+preset.title+'</strong><small>'+preset.detail+'</small>';
    presetGrid.appendChild(button);
  });
  const activityRow=activitySelect.closest('.row');
  if(activityRow)activityRow.insertAdjacentElement('beforebegin',presetWrap);

  const exportRow=document.querySelector('.btn-row');
  if(exportRow){
    const intro=document.createElement('div');
    intro.className='worksheet-export-intro';
    intro.innerHTML='<strong>ส่งออกใบงาน</strong><span>เลือกพิมพ์ หรือดาวน์โหลดเป็น PDF / PNG</span>';
    exportRow.prepend(intro);
    const printButton=exportRow.querySelector('button[onclick="window.print()"]');
    const pngButton=$('btnDownload');
    const zipButton=$('btnZip');
    const pdfButton=$('btnPdf');
    const resetButton=exportRow.querySelector('.btn-reset');
    if(printButton){
      printButton.textContent='🖨️ พิมพ์';
      printButton.title='เปิดหน้าพิมพ์ของเบราว์เซอร์ และเลือกบันทึกเป็น PDF ได้';
      printButton.setAttribute('aria-label','พิมพ์ หรือเลือกบันทึกเป็น PDF ผ่านเบราว์เซอร์');
    }
    if(pdfButton){
      pdfButton.textContent='📄 ดาวน์โหลด PDF';
      pdfButton.title='ดาวน์โหลด PDF โดยแต่ละหน้าใบงานถูกบันทึกเป็นภาพ';
    }
    if(pngButton){
      pngButton.textContent='🖼️ PNG แยกหน้า';
      pngButton.title='ดาวน์โหลดไฟล์ PNG แยกตามหน้า';
    }
    if(zipButton){
      zipButton.textContent='📦 PNG ทุกหน้า (ZIP)';
      zipButton.title='รวมภาพ PNG ทุกหน้าไว้ในไฟล์ ZIP เดียว';
    }
    [printButton,pdfButton,pngButton,zipButton,resetButton].filter(Boolean).forEach(button=>exportRow.appendChild(button));
  }

  const field=id=>{
    const element=$(id);
    if(!element)return null;
    return element.closest('.checkbox-group')||element.parentElement;
  };
  const setField=(id,visible)=>{
    const wrapper=field(id);
    if(wrapper)wrapper.hidden=!visible;
  };
  const setGroup=(id,visible)=>{
    const wrapper=$(id);
    if(wrapper)wrapper.hidden=!visible;
  };
  function refreshVisibility(){
    const activity=activitySelect.value;
    const traceLayout=$('traceLayout').value;
    const classicTrace=activity==='trace'&&traceLayout==='classic';
    const cardTrace=(activity==='trace'&&traceLayout==='cards')||activity==='fill'||activity==='scramble';
    const matchLike=activity==='match'||activity==='picmatch';
    const cardOptions=cardTrace||activity==='picmatch'||activity==='compound';
    const styleMode=$('style').value;
    const rowStyle=$('traceRowStyle').value;

    setField('style',classicTrace);
    setField('wordsPerPage',!matchLike);
    setGroup('traceLayoutWrap',activity==='trace');
    setGroup('matchPerPageWrap',matchLike);
    setGroup('traceColsWrap',cardTrace);
    setGroup('traceCardLangWrap',cardTrace||activity==='picmatch');
    setGroup('traceRowStyleWrap',cardTrace);
    setGroup('traceCardColorWrap',cardOptions);
    setGroup('wordPresetField',activity!=='compound');
    setGroup('answerKeyRow',matchLike);
    setGroup('answerKeyAllRow',!matchLike);

    setField('fontStyle',!matchLike);
    setField('rowCount',!matchLike);
    setField('colCount',classicTrace);
    setField('rowGap',classicTrace);
    setField('letterGap',classicTrace);
    setField('fontSize',classicTrace);
    setField('cellSize',classicTrace);
    setField('textStyle',classicTrace);
    setField('exampleMode',classicTrace);
    setField('lineStyle',classicTrace&&styleMode==='lines');
    setField('cardPos',classicTrace);
    setField('showStars',classicTrace);
    setField('showStartDot',classicTrace&&styleMode==='cross');
    setField('freehandMode',activity==='trace');
    setField('squareMode',(classicTrace&&styleMode==='cross')||(cardTrace&&rowStyle==='box'));
    setField('hideDash',classicTrace&&styleMode==='lines');
    setField('inkSaver',true);
    setGroup('layoutPresetsWrap',classicTrace);

    document.querySelectorAll('.controls > .row').forEach(row=>{
      if(row.id==='cardOptsWrap')return;
      const children=[...row.children].filter(child=>child.matches('div,label'));
      if(!children.length)return;
      row.hidden=!children.some(child=>!child.hidden&&getComputedStyle(child).display!=='none');
    });

    presetGrid.querySelectorAll('.worksheet-preset').forEach(button=>{
      const selected=classicTrace&&button.dataset.words===pageCount.value&&button.dataset.position===cardPosition.value;
      button.setAttribute('aria-pressed',String(selected));
    });
  }

  presetGrid.addEventListener('click',event=>{
    const button=event.target.closest('.worksheet-preset');
    if(!button)return;
    activitySelect.value='trace';
    $('traceLayout').value='classic';
    $('style').value='lines';
    pageCount.value=button.dataset.words;
    cardPosition.value=button.dataset.position;
    render();
    refreshVisibility();
  });
  ['worksheetMode','traceLayout','style','traceRowStyle'].forEach(id=>{
    $(id).addEventListener('change',refreshVisibility);
  });
  pageCount.addEventListener('change',refreshVisibility);
  cardPosition.addEventListener('change',refreshVisibility);
  window.addEventListener('load',refreshVisibility);
  refreshVisibility();
})();`;
    TOOLS.handwriting = injectFrame(TOOLS.handwriting, handwritingLayoutControls);

    TOOLS.balloons=patchTool(TOOLS.balloons,
      '<h2>🖼️ ขอบสติกเกอร์ & พื้นหลัง</h2>',
      '<label>🎨 พื้นหลังด่วน</label><select id="pgBgPreset"><option value="transparent">โปร่งใส</option><option value="pink">ชมพูพาสเทล</option><option value="blue-dots">ฟ้าลายจุด</option><option value="night-stars">กรมท่าลายดาว</option><option value="yellow-grid">เหลืองลายตาราง</option></select><h2>🖼️ ขอบสติกเกอร์ & พื้นหลัง</h2>'
    );
    const stickerBackgrounds = `
(function(){
  const preset=document.getElementById('pgBgPreset');if(!preset)return;
  const key='pgStickerBgPreset';try{preset.value=localStorage.getItem(key)||'transparent'}catch(e){}
  const values={transparent:{on:false,color:'#ffffff',pattern:'solid'},pink:{on:true,color:'#fff1f5',pattern:'solid'},'blue-dots':{on:true,color:'#e8f4ff',pattern:'dots'},'night-stars':{on:true,color:'#172554',pattern:'stars'},'yellow-grid':{on:true,color:'#fff7cc',pattern:'grid'}};
  const apply=()=>{const v=values[preset.value]||values.transparent;document.getElementById('bgOn').checked=v.on;document.getElementById('bg').value=v.color;document.getElementById('bgPattern').value=v.pattern;try{localStorage.setItem(key,preset.value)}catch(e){};go()};
  preset.addEventListener('change',apply);
  try{if(preset.value!=='transparent'){const v=values[preset.value];document.getElementById('bgOn').checked=v.on;document.getElementById('bg').value=v.color;document.getElementById('bgPattern').value=v.pattern}}catch(e){}
})();`;
    TOOLS.balloons = injectFrame(TOOLS.balloons, stickerBackgrounds);
  }

  // Shared helpers for the extra modules (vocab-tools.js, study-extras.js).
  window.PG = { localDay, markStudy, scheduleSM2, isNewWord, dueWords, speakText, studyMetrics, wordText, cleanTags, shuffle, escHtml, loadDictionary: async () => { await loadDictionary(); return dictionaryEntries; }, DICT_STARTER };

  render();
})();
