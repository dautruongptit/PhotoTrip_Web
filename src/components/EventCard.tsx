import type { TravelEvent, User } from '../types';
import { formatDateRange, formatTimeAgo } from '../utils';

interface Props {
  event: TravelEvent;
  user: User | null;
  selected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
}

export default function EventCard({ event, selected = false, onSelect, onClick }: Props) {
  const totalPhotos = event.photoCount ?? event.photos.length;

  return (
    <article
      onClick={onClick}
      className={`group bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border shadow-sm hover:shadow-xl hover:shadow-gray-200/60 hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
        selected ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-950' : 'border-gray-100 dark:border-gray-800'
      }`}
    >
      {/* Cover */}
      <div className="relative overflow-hidden bg-gray-100 dark:bg-gray-800" style={{ aspectRatio: '16/10' }}>
        <img
          src={event.coverImage}
          alt={event.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {/* Select badge (top-left) */}
        {onSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            title={selected ? 'Bỏ chọn' : 'Chọn sự kiện'}
            className={`absolute top-3 left-3 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 shadow-sm ${
              selected
                ? 'bg-blue-600 opacity-100 scale-100'
                : 'bg-white/85 backdrop-blur-sm opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
            }`}
          >
            {selected ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <div className="w-3.5 h-3.5 rounded-[3px] border-2 border-gray-400" />
            )}
          </button>
        )}
        {/* Photo count badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="white" strokeWidth="2"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="white"/>
            <path d="M21 15l-5-5L5 21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {totalPhotos} ảnh
        </div>
        {/* Date on image */}
        <div className="absolute bottom-3 left-3">
          <p className="text-white font-semibold text-lg leading-tight">{event.name}</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Location */}
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs mb-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor"/>
            <circle cx="12" cy="9" r="2.5" fill="white"/>
          </svg>
          <span className="truncate">{event.location}</span>
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed line-clamp-2 mb-3">{event.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span>{formatDateRange(event.startDate, event.endDate)}</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatTimeAgo(event.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}
