# PROJECT MEMORY – QA Photo App (Báo cáo IE + Final report Hazzys)

> Nguồn sự thật của dự án. Cập nhật lần cuối: 12/11/2026. Trạng thái: **v1.9.2 – code xong, chờ upload GitHub (+ supabase/update_v1.5.sql nếu chưa chạy)**; app chạy tại https://qa-photo.vercel.app (QA: /qa).

## 1. Mục tiêu
QA ngoài chuyền chụp ảnh trên điện thoại trong lúc sản xuất (chụp dần, lưu nháp, xóa/chụp lại khi chưa đạt). Admin duyệt và xuất:
1. **Báo cáo IE** (C/O marking – `수입상품 원산지표시 사진`) → Excel + PDF, đúng format file mẫu HSSH6AC15.xlsx / HSSH6B311.pdf.
2. **Final report** (giai đoạn 2).

## 2. Nguồn dữ liệu
- File **HAZZYS Order Recap** – admin **upload lại** mỗi khi cập nhật. Đọc sheet **`Prod`** (dòng tiêu đề = dòng 2).
- Cột dùng: `GO No`, `Cust. Style No`, `JO No`, `Color Code`, `Order Qty`, `Sewing Start Date`, `BPO Del Date`, `Style Desc(EN)`.
- **Style in trên IE** = `Cust. Style No` (vd. WSSH6AC15).
- **Lot** = phần `KR\d+` tách từ `JO No` (vd. `26M05665KR02` → KR02). JO đuôi lạ `…KR01::V::-` → gộp vào KR01.
- **Nhóm hàng**: `Style Desc(EN)` bắt đầu `MEN` → **Men** (gồm Men Outlet); `WOMEN`/`LADIES` và `BOYS` (kids) → **Ladies**.
- Upload lại recap: chỉ **thêm** JO/màu mới, cập nhật số liệu; **không xóa ảnh**. JO biến mất khỏi recap → báo admin, không tự xóa.

## 3. Quy tắc ảnh (đã chốt)
| Ảnh | Đơn vị chụp | IE | Final – Men | Final – Ladies/Boys |
|---|---|---|---|---|
| Mác sườn (1 ảnh) | Lot × màu | cột ① **và** ② | ✓ | ✓ |
| Gập gói | Style × màu (dùng chung, v1.5) | cột ③ | ✓ | – |
| Thẻ bài | Lot × màu | – | ✓ | ✓ |
| Thân trước | Style × màu – **dùng chung mọi lot** | – | ✓ | ✓ |
| Ảnh lỗi (gợi ý ≤10 ảnh, không chặn cứng) | Lot × màu | – | ✓ | ✓ |
| Ảnh thùng: mặt thùng + nhãn thùng (2 ảnh) | Lot × màu | – | ✓ | – |

- Mác, gập gói, thẻ bài **chụp riêng từng lot** – không dùng lại ảnh lot khác (tránh nhầm).
- Mỗi ảnh tự gắn nhãn: Style · JO · Màu · loại ảnh · tài khoản · thời gian.
- **Ảnh lỗi**: bắt buộc chọn *Tên lỗi* + *Mức độ* (chỉ mức được phép theo bảng lỗi chuẩn) + *Vị trí* (cổ, nẹp, măng séc, sườn, gấu, túi…) + ghi chú tự do. Tên lỗi – vị trí in dưới ảnh trong Final report. Quá 10 ảnh → app nhắc, admin có thể đổi giới hạn.
- Mỗi ô ảnh có **dòng hướng dẫn + ảnh mẫu** để QA chụp đúng góc (admin cài ảnh mẫu).
- **Độ nét**: dùng camera gốc của điện thoại (độ phân giải đầy đủ, lấy nét tự động); app chỉ nén nhẹ (cạnh dài 1600px, JPEG 85%, ~0.3–0.4MB/ảnh); tự báo ảnh mờ/tối để chụp lại.

