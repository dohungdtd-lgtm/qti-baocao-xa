/**
 * ĐỒNG BỘ TỪ "QUANG TRI WEEKLY INDEX" (ĐTH-VPTU)
 *
 * Trang Weekly Index (bao-cao-tuan.html) được mã hóa theo số điện thoại người xem. Máy chủ giữ khóa
 * (dẫn xuất từ số điện thoại của tài khoản Văn phòng, lưu trong Thuộc tính tập lệnh, không nằm trong mã),
 * cứ 10 phút tải trang một lần; khi trang đổi thì giải mã, tách số liệu của từng xã và lưu vào tab "WI"
 * của trang tính tài khoản. Trang xã đọc phần của đúng xã mình từ đây.
 *
 * Cài đặt một lần: Cài đặt dự án → Thuộc tính tập lệnh → thêm WI_SDT = số điện thoại được xem toàn tỉnh
 * trên Weekly Index; rồi chạy hàm caiDongBoWI(). Hàm dẫn xuất khóa, xóa WI_SDT và đặt lịch chạy 10 phút.
 */

const WI_URL = 'https://dohungdtd-lgtm.github.io/qti-theodoi-nhiemvu/bao-cao-tuan.html';
const WI_TAB = 'WI';

/* ============================ CÀI ĐẶT ============================ */

function caiDongBoWI() {
  const tc = PropertiesService.getScriptProperties();
  const sdt = String(tc.getProperty('WI_SDT') || '').replace(/\D/g, '');
  if (sdt.length < 10) throw new Error('Chưa có thuộc tính WI_SDT (số điện thoại xem được toàn tỉnh trên Weekly Index).');
  const html = UrlFetchApp.fetch(WI_URL, { muteHttpExceptions: false }).getContentText('UTF-8');
  const salt = html.match(/SALT = '([0-9a-f]+)'/)[1], it = Number(html.match(/IT = (\d+)/)[1]);
  const t0 = Date.now();
  const d = pbkdf2Sha256_(utf8_(sdt), hexBytes_(salt), it, 64);
  const tag = bytesHex_(d.slice(32, 40));
  if (html.indexOf('"t": "' + tag + '"') < 0) throw new Error('Số điện thoại trong WI_SDT không có quyền xem trang Weekly Index.');
  tc.setProperty('WI_KEK', Utilities.base64Encode(d.slice(0, 32)));
  tc.setProperty('WI_TAG', tag);
  tc.setProperty('WI_SALT', salt);
  tc.deleteProperty('WI_SDT');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dongBoWI').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dongBoWI').timeBased().everyMinutes(10).create();
  Logger.log('Đã dẫn xuất khóa sau ' + (Date.now() - t0) + ' ms, đặt lịch đồng bộ 10 phút/lần.');
  dongBoWI(true);
}

/* ============================ ĐỒNG BỘ ============================ */

function dongBoWI(epBuoc) {
  const tc = PropertiesService.getScriptProperties();
  const kekB64 = tc.getProperty('WI_KEK'), tag = tc.getProperty('WI_TAG');
  if (!kekB64) { Logger.log('Chưa cài khóa, chạy caiDongBoWI().'); return; }
  const html = UrlFetchApp.fetch(WI_URL + '?t=' + Date.now()).getContentText('UTF-8');
  const bam = bytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, html, Utilities.Charset.UTF_8));
  if (!epBuoc && bam === tc.getProperty('WI_BAM')) return; // trang chưa đổi

  const s = html.slice(html.indexOf('const SALT'));
  if (s.match(/SALT = '([0-9a-f]+)'/)[1] !== tc.getProperty('WI_SALT')) throw new Error('Weekly Index đã đổi khóa, cần chạy lại caiDongBoWI().');
  const W = JSON.parse(cat_(s, s.indexOf('W = ') + 4));
  const G = JSON.parse(cat_(s, s.indexOf('G = ') + 4));
  const w = W.find(x => x.t === tag);
  if (!w) throw new Error('Tài khoản đồng bộ không còn quyền xem Weekly Index.');
  const kek = Utilities.base64Decode(kekB64).map(b => b & 255);
  const v = JSON.parse(utf8Doc_(aesGcmGiai_(kek, w.i, w.c)));
  const shell = gunzip_(aesGcmGiai_(b64Bytes_(v.k), G.s.i, G.s.c));
  const rieng = JSON.parse(gunzip_(aesGcmGiai_(b64Bytes_(v.d), G.all.i, G.all.c)));
  const raw = JSON.parse(cat_(shell, shell.indexOf('const RAW = Object.assign(') + 'const RAW = Object.assign('.length));

  const meta = {
    capNhat: new Date().toISOString(),
    hien: theTuan_(shell, 'hien'), tiep: theTuan_(shell, 'tiep'),
    ngay: ((shell.match(/class="diadanh">([^<]+)</) || [])[1] || '').trim(),
  };
  const tachXa = tachTheoXa_(rieng, raw);
  luuWI_(meta, tachXa);
  tc.setProperty('WI_BAM', bam);
  tc.setProperty('WI_PHIEN', String(Date.now()));
  Logger.log('Đã đồng bộ Weekly Index: ' + meta.hien.tuan + ', ' + Object.keys(tachXa).length + ' đơn vị.');
}

