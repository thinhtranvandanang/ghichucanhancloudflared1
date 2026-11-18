import { LogOut, NotebookPen } from 'lucide-react';
import type { UserProfile } from '../types/note';

interface HeaderProps {
  user: UserProfile;
  onSignOut: () => void;
}

export function Header({ user, onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-green-500 text-white flex items-center justify-center shrink-0">
            <NotebookPen className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Sổ Tay Nhanh
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="hidden sm:flex flex-col items-end min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">
              {user.name}
            </span>
            <span className="text-xs text-slate-500 truncate max-w-[220px]">
              {user.email}
            </span>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            title={`Đăng xuất khỏi ${user.email}`}
          >
            <LogOut className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
