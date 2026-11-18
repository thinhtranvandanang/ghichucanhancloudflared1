interface JwkKey {
  kty: string;
  alg?: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
}

interface JwksCache {
  keys: JwkKey[];
  expiresAt: number;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name: string;
  picture?: string;
}

const FIREBASE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks: JwksCache | null = null;

function base64UrlToUint8Array(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    '='
  );
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const bytes = base64UrlToUint8Array(segment);
  const jsonText = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(jsonText) as T;
}

async function getFirebaseJwks(forceRefresh = false): Promise<JwkKey[]> {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const res = await fetch(FIREBASE_JWK_URL);
  if (!res.ok) {
    throw new Error('Không thể tải khóa công khai xác thực từ Google.');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  const data = (await res.json()) as { keys?: JwkKey[] };
  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('Danh sách khóa công khai Firebase không hợp lệ.');
  }

  cachedJwks = {
    keys: data.keys,
    expiresAt: now + Math.max(60, maxAgeSeconds) * 1000,
  };

  return data.keys;
}

/**
 * Xác thực Firebase ID Token bằng Web Crypto API (RS256), tương thích Cloudflare Workers và Node.js.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId: string
): Promise<VerifiedFirebaseUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token đăng nhập không đúng định dạng.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Thuật toán hoặc mã khóa token không hợp lệ.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }>(payloadB64);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

  if (payload.aud !== expectedProjectId) {
    throw new Error('Token không thuộc dự án Firebase của ứng dụng này.');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Nguồn phát hành token không hợp lệ.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Thiếu mã định danh người dùng trong token.');
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (payload.iat && payload.iat > nowSeconds + 300) {
    throw new Error('Thời gian phát hành token không hợp lệ.');
  }
  if (payload.auth_time && payload.auth_time > nowSeconds + 300) {
    throw new Error('Thời gian xác thực không hợp lệ.');
  }
  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('Tài khoản Google không cung cấp địa chỉ email.');
  }

  let keys = await getFirebaseJwks(false);
  let matchedKey = keys.find((k) => k.kid === header.kid);

  if (!matchedKey) {
    keys = await getFirebaseJwks(true);
    matchedKey = keys.find((k) => k.kid === header.kid);
  }

  if (!matchedKey) {
    throw new Error('Không tìm thấy khóa công khai phù hợp để xác thực token.');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    matchedKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signingInput
  );

  if (!isValid) {
    throw new Error('Chữ ký xác thực Firebase không hợp lệ.');
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  const displayName =
    (typeof payload.name === 'string' && payload.name.trim()) ||
    normalizedEmail.split('@')[0] ||
    normalizedEmail;

  return {
    uid: payload.sub,
    email: normalizedEmail,
    name: displayName,
    picture: payload.picture,
  };
}
