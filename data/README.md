# Thư mục `data/` — nơi bỏ file thật vào

> ⚠️ **Lưu ý bảo mật:** Mọi file trong `data/projects/` và `data/customers/` **đã được `.gitignore` loại trừ** khỏi git, vì chứa thông tin nội bộ chủ đầu tư hoặc dữ liệu cá nhân khách hàng (PII). Không có cách nào vô tình commit dữ liệu thật lên git public.

---

## 1. `data/projects/` — Hồ sơ dự án bất động sản

**Bỏ vào đây:** mọi tài liệu mô tả dự án mà bạn muốn agent học để tư vấn khách.

### Định dạng nên dùng (ưu tiên giảm dần)

| Định dạng | Khuyến nghị | Lý do |
|---|---|---|
| **Markdown** (`.md`) | ⭐⭐⭐ tốt nhất | Sạch, parse dễ, agent đọc chính xác nhất |
| **PDF text-based** (`.pdf`) | ⭐⭐ tốt | Hầu hết brochure CĐT đều ở dạng này |
| **Word** (`.docx`) | ⭐⭐ tốt | Trích text dễ, giữ heading & bảng |
| **PDF scan ảnh** | ⭐ kém | Cần OCR thêm, độ chính xác giảm |
| **PowerPoint** (`.pptx`) | ⭐ kém | Layout phức tạp, agent dễ hiểu sai bố cục |

### Cách tổ chức

Tạo **1 thư mục con cho mỗi dự án**, đặt tên ngắn không dấu (slug):

```
data/projects/
├── the-grand-tower/
│   ├── brochure.pdf
│   ├── bang-gia.xlsx           ← bảng giá chi tiết
│   ├── chinh-sach-ban-hang.docx
│   ├── faq.md                  ← câu hỏi thường gặp (tự viết)
│   └── phap-ly.pdf
├── sunset-villas/
│   └── ...
└── README.md                   ← ghi chú nội bộ cho thư mục này (tuỳ chọn)
```

### Nội dung khuyến khích cho mỗi dự án

Càng đầy đủ, agent càng trả lời chính xác:

- ✅ **Thông tin chung:** tên dự án, chủ đầu tư, vị trí, loại hình, tiến độ
- ✅ **Bảng giá:** giá theo loại căn (1PN, 2PN…), chính sách chiết khấu
- ✅ **Mặt bằng:** sơ đồ tầng, diện tích từng căn, hướng
- ✅ **Pháp lý:** loại sổ, giấy phép, bảo lãnh ngân hàng
- ✅ **Tiện ích:** nội khu, ngoại khu
- ✅ **Chính sách thanh toán:** đợt cọc, đợt thanh toán theo tiến độ, hỗ trợ vay
- ✅ **FAQ:** câu hỏi khách hay hỏi và cách trả lời mẫu

### Thông tin TUYỆT ĐỐI KHÔNG bỏ vào

- ❌ Tỷ lệ hoa hồng cho sale
- ❌ Giá vốn / lợi nhuận chủ đầu tư
- ❌ Chiến lược truyền thông nội bộ
- ❌ Hợp đồng đại lý / hợp tác

Agent sẽ học mọi thứ trong thư mục → nếu vô tình lộ thông tin nội bộ ra khách thì rất tệ.

---

## 2. `data/customers/` — Danh sách khách hàng

**Bỏ vào đây:** danh sách khách quan tâm xuất từ Google Trang tính, Excel hoặc CRM cũ.

### Định dạng nên dùng

| Định dạng | Khuyến nghị |
|---|---|
| **CSV UTF-8** (`.csv`) | ⭐⭐⭐ tốt nhất — parse đơn giản, không lệch encoding |
| **Excel** (`.xlsx`) | ⭐⭐ tốt — đọc được, nhưng cần script trích sheet đúng |
| **Google Trang tính** | Xuất ra CSV (File → Tải xuống → Giá trị được phân tách bằng dấu phẩy) |

### Cấu trúc cột tối thiểu

Cột bắt buộc (header dòng đầu, tiếng Việt hoặc tiếng Anh — đều được):

| Cột | Bắt buộc | Ví dụ |
|---|---|---|
| `họ_tên` hoặc `full_name` | ✅ | Nguyễn Văn A |
| `số_điện_thoại` hoặc `phone` | ✅ (ít nhất 1 trong phone/email) | 0900000000 |
| `email` | ✅ (ít nhất 1 trong phone/email) | a@example.com |
| `dự_án_quan_tâm` hoặc `interested_project` | ⭐ nên có | the-grand-tower |
| `nguồn` hoặc `source` | ⭐ nên có | Facebook Ads / Form web / Sự kiện |
| `ghi_chú` hoặc `notes` | tuỳ chọn | Quan tâm 2PN, ngân sách 15 tỷ |

### Ví dụ file CSV mẫu

```csv
họ_tên,số_điện_thoại,email,dự_án_quan_tâm,nguồn,ghi_chú
Nguyễn Văn A,0900000000,a@example.com,the-grand-tower,Facebook Ads,Quan tâm 2PN ngân sách 15 tỷ
Trần Thị B,0911111111,,the-grand-tower,Form web,Đã xem nhà mẫu
```

### Lưu ý PII

- Mọi file trong `data/customers/` được `.gitignore` loại trừ → **không bao giờ commit lên git**
- Khi không còn dùng đến → xoá file (luật Bảo vệ Dữ liệu Cá nhân yêu cầu xoá khi hết mục đích)
- Trên máy chia sẻ, nên mã hoá ổ đĩa (FileVault trên macOS)

