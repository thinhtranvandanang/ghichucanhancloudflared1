import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, Mail, NotebookPen, ShieldCheck, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  mode: 'livemode' | 'testmode';
  clientId: string;
  loginUri: string;
  onTestSignedIn: () => Promise<void>;
}

export function LoginScreen({
  mode,
  clientId,
  loginUri,
  onTestSignedIn,
}: LoginScreenProps) {
  const gsiContainerRef = useRef<HTMLDivElement>(null);
  const [gsiReady, setGsiReady] = useState(false);

  // State cho chế độ xem trước cục bộ (khi chưa gắn GOOGLE_CLIENT_ID)
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'livemode' || !clientId) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    const initGsi = () => {
      const googleApi = (window as unknown as {
        google?: {
          accounts?: {
            id?: {
              initialize: (cfg: Record<string, unknown>) => void;
              renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
            };
          };
        };
      }).google;

      if (!googleApi?.accounts?.id || !gsiContainerRef.current) return;

      googleApi.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'redirect',
        login_uri: loginUri,
        auto_prompt: false,
      });

      gsiContainerRef.current.innerHTML = '';
      googleApi.accounts.id.renderButton(gsiContainerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        locale: 'vi',
        width: 280,
      });
      setGsiReady(true);
    };

    if (existingScript) {
      initGsi();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGsi;
    document.head.appendChild(script);
  }, [mode, clientId, loginUri]);

  async function handleTestSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim() || trimmedEmail.split('@')[0] || 'Người dùng';

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ Gmail hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      const sessionID =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `local-${Date.now()}`;

      const res = await fetch('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
          sessionID,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Không thể đăng nhập. Vui lòng thử lại.');
      }

      await onTestSignedIn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng nhập.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10 sm:px-6">
      <main className="w-full max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-green-500 text-white flex items-center justify-center shrink-0">
            <NotebookPen className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Sổ Tay Nhanh
            </h1>
            <p className="text-sm text-slate-500">Ghi chú cá nhân tức thì</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 leading-snug mb-2 [text-wrap:balance]">
          Ghi lại mọi ý tưởng trong vài giây
        </h2>
        <p className="text-[15px] text-slate-600 leading-relaxed mb-6">
          Đăng nhập bằng Gmail để bắt đầu tạo, tìm kiếm và đồng bộ ghi chú riêng tư trên mọi thiết bị.
        </p>

        {mode === 'livemode' ? (
          <div className="space-y-4">
            <div
              ref={gsiContainerRef}
              className="flex justify-center min-h-[44px]"
            />

            {!gsiReady && (
              <a
                href="/auth/signin"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                <span>Đăng nhập bằng Gmail</span>
              </a>
            )}

            <p className="text-xs text-slate-500 text-center pt-1">
              Mỗi tài khoản Gmail có không gian ghi chú tách biệt hoàn toàn.
            </p>
          </div>
        ) : (
          <form onSubmit={handleTestSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-orange-50 border border-orange-200 text-xs text-orange-900 leading-relaxed">
              <span className="font-semibold">Chế độ xem trước cục bộ:</span>{' '}
              Biến <code className="font-mono">GOOGLE_CLIENT_ID</code> chưa được cấu hình trên máy chủ xem trước. Nhập Gmail bất kỳ để kiểm tra tính năng tách dữ liệu theo từng người dùng.
            </div>

            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Địa chỉ Gmail
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vi-du@gmail.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-[15px] focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="login-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Tên hiển thị (tùy chọn)
              </label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Minh Anh"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-[15px] focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold text-[15px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Đang đăng nhập...' : 'Tiếp tục với Gmail'}</span>
            </button>
          </form>
        )}

        <div className="mt-7 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
            <span>Dữ liệu tách riêng theo Gmail</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
            <span>Phiên cookie HttpOnly an toàn</span>
          </div>
        </div>
      </main>

      <footer className="mt-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
        <span>Lưu trữ tức thì trên Cloudflare Workers &amp; D1</span>
      </footer>
    </div>
  );
}
