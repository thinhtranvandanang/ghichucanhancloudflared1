import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Note } from '../types/note';
import { formatVietnamDateTime } from '../utils/date';

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: number) => Promise<void>;
}

export function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete(note.id);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <article
      onClick={() => {
        if (!confirmingDelete) onEdit(note);
      }}
      className="group bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-150 hover:border-green-400 hover:shadow-md cursor-pointer focus-within:border-green-500"
    >
      <div className="space-y-2.5">
        <h3 className="text-[17px] font-semibold text-slate-900 leading-snug line-clamp-2 break-words">
          {note.title}
        </h3>
        <p className="text-[15px] text-slate-600 leading-relaxed line-clamp-4 whitespace-pre-line break-words">
          {note.content}
        </p>
      </div>

      <div
        className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <time
          dateTime={note.created_at}
          className="text-xs text-slate-500 font-tabular whitespace-nowrap"
        >
          {formatVietnamDateTime(note.created_at)}
        </time>

        {confirmingDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition-colors cursor-pointer"
            >
              {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 sm:opacity-85 sm:group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onEdit(note)}
              aria-label={`Sửa ghi chú ${note.title}`}
              title="Sửa ghi chú"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-green-700 hover:bg-green-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Xóa ghi chú ${note.title}`}
              title="Xóa ghi chú"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