### Bảng lỗi chuẩn (file lỗi.xlsx – admin sửa được trong app)
| Defect name | Critical | Major | Minor |
|---|---|---|---|
| Dirt mark | | x | x |
| Foreign yarn | | x | x |
| Frayed yarn | | x | x |
| Fullness | | x | x |
| High/low placket | | x | x |
| Hiking | | x | x |
| Over stitching | | x | x |
| Pleat | | x | x |
| Poor shape | | x | x |
| Poor stitching | | x | x |
| Run off stitch | | x | x |
| Skip stitch | | x | |
| Slub | | x | x |
| Stain | | x | x |
| Thread end / join stitch | x | x | |
(Đã chốt sửa chính tả: "Hightlow placket" → High/low placket, "Hikking" → Hiking.)

**Vị trí lỗi (tiếng Anh, khớp Part Name GQS – chốt v1.3):** Collar, Placket, Cuff, Side seam, Hem, Pocket, Shoulder, Sleeve, Back body, Yoke, Front body, Armhole + Other (gõ tay tiếng Anh).

## 4. Quy trình & trạng thái
`Nháp` → (đủ ảnh) `Chờ duyệt` → Admin `Đã duyệt` hoặc `Bị trả lại` (kèm lý do) → QA chụp lại → `Chờ duyệt`.
- **Lưu trữ: 6 tháng** – v1.0: trang *Tải về & dọn ảnh* tô đỏ và chọn sẵn bộ ảnh quá 6 tháng; admin bấm Tải ZIP → Xóa khỏi cloud (chưa có xóa tự động phía server).
- QA được xóa/chụp lại khi chưa duyệt. Sau duyệt chỉ Admin sửa.
- **Admin duyệt và xuất** (hiện tại: Ana).
- **Tài khoản (đã chốt):** `thuytt@esquel.com` – admin; `QAinline` (email Supabase: **qainline@thv.com**) – tài khoản QA dùng chung (vai trò QA); lib/supabase.ts đổi 'QAinline' → qainline@thv.com. **Không** ghi tên người chụp (đã chốt) – app chỉ lưu tài khoản + thời gian chụp.

## 5. Xuất báo cáo IE (Cách A)
- Admin tick nhiều lot (cùng style, có thể khác GO) → **1 file Excel + 1 file PDF**.
- Excel: mỗi lot 1 sheet (tên sheet = lot), ô C2 = lot, B2 = Cust Style, mỗi màu 1 khối (header vàng + dòng ảnh). Ảnh đặt nổi → chỉnh tay được.
- PDF: xuất từ chính file Excel (mỗi lot 1 trang A4, fit 1 trang).
- Tên file: `<Style>_IE_<lot1>-<lot2>….xlsx/.pdf`.
- Chỉ lot **đã duyệt** mới tick được.
- Prototype bộ xuất (Python/openpyxl + LibreOffice) đã chạy OK với dữ liệu HSSH6B311 KR02–KR05.

