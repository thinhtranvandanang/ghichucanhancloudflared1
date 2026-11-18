import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Lock, NotebookPen, ShieldCheck } from 'lucide-react';
import { firebaseAuth, googleProvider } from '../firebase';

interface LoginScreenProps {
  onSignedIn: () => Promise<void>;
}

function getFirebaseErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.';
    case 'auth/cancelled-popup-request':
      return 'Yêu cầu đăng nhập trước đó đã bị hủy. Vui lòng thử lại.';
    case 'auth/popup-blocked':
      return 'Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup rồi thử lại.';
    case 'auth/unauthorized-domain':
      return 'Tên miền hiện tại chưa được thêm vào Authorized domains trong Firebase Console.';
    case 'auth/network-request-failed':
      return 'Kết nối mạng bị gián đoạn. Vui lòng kiểm tra Internet và thử lại.';
    default:
      return fallback || 'Không thể đăng nhập bằng Gmail. Vui lòng thử lại.';
  }
}

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setError(null);
    setSubmitting(true);

    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await credential.user.getIdToken();

      const res = await fetch('/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Không thể tạo phiên đăng nhập trên máy chủ.');
      }

      await onSignedIn();
    } catch (err) {
      const firebaseErr = err as { code?: string; message?: string };
      setError(getFirebaseErrorMessage(firebaseErr.code, firebaseErr.message));
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
          Đăng nhập bằng Gmail qua Firebase Auth để tạo, tìm kiếm và đồng bộ ghi chú riêng tư trên mọi thiết bị.
        </p>

        <div className="space-y-4">
          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-green-400 disabled:opacity-60 text-slate-800 font-semibold text-[15px] shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{submitting ? 'Đang kết nối Gmail...' : 'Đăng nhập bằng Gmail'}</span>
          </button>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 leading-relaxed"
            >
              {error}
            </div>
          )}

          <p className="text-xs text-slate-500 text-center pt-1">
            Mỗi tài khoản Gmail có không gian ghi chú tách biệt hoàn toàn.
          </p>
        </div>

        <div className="mt-7 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
            <span>Xác thực qua Firebase Auth</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
            <span>Phiên cookie HttpOnly an toàn</span>
          </div>
        </div>
      </main>
    </div>
  );
}
