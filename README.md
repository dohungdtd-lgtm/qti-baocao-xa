# Trang báo cáo tuần cấp xã — Văn phòng Tỉnh ủy Quảng Trị

Mỗi đồng chí Chánh Văn phòng Đảng ủy xã, phường, đặc khu đăng nhập bằng số điện thoại đã đăng ký và chỉ xem được báo cáo của đơn vị mình: tình trạng gửi báo cáo tuần này, tiến độ giải ngân, thu ngân sách, nhà đất dôi dư, số liệu so với tuần trước và toàn bộ các bản đã gửi.

## Cách hoạt động

- `index.html` (đặt trên GitHub Pages) chỉ là giao diện, **không chứa số liệu**.
- `apps-script/Code.gs` chạy trên tài khoản Google sở hữu biểu mẫu. Khi xã đăng nhập, máy chủ đối chiếu số điện thoại với trang tính tài khoản, rồi chỉ trả về các dòng của đúng xã đó trong trang tính "BÁO CÁO TUẦN- QTI (Câu trả lời)".
- Số liệu đọc trực tiếp từ trang tính, nên xã gửi biểu mẫu xong là trang có ngay; trang tự làm mới 5 phút một lần.
- Mã đăng nhập có hạn 12 giờ. Xóa một số điện thoại khỏi danh sách thì số đó mất quyền ngay.
- Một số nhập sai 5 lần trong 15 phút sẽ bị tạm khóa; toàn trang có 150 lần sai trong 15 phút thì tạm dừng đăng nhập.

## Cài đặt (một lần)

1. Vào https://script.google.com bằng tài khoản sở hữu biểu mẫu → **Dự án mới** → dán toàn bộ `apps-script/Code.gs` → Lưu.
2. Chọn hàm `caiDat` → **Chạy** → cấp quyền (hàm này tạo khóa bí mật ký mã đăng nhập).
3. Trong trang tính "Tài khoản trang báo cáo xã (không chia sẻ)" (đã lập sẵn 78 đơn vị, cùng thư mục với trang tính câu trả lời), điền họ tên, số điện thoại Chánh Văn phòng của từng đơn vị. Một đơn vị có thể có nhiều dòng (nhiều số). Dòng có cột Đơn vị là `*` xem được mọi đơn vị (dành cho Văn phòng Tỉnh ủy).
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: Thực thi với tư cách *Tôi*, Người có quyền truy cập *Bất kỳ ai*. Sao chép địa chỉ kết thúc bằng `/exec`.
5. Mở `index.html`, dán địa chỉ đó vào dòng `const DIA_CHI_MAY_CHU = '';`, đẩy lên GitHub.
6. Repo → Settings → Pages → Deploy from branch `main`, thư mục `/ (root)`.

Khi sửa `Code.gs` sau này: **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** để giữ nguyên địa chỉ.

## Lưu ý bảo mật

Đăng nhập chỉ bằng số điện thoại: ai biết số của đồng chí Chánh Văn phòng cũng mở được trang của xã đó. Không đưa trang tính tài khoản cho người khác; không chia sẻ dự án Apps Script.

Khi `DIA_CHI_MAY_CHU` để trống, trang chạy ở chế độ xem thử với số liệu giả.

ĐTH-VPTU