## 5b. Final report (chốt lại 13/11/2026)
- **Báo cáo IE giữ nguyên mẫu ban đầu**: cột ① và ② là CÙNG 1 ảnh mác sườn, cùng vị trí; mỗi lot 1 trang/sheet; 2 nút Xuất Excel / Xuất PDF.
- **Final report = file "Customer Audit input Report" xuất từ GQS** (sheet 1 = Final, sheet 2 = Measurement). App chỉ **chèn ảnh**, giữ nguyên form (chốt 13/11):
  - **Ladies (mẫu HSSH6BC30.xlsx)** – 1 file / 1 style gộp mọi JO (B8 = danh sách JO ";", B10 = danh sách màu ";"). Chèn 3 khối dòng mới (cột A–F, ~6 ảnh/hàng):
    - "Style Photo" ngay dưới dòng Factory (dòng 5–6): ảnh thân trước từng màu.
    - "Defective  Photo" dưới bảng Appearance Inspection: ảnh lỗi.
    - "Accessory  Photo" dưới Inspection Items, trên chữ ký: ảnh mác sườn + thẻ bài từng màu (nhiều dòng ảnh).
  - **Men (mẫu HZSH6E201-T2)** – 1 file / JO × màu (B6 = JO, B8 = màu). Chèn vào ô có sẵn: PRESENTATION (≈H3:K10) = gập gói; DEFECT PICTURE (≈J25:L30) = ảnh lỗi; dưới chữ ký (≈A39:D52) = ảnh thùng.
  - Đã nhận file GQS gốc Ladies.xlsx / Men.xlsx (13/11). File gốc có thể 1 hay nhiều JO (B6 ngăn ';') và nhiều màu (B8) – cả Men lẫn Ladies. Vị trí dòng thay đổi theo số lỗi → app tìm theo chữ ở cột A ('Factory', 'Style Confirmation', 'Inspection Items', 'QA Auditor:').
  - Đã code lib/finalReport.ts (exceljs): Ladies chèn dòng (tự dời ô gộp), cột A–F đổi độ rộng như mẫu HSSH6BC30, header copy style 'Judgment Information'; Men đặt ảnh vào khung I3:L10 (PRESENTATION), I[SC+2]:L (DEFECT PICTURE), dưới QA Auditor +4 (thùng, 2 ảnh/hàng). Demo: Demo_Final_Ladies_chen_anh.xlsx, Demo_Final_Men_chen_anh.xlsx – chờ chị duyệt.
  - Đã duyệt demo (13/11): vị trí/kích thước OK; Men nhiều màu → ô PRESENTATION chia lưới, mỗi màu 1 ảnh gập gói; Final chỉ xuất Excel (tự Save as PDF).
- **Tự cắt ảnh (chốt 13/11):** app đặt sẵn khung cắt, QA chỉnh khung hoặc xoay 90° rồi bấm "Dùng ảnh"; chỉ lưu ảnh đã cắt.

## 6. Màn hình (canvas thiết kế)
1. QA – Danh sách việc (lọc Đang làm / Bị trả lại / Đã duyệt, tiến độ ảnh)
2. QA – Chụp ảnh theo lot, tab màu (ô IE + ô Final, Lưu nháp / Gửi duyệt)
3. Admin – Duyệt & xuất (bảng Lot (đuôi JO) × GO × màu, xem ảnh, Duyệt/Trả lại, Xuất IE PDF + Excel, Nhập file Recap)
4. Trang IE A4 (xem trước)
5. QA – Ảnh lỗi (chọn tên lỗi, vị trí, ghi chú)

## 7. Công nghệ (đã chốt)
PWA: Next.js + TypeScript + Tailwind, Supabase (Postgres + Storage ảnh), Vercel. QA mở link/QR → 'Thêm vào màn hình chính' như app, không cần cài từ store. Chụp bằng camera gốc điện thoại. Xuất Excel bằng exceljs (ảnh) + PDF.
- **Dùng Supabase miễn phí** (Storage 1 GB, DB 500 MB). Ảnh nén cạnh dài **1600px** (~0.3–0.4 MB, vẫn đọc rõ mác khi in A4) → ~2.500–3.000 ảnh.
- **Tải về & dọn ảnh** (admin): thanh dung lượng trên trang Admin; ≥80% cảnh báo vàng, ≥90% đỏ. Admin chọn lot (mặc định: lot đã xuất báo cáo, cũ nhất trước) → tải 1 file ZIP (thư mục Style/Lot/Màu + Excel/PDF IE đã xuất) → xác nhận → xóa ảnh khỏi cloud. Lot đã dọn vẫn giữ lịch sử, đánh dấu "Đã lưu trữ".
- Vẫn tự xóa sau 6 tháng nếu admin chưa dọn.
- Lưu ý gói free: project tự tạm dừng nếu 7 ngày không ai dùng (dùng hằng ngày thì không sao); băng thông tải ~5 GB/tháng.