---

## 3. `data/sample_projects/` — Dữ liệu giả

Các file `.md` ở đây là **dữ liệu giả lập** dùng để dev/test agent (vd: `the-grand-tower.md`). KHÔNG xoá — tests và demo phụ thuộc vào chúng. Có commit lên git được.

---

## 4. Đường dẫn tuyệt đối để bỏ file vào

```
/Users/phamvanthu/Documents/Agent-Proptech/data/projects/
/Users/phamvanthu/Documents/Agent-Proptech/data/customers/
```

Sau khi anh bỏ file vào, báo lại để chạy 2 script nạp dữ liệu (xem mục 5).

---

## 5. Kế hoạch script nạp dữ liệu (sẽ viết khi có file thật)

### 5.1 Script `scripts/ingest_projects.py` — Nạp hồ sơ dự án vào knowledge base

**Đầu vào:** mọi file trong `data/projects/<slug>/`
**Đầu ra:** lưu vào DB (giai đoạn 1: SQLite/JSON; giai đoạn 2: Postgres + pgvector)

Quy trình:

1. **Duyệt mỗi sub-folder** = 1 dự án (slug = tên folder)
2. **Trích text theo loại file:**
   - `.md` → đọc thẳng
   - `.pdf` → dùng `pypdf` (text-based) hoặc `pdfplumber` (giữ bảng)
   - `.docx` → dùng `python-docx`
   - `.xlsx` → dùng `openpyxl` → CSV-style text
   - `.pdf` scan → cảnh báo người dùng, cần OCR (`tesseract` qua `pytesseract`) — chưa làm ở giai đoạn 1
3. **Chunk text** thành đoạn ~500 token (giữ ngắt theo heading nếu có)
4. **Embed** mỗi chunk → vector
   - Giai đoạn 1: lưu metadata + raw text, agent stuff vào prompt trực tiếp (Claude 200k context dư sức 5-10 tài liệu nhỏ)
   - Giai đoạn 2: thật sự embed bằng Voyage `voyage-multilingual-2` hoặc OpenAI `text-embedding-3-small`
5. **Lưu vào** `project_documents` + `project_chunks`
6. **Idempotent:** chạy lại không tạo trùng — hash content, chỉ cập nhật khi đổi

**Cách chạy (dự kiến):**
```bash
cd apps/agent-engine
source .venv/bin/activate
python ../../scripts/ingest_projects.py --project the-grand-tower
# hoặc nạp tất cả
python ../../scripts/ingest_projects.py --all
```

**Thư viện cần thêm vào `requirements.txt`:** `pypdf`, `python-docx`, `openpyxl`, `tiktoken` (đếm token).

### 5.2 Script `scripts/import_customers.py` — Import lead từ CSV/Excel

**Đầu vào:** mọi `.csv` / `.xlsx` trong `data/customers/`
**Đầu ra:** insert vào bảng `leads` (qua API `POST /leads` hoặc trực tiếp DB)

Quy trình:

1. **Đọc file** — auto-detect encoding (UTF-8, UTF-8-BOM, Windows-1258 thường có trên file VN cũ)
2. **Map cột thông minh** — chấp nhận tên cột tiếng Việt có dấu / không dấu / tiếng Anh (`họ_tên` ↔ `ho_ten` ↔ `full_name`)
3. **Validate từng dòng:**
   - Chuẩn hoá số điện thoại VN (`+84...` → `0...`, loại bỏ space/`-`)
   - Validate email cơ bản
   - Bỏ dòng thiếu cả phone lẫn email
4. **Dedupe:** nếu phone hoặc email đã tồn tại trong DB → cập nhật thay vì insert
5. **Báo cáo:** in ra "Đã import X lead mới, Y cập nhật, Z bỏ qua vì thiếu liên hệ"
6. **Idempotent:** chạy lại file cũ không nhân đôi lead

**Cách chạy (dự kiến):**
```bash
python ../../scripts/import_customers.py data/customers/khach-q2-2026.csv
# hoặc auto-detect mọi file mới
python ../../scripts/import_customers.py --auto
```

**Thư viện cần thêm:** `pandas` (đọc CSV/Excel linh hoạt), `phonenumbers` (chuẩn hoá SĐT VN), `email-validator`.

### 5.3 Khi nào viết 2 script này?

**Khi anh bỏ file thật vào.** Lúc đó tôi sẽ:
1. Đọc 1-2 file mẫu để hiểu cấu trúc thật (cột tên gì, encoding ra sao, PDF scan hay text-based)
2. Viết script bám sát dữ liệu thật → ít bug giả định
3. Chạy thử trên 1 file, in báo cáo, anh review trước khi nạp toàn bộ

Viết script trước khi có file thật rất dễ sai vì không biết:
- Cột Excel thật tên là gì (CSV xuất từ Google Sheets có thể có `Họ và tên` thay vì `họ_tên`)
- PDF có phải scan không
- Có tài liệu ngoại ngữ không

---

## 6. Tóm tắt nhanh

| Loại file | Bỏ vào | Có commit không? |
|---|---|---|
| Brochure / FAQ dự án (PDF, Word, MD) | `data/projects/<slug>/` | ❌ KHÔNG (đã .gitignore) |
| Danh sách khách hàng (CSV, Excel) | `data/customers/` | ❌ KHÔNG (đã .gitignore) |
| Dữ liệu giả lập cho demo/test | `data/sample_projects/` | ✅ Có |
