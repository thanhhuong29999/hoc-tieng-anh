/* Cấu hình app. Điền 2 giá trị này theo hướng dẫn trong README.md. */
window.APP_CONFIG = {
  // Client ID lấy từ Google Cloud Console (dạng: 1234567890-abc...apps.googleusercontent.com).
  // Để trống thì app vẫn chạy, chỉ lưu tiến độ trên máy, không có nút đăng nhập Google.
  GOOGLE_CLIENT_ID: "",

  // Địa chỉ máy chủ AI (Cloudflare Worker trong thư mục worker/), ví dụ:
  // "https://hoc-tieng-anh-ai.ten-ban.workers.dev"
  // Để trống thì tab Tập nói sẽ báo chưa bật AI.
  AI_ENDPOINT: ""
};