function theTuan_(shell, lop) {
  const m = shell.match(new RegExp('<div class="tuan-the ' + lop + '"><span>([^<]*)</span><b>([^<]*)</b><small>([^<]*)</small>'));
  return m ? { nhan: m[1], tuan: m[2], chu: m[3] } : null;
}

/** Tách dữ liệu Weekly Index theo xã; không lấy thông tin chuyên viên theo dõi. */
function tachTheoXa_(r, raw) {
  const kq = {};
  const lay = x => kq[x] || (kq[x] = { chiSo: null, kiemTra: [], duAn: [], nhaDat: [], truSo: null, nhiemVu: [] });
  (r.xa || []).forEach(x => { lay(x.xa).chiSo = x; });
  (r.kt || []).forEach(x => lay(x.xa).kiemTra.push({ ma: x.ma, chiTieu: x.chi_tieu, chiTiet: x.chi_tiet }));
  (r.da || []).forEach(x => lay(x.xa).duAn.push(x));
  (r.ndt || []).forEach(x => { if (x.cap === 'Cấp xã' && x.xa) lay(x.xa).nhaDat.push({
    ma: x.ma, ten: x.ten, dtDat: x.dt_dat, dtNha: x.dt_nha, daXuLy: x.da_xu_ly, phuongAn: x.phuong_an, hinhThuc: x.hinh_thuc,
    tienDo: x.tien_do, duKien: x.du_kien, vuongMac: x.vuong_mac, kienNghi: x.kien_nghi, nguon: x.nguon }); });
  (r.tc || []).forEach(x => { lay(x.xa).truSo = x; });
  const ten = Object.keys(kq);
  (raw.nvg || []).forEach(t => {
    const s = [t.chu_tri, t.phoi_hop, t.dau_moi, t.chu_tri_ub].join(' | ');
    ten.forEach(x => {
      const ngan = x.replace(/^(Xã|Phường|Đặc khu)\s+/, '');
      if (new RegExp('(xã|phường|đặc khu)\\s+' + ngan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\wÀ-ỹ])', 'i').test(s))
        lay(x).nhiemVu.push({ ma: t.ma, ten: t.ten, nguon: t.nguon, vanBan: t.van_ban, chuTri: t.chu_tri, phoiHop: t.phoi_hop,
          han: t.han, hanNgay: t.han_ngay, trangThai: t.trang_thai, tienDo: t.tien_do, ketQua: t.ket_qua, capNhat: t.cap_nhat });
    });
  });
  return kq;
}

function luuWI_(meta, tachXa) {
  const ss = SpreadsheetApp.openById(CAU_HINH.ID_TAI_KHOAN);
  let sh = ss.getSheetByName(WI_TAB);
  if (!sh) { sh = ss.insertSheet(WI_TAB); sh.hideSheet(); }
  const MANH = 45000, hang = [['__meta__'].concat(chia_(JSON.stringify(meta), MANH))];
  Object.keys(tachXa).sort().forEach(x => hang.push([x].concat(chia_(JSON.stringify(tachXa[x]), MANH))));
  const rong = Math.max.apply(null, hang.map(h => h.length));
  sh.clearContents();
  sh.getRange(1, 1, hang.length, rong).setNumberFormat('@').setValues(hang.map(h => h.concat(new Array(rong - h.length).fill(''))));
}

function chia_(s, n) { const a = []; for (let i = 0; i < s.length; i += n) a.push(s.slice(i, i + n)); return a.length ? a : ['']; }

