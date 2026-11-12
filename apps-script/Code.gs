/**
 * TRANG BÁO CÁO TUẦN CỦA ĐẢNG ỦY XÃ, PHƯỜNG, ĐẶC KHU — Văn phòng Tỉnh ủy Quảng Trị (ĐTH-VPTU)
 *
 * Máy chủ trung gian giữa trang web (GitHub Pages) và trang tính câu trả lời biểu mẫu
 * "BÁO CÁO TUẦN - QTI". Trang web không chứa số liệu; mỗi lần mở, trang gửi số điện thoại
 * về đây, máy chủ đối chiếu danh sách tài khoản rồi CHỈ trả về các bản báo cáo của đúng xã đó.
 *
 * Cài đặt: xem HUONG_DAN.md. Sau khi dán mã, chạy hàm caiDat() một lần.
 */

const CAU_HINH = {
  ID_TRA_LOI: '1a2VJ62wC-QxDLUg5S6ZsoxpRE7tvXzNz2HvHDXGqMcY', // BÁO CÁO TUẦN- QTI (Câu trả lời)
  TAB_TRA_LOI: 'Câu trả lời biểu mẫu 1',
  ID_TAI_KHOAN: '17FYIhMUsTT94H2rHohFZyNsf2Y8TN769o56y-2fnbG0', // Tài khoản trang báo cáo xã (không chia sẻ); đọc trang tính đầu tiên
  TAB_TAI_KHOAN: 'TaiKhoan',
  HAN_PHIEN_GIO: 12,          // mã phiên đăng nhập hết hạn sau 12 giờ
  DEM_GIAY: 120,              // dữ liệu mỗi xã được giữ tạm 2 phút để trang mở nhanh
  SAI_TOI_DA_MOT_SO: 5,       // một số nhập sai 5 lần trong 15 phút thì tạm khóa số đó
  SAI_TOI_DA_TOAN_TRANG: 150, // toàn trang có 150 lần sai trong 15 phút thì tạm dừng đăng nhập 15 phút
};

// Các cột không đưa lên trang (thông tin hành chính của biểu mẫu)
const COT_BO_QUA = ['Dấu thời gian', 'Tuần báo cáo', 'Đơn vị báo cáo', 'Đơn vị', 'Bộ phận báo cáo', 'Địa chỉ email'];

/* ============================ CÀI ĐẶT ============================ */

/** Chạy một lần: tạo khóa bí mật và trang tính danh sách tài khoản (điền sẵn tên các đơn vị). */
function caiDat() {
  const tc = PropertiesService.getScriptProperties();
  if (!tc.getProperty('KHOA_BI_MAT')) {
    tc.setProperty('KHOA_BI_MAT', Utilities.getUuid() + Utilities.getUuid());
  }
  let id = CAU_HINH.ID_TAI_KHOAN || tc.getProperty('ID_TAI_KHOAN');
  if (!id) {
    const ss = SpreadsheetApp.create('Tài khoản trang báo cáo xã (không chia sẻ)');
    const sh = ss.getSheets()[0].setName(CAU_HINH.TAB_TAI_KHOAN);
    sh.getRange(1, 1, 1, 4).setValues([['Đơn vị (đúng tên trên biểu mẫu)', 'Họ tên Chánh Văn phòng', 'Số điện thoại', 'Ghi chú']])
      .setFontWeight('bold').setBackground('#fde9e7');
    const ds = danhSachDonVi_();
    if (ds.length) sh.getRange(2, 1, ds.length, 1).setValues(ds.map(x => [x]));
    sh.getRange('C:C').setNumberFormat('@'); // giữ số 0 đầu số điện thoại
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 1, 220); sh.setColumnWidths(2, 1, 220); sh.setColumnWidths(3, 1, 140); sh.setColumnWidths(4, 1, 260);
    id = ss.getId();
    tc.setProperty('ID_TAI_KHOAN', id);
  }
  Logger.log('Danh sách tài khoản: https://docs.google.com/spreadsheets/d/' + id + '/edit');
}

/** Tên các đơn vị đã từng báo cáo (cột "Đơn vị"), sắp theo bảng chữ cái. */
function danhSachDonVi_() {
  const sh = SpreadsheetApp.openById(CAU_HINH.ID_TRA_LOI).getSheetByName(CAU_HINH.TAB_TRA_LOI);
  const v = sh.getDataRange().getDisplayValues();
  const c = v[0].indexOf('Đơn vị');
  if (c < 0) return [];
  const s = new Set();
  for (let i = 1; i < v.length; i++) { const t = String(v[i][c]).trim(); if (t) s.add(t); }
  return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
}

/* ============================ CỔNG GIAO TIẾP ============================ */

