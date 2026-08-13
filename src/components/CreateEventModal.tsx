import { useState, useRef } from 'react';
import type { EventFormData } from '../api/events';

interface Props {
  existingNames: string[];
  onClose: () => void;
  onSave: (data: EventFormData, coverFile?: File) => Promise<void>;
}

export default function CreateEventModal({ existingNames, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Tên sự kiện là bắt buộc.';
    else if (existingNames.includes(name.trim())) e.name = 'Tên sự kiện đã tồn tại.';
    if (!startDate) e.startDate = 'Chọn ngày bắt đầu.';
    if (!location.trim()) e.location = 'Địa điểm là bắt buộc.';
    return e;
  };

  const handleCoverFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          startDate,
          endDate: endDate || startDate,
          location: location.trim(),
        },
        coverFile ?? undefined
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Không thể tạo sự kiện. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:bg-white dark:focus:bg-gray-800 focus:ring-2 transition-all ${
      errors[field]
        ? 'border-red-400 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-900/40'
        : 'border-gray-200 dark:border-gray-700 focus:border-blue-400 focus:ring-blue-100 dark:focus:ring-blue-900/40'
    }`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="slide-up relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Tạo sự kiện mới</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Điền thông tin chuyến đi của bạn</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tên sự kiện <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(prev => ({...prev, name: ''})); }}
              placeholder="Ví dụ: Đà Lạt 2026"
              className={inputClass('name')}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><span>⚠</span>{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Chuyến du lịch cùng công ty…"
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:bg-white dark:focus:bg-gray-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all resize-none"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Ngày bắt đầu <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setErrors(prev => ({...prev, startDate: ''})); }}
                className={inputClass('startDate')}
              />
              {errors.startDate && <p className="text-red-500 text-xs mt-1.5">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ngày kết thúc</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass('endDate')}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Địa điểm <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor" opacity=".3"/>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <input
                type="text"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setErrors(prev => ({...prev, location: ''})); }}
                placeholder="Đà Lạt, Lâm Đồng"
                className={`${inputClass('location')} pl-10`}
              />
            </div>
            {errors.location && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><span>⚠</span>{errors.location}</p>}
          </div>

          {/* Cover image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ảnh bìa</label>
            {coverPreview ? (
              <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/7' }}>
                <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setCoverPreview(null); setCoverFile(null); }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors text-base leading-none"
                >
                  ×
                </button>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                  {coverFile?.name}
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleCoverFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 py-10 ${
                  isDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="#D1D5DB" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="#D1D5DB"/>
                  <path d="M21 15l-5-5L5 21" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">Kéo thả ảnh vào đây hoặc</p>
                <span className="text-sm text-blue-600 font-medium">chọn từ máy tính</span>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); }} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4">
          {submitError && (
            <p className="text-red-500 text-xs mb-3 flex items-center gap-1"><span>⚠</span>{submitError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-all shadow-sm hover:shadow-md hover:shadow-blue-200 disabled:opacity-60"
            >
              {isSubmitting ? 'Đang tạo…' : 'Tạo sự kiện'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
