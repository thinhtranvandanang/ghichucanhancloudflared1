import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { NoteCard } from './components/NoteCard';
import { NoteModal } from './components/NoteModal';
import type { AuthSessionResponse, Note } from './types/note';

export default function App() {
  const [auth, setAuth] = useState<AuthSessionResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  }, []);

  const fetchSession = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error('Không thể kiểm tra trạng thái đăng nhập.');
      }
      const data = (await res.json()) as AuthSessionResponse;
      setAuth(data);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Không thể kết nối tới máy chủ. Vui lòng thử lại.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  // Debounce tìm kiếm 300ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchNotes = useCallback(async (query: string) => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const url = params.toString() ? `/api/notes?${params.toString()}` : '/api/notes';

      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 401) {
        setAuth((prev) => (prev ? { ...prev, authenticated: false, user: undefined } : prev));
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Không thể tải danh sách ghi chú.');
      }
      const data = (await res.json()) as { notes: Note[] };
      setNotes(data.notes || []);
    } catch (err) {
      setNotesError(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi khi tải ghi chú. Vui lòng thử lại.'
      );
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth?.authenticated) {
      void fetchNotes(debouncedQuery);
    }
  }, [auth?.authenticated, debouncedQuery, fetchNotes]);

  function openCreateModal() {
    setEditingNote(null);
    setModalOpen(true);
  }

  function openEditModal(note: Note) {
    setEditingNote(note);
    setModalOpen(true);
  }

  async function handleSaveNote(payload: { id?: number; title: string; content: string }) {
    if (payload.id) {
      const res = await fetch(`/api/notes/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title: payload.title, content: payload.content }),
      });

      if (res.status === 401) {
        await fetchSession();
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const data = (await res.json().catch(() => ({}))) as { note?: Note; error?: string };
      if (!res.ok || !data.note) {
        throw new Error(data.error || 'Không thể cập nhật ghi chú.');
      }

      await fetchNotes(debouncedQuery);
      showToast('Đã cập nhật ghi chú');
    } else {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title: payload.title, content: payload.content }),
      });

      if (res.status === 401) {
        await fetchSession();
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const data = (await res.json().catch(() => ({}))) as { note?: Note; error?: string };
      if (!res.ok || !data.note) {
        throw new Error(data.error || 'Không thể lưu ghi chú mới.');
      }

      await fetchNotes(debouncedQuery);
      showToast('Đã lưu ghi chú mới');
    }
  }

  async function handleDeleteNote(id: number) {
    const res = await fetch(`/api/notes/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (res.status === 401) {
      await fetchSession();
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Không thể xóa ghi chú.');
    }

    setNotes((prev) => prev.filter((item) => item.id !== id));
    showToast('Đã xóa ghi chú');
  }

  function handleSignOut() {
    window.location.assign('/auth/signout');
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-11 h-11 rounded-2xl bg-green-500 text-white flex items-center justify-center">
            <NotebookPen className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-slate-600">
            Đang tải Sổ Tay Nhanh...
          </p>
        </div>
      </div>
    );
  }

  if (authError || !auth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
          <p className="text-sm text-red-700">
            {authError || 'Không thể tải thông tin phiên làm việc.'}
          </p>
          <button
            type="button"
            onClick={() => void fetchSession()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!auth.authenticated || !auth.user) {
    return (
      <LoginScreen
        mode={auth.mode}
        clientId={auth.clientId}
        loginUri={auth.loginUri}
        onTestSignedIn={fetchSession}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      <Header user={auth.user} onSignOut={handleSignOut} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {/* Thanh tìm kiếm trên cùng + thông tin tóm tắt */}
        <section aria-label="Tìm kiếm ghi chú" className="mb-6 sm:mb-8 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search
                className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm kiếm theo tiêu đề hoặc nội dung..."
                aria-label="Tìm kiếm ghi chú"
                className="w-full min-h-[48px] pl-11 pr-11 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-[15px] shadow-xs focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="hidden sm:inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-semibold text-[15px] shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              <span>Ghi chú mới</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 px-1">
            <span className="font-tabular">
              {debouncedQuery
                ? `Tìm thấy ${notes.length} ghi chú cho "${debouncedQuery}"`
                : `Tổng cộng ${notes.length} ghi chú`}
            </span>
            <span className="sm:hidden truncate max-w-[180px]">{auth.user.email}</span>
          </div>
        </section>

        {/* Trạng thái lỗi */}
        {notesError && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 text-sm text-red-800"
          >
            <span>{notesError}</span>
            <button
              type="button"
              onClick={() => void fetchNotes(debouncedQuery)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white border border-red-200 text-red-700 font-semibold hover:bg-red-100/50 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Trạng thái đang tải */}
        {notesLoading && notes.length === 0 ? (
          <div
            aria-label="Đang tải ghi chú"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="bg-white border border-slate-200 rounded-2xl p-5 h-44 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-5 bg-slate-200 rounded-md w-2/3" />
                  <div className="h-4 bg-slate-100 rounded-md w-full" />
                  <div className="h-4 bg-slate-100 rounded-md w-5/6" />
                </div>
                <div className="h-3 bg-slate-100 rounded-md w-1/3" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          /* Trạng thái trống */
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-6">
            <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-4">
              <NotebookPen className="w-6 h-6" aria-hidden="true" />
            </div>

            {debouncedQuery ? (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-1.5">
                  Không tìm thấy ghi chú phù hợp
                </h2>
                <p className="text-sm text-slate-600 mb-5">
                  Không có ghi chú nào chứa từ khóa &ldquo;{debouncedQuery}&rdquo;. Hãy thử từ khóa khác.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
                >
                  Xóa từ khóa tìm kiếm
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-1.5">
                  Chưa có ghi chú nào
                </h2>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  Hãy lưu lại ý tưởng đầu tiên của bạn ngay bây giờ để không bỏ lỡ điều quan trọng trong ngày.
                </p>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                  <span>Tạo ghi chú đầu tiên</span>
                </button>
              </>
            )}
          </div>
        ) : (
          /* Danh sách ghi chú: 1 cột mobile, 2 cột tablet, 3 cột desktop */
          <section
            aria-label="Danh sách ghi chú"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
          >
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={openEditModal}
                onDelete={handleDeleteNote}
              />
            ))}
          </section>
        )}
      </main>

      {/* Nút "+" nổi (FAB) màu cam ở góc dưới phải */}
      <button
        type="button"
        onClick={openCreateModal}
        aria-label="Tạo ghi chú mới"
        title="Tạo ghi chú mới"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-lg shadow-orange-500/30 flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} aria-hidden="true" />
      </button>

      {/* Thông báo thao tác thành công */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-4 sm:left-6 z-40 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      {/* Cửa sổ tạo / sửa ghi chú */}
      <NoteModal
        isOpen={modalOpen}
        note={editingNote}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />
    </div>
  );
}