## 8. CSDL dự kiến
- `recap_imports` (id, file_name, uploaded_by, uploaded_at, rows_added, rows_updated)
- `jo_colors` (id, go_no, cust_style, jo_no, lot, color_code, order_qty, sew_start, bpo_date, category[Men/Ladies], active)
- `photo_sets` (id, cust_style, lot, color_code, status, submitted_by, submitted_at, approved_by, approved_at, reject_reason)
- `photos` (id, photo_set_id NULL, cust_style, color_code, type[label|fold|hangtag|front|defect|carton_face|carton_label], storage_path, taken_by, taken_at, deleted_at)
  - `front` gắn theo style × màu (photo_set_id NULL) → dùng chung mọi lot.
- `users` (id, name, role[qa|admin])
- `exports` (id, type[IE|FINAL], lots[], file_xlsx, file_pdf, created_by, created_at)

## 9. Giai đoạn
- **GĐ1**: Nhập recap → QA chụp/nháp → Admin duyệt → Xuất IE Excel + PDF.
- **GĐ2**: Final report (Men/Ladies), ảnh thùng, ảnh lỗi.
- Ý tưởng chờ duyệt: OCR đọc mã màu trên mác để cảnh báo nhầm; khung căn ảnh + báo ảnh mờ; nhắc việc theo ngày may/BPOD.

## 10. Câu hỏi còn mở
1. Format Final report (chị gửi file mẫu khi làm GĐ2).

## 11. Tiến độ code (v1.0 – 12/11/2026)
**Đã xong (build OK, đã test bộ xuất Excel + PDF với ảnh HSSH6B311 KR02–KR05, test đọc recap SS27: 237 dòng JO × màu, KR01–KR06, Men 100 / Ladies 137):**
- Đăng nhập (QAinline → qainline@qa-photo.local; admin thuytt@esquel.com), phân quyền RLS.
- QA: danh sách JO (tab Đang làm / Bị trả lại / Đã duyệt, tìm kiếm, sắp theo ngày may), chụp theo tab màu, nén 1600px, cảnh báo mờ/tối, xóa/chụp lại, lưu nháp tự động, gửi duyệt từng màu; ảnh lỗi (tên lỗi + mức độ + vị trí + ghi chú).
- Admin: duyệt/trả lại (lý do), duyệt hàng loạt, xuất IE Excel + PDF (mỗi lot 1 sheet/1 trang, gộp nhiều lot, tách file theo style), nhập recap (xem trước, đánh dấu JO không còn), dọn ảnh (ZIP + Excel IE → xóa → trạng thái Đã lưu trữ), sửa bảng lỗi / vị trí.

**Cấu trúc thư mục:** xem README.md trong gói code (app/, components/, lib/, supabase/schema.sql).

**Deploy:** chưa – cần chị tạo Supabase Free (Singapore) + chạy schema.sql + tạo 2 user + GitHub + Vercel (README mục 1–3).

**Việc tiếp theo:**
1. Deploy, test trên điện thoại QA thật (Android + iPhone), chỉnh ngưỡng mờ/tối nếu cảnh báo sai.
2. Thu thập lỗi/góp ý → v1.1.
3. Giai đoạn 2: Final report (chị gửi file mẫu).

**Lỗi đã biết:** chưa có.

