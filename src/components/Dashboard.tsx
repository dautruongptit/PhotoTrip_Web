import { useState } from 'react';
import type { TravelEvent, User } from '../types';
import { formatTotalSize } from '../utils';
import EventCard from './EventCard';

interface Props {
  user: User;
  events: TravelEvent[];
  searchQuery: string;
  onOpenEvent: (id: string) => void;
  onCreateEvent: () => void;
  onDeleteEvents: (ids: string[]) => void;
}

const EmptyEvents = ({ onCreateEvent }: { onCreateEvent: () => void }) => (
  <div className="flex flex-col items-center justify-center py-32 text-center">
    <div className="w-24 h-24 bg-blue-50 dark:bg-blue-950/40 rounded-3xl flex items-center justify-center mb-6">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#93C5FD" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="#93C5FD"/>
        <path d="M21 15l-5-5L5 21" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="18" cy="18" r="4" fill="#2563EB"/>
        <path d="M18 16v4M16 18h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Chưa có sự kiện nào</h3>
    <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mb-8 leading-relaxed">
      Tạo sự kiện đầu tiên để bắt đầu lưu giữ những kỷ niệm đẹp từ chuyến đi của bạn.
    </p>
    <button
      onClick={onCreateEvent}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-2xl transition-colors shadow-lg shadow-blue-200"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      Tạo sự kiện đầu tiên
    </button>
  </div>
);

export default function Dashboard({ user, events, searchQuery, onOpenEvent, onCreateEvent, onDeleteEvents }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const totalPhotos = events.reduce((s, e) => s + (e.photoCount ?? e.photos.length), 0);
  const totalSize   = events.reduce((s, e) => s + (e.totalSizeBytes ?? e.photos.reduce((ps, p) => ps + p.size, 0)), 0);
  // Ảnh gần đây chỉ lấy được từ các event đã mở AlbumPage ít nhất 1 lần trong
  // phiên này (photos chỉ tải theo từng event, không tải hết mọi event ở Dashboard).
  const allPhotos   = events.flatMap((e) => e.photos.map((ph) => ({ ...ph, eventName: e.name })));
  const recentPhotos = [...allPhotos].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(0, 6);

  const filtered = searchQuery
    ? events.filter((e) => {
        const q = searchQuery.toLowerCase();
        // e.location có thể là null với các event tạo trước migration V9 (cột
        // location được thêm sau, không backfill dữ liệu cũ) — dù type khai
        // báo là string. Guard bằng '' để tránh crash trắng trang khi gõ tìm kiếm.
        return e.name.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q);
      })
    : events;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng';
    if (h < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((e) => e.id)));
  const clearSelect = () => setSelected(new Set());

  const handleDelete = () => {
    onDeleteEvents(Array.from(selected));
    clearSelect();
    setShowDeleteConfirm(false);
  };

  return (
    <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            {greeting()}, {user.name.split(' ').pop()} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Quản lý và chia sẻ album ảnh du lịch của bạn</p>
        </div>
        <button
          onClick={onCreateEvent}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-blue-200 self-start sm:self-auto"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Tạo sự kiện
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Sự kiện', value: events.length, icon: '🗺️', color: 'bg-purple-50 text-purple-600' },
          { label: 'Tổng ảnh', value: totalPhotos, icon: '📸', color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600' },
          { label: 'Dung lượng', value: formatTotalSize(totalSize), icon: '💾', color: 'bg-green-50 text-green-600' },
          { label: 'Ảnh tuần này', value: allPhotos.filter(p => {
            const d = new Date(p.uploadedAt);
            return Date.now() - d.getTime() < 7 * 86400000;
          }).length, icon: '🆕', color: 'bg-orange-50 text-orange-600' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${color.split(' ')[0]}`}>
              {icon}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent Photos */}
      {recentPhotos.length > 0 && !searchQuery && (
        <section className="mb-10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Ảnh mới nhất</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {recentPhotos.map((ph) => (
              <div
                key={ph.id}
                className="group relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                style={{ aspectRatio: '1' }}
              >
                <img
                  src={ph.url.replace('w=1920', 'w=400')}
                  alt={ph.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-end p-2">
                  <p className="text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate w-full">
                    {ph.eventName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Events */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {searchQuery ? `Kết quả cho "${searchQuery}"` : 'Tất cả sự kiện'}
            <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">({filtered.length})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          searchQuery ? (
            <div className="py-20 text-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm">Không tìm thấy sự kiện phù hợp.</p>
            </div>
          ) : (
            <EmptyEvents onCreateEvent={onCreateEvent} />
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                user={null}
                selected={selected.has(event.id)}
                onSelect={() => toggleSelect(event.id)}
                onClick={() => onOpenEvent(event.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Floating selection toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-900 dark:bg-gray-800 text-white pl-4 pr-2 py-2 rounded-2xl shadow-2xl slide-up">
          <span className="text-sm font-medium pr-3">
            <strong>{selected.size}</strong> sự kiện đã chọn
          </span>
          <div className="w-px h-5 bg-white/15" />
          <button
            onClick={selected.size === filtered.length ? clearSelect : selectAll}
            className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            {selected.size === filtered.length ? 'Bỏ chọn' : `Chọn tất cả (${filtered.length})`}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/10 rounded-xl transition-colors"
          >
            Xóa
          </button>
          <button
            onClick={clearSelect}
            title="Đóng"
            className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-colors ml-1 flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="slide-up relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Xác nhận xóa</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-5">
              Bạn có chắc muốn xóa <strong>{selected.size} sự kiện</strong> đã chọn? Toàn bộ ảnh bên trong cũng sẽ bị xóa. Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Hủy
              </button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold text-white transition-colors">
                Xóa {selected.size} sự kiện
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
