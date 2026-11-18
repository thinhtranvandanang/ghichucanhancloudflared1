-- Bảng lưu trữ ghi chú cá nhân
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Chỉ mục tối ưu truy vấn theo email và sắp xếp mới nhất lên đầu
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_email, created_at DESC);

-- Bảng lưu trữ phiên đăng nhập (dùng cho hono-simple-google-auth trên D1, không cần KV)
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  credential TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