function doGet() {
  return traVe_({ ok: true, ten: 'Trang báo cáo tuần cấp xã — ĐTH-VPTU' });
}

function doPost(e) {
  try {
    const yc = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (yc.viec === 'dangNhap') return traVe_(dangNhap_(yc.sdt, yc.xaChon));
    if (yc.viec === 'duLieu') return traVe_(duLieu_(yc.ma));
    return traVe_({ ok: false, loi: 'Yêu cầu không hợp lệ.' });
  } catch (err) {
    console.error(err);
    return traVe_({ ok: false, loi: 'Máy chủ gặp lỗi, đồng chí thử lại sau ít phút.' });
  }
}

function traVe_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ ĐĂNG NHẬP ============================ */

function chuanSdt_(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2);
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d;
  return d;
}

/** Bảng số điện thoại → {xa, ten}. Đơn vị ghi "*" là tài khoản xem được mọi xã (dành cho Văn phòng). */
function bangTaiKhoan_() {
  const id = CAU_HINH.ID_TAI_KHOAN || PropertiesService.getScriptProperties().getProperty('ID_TAI_KHOAN');
  if (!id) throw new Error('Chưa chạy caiDat()');
  const v = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues();
  const b = {};
  for (let i = 1; i < v.length; i++) {
    const xa = String(v[i][0]).trim(), sdt = chuanSdt_(v[i][2]);
    if (xa && sdt.length >= 10) b[sdt] = { xa: xa, ten: String(v[i][1]).trim() };
  }
  return b;
}

function dangNhap_(sdtNhap, xaChon) {
  const sdt = chuanSdt_(sdtNhap);
  if (sdt.length < 10) return { ok: false, loi: 'Số điện thoại chưa đúng (cần đủ 10 số).' };

  const dem = CacheService.getScriptCache();
  const saiSo = Number(dem.get('sai:' + sdt) || 0);
  const saiTong = Number(dem.get('sai:*') || 0);
  if (saiSo >= CAU_HINH.SAI_TOI_DA_MOT_SO || saiTong >= CAU_HINH.SAI_TOI_DA_TOAN_TRANG) {
    return { ok: false, loi: 'Đăng nhập tạm khóa do nhập sai nhiều lần. Đồng chí thử lại sau 15 phút hoặc liên hệ Phòng Tổng hợp, Văn phòng Tỉnh ủy.' };
  }

  const tk = bangTaiKhoan_()[sdt];
  if (!tk) {
    dem.put('sai:' + sdt, String(saiSo + 1), 900);
    dem.put('sai:*', String(saiTong + 1), 900);
    Utilities.sleep(1200); // làm chậm việc dò số
    return { ok: false, loi: 'Số điện thoại này chưa được đăng ký. Đồng chí liên hệ Phòng Tổng hợp, Văn phòng Tỉnh ủy để được cấp quyền.' };
  }

  let xa = tk.xa;
  if (xa === '*') {
    const ds = danhSachDonVi_();
    if (!xaChon) return { ok: true, chonXa: true, dsXa: ds, ten: tk.ten };
    if (ds.indexOf(xaChon) < 0) return { ok: false, loi: 'Không có đơn vị này.' };
    xa = xaChon;
  }
  return { ok: true, ma: kyMa_(sdt, xa), xa: xa, ten: tk.ten };
}

function kyMa_(sdt, xa) {
  const het = Date.now() + CAU_HINH.HAN_PHIEN_GIO * 3600 * 1000;
  const noiDung = Utilities.base64EncodeWebSafe(JSON.stringify({ s: sdt, x: xa, h: het }), Utilities.Charset.UTF_8);
  return noiDung + '.' + chuKy_(noiDung);
}

function chuKy_(s) {
  const khoa = PropertiesService.getScriptProperties().getProperty('KHOA_BI_MAT');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, khoa, Utilities.Charset.UTF_8));
}

/** Kiểm tra mã phiên; số điện thoại phải còn trong danh sách và còn gắn với đúng xã. */
function moMa_(ma) {
  const p = String(ma || '').split('.');
  if (p.length !== 2 || chuKy_(p[0]) !== p[1]) return null;
  const o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString('UTF-8'));
  if (!o.h || o.h < Date.now()) return null;
  const tk = bangTaiKhoan_()[o.s];
  if (!tk || (tk.xa !== '*' && tk.xa !== o.x)) return null;
  return { xa: o.x, ten: tk.ten };
}

/* ============================ DỮ LIỆU CỦA XÃ ============================ */

