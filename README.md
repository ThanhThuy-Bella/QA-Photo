# QA Photo – THV (Giai đoạn 1: Báo cáo IE Hazzys)

App web cài lên điện thoại (PWA) cho QA ngoài chuyền chụp ảnh theo JO × màu, admin duyệt và xuất **báo cáo IE (C/O marking)** ra **Excel + PDF** theo lot.

Công nghệ: Next.js 14 · Supabase (gói Free) · Vercel.

---

## 1. Tạo Supabase (5 phút)
1. Vào https://supabase.com → **New project** → tên `qa-photo-thv`, region **Southeast Asia (Singapore)**, gói **Free**.
2. Mở **SQL Editor** → **New query** → dán toàn bộ nội dung file `supabase/schema.sql` → **Run**.
   - File này tạo bảng, phân quyền (RLS), bucket ảnh `photos` (private), 15 lỗi chuẩn và 10 vị trí lỗi.
3. **Authentication → Users → Add user → Create new user** (tick *Auto Confirm User*):
   | Tài khoản | Email nhập vào Supabase | Vai trò |
   |---|---|---|
   | Admin | `thuytt@esquel.com` | admin (tự gán) |
   | QA dùng chung | `qainline@thv.com` | qa |
   - Khi đăng nhập app, QA chỉ cần gõ **QAinline** + mật khẩu (app tự đổi thành email trên).
   - Nếu tạo user **trước** khi chạy schema.sql: chạy lại phần *BACKFILL* cuối file.
4. **Project Settings → API**: copy **Project URL** và **anon public key**.

## 2. Đưa code lên GitHub
1. Tạo repo mới (vd. `QA-Photo`), giải nén file zip, upload toàn bộ thư mục (trừ `node_modules`, `.next`).

## 3. Deploy Vercel
1. https://vercel.com → **Add New → Project** → chọn repo `QA-Photo`.
2. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
3. **Deploy**. Xong sẽ có link dạng `https://qa-photo-xxx.vercel.app`.

## 4. Dùng thử
1. Máy tính: đăng nhập `thuytt@esquel.com` → **Nhập recap** → chọn file *HAZZYS Order Recap* → **Cập nhật vào app**.
2. Điện thoại QA: mở link → đăng nhập **QAinline** → Chrome: menu ⋮ → *Thêm vào màn hình chính* (iPhone Safari: nút Chia sẻ → *Thêm vào MH chính*).
3. QA chọn JO → tab màu → bấm **Chụp** (camera) hoặc **Album** (ảnh có sẵn) cho **Mác sườn** + **Gập gói** (bắt buộc cho IE), các ảnh Final (thân trước, thẻ bài, thùng – hàng Men, ảnh lỗi) → **Gửi duyệt màu …**.
4. Admin → **Duyệt & xuất** → **Xem ảnh** → *Duyệt* / *Trả lại QA* (kèm lý do).
5. **Báo cáo IE:** tick các dòng đã duyệt (nhiều lot) → bấm **Xuất Excel** hoặc **Xuất PDF**. Mỗi style ra 1 file, mỗi lot 1 sheet / 1 trang.
6. **Final report:** xuất file Final từ GQS như bình thường → Admin → **Final report** → chọn file GQS (chọn được nhiều file) → **Chèn ảnh & tải Excel**. Ladies: thêm khối Style Photo / Defective Photo / Accessory Photo; Men: PRESENTATION (gập gói từng màu), DEFECT PICTURE, ảnh thùng dưới chữ ký. Cần PDF thì mở Excel → Save as PDF.

## 5. Quy tắc nghiệp vụ (tóm tắt)
- Nguồn: sheet **Prod** của recap. Style = `Cust. Style No`. Lot = `KR..` tách từ `JO No` (`…KR01::V::-` → KR01). Hàng `MEN…` = Men (gồm outlet), còn lại (Ladies, Boys) = Ladies.
- Nhập lại recap: thêm/cập nhật JO × màu; JO bị bỏ khỏi recap chỉ bị đánh dấu, **không xóa ảnh**.
- **Riêng từng lot × màu:** Mác sườn (cột ① ② IE; có nút *Dùng lại ảnh mác của lot khác* khi mác giống) và ảnh lỗi.
- **Dùng chung mọi lot (style × màu):** Gập gói (cột ③ IE), Thẻ bài, Thân trước, Mặt thùng có tem (hàng Men, 1 ảnh).
- **Tự lưu nháp:** ảnh lưu vào máy trước rồi tự tải lên khi có mạng (biểu tượng ● Đã lưu / Chờ tải / Lỗi); form ảnh lỗi tự lưu và khôi phục; xóa ảnh có *Hoàn tác* 10 giây.
- Ảnh lỗi: bắt buộc tên lỗi + mức độ (chỉ mức được phép) + vị trí; nhắc khi > 10 ảnh.
- QA sửa được khi bộ ảnh ở trạng thái Nháp / Bị trả lại. Đã gửi / đã duyệt → chỉ admin sửa.
- Chụp/chọn album xong → màn hình **Cắt ảnh**: app tự đặt khung (mác/nhãn/thẻ: tìm vùng trắng; gập gói/áo/thùng: tách khỏi nền), QA kéo khung, **Xoay 90°**, **Tự cắt lại**, **Không cắt** hoặc **Dùng ảnh**. Chỉ lưu ảnh đã cắt.
- Ảnh nén cạnh dài 1600px (~0,3–0,4 MB). App cảnh báo ảnh mờ/tối trước khi lưu.

## 5b. Cập nhật phiên bản
Upload toàn bộ nội dung thư mục lên GitHub → Vercel tự build. Mỗi bản có file SQL kèm theo thì chạy 1 lần trong Supabase → SQL Editor (theo thứ tự): `update_v1.3.sql` (nếu chưa), `update_v1.5.sql`, `update_v2.0.sql`. Số phiên bản hiện ở góc trang QA và thanh Admin.

## 6. Dung lượng (gói Free 1 GB)
- Trang **Tải về & dọn ảnh**: thanh dung lượng; bộ ảnh quá 6 tháng được chọn sẵn → **1. Tải ZIP** (ảnh theo Style/Lot_JO/Màu + Excel IE) → kiểm tra → **2. Xóa khỏi cloud**.
- Gói Free tự tạm dừng project nếu 7 ngày không ai dùng → vào supabase.com bấm *Restore*.

## 7. Chỉnh thông số
`lib/config.ts`: giới hạn dung lượng, số tháng lưu, số ảnh lỗi gợi ý, kích thước nén, ngưỡng cảnh báo mờ (`BLUR_THRESHOLD`) / tối (`DARK_THRESHOLD`).

## 8. Cấu trúc thư mục
```
app/
  login/                 Đăng nhập
  qa/                    Danh sách JO cần chụp
  qa/[jo]/               Chụp ảnh theo màu
  qa/[jo]/defect/        Ảnh lỗi
  admin/                 Duyệt & xuất IE (Excel / PDF)
  admin/final/           Final report: chèn ảnh vào file GQS
  admin/import/          Nhập recap
  admin/cleanup/         Tải ZIP & dọn ảnh
  admin/defects/         Bảng lỗi, vị trí lỗi
components/              UI dùng chung (PhotoSlot, CropModal, Lightbox…)
lib/
  exportIE.ts            Tạo Excel (exceljs) + PDF (html2canvas + jsPDF) đúng format IE
  recap.ts               Đọc file recap
  image.ts               Nén ảnh, đo độ nét/độ sáng
  photos.ts              Upload/xóa ảnh Supabase
supabase/schema.sql      CSDL + phân quyền + dữ liệu lỗi chuẩn
```
