# Kế Toán Nói Tiếng Anh

App học tiếng Anh cho kế toán xuất nhập khẩu mất gốc: 90 ngày × 15 từ, ôn tập theo lịch (1, 3, 7, 16 ngày), kiểm tra có độ khó tăng dần và tập nói với AI đóng vai sếp và đối tác.

**Tiến độ tự sao lưu vào Google Drive của chính người học.** Người học bấm "Đăng nhập Google" một lần. Sau đó app tự lấy tiến độ khi mở và tự lưu sau mỗi lần học. Học trên máy nào cũng tiếp tục đúng chỗ cũ. Nếu không đăng nhập, app vẫn chạy và lưu trên máy đang dùng.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html`, `style.css` | Giao diện |
| `data.js` | Từ vựng 90 ngày, câu cứu cánh, danh sách tình huống |
| `app.js` | Học thẻ, ôn tập, kiểm tra, tập nói |
| `sync.js` | Đăng nhập Google và đồng bộ với Drive (quyền `drive.file`: chỉ thấy file do app tạo) |
| `config.js` | **Nơi điền Client ID và địa chỉ máy chủ AI** |
| `worker/` | Máy chủ AI (Cloudflare Worker): giữ kín khoá API, chỉ cho người đã đăng nhập Google dùng |

## Cài đặt (một lần, đều miễn phí trừ phí AI)

### Bước 1: Đưa app lên GitHub Pages
1. Đẩy code lên repo GitHub, ví dụ `thanhhuong29999/hoc-tieng-anh`.
2. Vào repo, chọn **Settings → Pages → Build and deployment**, ở mục Source chọn **Deploy from a branch**, Branch chọn **main** và thư mục **/ (root)**, rồi bấm **Save**.
3. Vài phút sau app có địa chỉ `https://thanhhuong29999.github.io/hoc-tieng-anh/`.

> Lưu ý: GitHub Pages của repo **private** chỉ dùng được với gói GitHub trả phí. Với gói miễn phí thì để repo **public**. Code không chứa khoá bí mật nào nên để public vẫn an toàn.

### Bước 2: Tạo Client ID cho nút "Đăng nhập Google"
1. Vào https://console.cloud.google.com, tạo project mới (ví dụ "Hoc Tieng Anh").
2. **APIs & Services → Library**: tìm **Google Drive API** và bấm **Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type: **External**.
   - Điền tên app, email hỗ trợ.
   - Scopes: thêm `.../auth/drive.file`, `openid`, `email`.
   - **Test users** (Audience): thêm Gmail của từng người học, tối đa 100 người khi app ở chế độ Testing.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `https://thanhhuong29999.github.io` (thêm `http://localhost:8000` nếu muốn chạy thử trên máy).
5. Copy **Client ID** và dán vào `GOOGLE_CLIENT_ID` trong `config.js`.

> Muốn mọi Gmail đều đăng nhập được, không giới hạn 100 người: ở OAuth consent screen bấm **Publish app**. Vì `drive.file` là quyền không nhạy cảm, thường chỉ cần Google xác minh thương hiệu (tên, logo, trang chính sách quyền riêng tư).

### Bước 3: Dựng máy chủ AI (Cloudflare Worker)
1. Tạo tài khoản miễn phí tại https://dash.cloudflare.com.
2. Trên máy có Node.js, mở thư mục `worker/`:
   ```bash
   npx wrangler login
   npx wrangler secret put AI_API_KEY      # dán khoá API của bạn khi được hỏi
   npx wrangler deploy
   ```
3. Mở `worker/wrangler.toml` và sửa trước khi deploy:
   - `GOOGLE_CLIENT_ID`: giống trong config.js.
   - `ALLOWED_ORIGIN`: `https://thanhhuong29999.github.io`.
   - `AI_MODEL`: tên model bạn dùng.
   - Nếu không dùng OpenAI: thêm `AI_BASE_URL` (địa chỉ API kiểu OpenAI của hãng bạn dùng).
4. Copy địa chỉ worker sau khi deploy (dạng `https://hoc-tieng-anh-ai.<tên>.workers.dev`) và dán vào `AI_ENDPOINT` trong `config.js`.

**Kiểm soát chi phí AI (nên làm):**
- `ALLOWED_EMAILS`: chỉ những Gmail trong danh sách mới dùng được phần Tập nói.
- `DAILY_LIMIT` cùng KV `USAGE`: giới hạn số lượt AI trả lời mỗi người mỗi ngày (mặc định 80). Tạo KV bằng `npx wrangler kv namespace create USAGE` rồi điền id vào `wrangler.toml`.
- Đặt hạn mức chi tiêu tháng ngay trong trang quản lý khoá API của hãng AI.

### Bước 4: Đẩy config.js đã điền lên GitHub
Client ID và địa chỉ worker không phải bí mật. **Khoá API thì tuyệt đối không ghi vào file nào trong repo**, chỉ đặt bằng `wrangler secret`.

## Chạy thử trên máy
```bash
python3 -m http.server 8000
```
Sau đó mở http://localhost:8000. Muốn thử đăng nhập Google trên máy thì cần thêm `http://localhost:8000` vào Authorized JavaScript origins.

## Dữ liệu tiến độ
- Lưu trong file `hoc-tieng-anh-tien-do.json` ở Google Drive của người học. Người học thấy được file này. **Xoá file này là mất tiến độ.**
- Mỗi từ lưu: mức nhớ (0–4), lần ôn gần nhất, số lần sai, số lần gặp. Khi học trên nhiều máy, app giữ bản ghi mới nhất của từng từ.
- "Đăng xuất" trên app sẽ xoá tiến độ khỏi máy đang dùng (nên làm với máy dùng chung). Dữ liệu trên Drive vẫn còn.
- Tiến độ ở bản thử trên claude.ai nằm ở chỗ khác nên không tự chuyển sang bản này.
