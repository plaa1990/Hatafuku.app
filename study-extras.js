/* Polyglot Studio — ส่วนเสริมการเรียน
   • คำประจำวัน (หน้าภาพรวม) — สุ่มจากคำที่ยังไม่เคยทบทวน
   ต้องโหลดหลัง study-features.js */
(function () {
  'use strict';
  const PGH = window.PG;
  if (!PGH) { try { console.warn('[polyglot] study-extras.js ต้องโหลดหลัง study-features.js'); } catch (e) {} return; }
  const { localDay, isNewWord, speakText } = PGH;
  const h = value => esc(value);
  const trim = value => String(value ?? '').trim();

  const style = document.createElement('style');
  style.textContent = `
    .wotd{margin:15px 0;padding:18px 20px}
    .wotd-lines{display:grid;gap:8px;margin:10px 0 14px}
    .wotd-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .wotd-line small{min-width:56px;font:10px var(--app-font-mono);letter-spacing:.08em;text-transform:uppercase;color:hsl(var(--muted-foreground))}
    .wotd-main{font:700 clamp(22px,5vw,32px) var(--app-font-serif);overflow-wrap:anywhere}
    .wotd-text{font-size:16px;overflow-wrap:anywhere}
    .wotd-read{font-size:12px;color:hsl(var(--muted-foreground))}
    .wotd-actions{display:flex;gap:8px;flex-wrap:wrap}
  `;
  document.head.appendChild(style);

  // ---------- คำประจำวัน ----------
  const langCount = w => ['th', 'en', 'cn', 'jp', 'kr'].filter(k => trim(w[k])).length;
  const hashString = text => { let n = 2166136261; for (const ch of String(text)) { n ^= ch.codePointAt(0); n = Math.imul(n, 16777619); } return n >>> 0; };

  // เลือกคำของวันนี้: จำไว้ใน S.wotd เพื่อให้ทั้งวันเป็นคำเดิม จนกว่าผู้ใช้จะกด “สุ่มคำอื่น”
  function pickWord(excludeId) {
    const day = localDay();
    const usable = S.words.filter(w => w.id !== excludeId && langCount(w) >= 2);
    const fresh = usable.filter(isNewWord);
    const pool = fresh.length ? fresh : usable;
    if (!pool.length) return null;
    const index = excludeId ? Math.floor(Math.random() * pool.length) : hashString(day + ':' + S.words.length) % pool.length;
    return pool[index];
  }
  function currentWord() {
    const day = localDay();
    let word = S.wotd && S.wotd.date === day ? S.words.find(w => w.id === S.wotd.id) : null;
    if (!word) {
      word = pickWord();
      if (word) { S.wotd = { date: day, id: word.id }; save(); }
    }
    return word;
  }

  function wotdHtml(w) {
    const rows = [
      ['th', 'ไทย', w.th, ''], ['en', 'อังกฤษ', w.en, ''], ['cn', 'จีน', w.cn, w.cnr],
      ['jp', 'ญี่ปุ่น', w.jp, w.jpKana || w.jpr], ['kr', 'เกาหลี', w.kr, w.krr]
    ].filter(row => trim(row[2]));
    const inQueue = w.introducedAt === localDay();
    const speak = (code, text) => `<button class="mini-action" data-wotd-say="${code}" data-text="${h(text)}" title="ฟังเสียงอ่าน" aria-label="ฟังเสียงอ่าน">🔊</button>`;
    const [first, ...rest] = rows;
    return `<section class="panel wotd" id="wotd"><div class="section-title" style="margin-bottom:6px"><div><div class="eyebrow">คำประจำวัน</div></div>${w.category ? `<span class="tag">${h(w.category)}</span>` : ''}</div>
      <div class="wotd-line"><span class="wotd-main">${h(first[2])}</span>${first[3] ? `<span class="wotd-read">${h(first[3])}</span>` : ''}${speak(first[0], first[0] === 'jp' && w.jpKana ? w.jpKana : first[2])}</div>
      <div class="wotd-lines">${rest.map(([code, name, text, reading]) => `<div class="wotd-line"><small>${name}</small><span class="wotd-text">${h(text)}</span>${reading ? `<span class="wotd-read">${h(reading)}</span>` : ''}${speak(code, code === 'jp' && w.jpKana ? w.jpKana : text)}</div>`).join('')}</div>
      <div class="wotd-actions"><button class="button button-primary" id="wotd-add" ${inQueue ? 'disabled' : ''} title="ใส่คำนี้เข้าคิวทบทวนวันนี้ (นับรวมในโควตาคำใหม่ของวัน)">${inQueue ? 'อยู่ในคิวทบทวนวันนี้แล้ว ✓' : '＋ เรียนคำนี้วันนี้'}</button><button class="button button-outline" id="wotd-next">🎲 สุ่มคำอื่น</button></div></section>`;
  }

  const previousOverview = overview;
  overview = function () {
    previousOverview.apply(this, arguments);
    const anchor = view.querySelector('.quick-actions');
    const word = anchor ? currentWord() : null;
    if (!anchor || !word) return;
    anchor.insertAdjacentHTML('afterend', wotdHtml(word));
    const card = view.querySelector('#wotd');
    card.querySelectorAll('[data-wotd-say]').forEach(button => button.onclick = () => speakText(button.dataset.text, button.dataset.wotdSay));
    card.querySelector('#wotd-next').onclick = () => {
      const next = pickWord(word.id);
      if (!next) return toast('ไม่มีคำอื่นให้สุ่มแล้ว');
      S.wotd = { date: localDay(), id: next.id }; save(); overview();
    };
    card.querySelector('#wotd-add').onclick = () => {
      // ทำให้คำนี้เป็นคำที่ “เริ่มเรียนแล้ว” และถึงกำหนดทบทวนวันนี้ จึงเข้าคิวในหน้า “ทบทวนวันนี้”
      word.introducedAt = localDay(); word.dueAt = localDay(); word.updatedAt = new Date().toISOString(); save();
      toast('เพิ่มเข้าคิวทบทวนวันนี้แล้ว'); overview();
    };
  };

  window.PGStudyExtras = { currentWord, pickWord };
  render();
})();
