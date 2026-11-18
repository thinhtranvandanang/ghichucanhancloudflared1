import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import firebaseConfig from './firebase-applet-config.json';
import { verifyFirebaseIdToken } from './shared/firebaseJwt';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Khởi tạo SQLite cục bộ chạy đúng schema.sql của Cloudflare D1 cho môi trường xem trước
const dbPath = path.resolve(process.cwd(), '.local-dev.sqlite');
const sqlite = new DatabaseSync(dbPath);
const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'schema.sql'), 'utf-8');
sqlite.exec(schemaSql);

const SESSION_COOKIE_NAME = 'sotay_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const FIREBASE_PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId).trim();
const AUTH_SECRET = process.env.AUTH_SECRET || FIREBASE_PROJECT_ID;

function hashSessionId(sessionId: string): string {
  return crypto.createHmac('sha256', AUTH_SECRET).update(sessionId).digest('hex');
}

interface SessionUser {
  email: string;
  name: string;
}

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

type AppEnv = {
  Variables: {
    user?: SessionUser;
  };
};

const honoApp = new Hono<AppEnv>();

honoApp.post('/auth/firebase', async (c) => {
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

  try {
    const firebaseUser = await verifyFirebaseIdToken(idToken, FIREBASE_PROJECT_ID);
    const sessionId = crypto.randomUUID();
    const hashedId = hashSessionId(sessionId);
    const nowIso = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    sqlite
      .prepare(
        `INSERT INTO sessions (session_id, email, name, credential, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(hashedId, firebaseUser.email, firebaseUser.name, 'firebase', nowIso, expiresAt);

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

async function handleSignOut(c: Context<AppEnv>) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    const hashedId = hashSessionId(sessionId);
    sqlite.prepare('DELETE FROM sessions WHERE session_id = ?').run(hashedId);
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

honoApp.post('/auth/signout', handleSignOut);
honoApp.get('/auth/signout', async (c) => {
  await handleSignOut(c);
  return c.redirect('/');
});

honoApp.use('/api/*', async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    const hashedId = hashSessionId(sessionId);
    const now = Math.floor(Date.now() / 1000);
    const row = sqlite
      .prepare('SELECT session_id, email, name, expires_at FROM sessions WHERE session_id = ?')
      .get(hashedId) as SessionRow | undefined;

    if (row) {
      if (row.expires_at > now) {
        c.set('user', { email: row.email, name: row.name });
      } else {
        sqlite.prepare('DELETE FROM sessions WHERE session_id = ?').run(hashedId);
      }
    }
  }
  await next();
});

honoApp.get('/api/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ authenticated: false });
  }
  return c.json({
    authenticated: true,
    user,
  });
});

honoApp.use('/api/notes*', async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng Gmail.' },
      401
    );
  }
  await next();
});

honoApp.get('/api/notes', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  const query = (c.req.query('q') || '').trim();
  const rows = sqlite
    .prepare(
      `SELECT id, user_email, title, content, created_at
       FROM notes
       WHERE user_email = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(user.email) as unknown as NoteRow[];

  let notes = rows;
  if (query.length > 0) {
    const keyword = query.toLocaleLowerCase('vi-VN');
    notes = rows.filter(
      (note) =>
        note.title.toLocaleLowerCase('vi-VN').includes(keyword) ||
        note.content.toLocaleLowerCase('vi-VN').includes(keyword)
    );
  }

  return c.json({ notes });
});

honoApp.post('/api/notes', async (c) => {
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
  const inserted = sqlite
    .prepare(
      `INSERT INTO notes (user_email, title, content, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id, user_email, title, content, created_at`
    )
    .get(user.email, title, content, createdAt) as unknown as NoteRow;

  return c.json({ note: inserted }, 201);
});

honoApp.put('/api/notes/:id', async (c) => {
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

  const updated = sqlite
    .prepare(
      `UPDATE notes
       SET title = ?, content = ?
       WHERE id = ? AND user_email = ?
       RETURNING id, user_email, title, content, created_at`
    )
    .get(title, content, id, user.email) as unknown as NoteRow | undefined;

  if (!updated) {
    return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền sửa.' }, 404);
  }

  return c.json({ note: updated });
});

honoApp.delete('/api/notes/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Chưa đăng nhập.' }, 401);
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'Mã ghi chú không hợp lệ.' }, 400);
  }

  const deleted = sqlite
    .prepare(
      `DELETE FROM notes
       WHERE id = ? AND user_email = ?
       RETURNING id`
    )
    .get(id, user.email) as unknown as { id: number } | undefined;

  if (!deleted) {
    return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền xóa.' }, 404);
  }

  return c.json({ success: true, id: deleted.id });
});

async function startServer() {
  const expressApp = express();
  expressApp.set('trust proxy', true);

  expressApp.use(['/api', '/auth'], async (req, res, next) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
      const fullUrl = `${proto}://${host}${req.originalUrl}`;

      const chunks: Buffer[] = [];
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
      }
      const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }

      const webReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body: bodyBuffer,
      });

      const webRes = await honoApp.fetch(webReq);
      res.status(webRes.status);

      const setCookies =
        typeof (webRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
          ? (webRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : [];

      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        res.setHeader(key, value);
      });

      if (setCookies.length > 0) {
        res.setHeader('Set-Cookie', setCookies);
      } else {
        const singleCookie = webRes.headers.get('set-cookie');
        if (singleCookie) {
          res.setHeader('Set-Cookie', singleCookie);
        }
      }

      const arrayBuf = await webRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      next(err);
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    expressApp.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    expressApp.use(express.static(distDir));
    expressApp.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  expressApp.listen(PORT, '0.0.0.0', () => {
    console.log(`Sổ Tay Nhanh đang chạy tại http://localhost:${PORT}`);
  });
}

startServer();
