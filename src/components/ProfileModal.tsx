import { useState } from 'react';
import type { TravelEvent, User } from '../types';
import { formatTotalSize } from '../utils';
import Avatar from './Avatar';

interface Props {
  user: User;
  events: TravelEvent[];
  usedBytes: number;
  limitBytes: number;
  onClose: () => void;
  onSave: (name: string) => void;
  onOpenUpgrade: () => void;
}

export default function ProfileModal({ user, events, usedBytes, limitBytes, onClose, onSave, onOpenUpgrade }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);

  const totalPhotos = events.reduce((sum, e) => sum + e.photos.length, 0);
  const usedPercent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="slide-up relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Hồ sơ của tôi</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center">
            <Avatar src={user.avatar} name={user.name} className="w-20 h-20 rounded-full ring-4 ring-gray-100 dark:ring-gray-800" />

            {editing ? (
              <div className="mt-3 w-full">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  maxLength={60}
                  className="w-full text-center text-base font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                />
                <div className="flex justify-center gap-2 mt-2">
                  <button onClick={() => { setEditing(false); setName(user.name); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Hủy</button>
                  <button onClick={handleSave} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white">Lưu</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.name}</p>
                <button onClick={() => setEditing(true)} title="Đổi tên hiển thị" className="text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Đăng nhập bằng Google
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{events.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sự kiện</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totalPhotos}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ảnh đã lưu</p>
            </div>
          </div>

          {/* Storage */}
          <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-800 p-3.5">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300">Dung lượng lưu trữ</span>
              <span className="text-gray-500 dark:text-gray-400">{usedPercent}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${usedPercent >= 90 ? 'bg-red-500' : usedPercent >= 70 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {formatTotalSize(usedBytes)} / {formatTotalSize(limitBytes)} đã sử dụng
            </p>
            <button
              onClick={() => { onClose(); onOpenUpgrade(); }}
              className="mt-3 w-full py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              Nâng cấp dung lượng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