## 12. Lịch sử phiên bản
- **v1.0 (12/11/2026):** bản đầu Giai đoạn 1.
- **v1.9.2 (17/11/2026):** sửa lỗi không bấm được nút ← quay lại trên iPhone (thanh tab màu dính đè lên header khi mở app từ màn hình chính – header + tab gộp thành 1 khối dính); sau khi Gửi duyệt hiện hộp "✓ Đã gửi duyệt màu X" với nút **Chụp tiếp màu …** và **Về danh sách JO (làm lot khác)**; nút dưới đổi thành "← Về danh sách" khi bộ ảnh đã gửi/duyệt.
- **v1.9.1 (17/11/2026):** ảnh dùng chung (gập gói, thẻ bài, thùng) hiện cho mọi lot cùng màu kể cả dữ liệu cũ chưa chạy update_v1.5.sql (lấy ảnh cũ của lot này/lot khác cùng màu); IE lấy gập gói: dùng chung → của lot → của lot khác cùng màu. Ô mặt thùng chỉ hiện với hàng Men (style desc MEN…).
- **v1.9 (17/11/2026) – sửa lỗi QA báo trên iPhone:**
  - Ảnh chờ tải lưu dạng **ArrayBuffer** thay vì Blob trong IndexedDB (iPhone / trình duyệt trong Zalo làm hỏng Blob → ảnh hiện "?" và tải lên lỗi → nút Gửi duyệt bị khóa nên admin không nhận được). Ảnh cũ bị hỏng báo rõ "Ảnh lưu trong máy bị hỏng – Bỏ ảnh rồi chụp lại".
  - Bấm badge trạng thái → bảng **Ảnh chờ tải lên**: xem lỗi cụ thể, **Thử tải lại tất cả**, **Bỏ ảnh** từng ảnh.
  - Ảnh đang chờ/lỗi xóa được (nút Xóa ở ô ảnh, nút "Bỏ ảnh" ở ảnh lỗi chờ tải).
  - Nút **Lưu nháp** là nút thật (thử tải lại rồi về danh sách).
  - Khuyến nghị QA mở app bằng Safari/Chrome (Thêm vào màn hình chính), không mở trong Zalo.
- **v1.8 (16/11/2026):** PDF IE **vẽ trực tiếp bằng canvas** (bỏ html2canvas – nguyên nhân chữ lệch ô khi trình duyệt tải font Noto Sans KR / Nanum Gothic Coding): chữ căn giữa bằng textBaseline 'middle', chờ font tải xong mới vẽ. Excel IE: dòng STYLE NO. cao 30, dòng tiêu đề vàng 36, mọi ô căn giữa ngang + dọc.
- **v1.7 (16/11/2026, chốt theo chị):** Men – **PRESENTATION và DEFECT PICTURE luôn ở khung bên phải** như mẫu HZSH6E201, kể cả đơn 10–12 màu: khung chia lưới 2–4 cột (1 ảnh / ≤4 / ≤9 / >9), cột I–L nới lên 14 (18 khi > 4 ảnh), tự nới chiều cao các dòng trống trong khung khi thiếu chỗ. CARTON PHOTO dưới chữ ký: 3 ô/hàng (A–F), > 3 ảnh thì 6 ô/hàng (A–L).
- **v1.6 (16/11/2026):** Final report chèn ảnh dạng **ô ảnh đều nhau**: mỗi ô cùng kích thước, viền mảnh, nền trắng, dải chú thích xám dưới ảnh (màu / lot / Side label / Hangtag / tên lỗi (mức độ) – vị trí). Ladies: Style Photo 6 ô/hàng (ảnh cắt vừa khung 3:4), Defective Photo 4 ô/hàng, Accessory 6 ô/hàng (giữ trọn ảnh); mác giống nhau giữa các lot gộp 1 ô ghi các lot. Men: nới cột I–L lên 14, PRESENTATION dùng vùng I4 → trên Style Confirmation, DEFECT PICTURE tới trên QA Auditor, khối CARTON PHOTO (tiêu đề xám) 3 ô/hàng dưới chữ ký. Ô ảnh vẽ bằng canvas ở độ phân giải ×2.
- **v1.5 (15/11/2026):**
  - Ảnh **dùng chung theo style × màu** (set_id = null): gập gói, thẻ bài, thân trước, **mặt thùng có tem** (kind `carton`, Men, 1 ảnh/màu). **Riêng lot**: mác sườn + ảnh lỗi. Màn hình chụp chia 2 khối "Riêng lot" / "Dùng chung mọi lot".
  - **Dùng lại ảnh mác** của lot khác cùng màu (chèn dòng ảnh trỏ cùng file, size_bytes 0; xóa file chỉ khi không còn dòng nào dùng). Mác khác thì chụp mới.
  - **Tự lưu nháp**: hàng chờ IndexedDB (lib/queue.ts) – ảnh lưu máy trước, tự tải lên khi có mạng, thử lại mỗi 15s/khi online, cảnh báo khi rời trang; badge ● Đã lưu / Chờ tải n / Lỗi – Thử lại. Form ảnh lỗi tự lưu + khôi phục. Xóa ảnh có Hoàn tác 10 giây. Gửi duyệt + cảnh báo ảnh mờ dùng hộp thoại trong app (bỏ window.confirm – bị chặn trong trình duyệt Zalo, là nguyên nhân lỗi "không xóa được ảnh lỗi").
  - Xóa ảnh báo lỗi rõ khi không có quyền (bộ ảnh đã gửi/duyệt).
  - Vị trí lỗi luôn hiển thị/lưu tiếng Anh (code đổi tên cũ tiếng Việt), SQL update_v1.5.sql gồm cả phần v1.3.
  - PDF IE: chữ căn giữa ô (line-height cố định).
  - Final: Accessory = mác từng lot (bỏ trùng) + thẻ bài dùng chung; Men PRESENTATION = gập gói dùng chung, ảnh thùng = carton (fallback carton_face cũ).
