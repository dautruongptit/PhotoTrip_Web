import { useState } from 'react';

interface Props {
  src: string;
  name: string;
  className?: string;
}

/**
 * Avatar người dùng — ưu tiên ảnh Google (`src`), tự chuyển sang chữ cái đầu tên
 * (trên nền màu) nếu ảnh lỗi hoặc chưa có `src`.
 *
 * `referrerPolicy="no-referrer"` vì Google khuyến nghị khi nhúng ảnh profile
 * (googleusercontent.com đôi khi từ chối request kèm Referer header của trang gọi tới).
 */
export default function Avatar({ src, name, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-semibold ${className}`}
        aria-label={name}
        role="img"
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
