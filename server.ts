import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  honoSimpleGoogleAuth,
  type GoogleAuthEnv,
} from 'hono-simple-google-auth';

interface ValidSessionData {
  signedIn: true;
  sessionId: string;
  name: string;
  email: string;
  credential: string;
}

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Khởi tạo SQLite cục bộ chạy đúng schema.sql của Cloudflare D1 cho môi trường xem trước
const dbPath = path.resolve(process.cwd(), '.local-dev.sqlite');
const sqlite = new DatabaseSync(dbPath);
const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'schema.sql'), 'utf-8');
sqlite.exec(schemaSql);

const SESSION_COOKIE_NAME = 'sotay_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_SECRET = process.env.AUTH_SECRET || 'local-dev-secret-so-tay-nhanh-2026';
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();

const hasRealGoogleClient =
  GOOGLE_CLIENT_ID.length > 0 &&
  !GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID');

function hashSessionId(sessionId: string): string {
  return crypto.createHmac('sha256', AUTH_SECRET).update(sessionId).digest('hex');
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
  credential: string;
  created_at: string;
  expires_at: number;
}

const sqliteSessionStore = {
  async get(sessionId: string): Promise<ValidSessionData | undefined> {
    const hashedId = hashSessionId(sessionId);
    const now = Math.floor(Date.now() / 1000);
    const stmt = sqlite.prepare(
      'SELECT session_id, email, name, credential, expires_at FROM sessions WHERE session_id = ?'
    );
    const row = stmt.get(hashedId) as SessionRow | undefined;
    if (!row) return undefined;

    if (row.expires_at <= now) {
      sqlite.prepare('DELETE FROM sessions WHERE session_id = ?').run(hashedId);
      return undefined;
    }

    return {
      signedIn: true,
      sessionId,
      email: row.email,
      name: row.name,
      credential: row.credential,
    };
  },

  async put(data: ValidSessionData): Promise<void> {
    const hashedId = hashSessionId(data.sessionId);
    const nowIso = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    sqlite
      .prepare(
        `INSERT INTO sessions (session_id, email, name, credential, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           credential = excluded.credential,
           expires_at = excluded.expires_at`
      )
      .run(
        hashedId,
        data.email,
        data.name || data.email,
        data.credential || '',
        nowIso,
        expiresAt
      );
  },

  async delete(sessionId: string): Promise<void> {
    const hashedId = hashSessionId(sessionId);
    sqlite.prepare('DELETE FROM sessions WHERE session_id = ?').run(hashedId);
  },
};

const honoApp = new Hono<GoogleAuthEnv>();

const googleAuth = honoSimpleGoogleAuth<GoogleAuthEnv>(async (c) => {
  const url = new URL(c.req.url);
  const callbackUrl = `${url.protocol}//${url.host}/auth/callback`;
  return {
    clientId: hasRealGoogleClient ? GOOGLE_CLIENT_ID : 'local-preview-client-id',
    callbackUrl,
    cookieName: SESSION_COOKIE_NAME,
    sessionDurationSeconds: SESSION_TTL_SECONDS,
    sessionStore: sqliteSessionStore,
    mode: hasRealGoogleClient ? 'livemode' : 'testmode',
  };
});

honoApp.use('/auth/*', async (c, next) => {
  const url = new URL(c.req.url);

  if (url.pathname === '/auth/signout') {
    const cookieName = hasRealGoogleClient ? SESSION_COOKIE_NAME : 'testmode-session-id';
    const sessionId = getCookie(c, cookieName);
    if (sessionId) {
      await sqliteSessionStore.delete(sessionId);
    }
  }

  await next();

  const setCookieHeader = c.res.headers.get('Set-Cookie');
  if (setCookieHeader) {
    let updated = setCookieHeader;
    if (!/\bHttpOnly\b/i.test(updated)) {
      updated += '; HttpOnly';
    }
    if (url.protocol === 'https:' && !/\bSecure\b/i.test(updated)) {
      updated += '; Secure';
    }
    c.res.headers.set('Set-Cookie', updated);
  }
});

honoApp.route('/auth', googleAuth.routes);
honoApp.use('/api/*', googleAuth.session);

honoApp.get('/api/me', async (c) => {
  const session = c.var.session;
  const url = new URL(c.req.url);
  const loginUri = `${url.protocol}//${url.host}/auth/callback`;
  const mode = hasRealGoogleClient ? 'livemode' : 'testmode';

  if (!session?.signedIn || !session.email) {
    return c.json({
      authenticated: false,
      mode,
      clientId: hasRealGoogleClient ? GOOGLE_CLIENT_ID : '',
      loginUri,
    });
  }

  return c.json({
    authenticated: true,
    mode,
    clientId: hasRealGoogleClient ? GOOGLE_CLIENT_ID : '',
    loginUri,
    user: {
      email: session.email,
      name: session.name || session.email,
    },
  });
});

honoApp.use('/api/notes*', async (c, next) => {
  const session = c.var.session;
  if (!session?.signedIn || !session.email) {
    return c.json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng Gmail.' }, 401);
  }
  await next();
});

honoApp.get('/api/notes', async (c) => {
  const session = c.var.session;
  if (!session?.signedIn) {
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
    .all(session.email) as unknown as NoteRow[];

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
  const session = c.var.session;
  if (!session?.signedIn) {
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
    .get(session.email, title, content, createdAt) as unknown as NoteRow;

  return c.json({ note: inserted }, 201);
});

honoApp.put('/api/notes/:id', async (c) => {
  const session = c.var.session;
  if (!session?.signedIn) {
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
    .get(title, content, id, session.email) as unknown as NoteRow | undefined;

  if (!updated) {
    return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền sửa.' }, 404);
  }

  return c.json({ note: updated });
});

honoApp.delete('/api/notes/:id', async (c) => {
  const session = c.var.session;
  if (!session?.signedIn) {
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
    .get(id, session.email) as unknown as { id: number } | undefined;

  if (!deleted) {
    return c.json({ error: 'Không tìm thấy ghi chú hoặc bạn không có quyền xóa.' }, 404);
  }

  return c.json({ success: true, id: deleted.id });
});

async function startServer() {
  const expressApp = express();
  expressApp.set('trust proxy', true);

  // Chuyển tiếp /api/* và /auth/* sang Hono app
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