function duLieu_(ma) {
  const p = moMa_(ma);
  if (!p) return { ok: false, hetPhien: true, loi: 'Phiên đăng nhập đã hết hạn, đồng chí đăng nhập lại.' };

  const dem = CacheService.getScriptCache();
  const khoaDem = 'xa:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, p.xa, Utilities.Charset.UTF_8));
  let baoCao = null;
  const daCo = dem.get(khoaDem);
  if (daCo) baoCao = JSON.parse(daCo);
  if (!baoCao) {
    const sh = SpreadsheetApp.openById(CAU_HINH.ID_TRA_LOI).getSheetByName(CAU_HINH.TAB_TRA_LOI);
    baoCao = locBaoCaoXa(sh.getDataRange().getDisplayValues(), p.xa);
    const chuoi = JSON.stringify(baoCao);
    if (chuoi.length < 95000) dem.put(khoaDem, chuoi, CAU_HINH.DEM_GIAY);
  }
  return { ok: true, xa: p.xa, ten: p.ten, capNhat: new Date().toISOString(), tuanNay: tuanCua(new Date()), baoCao: baoCao };
}

/**
 * Lọc các bản báo cáo của một xã từ toàn bộ trang tính (dòng đầu là tiêu đề).
 * Mỗi bản: thời gian gửi, tuần báo cáo, bộ phận, và các câu đã trả lời theo đúng thứ tự trên biểu mẫu.
 */
function locBaoCaoXa(v, xa) {
  const tieuDe = v[0].map(t => String(t).replace(/\s+/g, ' ').trim());
  const cDonVi = tieuDe.indexOf('Đơn vị'), cBoPhan = tieuDe.indexOf('Bộ phận báo cáo');
  const cotLay = [];
  tieuDe.forEach((t, i) => { if (i > 0 && t && COT_BO_QUA.indexOf(t) < 0 && !/^Cột \d+$/.test(t)) cotLay.push(i); });

  const kq = [];
  for (let r = 1; r < v.length; r++) {
    const row = v[r];
    if (String(row[cDonVi] || '').trim() !== xa) continue;
    const tg = docThoiGian(row[0]);
    if (!tg) continue;
    // Tuần báo cáo luôn tính theo ngày gửi (thứ Hai – Chủ nhật), không theo tuần xã tự chọn ở biểu mẫu cũ:
    // gửi trong 02–08/11/2026 là tuần 45, gửi trong 09–15/11/2026 là tuần 46.
    const tuan = tuanCua(tg);
    const muc = [];
    cotLay.forEach(i => {
      const tl = String(row[i] == null ? '' : row[i]).trim();
      if (tl) muc.push([tieuDe[i], tl]);
    });
    kq.push({
      tg: row[0], ms: tg.getTime(), tuan: tuan.so, nam: tuan.nam, nhanTuan: tuan.nhan,
      boPhan: cBoPhan >= 0 ? String(row[cBoPhan] || '').trim() : '', muc: muc,
    });
  }
  kq.sort((a, b) => b.ms - a.ms);
  return kq;
}

/** "12/11/2026 7:53:40" → Date (giờ Việt Nam). */
function docThoiGian(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], (+m[4] || 0) - 7, +m[5] || 0, +m[6] || 0));
}

/** Tuần báo cáo từ thứ Hai đến Chủ nhật (đánh số theo ISO, khớp "tuần 45 = 02–08/11/2026"). Hạn gửi 17h00 thứ Năm. */
function tuanCua(d) {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);                 // dời sang giờ Việt Nam
  const ngay = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
  const thu = (ngay.getUTCDay() + 6) % 7;                             // 0 = thứ Hai
  const thuHai = new Date(ngay.getTime() - thu * 864e5);
  const thuNam = new Date(thuHai.getTime() + 3 * 864e5);
  const nam = thuNam.getUTCFullYear();
  const dauNam = new Date(Date.UTC(nam, 0, 4));
  const thuHaiTuan1 = new Date(dauNam.getTime() - ((dauNam.getUTCDay() + 6) % 7) * 864e5);
  const so = Math.round((thuHai - thuHaiTuan1) / (7 * 864e5)) + 1;
  const cn = new Date(thuHai.getTime() + 6 * 864e5);
  const f = x => ('0' + x.getUTCDate()).slice(-2) + '/' + ('0' + (x.getUTCMonth() + 1)).slice(-2);
  return {
    so: so, nam: nam,
    nhan: 'Tuần ' + so + ' (' + f(thuHai) + '–' + f(cn) + '/' + cn.getUTCFullYear() + ')',
    han: new Date(thuNam.getTime() + 10 * 3600 * 1000).toISOString(), // 17h00 thứ Năm giờ Việt Nam
  };
}

/* Để chạy thử ngoài Apps Script (Node) */
if (typeof module !== 'undefined') module.exports = { locBaoCaoXa, tuanCua, docThoiGian, chuanSdt_ };