- **v1.4 (14/11/2026):** **Cảnh báo BPO date** trên trang Admin: JO × màu chưa duyệt ảnh khi còn ≤ 5 ngày tới BPOD; hạn gửi báo cáo buyer = BPOD − 2 ngày (nhãn: Quá hạn gửi buyer N ngày / Hôm nay phải gửi buyer / Còn N ngày). Có ô KPI, khối cảnh báo (8 dòng đầu, xem tất cả), cột BPOD tô màu, bộ lọc "Sắp đến BPOD". Tham số trong lib/config.ts (BPO_ALERT_DAYS=5, BPO_SEND_DAYS=2).
- **v1.3 (14/11/2026):** khối **Defect Photo – Ảnh lỗi** nổi bật trong phần Final của màn hình chụp (xem 3 ảnh gần nhất + nút đỏ "+ Chụp / thêm ảnh lỗi"); vị trí lỗi đổi sang **tiếng Anh**; nhãn màn hình ảnh lỗi song ngữ; file `supabase/update_v1.3.sql` để đổi dữ liệu cũ.
- **v1.2 (13/11/2026):** màn hình **Cắt ảnh** (tự đặt khung: mác/nhãn/thẻ = vùng trắng lớn nhất, gập gói/áo/thùng = tách nền theo màu viền; kéo 4 góc, Xoay 90°, Tự cắt lại, Không cắt, Dùng ảnh) cho mọi loại ảnh kể cả ảnh lỗi; IE tách nút **Xuất Excel** / **Xuất PDF**; trang **Admin → Final report**: upload 1 hoặc nhiều file GQS → đọc JO (B6) + màu (B8) → bảng kiểm thiếu ảnh / chưa duyệt → **Chèn ảnh & tải Excel** (file *_anh.xlsx). Ảnh chưa duyệt vẫn được chèn (có cảnh báo).
- **v1.1 (12/11/2026):** mọi ô ảnh (mác, gập gói, thẻ bài, thân trước, thùng) và ảnh lỗi đều có 2 nút **Chụp** (camera sau) và **Album** (chọn ảnh có sẵn trong điện thoại). Ảnh từ album vẫn được nén 1600px + kiểm tra mờ/tối như ảnh chụp. Ảnh HEIC không đọc được → báo hướng dẫn đổi camera sang JPG.