/** Phần Weekly Index của một xã (giữ tạm 10 phút, làm mới ngay khi có bản đồng bộ mới). */
function wiCuaXa(xa) {
  const phien = PropertiesService.getScriptProperties().getProperty('WI_PHIEN');
  if (!phien) return null;
  const dem = CacheService.getScriptCache();
  const khoa = 'wi:' + phien + ':' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, xa, Utilities.Charset.UTF_8));
  const co = dem.get(khoa); if (co) return JSON.parse(co);
  const sh = SpreadsheetApp.openById(CAU_HINH.ID_TAI_KHOAN).getSheetByName(WI_TAB);
  if (!sh) return null;
  const v = sh.getDataRange().getValues();
  const doc = ten => { const h = v.find(r => r[0] === ten); return h ? JSON.parse(h.slice(1).join('')) : null; };
  const kq = { meta: doc('__meta__'), xa: doc(xa) };
  const s = JSON.stringify(kq); if (s.length < 95000) dem.put(khoa, s, 600);
  return kq;
}

/* ============================ MẬT MÃ (thuần JS) ============================ */

/** Lấy một giá trị JSON (mảng/đối tượng) bắt đầu tại vị trí i, có tính chuỗi. */
function cat_(s, i) {
  while (s[i] !== '{' && s[i] !== '[') i++;
  let sau = 0, trongChuoi = false, thoat = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (trongChuoi) { if (thoat) thoat = false; else if (c === '\\') thoat = true; else if (c === '"') trongChuoi = false; continue; }
    if (c === '"') trongChuoi = true;
    else if (c === '{' || c === '[') sau++;
    else if (c === '}' || c === ']') { sau--; if (!sau) return s.slice(i, j + 1); }
  }
  throw new Error('Không đọc được dữ liệu Weekly Index.');
}

