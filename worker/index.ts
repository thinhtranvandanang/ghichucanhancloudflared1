import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { D1Database, Fetcher } from '@cloudflare/workers-types';
import firebaseConfig from '../firebase-applet-config.json';
import { verifyFirebaseIdToken } from '../shared/firebaseJwt';

export type WorkerBindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  FIREBASE_PROJECT_ID?: string;
  AUTH_SECRET?: string;
};

interface SessionUser {
  email: string;
  name: string;
}

type AppEnv = {
  Bindings: WorkerBindings;
  Variables: {
    user?: SessionUser;
  };
};

interface NoteRow {
  id: number;
  user_email: string;
  title: string;
  content: string;
  created_at: string;
}

interface SessionRow {
  session_id: string;
  email: string;
  name: string;
  expires_at: number;
}

const SESSION_COOKIE_NAME = 'sotay_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

async function hashSessionId(sessionId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret || 'sotay-default-session-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const app = new Hono<AppEnv>();

// Xác thực bằng Firebase ID Token (đăng nhập Gmail từ Firebase Auth)
app.post('/auth/firebase', async (c) => {
  let body: { idToken?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Dữ liệu đăng nhập không hợp lệ.' }, 400);
  }

  const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
  if (!idToken) {
    return c.json({ error: 'Thiếu mã xác thực Firebase.' }, 400);
  }

  const projectId = (c.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId).trim();
  const authSecret = c.env.AUTH_SECRET || projectId;

  try {
    const firebaseUser = await verifyFirebaseIdToken(idToken, projectId);
    const sessionId = crypto.randomUUID();
    const hashedId = await hashSessionId(sessionId, authSecret);
    const nowIso = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    await c.env.DB.prepare(
      `INSERT INTO sessions (session_id, email, name, credential, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(hashedId, firebaseUser.email, firebaseUser.name, 'firebase', nowIso, expiresAt)
      .run();

    const url = new URL(c.req.url);
    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: url.protocol === 'https:',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return c.json({
      authenticated: true,
      user: {
        email: firebaseUser.email,
        name: firebaseUser.name,
      },
    });
  } catch (err) {
    console.error('Lỗi xác thực Firebase ID Token:', err);
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Không thể xác thực tài khoản Gmail. Vui lòng thử lại.',
      },
      401
    );
  }
});

// Đăng xuất: xóa phiên trong D1 và xóa cookie
async function handleSignOut(c: Context<AppEnv>) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  const projectId = (c.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId).trim();
  const authSecret = c.env.AUTH_SECRET || projectId;

  if (sessionId) {
    const hashedId = await hashSessionId(sessionId, authSecret);
    await c.env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(hashedId).run();
  }

  const url = new URL(c.req.url);
  setCookie(c, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: 0,
  });

  return c.json({ success: true });
}

app.post('/auth/signout', handleSignOut);
app.get('/auth/signout', async (c) => {
  await handleSignOut(c);
  return c.redirect('/');
});

// Middleware đọc phiên từ cookie HttpOnly cho toàn bộ /api/*
app.use('/api/*', async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    const projectId = (c.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId).trim();
    const authSecret = c.env.AUTH_SECRET || projectId;
    const hashedId = await hashSessionId(sessionId, authSecret);
    const now = Math.floor(Date.now() / 1000);

    try {
      const row = await c.env.DB.prepare(
        'SELECT session_id, email, name, expires_at FROM sessions WHERE session_id = ?'
      )
        .bind(hashedId)
        .first<SessionRow>();

      if (row) {
        if (row.expires_at > now) {
          c.set('user', { email: row.email, name: row.name });
        } else {
          await c.env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(hashedId).run();
        }
      }
    } catch (err) {
      console.error('Lỗi đọc phiên D1:', err);
    }
  }

  await next();
});

// Kiểm tra trạng thái đăng nhập hiện tại
app.get('/api/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ authenticated: false });
  }
  return c.json({
    authenticated: true,
    user,
  });
});

// Middleware bắt buộc đăng nhập cho mọi thao tác ghi chú
app.use('/api/notes*', async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng Gmail.' },
      401
    );
  }
  await next();
});

// Lấy danh sách ghi chú của người dùng (mới nhất lên đầu) + tìm kiếm theo từ khóa
app.get('/api/notes', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  const query = (c.req.query('q') || '').trim();

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, user_email, title, content, created_at
       FROM notes
       WHERE user_email = ?
       ORDER BY created_at DESC, id DESC`
    )
      .bind(user.email)
      .all<NoteRow>();

    let notes = result.results || [];

    if (query.length > 0) {
      const keyword = query.toLocaleLowerCase('vi-VN');
      notes = notes.filter((note) => {
        const titleLower = note.title.toLocaleLowerCase('vi-VN');
        const contentLower = note.content.toLocaleLowerCase('vi-VN');
        return titleLower.includes(keyword) || contentLower.includes(keyword);
      });
    }

    return c.json({ notes });
  } catch (err) {
    console.error('Lỗi đọc ghi chú D1:', err);
    return c.json({ error: 'Không thể tải danh sách ghi chú. Vui lòng thử lại.' }, 500);
  }
});

// Tạo ghi chú mới (created_at do server tự sinh theo chuẩn ISO 8601)
app.post('/api/notes', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  let body: { title?: unknown; content?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!title) {
    return c.json({ error: 'Vui lòng nhập tiêu đề ghi chú.' }, 400);
  }
  if (!content) {
    return c.json({ error: 'Vui lòng nhập nội dung ghi chú.' }, 400);
  }
  if (title.length > 200) {
    return c.json({ error: 'Tiêu đề tối đa 200 ký tự.' }, 400);
  }

  const createdAt = new Date().toISOString();

  try {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO notes (user_email, title, content, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id, user_email, title, content, created_at`
    )
      .bind(user.email, title, content, createdAt)
      .first<NoteRow>();

    return c.json({ note: inserted }, 201);
  } catch (err) {
    console.error('Lỗi tạo ghi chú D1:', err);
    return c.json({ error: 'Không thể lưu ghi chú. Vui lòng thử lại.' }, 500);
  }
});

// Cập nhật ghi chú của chính người dùng
app.put('/api/notes/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'Mã ghi chú không hợp lệ.' }, 400);
  }

  let body: { title?: unknown; content?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!title) {
    return c.json({ error: 'Vui lòng nhập tiêu đề ghi chú.' }, 400);
  }
  if (!content) {
    return c.json({ error: 'Vui lòng nhập nội dung ghi chú.' }, 400);
  }
  if (title.length > 200) {
    return c.json({ error: 'Tiêu đề tối đa 200 ký tự.' }, 400);
  }

  try {
    const updated = await c.env.DB.prepare(
      `UPDATE notes
       SET title = ?, content = ?
       WHERE id = ? AND user_email = ?
       RETURNING id, user_email, title, content, created_at`
    )
      .bind(title, content, id, user.email)
      .first<NoteRow>();

    if (!updated) {
      return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền sửa.' }, 404);
    }

    return c.json({ note: updated });
  } catch (err) {
    console.error('Lỗi cập nhật ghi chú D1:', err);
    return c.json({ error: 'Không thể cập nhật ghi chú. Vui lòng thử lại.' }, 500);
  }
});

// Xóa ghi chú của chính người dùng
app.delete('/api/notes/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'Mã ghi chú không hợp lệ.' }, 400);
  }

  try {
    const deleted = await c.env.DB.prepare(
      `DELETE FROM notes
       WHERE id = ? AND user_email = ?
       RETURNING id`
    )
      .bind(id, user.email)
      .first<{ id: number }>();

    if (!deleted) {
      return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền xóa.' }, 404);
    }

    return c.json({ success: true, id: deleted.id });
  } catch (err) {
    console.error('Lỗi xóa ghi chú D1:', err);
    return c.json({ error: 'Không thể xóa ghi chú. Vui lòng thử lại.' }, 500);
  }
});

// Phục vụ các file tĩnh frontend đã build từ Vite
app.all('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(
    c.req.raw as unknown as Parameters<Fetcher['fetch']>[0]
  );
  return assetResponse as unknown as Response;
});

export default app;
