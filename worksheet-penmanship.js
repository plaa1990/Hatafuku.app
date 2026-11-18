/* ฝึกเขียนอังกฤษ + ลำดับการลากเส้น (Penmanship) — โหมดใหม่ของใบงานคัดลายมือ
 * ทำงานออฟไลน์ทั้งหมด: วาดตัวอักษรเป็นเส้น (SVG) จากข้อมูลเส้นในไฟล์นี้ ไม่พึ่งฟอนต์/AI ภายนอก
 * ฟังก์ชันนี้ถูกฝังเข้าไปใน iframe ของเครื่องมือใบงานโดย index.html (เหมือน PG_WS_HALF2)
 * ห้ามอ้างตัวแปรภายนอกฟังก์ชัน ยกเว้นตัวแปรของเครื่องมือใบงาน ($, render, inputsToSave) */
window.PG_WS_PEN = function () {
  const $ = id => document.getElementById(id);
  const controls = document.querySelector('.controls');
  const modeSel = $('worksheetMode');
  if (!controls || !modeSel || $('pgPenSection')) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ================= ข้อมูลเส้นตัวอักษร =================
   * พิกัดหน่วยนามธรรม: เส้นบนสุด y=0, เส้นกลาง(x-height) y=35, เส้นฐาน y=70, เส้นล่างสุด y=100
   * แต่ละเส้น = รายการจุด [x,y] เรียงตามทิศที่ลากปากกา, จุดที่ 3 = 1 หมายถึงมุมหักคม
   * ถ้าจุดแรก = จุดสุดท้ายจะถือเป็นเส้นวงปิด (ใช้ Catmull-Rom ทำให้โค้งเนียน) */
  const L = (w, ...s) => ({ w, s });
  const DOT = (x, y) => [[x, y], [x, y + 0.01]];
  const P = {
    A: L(60, [[30, 0], [3, 70]], [[30, 0], [57, 70]], [[14, 46], [46, 46]]),
    B: L(50, [[8, 0], [8, 70]], [[8, 0], [26, 0], [38, 5], [42, 17], [38, 29], [26, 35], [8, 35]], [[8, 35], [28, 35], [42, 40], [46, 52], [42, 64], [28, 70], [8, 70]]),
    C: L(55, [[48, 12], [38, 3], [26, 0], [14, 6], [6, 20], [4, 35], [6, 50], [14, 64], [26, 70], [38, 67], [48, 58]]),
    D: L(55, [[8, 0], [8, 70]], [[8, 0], [26, 0], [42, 8], [50, 22], [52, 35], [50, 50], [42, 63], [26, 70], [8, 70]]),
    E: L(45, [[8, 0], [8, 70]], [[8, 0], [40, 0]], [[8, 35], [34, 35]], [[8, 70], [40, 70]]),
    F: L(45, [[8, 0], [8, 70]], [[8, 0], [40, 0]], [[8, 35], [34, 35]]),
    G: L(58, [[50, 12], [40, 3], [28, 0], [15, 6], [7, 20], [5, 35], [7, 50], [15, 64], [28, 70], [42, 66], [50, 56], [50, 40]], [[32, 40], [52, 40]]),
    H: L(55, [[8, 0], [8, 70]], [[47, 0], [47, 70]], [[8, 35], [47, 35]]),
    I: L(30, [[15, 0], [15, 70]], [[6, 0], [24, 0]], [[6, 70], [24, 70]]),
    J: L(40, [[28, 0], [28, 50], [24, 63], [15, 70], [6, 63]]),
    K: L(52, [[8, 0], [8, 70]], [[46, 0], [8, 40]], [[20, 28], [48, 70]]),
    L: L(42, [[8, 0], [8, 70]], [[8, 70], [38, 70]]),
    M: L(66, [[8, 0], [8, 70]], [[8, 0, 1], [33, 52, 1], [58, 0, 1]], [[58, 0], [58, 70]]),
    N: L(55, [[8, 0], [8, 70]], [[8, 0], [47, 70]], [[47, 70], [47, 0]]),
    O: L(58, [[29, 0], [14, 5], [6, 18], [4, 35], [6, 52], [14, 65], [29, 70], [44, 65], [52, 52], [54, 35], [52, 18], [44, 5], [29, 0]]),
    P: L(50, [[8, 0], [8, 70]], [[8, 0], [26, 0], [38, 5], [42, 17], [38, 29], [26, 35], [8, 35]]),
    Q: L(58, [[29, 0], [14, 5], [6, 18], [4, 35], [6, 52], [14, 65], [29, 70], [44, 65], [52, 52], [54, 35], [52, 18], [44, 5], [29, 0]], [[36, 54], [56, 74]]),
    R: L(52, [[8, 0], [8, 70]], [[8, 0], [26, 0], [38, 5], [42, 17], [38, 29], [26, 35], [8, 35]], [[24, 35], [46, 70]]),
    S: L(46, [[40, 12], [32, 3], [22, 0], [11, 4], [6, 14], [10, 24], [22, 33], [34, 40], [40, 50], [36, 63], [24, 70], [12, 68], [4, 58]]),
    T: L(50, [[4, 0], [46, 0]], [[25, 0], [25, 70]]),
    U: L(52, [[8, 0], [8, 50], [13, 63], [26, 70], [39, 63], [44, 50], [44, 0]]),
    V: L(56, [[3, 0], [28, 70, 1], [53, 0]]),
    W: L(76, [[3, 0], [19, 70, 1], [38, 12, 1], [57, 70, 1], [73, 0]]),
    X: L(54, [[4, 0], [50, 70]], [[50, 0], [4, 70]]),
    Y: L(54, [[4, 0], [27, 38]], [[50, 0], [27, 38]], [[27, 38], [27, 70]]),
    Z: L(50, [[5, 0], [45, 0]], [[45, 0], [5, 70]], [[5, 70], [45, 70]]),
    a: L(44, [[36, 40], [27, 35], [17, 36], [8, 43], [4, 53], [8, 64], [17, 70], [27, 70], [36, 65]], [[38, 35], [38, 70]]),
    b: L(44, [[8, 0], [8, 70]], [[8, 45], [16, 37], [26, 35], [36, 40], [41, 52], [37, 64], [27, 70], [16, 69], [8, 62]]),
    c: L(40, [[36, 42], [28, 36], [19, 35], [10, 40], [5, 52], [10, 64], [19, 70], [28, 69], [36, 63]]),
    d: L(44, [[36, 40], [27, 35], [17, 36], [8, 43], [4, 53], [8, 64], [17, 70], [27, 70], [36, 65]], [[38, 0], [38, 70]]),
    e: L(42, [[6, 52], [36, 52], [35, 42], [26, 35], [16, 36], [7, 44], [5, 55], [9, 65], [19, 70], [29, 70], [37, 63]]),
    f: L(34, [[30, 8], [24, 2], [17, 1], [12, 8], [12, 70]], [[4, 35], [26, 35]]),
    g: L(44, [[36, 40], [27, 35], [17, 36], [8, 43], [4, 53], [8, 64], [17, 70], [27, 70], [36, 65]], [[38, 35], [38, 88], [34, 98], [24, 102], [12, 98], [6, 92]]),
    h: L(44, [[8, 0], [8, 70]], [[8, 48], [14, 39], [24, 35], [34, 40], [37, 50], [37, 70]]),
    i: L(20, [[10, 35], [10, 70]], DOT(10, 20)),
    j: L(26, [[14, 35], [14, 90], [10, 100], [2, 104]], DOT(14, 20)),
    k: L(42, [[8, 0], [8, 70]], [[36, 35], [8, 56]], [[18, 50], [38, 70]]),
    l: L(20, [[10, 0], [10, 70]]),
    m: L(62, [[8, 35], [8, 70]], [[8, 48], [14, 39], [22, 35], [30, 40], [33, 50], [33, 70]], [[33, 48], [39, 39], [47, 35], [55, 40], [58, 50], [58, 70]]),
    n: L(44, [[8, 35], [8, 70]], [[8, 48], [14, 39], [24, 35], [34, 40], [37, 50], [37, 70]]),
    o: L(44, [[22, 35], [11, 40], [6, 52], [11, 64], [22, 70], [33, 64], [38, 52], [33, 40], [22, 35]]),
    p: L(44, [[8, 35], [8, 105]], [[8, 45], [16, 37], [26, 35], [36, 40], [41, 52], [37, 64], [27, 70], [16, 69], [8, 62]]),
    q: L(44, [[36, 40], [27, 35], [17, 36], [8, 43], [4, 53], [8, 64], [17, 70], [27, 70], [36, 65]], [[38, 35], [38, 105]]),
    r: L(32, [[8, 35], [8, 70]], [[8, 50], [14, 40], [22, 36], [30, 37]]),
    s: L(36, [[31, 42], [24, 36], [16, 35], [8, 39], [6, 46], [12, 52], [22, 55], [30, 60], [30, 66], [22, 70], [12, 70], [5, 65]]),
    t: L(32, [[14, 12], [14, 62], [18, 69], [27, 70]], [[5, 35], [26, 35]]),
    u: L(44, [[8, 35], [8, 58], [13, 67], [22, 70], [32, 66], [38, 56]], [[38, 35], [38, 70]]),
    v: L(44, [[4, 35], [22, 70, 1], [40, 35]]),
    w: L(60, [[3, 35], [16, 70, 1], [30, 42, 1], [44, 70, 1], [57, 35]]),
    x: L(40, [[5, 35], [35, 70]], [[35, 35], [5, 70]]),
    y: L(44, [[5, 35], [22, 70]], [[40, 35], [24, 72], [16, 92], [8, 102], [2, 100]]),
    z: L(40, [[5, 35], [35, 35]], [[35, 35], [5, 70]], [[5, 70], [35, 70]]),
    0: L(46, [[23, 0], [10, 6], [5, 22], [5, 48], [10, 64], [23, 70], [36, 64], [41, 48], [41, 22], [36, 6], [23, 0]]),
    1: L(34, [[8, 16], [22, 0, 1], [22, 70]]),
    2: L(46, [[6, 16], [10, 6], [20, 1], [32, 4], [38, 14], [34, 28], [20, 46], [6, 70, 1], [40, 70]]),
    3: L(46, [[6, 10], [14, 2], [26, 1], [36, 8], [36, 20], [28, 30], [18, 34, 1], [30, 38], [40, 48], [38, 62], [28, 70], [16, 70], [6, 63]]),
    4: L(48, [[32, 0], [4, 48, 1], [44, 48]], [[32, 18], [32, 70]]),
    5: L(46, [[36, 0], [10, 0, 1], [8, 34]], [[8, 34], [18, 30], [30, 31], [39, 42], [40, 54], [33, 66], [22, 70], [12, 69], [5, 63]]),
    6: L(46, [[34, 6], [26, 1], [16, 4], [8, 16], [5, 38], [6, 56], [13, 67], [23, 70], [34, 64], [38, 52], [33, 40], [22, 35], [12, 38], [6, 46]]),
    7: L(46, [[5, 0], [40, 0, 1], [20, 70]]),
    8: L(46, [[34, 12], [28, 2], [17, 0], [9, 7], [9, 19], [17, 28], [29, 36], [38, 46], [38, 60], [29, 69], [19, 70], [9, 66], [5, 55], [9, 44], [20, 35], [30, 27], [37, 18], [35, 7], [28, 1]]),
    9: L(46, [[36, 20], [31, 6], [21, 0], [11, 5], [6, 18], [10, 31], [21, 36], [32, 31], [36, 20]], [[36, 20], [36, 50], [31, 64], [21, 70], [10, 67], [5, 60]]),
    '.': L(16, DOT(8, 68)),
    ',': L(16, [[8, 66], [6, 78]]),
    '!': L(16, [[8, 0], [8, 48]], DOT(8, 67)),
    '?': L(32, [[3, 12], [8, 3], [18, 0], [27, 6], [28, 17], [20, 28], [14, 36], [14, 46]], DOT(14, 67)),
    "'": L(14, [[6, 0], [6, 14]]),
    '-': L(32, [[4, 45], [28, 45]]),
    ':': L(16, DOT(8, 40), DOT(8, 67)),
    ';': L(16, DOT(8, 40), [[8, 66], [6, 78]])
  };
  /* ลายเส้นพื้นฐาน (ก่อนเขียนตัวอักษร) */
  const E = {
    '§1': L(22, [[11, 0], [11, 70]]),
    '§2': L(54, [[3, 35], [51, 35]]),
    '§3': L(40, [[34, 0], [6, 70]]),
    '§4': L(40, [[6, 0], [34, 70]]),
    '§5': L(54, [[27, 0], [13, 5], [5, 18], [3, 35], [5, 52], [13, 65], [27, 70], [41, 65], [49, 52], [51, 35], [49, 18], [41, 5], [27, 0]]),
    '§6': L(44, [[5, 18], [8, 46], [16, 62], [22, 66], [28, 62], [36, 46], [39, 18]]),
    '§7': L(44, [[5, 68], [8, 40], [16, 24], [22, 20], [28, 24], [36, 40], [39, 68]]),
    '§8': L(62, [[3, 50], [11, 36], [19, 36], [27, 50], [35, 64], [43, 64], [51, 50], [59, 36]]),
    '§9': L(60, [[3, 70], [17, 8, 1], [31, 70, 1], [45, 8, 1], [57, 70]])
  };
  /* ตัวเขียนต่อเนื่อง (cursive) สำหรับพิมพ์เล็ก: เริ่มที่เส้นฐานซ้ายสุด (x=0,y=70) เพื่อเชื่อมต่อกับตัวก่อนหน้า */
  const C = {
    a: L(44, [[0, 70], [7, 58], [15, 46], [25, 38], [17, 34], [8, 40], [4, 52], [8, 65], [18, 70], [29, 63], [34, 48], [35, 32, 1], [35, 64], [39, 69], [44, 70]]),
    b: L(44, [[0, 70], [7, 56], [14, 36], [19, 14], [19, 3], [14, 0], [10, 6], [10, 30], [10, 60], [11, 68], [18, 70], [27, 68], [33, 58], [33, 46], [29, 39], [34, 36], [44, 35]]),
    c: L(36, [[0, 70], [8, 59], [18, 46], [22, 38], [16, 35], [9, 41], [6, 53], [11, 65], [20, 70], [30, 69], [36, 70]]),
    d: L(44, [[0, 70], [7, 58], [15, 46], [23, 38], [16, 35], [8, 41], [5, 53], [10, 65], [19, 70], [28, 62], [33, 48], [35, 36], [36, 18], [36, 2, 1], [35, 36], [35, 64], [39, 69], [44, 70]]),
    e: L(36, [[0, 70], [10, 58], [20, 44], [27, 36], [31, 40], [24, 47], [10, 53], [6, 62], [12, 70], [22, 70], [30, 68], [36, 70]]),
    f: L(38, [[0, 70], [8, 50], [14, 24], [17, 6], [13, 0], [9, 6], [11, 30], [14, 60], [15, 85], [11, 100], [4, 100], [3, 92], [12, 82], [24, 72], [34, 70], [38, 70]], [[2, 35], [26, 35]]),
    g: L(44, [[0, 70], [7, 58], [15, 46], [23, 38], [16, 35], [8, 41], [5, 53], [10, 65], [19, 70], [28, 62], [33, 48], [34, 36, 1], [34, 85], [31, 98], [22, 102], [14, 98], [16, 90], [26, 80], [38, 72], [44, 70]]),
    h: L(44, [[0, 70], [8, 50], [14, 24], [17, 6], [13, 0], [9, 6], [10, 30], [11, 70, 1], [11, 52], [18, 39], [28, 36], [34, 44], [34, 60], [37, 68], [44, 70]]),
    i: L(24, [[0, 70], [7, 58], [10, 36, 1], [10, 62], [14, 70], [24, 70]], DOT(10, 22)),
    j: L(26, [[0, 70], [7, 58], [12, 36, 1], [12, 84], [8, 98], [0, 100], [0, 92], [10, 84], [20, 74], [26, 70]], DOT(12, 22)),
    k: L(42, [[0, 70], [8, 50], [14, 24], [17, 6], [13, 0], [9, 6], [10, 30], [11, 70]], [[30, 36], [22, 44], [12, 53, 1], [22, 58], [34, 70], [42, 70]]),
    l: L(28, [[0, 70], [8, 50], [14, 24], [17, 6], [13, 0], [9, 6], [11, 30], [12, 64], [16, 70], [28, 70]]),
    m: L(64, [[0, 70], [7, 57], [11, 38, 1], [11, 70, 1], [11, 50], [17, 38], [26, 36], [31, 44], [31, 70, 1], [31, 50], [37, 38], [46, 36], [52, 44], [52, 62], [56, 69], [64, 70]]),
    n: L(46, [[0, 70], [7, 57], [11, 38, 1], [11, 70, 1], [11, 50], [18, 38], [28, 36], [34, 44], [34, 62], [38, 69], [46, 70]]),
    o: L(42, [[0, 70], [8, 58], [17, 45], [20, 38], [14, 36], [7, 43], [6, 55], [12, 66], [22, 70], [30, 64], [33, 52], [29, 40], [32, 36], [42, 35]]),
    p: L(44, [[0, 70], [7, 58], [10, 36, 1], [10, 100]], [[10, 48], [18, 38], [28, 36], [36, 44], [37, 56], [30, 67], [20, 70], [11, 64]]),
    q: L(46, [[0, 70], [7, 58], [15, 46], [23, 38], [16, 35], [8, 41], [5, 53], [10, 65], [19, 70], [28, 62], [33, 48], [34, 36, 1], [34, 92], [38, 100], [44, 96], [46, 86]]),
    r: L(36, [[0, 70], [7, 57], [12, 38, 1], [15, 52], [19, 40], [27, 34], [36, 36]]),
    s: L(34, [[0, 70], [8, 58], [16, 44], [20, 36, 1], [24, 46], [20, 56], [13, 62], [15, 69], [24, 70], [34, 70]]),
    t: L(34, [[0, 70], [7, 56], [11, 36], [12, 14, 1], [13, 62], [16, 69], [24, 70], [34, 70]], [[2, 35], [24, 35]]),
    u: L(44, [[0, 70], [7, 58], [10, 38, 1], [10, 60], [14, 68], [22, 70], [30, 64], [34, 52], [35, 36, 1], [35, 62], [39, 69], [44, 70]]),
    v: L(46, [[0, 70], [7, 57], [11, 38, 1], [18, 70, 1], [28, 50], [34, 38], [40, 36], [46, 35]]),
    w: L(60, [[0, 70], [7, 57], [11, 38, 1], [18, 70, 1], [26, 38, 1], [34, 70, 1], [42, 50], [48, 38], [54, 36], [60, 35]]),
    x: L(38, [[0, 70], [8, 56], [12, 38, 1], [28, 69], [38, 70]], [[30, 36], [10, 70]]),
    y: L(44, [[0, 70], [7, 58], [10, 38, 1], [10, 60], [14, 68], [22, 70], [30, 64], [34, 52], [36, 36, 1], [36, 80], [30, 96], [20, 102], [12, 98], [12, 90], [22, 80], [34, 72], [44, 70]]),
    z: L(40, [[0, 70], [6, 56], [8, 38, 1], [28, 38, 1], [10, 66], [20, 72], [30, 68], [40, 70]])
  };

  /* ตัวพิมพ์ใหญ่แบบเขียนต่อเนื่อง (จบด้านขวา เพื่อเชื่อมกับตัวพิมพ์เล็กถัดไป) */
  Object.assign(C, {
    A: L(56, [[30, 0], [20, 26], [10, 50], [4, 68]], [[30, 0], [38, 28], [46, 54], [56, 70]], [[14, 46], [46, 46]]),
    B: L(50, [[10, 0], [8, 28], [7, 56], [9, 70]], [[10, 2], [28, 0], [40, 8], [38, 21], [24, 32], [14, 35, 1], [30, 37], [44, 45], [44, 58], [32, 68], [16, 68], [8, 64]]),
    C: L(48, [[46, 10], [36, 2], [22, 0], [10, 10], [5, 32], [7, 54], [16, 67], [30, 70], [42, 64]]),
    D: L(56, [[10, 0], [9, 35], [8, 66]], [[12, 2], [34, 4], [50, 22], [50, 46], [38, 63], [20, 69], [8, 66], [24, 74], [44, 70], [56, 70]]),
    E: L(44, [[38, 12], [26, 2], [12, 8], [10, 20], [24, 31], [14, 36], [8, 48], [10, 62], [22, 69], [34, 65], [42, 70]]),
    F: L(46, [[44, 8], [34, 0], [22, 2], [16, 18], [12, 50], [8, 66], [16, 70], [30, 70], [46, 70]], [[2, 34], [34, 32]]),
    G: L(52, [[46, 10], [36, 2], [22, 0], [10, 10], [5, 32], [7, 54], [17, 67], [32, 69], [44, 60], [47, 42], [34, 42]]),
    H: L(56, [[8, 0], [6, 30], [5, 56], [6, 70]], [[46, 0], [44, 30], [44, 56], [48, 68], [56, 70]], [[6, 36], [46, 34]]),
    I: L(32, [[18, 0], [15, 30], [13, 56], [15, 66], [21, 70], [32, 70]]),
    J: L(42, [[24, 0], [24, 40], [20, 62], [10, 72], [3, 66], [6, 58], [16, 60], [28, 66], [42, 70]]),
    K: L(50, [[8, 0], [6, 34], [6, 60], [8, 70]], [[44, 6], [28, 26], [10, 42, 1], [24, 48], [36, 60], [44, 68], [50, 70]]),
    L: L(46, [[10, 0], [8, 30], [8, 58], [16, 69], [30, 70], [46, 70]]),
    M: L(70, [[6, 70], [6, 0, 1], [30, 56, 1], [54, 0, 1], [54, 50], [58, 66], [70, 70]]),
    N: L(62, [[8, 70], [8, 0, 1], [46, 70, 1], [46, 0], [46, 44], [50, 64], [62, 70]]),
    O: L(56, [[30, 2], [12, 10], [5, 36], [12, 62], [28, 70], [46, 60], [54, 34], [44, 10], [28, 2], [34, 0], [48, 6]]),
    P: L(48, [[10, 0], [8, 36], [7, 70]], [[10, 2], [30, 0], [44, 10], [42, 26], [28, 36], [10, 38]]),
    Q: L(58, [[30, 2], [12, 10], [5, 36], [12, 62], [28, 70], [46, 60], [54, 34], [44, 10], [28, 2]], [[30, 50], [46, 66], [58, 72]]),
    R: L(52, [[10, 0], [8, 36], [7, 70]], [[10, 2], [30, 0], [42, 9], [40, 24], [28, 34], [10, 38, 1], [24, 44], [34, 58], [44, 68], [52, 70]]),
    S: L(46, [[40, 10], [30, 2], [18, 2], [10, 12], [16, 26], [32, 38], [40, 50], [34, 64], [20, 70], [8, 64], [6, 56]]),
    T: L(50, [[4, 2], [46, 0]], [[26, 0], [24, 30], [24, 56], [30, 68], [44, 70]]),
    U: L(62, [[8, 0], [10, 30], [16, 60], [28, 70], [42, 60], [48, 30], [50, 0, 1], [50, 40], [50, 62], [54, 69], [62, 70]]),
    V: L(56, [[6, 4], [16, 36], [26, 68], [36, 40], [50, 6], [52, 0]]),
    W: L(70, [[6, 4], [14, 36], [22, 68], [30, 34], [38, 66], [48, 34], [60, 4], [64, 0]]),
    X: L(54, [[46, 2], [26, 34], [6, 68]], [[6, 2], [26, 34], [46, 68], [54, 70]]),
    Y: L(50, [[4, 2], [18, 32], [28, 46]], [[46, 0], [34, 34], [28, 60], [22, 86], [12, 98], [4, 90], [10, 82], [26, 76], [42, 70]]),
    Z: L(50, [[6, 4], [24, 0], [46, 4], [28, 34], [10, 64], [24, 70], [40, 68], [50, 70]])
  });

  /* ตัวกลมแบบเขียนต่อเนื่อง สร้างจากวงรีสม่ำเสมอ (a c d e g o q) เพื่อให้รูปทรงสะอาดและแยกกันชัด */
  const arc = (cx, cy, rx, ry, a0, a1) => { const o = [], n = Math.max(6, Math.round(Math.abs(a1 - a0) / 22)); for (let i = 0; i <= n; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; o.push([+(cx + rx * Math.cos(t)).toFixed(1), +(cy - ry * Math.sin(t)).toFixed(1)]); } return o; };
  const arcK = (...a) => { const r = arc(...a); r[0] = [r[0][0], r[0][1], 1]; return r; };
  const ENT = [[0, 70], [8, 62], [16, 47]];
  Object.assign(C, {
    a: L(46, ENT.concat(arcK(20, 52.5, 14, 17.5, 62, 360), [[34, 37, 1], [34, 62], [38, 69], [46, 70]])),
    c: L(40, ENT.concat(arcK(20, 52.5, 14, 17.5, 62, 310), [[32, 69], [40, 70]])),
    d: L(46, ENT.concat(arcK(20, 52.5, 14, 17.5, 62, 360), [[34, 30], [36, 6], [38, 0, 1], [36, 30], [35, 62], [39, 69], [46, 70]])),
    e: L(40, ENT.concat([[22, 40], [27, 35], [24, 31], [18, 34], [14, 41]], arc(18, 53, 12, 17, 140, 320), [[32, 69], [40, 70]])),
    g: L(46, ENT.concat(arcK(20, 52.5, 14, 17.5, 62, 360), [[34, 70], [34, 88], [30, 98], [20, 102], [12, 98], [14, 91], [24, 82], [36, 73], [46, 70]])),
    o: L(44, [[0, 70], [7, 60], [13, 46], [18, 38]].concat(arc(18, 52.5, 12, 17.5, 95, 440), [[26, 37], [35, 35], [44, 35]])),
    q: L(48, ENT.concat(arcK(20, 52.5, 14, 17.5, 62, 360), [[34, 70], [34, 90], [38, 99], [46, 95], [48, 84]]))
  });
  const getGlyph = (ch, st) => {
    if (E[ch]) return E[ch];
    if (st.cursive && C[ch]) return C[ch];
    return P[ch] || null;
  };

  /* ================= เรขาคณิตเส้น ================= */
  const cr = (p0, p1, p2, p3) => [[p1[0], p1[1]], [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], [p2[0], p2[1]]];
  const openSegs = Q => { const n = Q.length, r = []; for (let i = 0; i < n - 1; i++) r.push(cr(Q[Math.max(0, i - 1)], Q[i], Q[i + 1], Q[Math.min(n - 1, i + 2)])); return r; };
  const strokeSegs = pts => {
    const n = pts.length, f = pts[0], l = pts[n - 1];
    const hasCorner = pts.some((p, i) => p[2] && i > 0 && i < n - 1);
    if (n > 3 && f[0] === l[0] && f[1] === l[1] && !hasCorner) {
      const Q = pts.slice(0, -1), m = Q.length, r = [];
      for (let i = 0; i < m; i++) r.push(cr(Q[(i - 1 + m) % m], Q[i], Q[(i + 1) % m], Q[(i + 2) % m]));
      return r;
    }
    const out = []; let st = 0;
    for (let i = 1; i < n; i++) if (pts[i][2] || i === n - 1) { out.push(...openSegs(pts.slice(st, i + 1))); st = i; }
    return out;
  };
  const bez = (s, t) => { const u = 1 - t; return [u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0], u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]]; };
  const f2 = n => (Math.round(n * 100) / 100);

  /* ===== เส้นพู่กัน: ลากลงหนา ลากขึ้น/ลากขวางบาง ===== */
  function brushShape(pts, thick, col) {
    const n = pts.length, thin = thick * .32;
    let w = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1;
      return thin + (thick - thin) * Math.pow(Math.max(0, dy / L2), 1.15);
    });
    for (let k = 0; k < 3; k++) w = w.map((v, i) => (w[Math.max(0, i - 1)] + v * 2 + w[Math.min(n - 1, i + 1)]) / 4);
    const Lp = [], Rp = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1, nx = -dy / L2, ny = dx / L2;
      Lp.push([p[0] + nx * w[i] / 2, p[1] + ny * w[i] / 2]); Rp.push([p[0] - nx * w[i] / 2, p[1] - ny * w[i] / 2]);
    });
    const all = Lp.concat(Rp.reverse()), d = 'M' + all.map(q => f2(q[0]) + ' ' + f2(q[1])).join('L') + 'Z';
    const cap = (p, r) => '<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(r / 2) + '" fill="' + col + '"/>';
    return '<path d="' + d + '" fill="' + col + '" stroke="' + col + '" stroke-width=".05" stroke-linejoin="round"/>' + cap(pts[0], w[0]) + cap(pts[n - 1], w[n - 1]);
  }
  /* ลูกศรโค้งบาง ๆ วิ่งขนานไปกับเส้น (แบบแผ่นตัวอย่างบรัชเลตเตอร์) */
  function curvedArrow(S, ac, thick) {
    const P2 = S.poly, n = P2.length, i0 = Math.min(1, n - 2), i1 = Math.max(i0 + 1, Math.floor((n - 1) * .86));
    const off = thick * .5 + .9, pts = [];
    for (let i = i0; i <= i1; i++) {
      const a = P2[Math.max(0, i - 1)], b = P2[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1;
      pts.push([P2[i][0] - dy / L2 * off, P2[i][1] + dx / L2 * off]);
    }
    if (pts.length < 2) return '';
    const e = pts[pts.length - 1], q = pts[pts.length - 2], ang = Math.atan2(e[1] - q[1], e[0] - q[0]), h = 1.3, c = Math.cos(ang), sn = Math.sin(ang);
    return '<path d="M' + pts.map(q2 => f2(q2[0]) + ' ' + f2(q2[1])).join('L') + '" fill="none" stroke="' + ac + '" stroke-width=".28" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M' + f2(e[0] + c * h * .6) + ' ' + f2(e[1] + sn * h * .6) + 'L' + f2(e[0] - c * h * .6 - sn * h * .7) + ' ' + f2(e[1] - sn * h * .6 + c * h * .7) + 'L' + f2(e[0] - c * h * .6 + sn * h * .7) + ' ' + f2(e[1] - sn * h * .6 - c * h * .7) + 'Z" fill="' + ac + '"/>';
  }

  /* วาดตัวอักษร 1 ตัวที่ตำแหน่ง x0 (มม.), เส้นฐาน base (มม.), สเกล s (มม./หน่วย)
   * คืน {guide, over, w, strokes} — guide = ตัวเส้น, over = เลขลำดับ/ลูกศร */
  function drawGlyph(def, x0, base, s, st, o) {
    const t = Math.tan((st.slant || 0) * Math.PI / 180);
    const xs = st.xs || 1, tr = p => [x0 + (p[0] * xs - t * (p[1] - 70)) * s, base + (p[1] - 70) * s];
    const col = o.color, sw = o.sw;
    let guide = '', over = '';
    const strokes = def.s.map(pts => {
      const segs = strokeSegs(pts).map(sg => sg.map(tr));
      const poly = [];
      segs.forEach((sg, i) => { for (let k = i ? 1 : 0; k <= 10; k++) poly.push(bez(sg, k / 10)); });
      let len = 0; const cum = [0];
      for (let i = 1; i < poly.length; i++) { len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); cum.push(len); }
      return { segs, poly, cum, len };
    });
    const at = (S, d) => {
      d = Math.max(0, Math.min(S.len, d));
      let i = 1; while (i < S.cum.length - 1 && S.cum[i] < d) i++;
      const a = S.poly[i - 1], b = S.poly[i], seg = S.cum[i] - S.cum[i - 1] || 1, k = (d - S.cum[i - 1]) / seg;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
    };
    strokes.forEach((S, idx) => {
      let d = '';
      S.segs.forEach((sg, i) => { if (!i) d += 'M' + f2(sg[0][0]) + ' ' + f2(sg[0][1]); d += 'C' + sg.slice(1).map(p => f2(p[0]) + ' ' + f2(p[1])).join(' '); });
      if (o.brush) guide += brushShape(S.poly, sw, col); else
      guide += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + f2(sw) + '" stroke-linecap="round" stroke-linejoin="round"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
      if (!o.marks) return;
      const ac = o.accent, st0 = at(S, 0), st1 = at(S, Math.min(2, S.len * .3));
      const ang = Math.atan2(st1[1] - st0[1], st1[0] - st0[0]);
      if (o.dots) over += '<circle cx="' + f2(st0[0]) + '" cy="' + f2(st0[1]) + '" r="' + f2(o.rb * .45) + '" fill="' + ac + '"/>';
      if (o.nums) {
        const cx = st0[0] - Math.cos(ang) * (o.rb + .15), cy = st0[1] - Math.sin(ang) * (o.rb + .15);
        over += '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(o.rb) + '" fill="#fff" stroke="' + ac + '" stroke-width=".28"/>' +
          '<text x="' + f2(cx) + '" y="' + f2(cy) + '" dy=".36em" text-anchor="middle" font-size="' + f2(o.rb * 1.45) + '" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="' + ac + '">' + (idx + 1) + '</text>';
      }
      if (o.arrows && o.brush && S.len > o.rb * 4) {
        over += curvedArrow(S, ac, sw);
      } else if (o.arrows && S.len > o.rb * 5) {
        const q = at(S, S.len * .56), a = o.rb * 1.05, c = Math.cos(q[2]), n = Math.sin(q[2]);
        over += '<path d="M' + f2(q[0] + c * a) + ' ' + f2(q[1] + n * a) + 'L' + f2(q[0] - c * a * .55 - n * a * .8) + ' ' + f2(q[1] - n * a * .55 + c * a * .8) + 'L' + f2(q[0] - c * a * .55 + n * a * .8) + ' ' + f2(q[1] - n * a * .55 - c * a * .8) + 'Z" fill="' + ac + '"/>';
      }
    });
    return { guide, over, w: def.w * s * (st.xs || 1), strokes };
  }

  /* จุดออก (ไว้ต่อเส้นเชื่อมแบบ cursive) */
  const outPoint = def => {
    for (let i = def.s.length - 1; i >= 0; i--) { const q = def.s[i]; if (q.length > 2) return q[q.length - 1]; }
    return def.s[0][def.s[0].length - 1];
  };

  /* ================= สไตล์ ================= */
  const STY = {
    print: { slant: 0, cursive: false, model: '#3b3f46', mw: 4.4, accent: '#e11d48', trace: '#8a919c', tw: 3.2, dotted: true },
    cursive: { slant: 12, cursive: true, model: '#3b3f46', mw: 3.6, accent: '#e11d48', trace: '#8a919c', tw: 2.8, dotted: true },
    brush: { brush: true, slant: 9, cursive: false, model: '#a9aeb7', mw: 10, accent: '#111827', trace: '#d3d7dd', tw: 8, dotted: false }
  };
  const OPS = [.9, .62, .42, .28, .2, .14];

  /* ================= เส้นบรรทัด ================= */
  function ruling(kind, x1, x2, base, s) {
    if (kind === 'none') return '';
    const top = base - 70 * s, mid = base - 35 * s, desc = base + 30 * s;
    const ln = (y, c, w, d) => '<line x1="' + f2(x1) + '" x2="' + f2(x2) + '" y1="' + f2(y) + '" y2="' + f2(y) + '" stroke="' + c + '" stroke-width="' + w + '"' + (d ? ' stroke-dasharray="' + d + '"' : '') + '/>';
    return ln(top, '#c9d3de', .2) + ln(mid, '#e8a9a2', .25, '1.2 1') + ln(base, '#6f95c8', .32) + (kind === '4' ? ln(desc, '#c9d3de', .2) : '');
  }

  /* ================= รายการเนื้อหา ================= */
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = AZ.toLowerCase();
  const CONTENT = {
    pair: { name: 'ตัวพิมพ์ใหญ่-เล็ก Aa–Zz (คู่)', items: [...AZ].map(c => c + c.toLowerCase()), title: 'ฝึกเขียนอังกฤษ Aa–Zz' },
    upper: { name: 'ตัวพิมพ์ใหญ่ A–Z', items: [...AZ], title: 'ฝึกเขียนตัวพิมพ์ใหญ่ A–Z' },
    lower: { name: 'ตัวพิมพ์เล็ก a–z', items: [...az], title: 'ฝึกเขียนตัวพิมพ์เล็ก a–z' },
    num: { name: 'ตัวเลข 0–9', items: [...'0123456789'], title: 'ฝึกเขียนตัวเลข 0–9' },
    basic: { name: 'เส้นพื้นฐาน (ก่อนเขียนตัวอักษร)', items: ['§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '§9'], title: 'ฝึกลากเส้นพื้นฐาน' },
    conn: { name: 'การเชื่อมตัวอักษร (ar br cr …)', text: true, title: 'ฝึกเชื่อมตัวอักษร', lines: ['ar br cr dr er fr gr hr ir jr kr lr mr', 'nr or pr qr rr sr tr ur vr wr xr yr zr', 'an en in on un   am em im om um', 'ab eb ib ob ub   ad ed id od ud   ag eg ig og ug'] },
    sheet: { name: '📄 แผ่นฝึกครบชุด (ตัวใหญ่ ตัวเล็ก เลข เส้นพื้นฐาน การเชื่อม คำ ประโยค)', sheet: true, title: 'Elegant Connected Handwriting Practice Sheet' },
    text: { name: 'คำ / ประโยค (จากรายการคำด้านล่าง)', text: true, title: 'ฝึกเขียนคำและประโยค' }
  };
  const SAMPLE = ['time', 'believe', 'practice', 'patience', 'freedom', 'remember', 'beautiful', 'ordinary', 'strength', 'journey', 'forever', 'imagine',
    'Small steps every day.', 'Practice makes progress.', 'Write slowly, write well.', 'Take your time and enjoy the process.'];

  /* ================= แผงตั้งค่า ================= */
  const sec = document.createElement('div');
  sec.id = 'pgPenSection';
  const fld = (label, inner) => '<div><label>' + label + '</label>' + inner + '</div>';
  const sel = (id, opts, val) => '<select id="pgPen_' + id + '">' + opts.map(o => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  const chk = (id, label, on) => '<label class="checkbox-group"><input type="checkbox" id="pgPen_' + id + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';
  sec.innerHTML =
    '<h4 style="margin:14px 0 6px;font-size:15px">✍️ ฝึกเขียนอังกฤษ + ลำดับการลากเส้น</h4>' +
    '<p class="hint" style="font-size:12px;color:#6b7280;margin:0 0 8px">เลือกกิจกรรม “✍️ ฝึกเขียนอังกฤษ (ลำดับเส้น)” ด้านบน แล้วตั้งค่าที่นี่ — ตัวอักษรถูกวาดจากเส้นในแอป ใช้ได้ออฟไลน์</p>' +
    '<div class="row">' + fld('สไตล์ตัวเขียน', sel('style', [['print', '🅰️ ตัวพิมพ์ (Print)'], ['cursive', '🖋️ ตัวเขียนต่อเนื่อง (Cursive)'], ['brush', '🖌️ บรัชเลตเตอร์ (เส้นหนาสีเทา)']], 'print')) +
    fld('เนื้อหา', sel('content', Object.keys(CONTENT).map(k => [k, CONTENT[k].name]), 'pair')) + '</div>' +
    '<div class="row" data-pgpen="items">' + fld('รูปแบบหน้า', sel('layout', [['rows', 'แถวละตัว (ตัวอย่าง → ลากตามรอย → เขียนเอง)'], ['chart', 'ตารางอ้างอิงลำดับเส้น (ทั้งชุดในหน้าเดียว)']], 'rows')) +
    fld('จำนวนแถวต่อหน้า', sel('rows', [['8', '8 (ตัวใหญ่)'], ['10', '10'], ['13', '13'], ['16', '16 (กะทัดรัด)']], '10')) + '</div>' +
    '<div class="row" data-pgpen="items">' + fld('ชุดลากตามรอย (ต่อแถว)', sel('trace', [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['8', '8'], ['12', '12']], '4')) +
    fld('คอลัมน์ในตารางอ้างอิง', sel('cols', [['3', '3'], ['4', '4'], ['5', '5']], '4')) + '</div>' +
    chk('refpage', 'เพิ่มหน้าตารางอ้างอิงลำดับเส้นไว้หน้าแรก (เมื่อเลือกแบบแถวละตัว)', false).replace('<label ', '<label data-pgpen="items" ') +
    '<div class="row" data-pgpen="text">' + fld('ขนาดบรรทัด', sel('lh', [['11', 'เล็ก (11 มม.)'], ['15', 'กลาง (15 มม.)'], ['19', 'ใหญ่ (19 มม.)'], ['24', 'ใหญ่มาก (24 มม.)']], '15')) +
    fld('ลากตามรอย (บรรทัด)', sel('wtrace', [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], '1')) + fld('เขียนเอง (บรรทัด)', sel('wblank', [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], '1')) + '</div>' +
    '<div data-pgpen="text">' + chk('wnums', 'แสดงเลขลำดับเส้นในแถวตัวอย่างของคำ/ประโยค', true) + chk('warrows', 'แสดงลูกศรทิศทางในแถวตัวอย่างของคำ/ประโยค', false) + '<button type="button" id="pgPen_sample" style="min-width:0;padding:8px 12px;font-size:13px;background:#e5e7eb;color:#374151">📝 ใส่คำ/ประโยคอังกฤษตัวอย่างลงรายการคำ</button></div>' +
    '<div class="row">' + fld('เส้นบรรทัด', sel('ruling', [['4', 'เส้น 4 ชั้น'], ['3', 'เส้น 3 ชั้น'], ['none', 'ไม่มีเส้น']], '4')) + '</div>' +
    chk('nums', 'แสดงเลขลำดับเส้น ①②③ ที่จุดเริ่ม', true) + chk('arrows', 'แสดงลูกศรทิศทางการลากเส้น', true) +
    chk('dots', 'แสดงจุดเริ่มต้นในแถวคำ/ประโยค', true);
  controls.appendChild(sec);

  const ids = ['style', 'content', 'layout', 'rows', 'trace', 'cols', 'refpage', 'lh', 'wtrace', 'wblank', 'ruling', 'nums', 'arrows', 'dots', 'wnums', 'warrows'].map(k => 'pgPen_' + k);
  const KEY = 'polyglotPenSettings';
  try {
    const sv = JSON.parse(localStorage.getItem(KEY) || '{}');
    ids.forEach(id => { const e = $(id); if (e && sv[id] !== undefined) { if (e.type === 'checkbox') e.checked = sv[id]; else e.value = sv[id]; } });
  } catch (e) { }
  const persist = () => { const v = {}; ids.forEach(id => { const e = $(id); if (e) v[id] = e.type === 'checkbox' ? e.checked : e.value; }); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } };

  const option = document.createElement('option');
  option.value = 'pen'; option.textContent = '✍️ ฝึกเขียนอังกฤษ (ลำดับเส้น)';
  modeSel.appendChild(option);

  /* ================= สร้างหน้า ================= */
  const paper = () => { const PZ = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] }[$('paperSize') && $('paperSize').value] || [210, 297]; return { uw: PZ[0] - 20, uh: PZ[1] - 58 }; };
  const getOpts = () => ({ style: $('pgPen_style').value, content: $('pgPen_content').value, layout: $('pgPen_layout').value, rows: +$('pgPen_rows').value || 10, trace: +$('pgPen_trace').value, cols: +$('pgPen_cols').value || 4, refpage: $('pgPen_refpage').checked, lh: +$('pgPen_lh').value || 15, wtrace: +$('pgPen_wtrace').value, wblank: +$('pgPen_wblank').value, ruling: $('pgPen_ruling').value, nums: $('pgPen_nums').checked, arrows: $('pgPen_arrows').checked, dots: $('pgPen_dots').checked, wnums: $('pgPen_wnums').checked, warrows: $('pgPen_warrows').checked });

  const gOpt = (st, kind, s, op, nums, o) => {
    const model = kind === 'model';
    const sw = (model ? st.mw : st.tw) * s;
    return {
      color: model ? st.model : st.trace, sw, accent: st.accent, rb: Math.max(1.25, Math.min(2.2, 12 * s)),
      dash: !model && st.dotted ? (f2(sw * .05) + ' ' + f2(sw * 1.9)) : '', marks: model && nums, nums: model && o.nums, arrows: model && o.arrows, dots: false, brush: !!st.brush
    };
  };

  /* ใส่ลำดับของ "ชุดตัวอักษร" 1 ชุด (เช่น Aa) ลงในแถว คืน x ที่ต่อไป */
  function putSet(items, x, base, s, st, kind, gap, o, parts, op) {
    items.forEach(ch => {
      const def = getGlyph(ch, st); if (!def) { x += 20 * s; return; }
      const g = drawGlyph(def, x, base, s, st, gOpt(st, kind, s, op, true, o));
      parts.g += op != null && op < 1 ? '<g opacity="' + op + '">' + g.guide + '</g>' : g.guide;
      parts.o += g.over;
      x += g.w + gap * s;
    });
    return x;
  }
  const setW = (items, st, s, gap) => items.reduce((a, ch) => { const d = getGlyph(ch, st); return a + (d ? d.w : 20) * s + gap * s; }, 0);

  /* ----- แบบแถวละตัว ----- */
  function rowsPages(items, st, o) {
    const { uw, uh } = paper();
    const legendH = 8, avail = uh - legendH, rh = avail / o.rows, s = rh * .84 / 100;
    const pages = [];
    for (let i = 0; i < items.length; i += o.rows) {
      const chunk = items.slice(i, i + o.rows);
      let svg = legend(uw, st, o), body = '';
      chunk.forEach((it, r) => {
        const top = legendH + r * rh, base = top + rh * .08 + 70 * s;
        const set = [...it];
        const parts = { g: '', o: '' };
        body += '<rect x="0" y="' + f2(top + 1) + '" width="' + uw + '" height="' + f2(rh - 2) + '" fill="none"/>' + ruling(o.ruling, 0, uw, base, s);
        const mx0 = 4;
        const mEnd = putSet(set, mx0, base, s, st, 'model', 16, o, parts);
        const divX = mEnd + 1;
        body += '<rect x="0" y="' + f2(top + 1) + '" width="' + f2(divX) + '" height="' + f2(rh - 2) + '" fill="#fff8f0" opacity=".9"/>';
        body += ruling(o.ruling, 0, divX, base, s);
        body += '<line x1="' + f2(divX) + '" x2="' + f2(divX) + '" y1="' + f2(top + 1) + '" y2="' + f2(top + rh - 1) + '" stroke="#e8a9a2" stroke-width=".3" stroke-dasharray="1.2 1"/>';
        let x = divX + 5;
        const sw = setW(set, st, s, 6) + 12 * s;
        for (let t = 0; t < o.trace && x + sw < uw - 2; t++) { x = putSet(set, x, base, s, st, 'trace', 6, o, parts, OPS[Math.min(t, OPS.length - 1)]) + 12 * s; }
        body += parts.g + parts.o;
        // เซลล์เส้นแบ่งแถวบาง ๆ
        body += '<line x1="0" x2="' + uw + '" y1="' + f2(top + rh) + '" y2="' + f2(top + rh) + '" stroke="#eee" stroke-width=".2"/>';
      });
      pages.push(wrap(uw, uh, svg + body));
    }
    return pages;
  }

  function legend(uw, st, o) {
    const ac = st.accent;
    let x = 0;
    const t = (txt, col) => { const r = '<text x="' + x + '" y="5" font-size="3.3" font-family="Sarabun,Tahoma,sans-serif" fill="' + (col || '#4b5563') + '">' + txt + '</text>'; x += txt.length * 1.9 + 4; return r; };
    let h = '';
    if (o.nums) { h += '<circle cx="2" cy="4" r="1.7" fill="#fff" stroke="' + ac + '" stroke-width=".28"/><text x="2" y="4" dy=".36em" text-anchor="middle" font-size="2.4" font-weight="700" font-family="Arial,sans-serif" fill="' + ac + '">1</text>'; x = 5; h += t('ลำดับการลากเส้น'); }
    if (o.arrows) { h += '<path d="M' + (x + 3) + ' 4L' + x + ' 2.6L' + x + ' 5.4Z" fill="' + ac + '"/>'; x += 5; h += t('ทิศทางการลาก'); }
    return h + '<text x="' + (uw) + '" y="5" text-anchor="end" font-size="3.3" font-family="Sarabun,Tahoma,sans-serif" fill="#6b7280">ตัวอย่าง → ลากตามรอย → เขียนเอง</text>';
  }
  const wrap = (uw, uh, inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f2(uw) + ' ' + f2(uh) + '" style="display:block;width:100%;height:auto;max-height:100%">' + inner + '</svg>';

  /* ----- ตารางอ้างอิงลำดับเส้น ----- */
  function chartPages(items, st, o) {
    const { uw, uh } = paper();
    const cols = o.cols, R = 7, cw = uw / cols, ch = (uh - 8) / R, per = cols * R, pages = [];
    for (let p = 0; p < items.length; p += per) {
      let body = legend(uw, st, o);
      items.slice(p, p + per).forEach((it, k) => {
        const c = k % cols, r = Math.floor(k / cols), x0 = c * cw, y0 = 8 + r * ch;
        const set = [...it];
        const gapU = 14, totU = set.reduce((a, g) => a + ((getGlyph(g, st) || { w: 20 }).w), 0) + gapU * (set.length - 1);
        const s = Math.min((cw - 8) / totU, (ch * .8) / 112);
        const base = y0 + ch * .1 + 70 * s + 6 * s;
        body += '<rect x="' + f2(x0 + .6) + '" y="' + f2(y0 + .6) + '" width="' + f2(cw - 1.2) + '" height="' + f2(ch - 1.2) + '" rx="2" fill="none" stroke="#e5e7eb" stroke-width=".3"/>';
        body += ruling(o.ruling === 'none' ? 'none' : '3', x0 + 1.5, x0 + cw - 1.5, base, s);
        const parts = { g: '', o: '' };
        let x = x0 + (cw - totU * s) / 2;
        putSet(set, x, base, s, st, 'model', gapU, o, parts);
        body += parts.g + parts.o;
      });
      pages.push(wrap(uw, uh, body));
    }
    return pages;
  }


  /* วาดหนึ่งแถวของคำ (เชื่อมตัวอักษรแบบ cursive) คืน {g, o, x} */
  function drawRow(words, x, base, s, st, k, op, o, wordGap, noNums) {
    const parts = { g: '', o: '' };
    const model = k === 'model';
    words.forEach(w => {
      const chars = [...w];
      let skip = false;
      chars.forEach((c, ci) => {
        let def = getGlyph(c, st); if (!def) { x += 20 * s; skip = false; return; }
        if (skip) { /* ตัดเส้นขาเข้า เพราะเส้นเชื่อมจากตัวก่อนหน้าพามาถึงจุดนี้แล้ว */
          const f = def.s[0]; let i = 0; while (i < f.length - 2 && f[i][1] > 46) i++;
          def = { w: def.w, s: [f.slice(i)].concat(def.s.slice(1)) }; skip = false;
        }
        const useNums = model && o.wnums && !noNums;
        const go = Object.assign(gOpt(st, k, s, op, false, o), model ? { marks: o.dots || useNums, nums: useNums, arrows: !!(o.warrows && !noNums), dots: o.dots && !useNums } : {});
        if (useNums) go.rb = Math.max(.95, Math.min(1.5, 9 * s));
        const g = drawGlyph(def, x, base, s, st, go);
        parts.g += op != null ? '<g opacity="' + op + '">' + g.guide + '</g>' : g.guide; parts.o += g.over;
        const xs = st.xs || 1, nx = x + def.w * s * xs; let hiExit = 0;
        if (st.cursive && ci < chars.length - 1) {
          const nd = getGlyph(chars[ci + 1], st), po = outPoint(def);
          if (nd && C[chars[ci + 1]] && C[c]) {
            const t = Math.tan(st.slant * Math.PI / 180), tr = (px, py) => [x + (px * xs - t * (py - 70)) * s, base + (py - 70) * s];
            const high = po[1] < 52, low = Math.abs(po[1] - 70) > 3;
            if (high || low) {
              let tx = def.w + 14, ty = 70;
              if (high) { const f = nd.s[0]; let i = 0; while (i < f.length - 2 && f[i][1] > 46) i++; tx = def.w + 14 + f[i][0]; ty = f[i][1]; skip = true; hiExit = 14; }
              else hiExit = 14;
              const a = tr(po[0], po[1]), b = tr(tx, ty), gO = gOpt(st, k, s, op, false, o);
              const cd = 'M' + f2(a[0]) + ' ' + f2(a[1]) + 'C' + f2(a[0] + 8 * s) + ' ' + f2(a[1] - (high ? 1 : 0) * s) + ' ' + f2(b[0] - 7 * s) + ' ' + f2(b[1]) + ' ' + f2(b[0]) + ' ' + f2(b[1]);
              const path = '<path d="' + cd + '" fill="none" stroke="' + gO.color + '" stroke-width="' + f2(gO.sw) + '" stroke-linecap="round"' + (gO.dash ? ' stroke-dasharray="' + gO.dash + '"' : '') + '/>';
              parts.g += op != null ? '<g opacity="' + op + '">' + path + '</g>' : path;
            }
          }
        }
        x = nx + (st.cursive ? hiExit * s * xs : 4 * s);
      });
      x += wordGap * s; skip = false;
    });
    return { g: parts.g, o: parts.o, x };
  }


  /* ----- แผ่นฝึกครบชุดในหน้าเดียว (เหมือนแผ่นตัวอย่าง Elegant Connected Handwriting) ----- */
  const SHEET_WORDS = ['time', 'believe', 'practice', 'patience', 'freedom', 'remember', 'beautiful', 'ordinary', 'strength', 'journey', 'forever', 'imagine'];
  const SHEET_SENT = ['The beautiful thing about learning is that no one can take it away from you.', 'Take your time, trust the process, and enjoy the little things in life.', 'Handwriting is the reflection of the mind and the heart.', 'Every day is a chance to become a better version of yourself.', 'Small progress is still progress.', 'Write with love, and let your words inspire.'];
  function sheetPages(st, o) {
    const { uw, uh } = paper();
    const secs = [['UPPERCASE ALPHABET', 2], ['LOWERCASE ALPHABET', 2], ['NUMBERS', 1], ['BASIC STROKES', 1], ['COMMON CONNECTIONS', 2], ['WORDS PRACTICE', 2], ['SENTENCE PRACTICE', 6]];
    const labH = 5.4, tipH = 7, nRows = secs.reduce((a, x) => a + x[1], 0);
    const rh = (uh - secs.length * labH - tipH - 2) / nRows, s0 = rh * .0086;
    const ink = Object.assign({}, st, { nums: false });
    const base0 = rh * .66;
    let y = 0, out = '';
    const rowRule = (top, s) => ruling(o.ruling === 'none' ? 'none' : '3', 0, uw, top + base0, s);
    const lab = t => { out += '<text x="0" y="' + f2(y + 3.6) + '" font-size="2.5" letter-spacing=".35" font-family="Arial,Helvetica,sans-serif" fill="#4b5563">' + t + '</text>'; y += labH; };
    const gopt = () => Object.assign(gOpt(st, 'model', s0, null, false, o), { marks: false, nums: false, arrows: false, dots: false });
    const spread = (list, top) => {
      const cw = uw / list.length; let g = '';
      list.forEach((ch, i) => { const d = getGlyph(ch, st); if (!d) return; const r = drawGlyph(d, i * cw + (cw - d.w * s0) / 2, top + base0, s0, st, gopt()); g += r.guide; });
      return g;
    };
    const stW = Object.assign({}, st, { xs: st.cursive ? .86 : 1 }), stS = Object.assign({}, st, { xs: st.cursive ? .78 : .9 });
    const measure = (words, xs) => words.reduce((a, w) => a + [...w].reduce((b, c) => b + ((getGlyph(c, st) || { w: 20 }).w + (st.cursive ? 12 : 4)) * (xs || 1), 0) + 28, 0);
    secs.forEach(([name, rows]) => {
      lab(name);
      for (let r = 0; r < rows; r++) {
        const top = y, s = s0;
        let body = rowRule(top, s);
        if (name === 'UPPERCASE ALPHABET') body += spread([...AZ].slice(r * 13, r * 13 + 13), top);
        else if (name === 'LOWERCASE ALPHABET') body += spread([...az].slice(r * 13, r * 13 + 13), top);
        else if (name === 'NUMBERS') body += spread([...'1234567890'], top);
        else if (name === 'BASIC STROKES') {
          const bs = top + base0, h = 35 * s, col = st.model, w = st.mw * s0 * .8; let x = 4, g = '';
          const line = (x1, y1, x2, y2) => '<path d="M' + f2(x1) + ' ' + f2(y1) + 'L' + f2(x2) + ' ' + f2(y2) + '" stroke="' + col + '" stroke-width="' + f2(w) + '" stroke-linecap="round" fill="none"/>';
          [1, 2, 3, 1, 1, 1].forEach(n => { for (let i = 0; i < n; i++) { g += line(x + i * 3, bs, x + i * 3 + 4.5, bs - h * 1.9); } x += n * 3 + 6; });
          x += 4; [2, 6].forEach(n => { for (let i = 0; i < n; i++) { g += line(x + i * 3, bs - h * 1.9, x + i * 3 + 4.5, bs); } x += n * 3 + 6; });
          const rr = drawRow(['ccccc'], x + 4, bs, s0, st, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true);
          const r2 = drawRow(['ooooo'], rr.x + 2, bs, s0, st, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true);
          const r3 = drawRow(['lllll'], r2.x + 2, bs, s0, st, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true);
          body += g + rr.g + r2.g + r3.g;
        } else if (name === 'COMMON CONNECTIONS') {
          const pairs = r ? 'nr or pr qr rr sr tr ur vr wr xr yr zr'.split(' ') : 'ar br cr dr er fr gr hr ir jr kr lr mr'.split(' ');
          const cw = uw / pairs.length; let g = '';
          pairs.forEach((pr, i) => { g += drawRow([pr], i * cw + 2, top + base0, s0, stW, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true).g; });
          body += g;
        } else if (name === 'WORDS PRACTICE') {
          const list = SHEET_WORDS.slice(r * 6, r * 6 + 6), cw = uw / 6; let g = '';
          list.forEach((w, i) => { const sw2 = Math.min(s0, (cw - 4) / measure([w], stW.xs)); g += drawRow([w], i * cw + 2, top + base0, sw2, stW, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true).g; });
          body += g;
        } else {
          const sentence = SHEET_SENT[r], units = measure(sentence.split(' '), stS.xs), sf = Math.min(s0 * 1.3, (uw - 4) / units);
          body = ruling(o.ruling === 'none' ? 'none' : '3', 0, uw, top + base0, Math.max(sf, s0 * .8) * 1.2);
          body += drawRow(sentence.split(' '), 2, top + base0, sf, stS, 'model', null, Object.assign({}, o, { wnums: false, warrows: false, dots: false }), 28, true).g;
        }
        out += body; y += rh;
      }
    });
    out += '<text x="0" y="' + f2(uh - 1.5) + '" font-size="2.3" fill="#6b7280" font-family="Arial,Helvetica,sans-serif" letter-spacing=".2">TIPS:   •  Sit upright    •  Relax your hand    •  Use light pressure    •  Practice daily    •  Be patient and consistent</text>';
    return [wrap(uw, uh, out)];
  }

  /* ----- แถวคำ/ประโยค ----- */
  function textPages(lines, st, o) {
    const { uw, uh } = paper();
    const lh = o.lh, s = lh * .84 / 100, wordGap = 28;
    const blocks = [];
    lines.forEach(line => {
      // แตกเป็นบรรทัดตามความกว้าง
      const words = line.split(/\s+/).filter(Boolean), rowsW = []; let cur = [], curW = 0;
      words.forEach(w => {
        const ww = [...w].reduce((a, c) => a + ((getGlyph(c, st) || { w: 20 }).w + 4) * s, 0);
        if (cur.length && curW + wordGap * s + ww > uw - 6) { rowsW.push(cur); cur = []; curW = 0; }
        curW += (cur.length ? wordGap * s : 0) + ww; cur.push(w);
      });
      if (cur.length) rowsW.push(cur);
      const rowsPerBlock = rowsW.length, kinds = [];
      rowsW.forEach(r => kinds.push(['model', r]));
      for (let t = 0; t < o.wtrace; t++) rowsW.forEach(r => kinds.push(['trace' + t, r]));
      for (let b = 0; b < o.wblank; b++) rowsW.forEach(() => kinds.push(['blank', null]));
      blocks.push(kinds);
    });
    const pages = []; let cur = '', y = 8, hasAny = false;
    const flush = () => { if (hasAny) pages.push(wrap(uw, uh, legend(uw, st, o) + cur)); cur = ''; y = 8; hasAny = false; };
    blocks.forEach(kinds => {
      if (y + kinds.length * lh > uh && hasAny) flush();
      kinds.forEach(([kind, r]) => {
        if (y + lh > uh + .01) flush();
        const base = y + lh * .08 + 70 * s;
        cur += ruling(o.ruling, 0, uw, base, s);
        if (r) {
          const op = kind === 'model' ? null : OPS[Math.min(+kind.slice(5) + 0, OPS.length - 1)];
          const k = kind === 'model' ? 'model' : 'trace';
          const R = drawRow(r, 3, base, s, st, k, op, o, wordGap);
          cur += R.g + R.o;
        }
        y += lh; hasAny = true;
      });
      y += 3;
    });
    flush();
    return pages;
  }

  /* ================= รวมเป็นหน้า A4 ================= */
  function buildPages(o) {
    const st = STY[o.style] || STY.print, cont = CONTENT[o.content] || CONTENT.pair;
    const stX = Object.assign({}, st);
    if (cont.sheet) return sheetPages(stX, o);
    if (cont.text) {
      let lines = cont.lines || $('wordsInput').value.split(/\r?\n/).map(l => l.split('|')[0].trim()).filter(Boolean);
      lines = lines.filter(l => [...l].some(c => getGlyph(c, st)));
      return textPages(lines, stX, o);
    }
    const items = cont.items;
    const chart = chartPages(items, stX, o);
    if (o.layout === 'chart') return chart;
    const rows = rowsPages(items, stX, o);
    return (o.refpage ? chart : []).concat(rows);
  }

  let lastAuto = '';
  function autoTitle() {
    const o = getOpts(), cont = CONTENT[o.content] || CONTENT.pair, sName = { print: 'ตัวพิมพ์', cursive: 'ตัวเขียนต่อเนื่อง', brush: 'บรัชเลตเตอร์' }[o.style];
    const t = cont.title + ' · ' + sName, f = $('headerTitle');
    if (f && (!f.value.trim() || f.value === lastAuto || /^ฝึก/.test(f.value) && / · /.test(f.value) || /Tracing Worksheet|^แบบฝึกคัดคำศัพท์/.test(f.value))) { f.value = t; lastAuto = t; }
  }

  function renderPen() {
    const o = getOpts(), title = $('headerTitle').value, sub = $('headerSub').value;
    const pages = buildPages(o), total = pages.length;
    $('pagesContainer').innerHTML = total ? pages.map((svg, i) =>
      '<div class="page-a4" data-page="' + (i + 1) + '"><div class="page-header"><div class="page-title"><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div>' +
      '<div class="page-meta">ชื่อ: <input type="text"><br>ชั้น: <input type="text" size="6"> เลขที่: <input type="text" size="4"> วันที่: <input type="text" size="8"></div></div>' +
      '<div class="page-content" style="gap:0;display:block">' + svg + '</div><div class="page-footer"><div class="page-footer-left">Created with PolyglotWorksheet &amp; StudioPro</div><div class="page-footer-right">Page ' + (i + 1) + ' / ' + total + '</div></div></div>').join('')
      : '<div class="page-a4"><div class="page-content"><div class="match-instructions">ไม่มีเนื้อหาให้ฝึก — เลือกเนื้อหาอื่น หรือพิมพ์คำภาษาอังกฤษในรายการคำ</div></div></div>';
  }

  function syncUi(mode) {
    sec.querySelectorAll('[data-pgpen]').forEach(d => {
      const o = getOpts(), cont = CONTENT[o.content] || CONTENT.pair, k = d.getAttribute('data-pgpen');
      d.style.display = (mode === 'pen' && (k === 'text' ? cont.text : !cont.text && !cont.sheet)) ? '' : 'none';
    });
    sec.querySelectorAll(':scope > .row:not([data-pgpen]), :scope > label.checkbox-group:not([data-pgpen]), :scope > h4, :scope > p').forEach(d => { d.style.display = mode === 'pen' || d.tagName === 'H4' || d.tagName === 'P' ? '' : 'none'; });
    sec.style.display = '';
  }

  const baseRender = render;
  render = function () {
    baseRender();
    const mode = modeSel.value;
    syncUi(mode);
    if (mode === 'pen') { try { renderPen(); } catch (e) { console.error(e); } persist(); }
    if (typeof fitPreview === 'function') requestAnimationFrame(fitPreview);
  };

  ids.forEach(id => { const e = $(id); if (!e) return; e.addEventListener(e.type === 'checkbox' || e.tagName === 'SELECT' ? 'change' : 'input', () => { if (/style|content/.test(id)) autoTitle(); render(); }); });
  $('pgPen_sample').onclick = () => { $('wordsInput').value = SAMPLE.join('\n'); $('pgPen_content').value = 'text'; autoTitle(); render(); };
  modeSel.addEventListener('change', () => { if (modeSel.value === 'pen') { autoTitle(); render(); } });
  if (typeof inputsToSave !== 'undefined') ids.forEach(id => { if (!inputsToSave.includes(id)) inputsToSave.push(id); });
  syncUi(modeSel.value);
  if (modeSel.value === 'pen') { autoTitle(); render(); }
};
