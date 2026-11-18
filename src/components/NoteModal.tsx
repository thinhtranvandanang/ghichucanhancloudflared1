import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Trash2, X } from 'lucide-react';
import type { Note } from '../types/note';
import { formatVietnamDateTime } from '../utils/date';

interface NoteModalProps {
  isOpen: boolean;
  note: Note | null;
  onClose: () => void;
  onSave: (payload: { id?: number; title: string; content: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function NoteModal({
  isOpen,
  note,
  onClose,
  onSave,
  onDelete,
}: NoteModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    setError(null);
    setConfirmDelete(false);

    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [isOpen, note]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, deleting, onClose]);

  if (!isOpen) return null;

  async function submitForm() {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setError('Vui lòng nhập tiêu đề ghi chú.');
      titleInputRef.current?.focus();
      return;
    }
    if (!trimmedContent) {
      setError('Vui lòng nhập nội dung ghi chú.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: note?.id,
        title: trimmedTitle,
        content: trimmedContent,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể lưu ghi chú. Vui lòng thử lại.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitForm();
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void submitForm();
    }
  }

  async function handleDelete() {
    if (!note) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(note.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể xóa ghi chú. Vui lòng thử lại.'
      );
    } finally {
      setDeleting(false);
    }
  }

  const isEditing = note !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-modal-title"
      onClick={() => {
        if (!saving && !deleting) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

        <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2
              id="note-modal-title"
              className="text-lg font-bold text-slate-900"
            >
              {isEditing ? 'Chỉnh sửa ghi chú' : 'Ghi chú mới'}
            </h2>
            {isEditing && (
              <p className="text-xs text-slate-500 font-tabular mt-0.5">
                Tạo lúc: {formatVietnamDateTime(note.created_at)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            aria-label="Đóng cửa sổ"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          <div>
            <label
              htmlFor="note-title"
              className="block text-sm font-semibold text-slate-700 mb-1.5"
            >
              Tiêu đề
            </label>
            <input
              ref={titleInputRef}
              id="note-title"
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề ngắn gọn..."
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-base font-medium focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="note-content"
                className="block text-sm font-semibold text-slate-700"
              >
                Nội dung
              </label>
              <span className="hidden sm:inline text-xs text-slate-400">
                Nhấn Ctrl + Enter để lưu nhanh
              </span>
            </div>
            <textarea
              id="note-content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Viết ý tưởng hoặc việc cần nhớ của bạn tại đây..."
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-[15px] leading-relaxed resize-y min-h-[150px] focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
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

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              {isEditing && !confirmDelete && (
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>Xóa</span>
                </button>
              )}

              {isEditing && confirmDelete && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Thôi
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                disabled={saving || deleting}
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