function utf8_(s) { return Utilities.newBlob(s).getBytes().map(b => b & 255); }
function utf8Doc_(a) { return Utilities.newBlob(a.map(b => (b << 24) >> 24)).getDataAsString('UTF-8'); }
function b64Bytes_(s) { return Utilities.base64Decode(s).map(b => b & 255); }
function hexBytes_(h) { return h.match(/../g).map(x => parseInt(x, 16)); }
function bytesHex_(a) { return a.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function gunzip_(a) { return Utilities.ungzip(Utilities.newBlob(a.map(b => (b << 24) >> 24), 'application/x-gzip')).getDataAsString('UTF-8'); }

/* SHA-256 / HMAC / PBKDF2 */
const K256_ = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const H0_ = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
function nen_(H, w) { // w: 16 từ 32 bit; cập nhật H tại chỗ
  const W = new Array(64);
  for (let i = 0; i < 16; i++) W[i] = w[i] | 0;
  for (let i = 16; i < 64; i++) {
    const a = W[i-15], b = W[i-2];
    W[i] = (((a>>>7)|(a<<25)) ^ ((a>>>18)|(a<<14)) ^ (a>>>3)) + W[i-16] + (((b>>>17)|(b<<15)) ^ ((b>>>19)|(b<<13)) ^ (b>>>10)) + W[i-7] | 0;
  }
  let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
  for (let i = 0; i < 64; i++) {
    const t1 = h + (((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7))) + ((e&f) ^ (~e&g)) + K256_[i] + W[i] | 0;
    const t2 = (((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10))) + ((a&b) ^ (a&c) ^ (b&c)) | 0;
    h=g; g=f; f=e; e=d+t1|0; d=c; c=b; b=a; a=t1+t2|0;
  }
  H[0]=H[0]+a|0;H[1]=H[1]+b|0;H[2]=H[2]+c|0;H[3]=H[3]+d|0;H[4]=H[4]+e|0;H[5]=H[5]+f|0;H[6]=H[6]+g|0;H[7]=H[7]+h|0;
}
function tuBytes_(a) { const w = []; for (let i = 0; i < a.length; i += 4) w.push((a[i]<<24)|(a[i+1]<<16)|(a[i+2]<<8)|a[i+3]); return w; }
function sha256_(bytes) {
  const H = H0_.slice(), n = bytes.length, m = bytes.slice(); m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  const bit = n * 8; m.push(0,0,0,0,(bit>>>24)&255,(bit>>>16)&255,(bit>>>8)&255,bit&255);
  for (let i = 0; i < m.length; i += 64) nen_(H, tuBytes_(m.slice(i, i + 64)));
  return H;
}
function pbkdf2Sha256_(pw, salt, iter, dkLen) {
  let k = pw.length > 64 ? h2b_(sha256_(pw)) : pw.slice();
  while (k.length < 64) k.push(0);
  const Hi = H0_.slice(), Ho = H0_.slice();
  nen_(Hi, tuBytes_(k.map(b => b ^ 0x36))); nen_(Ho, tuBytes_(k.map(b => b ^ 0x5c)));
  const hmac32 = u => { // HMAC của 32 byte (dạng 8 từ) với trạng thái đệm sẵn
    const a = Hi.slice(); nen_(a, u.concat([0x80000000,0,0,0,0,0,0,(64+32)*8]));
    const b = Ho.slice(); nen_(b, a.concat([0x80000000,0,0,0,0,0,0,(64+32)*8])); return b;
  };
  const out = [];
  for (let blk = 1; out.length < dkLen; blk++) {
    // U1 = HMAC(salt || INT(blk)) — độ dài tùy salt, tính trọn
    const msg = salt.concat([(blk>>>24)&255,(blk>>>16)&255,(blk>>>8)&255,blk&255]);
    const a = Hi.slice(); const m = msg.slice(); m.push(0x80);
    while ((m.length + 64) % 64 !== 56) m.push(0);
    const bit = (64 + msg.length) * 8; m.push(0,0,0,0,(bit>>>24)&255,(bit>>>16)&255,(bit>>>8)&255,bit&255);
    for (let i = 0; i < m.length; i += 64) nen_(a, tuBytes_(m.slice(i, i + 64)));
    const b = Ho.slice(); nen_(b, a.concat([0x80000000,0,0,0,0,0,0,(64+32)*8]));
    let u = b, t = b.slice();
    for (let i = 1; i < iter; i++) { u = hmac32(u); for (let j = 0; j < 8; j++) t[j] ^= u[j]; }
    h2b_(t).forEach(x => out.push(x));
  }
  return out.slice(0, dkLen);
}
function h2b_(H) { const o = []; H.forEach(w => o.push((w>>>24)&255,(w>>>16)&255,(w>>>8)&255,w&255)); return o; }

/* AES-256 (mã hóa khối) và giải mã GCM theo chế độ CTR; độ toàn vẹn kiểm qua bước giải nén gzip. */
const SBOX_ = (function () {
  const s = new Array(256), p = [], q = [];
  let x = 1; for (let i = 0; i < 256; i++) { p[i] = x; x ^= (x << 1) ^ (x & 0x80 ? 0x1b : 0); x &= 255; }
  for (let i = 0; i < 255; i++) q[p[i]] = i;
  for (let i = 0; i < 256; i++) {
    let inv = i ? p[(255 - q[i]) % 255] : 0, r = inv;
    for (let k = 0; k < 4; k++) { inv = ((inv << 1) | (inv >>> 7)) & 255; r ^= inv; }
    s[i] = r ^ 0x63;
  }
  return s;
})();
function moRongKhoa_(key) {
  const w = [], rcon = [1,2,4,8,16,32,64];
  for (let i = 0; i < 8; i++) w.push(key.slice(4*i, 4*i+4));
  for (let i = 8; i < 60; i++) {
    let t = w[i-1].slice();
    if (i % 8 === 0) { t = [SBOX_[t[1]]^rcon[i/8-1], SBOX_[t[2]], SBOX_[t[3]], SBOX_[t[0]]]; }
    else if (i % 8 === 4) t = t.map(b => SBOX_[b]);
    w.push(w[i-8].map((b, j) => b ^ t[j]));
  }
  return w;
}
const xt_ = b => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 255;
function maKhoi_(w, inp) {
  let s = inp.slice();
  const them = r => { for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) s[4*c+k] ^= w[4*r+c][k]; };
  them(0);
  for (let r = 1; r <= 14; r++) {
    s = s.map(b => SBOX_[b]);
    s = [s[0],s[5],s[10],s[15], s[4],s[9],s[14],s[3], s[8],s[13],s[2],s[7], s[12],s[1],s[6],s[11]];
    if (r < 14) for (let c = 0; c < 4; c++) {
      const a0=s[4*c],a1=s[4*c+1],a2=s[4*c+2],a3=s[4*c+3], t=a0^a1^a2^a3;
      s[4*c]^=t^xt_(a0^a1); s[4*c+1]^=t^xt_(a1^a2); s[4*c+2]^=t^xt_(a2^a3); s[4*c+3]^=t^xt_(a3^a0);
    }
    them(r);
  }
  return s;
}
function aesGcmGiai_(key, ivB64, cB64) {
  const w = moRongKhoa_(key), iv = b64Bytes_(ivB64), c = b64Bytes_(cB64);
  const n = c.length - 16, out = new Array(n);
  let dem = 2;
  for (let i = 0; i < n; i += 16) {
    const ks = maKhoi_(w, iv.concat([(dem>>>24)&255,(dem>>>16)&255,(dem>>>8)&255,dem&255])); dem++;
    for (let j = 0; j < 16 && i + j < n; j++) out[i+j] = c[i+j] ^ ks[j];
  }
  return out;
}
