import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppView, StoragePlan, TravelEvent, ToastItem, Photo, User } from './types';
import { storagePlans } from './mockData';
import { generateId, formatTotalSize, FREE_STORAGE_BYTES } from './utils';
import { useTheme } from './hooks/useTheme';
import { useHistoryNavigation } from './hooks/useHistoryNavigation';
import { getToken, setToken, clearToken } from './lib/apiClient';
import { fetchCurrentUser, logout as apiLogout } from './lib/authApi';
import { verifyVnpayReturn, readPendingOrder, clearPendingOrder, isMockPaymentMode, type VnpayReturnResult } from './lib/paymentApi';
import { listEvents, createEvent as apiCreateEvent, type EventResponse, type EventFormData } from './api/events';
import { listPhotosByEvent, deletePhoto as apiDeletePhoto, type PhotoResponse } from './api/photos';

const FALLBACK_COVER_IMAGE = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=500&fit=crop&auto=format';

function mapEventResponse(dto: EventResponse, photos: Photo[] = []): TravelEvent {
  return {
    id: String(dto.id),
    name: dto.name,
    description: dto.description ?? '',
    startDate: dto.startDate,
    endDate: dto.endDate || dto.startDate,
    location: dto.location,
    coverImage: dto.coverImageUrl || FALLBACK_COVER_IMAGE,
    photos,
    photoCount: dto.photoCount,
    totalSizeBytes: dto.totalSize,
    createdBy: dto.ownerName,
    createdAt: dto.createdAt,
  };
}

function mapPhotoResponse(dto: PhotoResponse): Photo {
  return {
    id: String(dto.id),
    name: dto.originalName,
    url: dto.url,
    size: dto.size,
    width: dto.width,
    height: dto.height,
    uploadedAt: dto.uploadedTime,
    uploadedBy: dto.uploadedBy,
  };
}

import LoginPage from './components/LoginPage';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import CreateEventModal from './components/CreateEventModal';
import AlbumPage from './components/AlbumPage';
import HelpPage from './components/HelpPage';
import UploadModal from './components/UploadModal';
import ProfileModal from './components/ProfileModal';
import SettingsModal from './components/SettingsModal';
import UpgradeModal from './components/UpgradeModal';
import VnpayCheckoutModal from './components/VnpayCheckoutModal';
import Footer from './components/Footer';
import Toast from './components/Toast';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<AppView>('login');
  const [events, setEvents] = useState<TravelEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<StoragePlan | null>(null);
  const [storageLimitBytes, setStorageLimitBytes] = useState(FREE_STORAGE_BYTES);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const storageUsedBytes = useMemo(
    () => events.reduce((sum, e) => sum + (e.totalSizeBytes ?? e.photos.reduce((s, p) => s + p.size, 0)), 0),
    [events]
  );

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Tải danh sách Event thật từ backend (gọi sau khi xác nhận đã đăng nhập).
  const loadEvents = useCallback(async () => {
    try {
      const page = await listEvents(0, 100);
      setEvents(page.content.map((dto) => mapEventResponse(dto)));
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không thể tải danh sách sự kiện.');
    }
  }, [addToast]);

  // Tải toàn bộ ảnh của 1 Event (chỉ gọi khi mở AlbumPage của event đó).
  const loadEventPhotos = useCallback(async (eventId: string) => {
    try {
      const page = await listPhotosByEvent(Number(eventId), 0, 500);
      const photos = page.content.map(mapPhotoResponse);
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, photos, photoCount: page.totalElements } : e)));
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không thể tải ảnh của sự kiện.');
    }
  }, [addToast]);

  // Đồng bộ Dashboard/Album/Login với nút Back-Forward của trình duyệt
  const { push, replace } = useHistoryNavigation({
    onNavigate: (state) => {
      if (state.view === 'album') {
        setSelectedEventId(state.eventId);
        setView('album');
        if (state.eventId) loadEventPhotos(state.eventId);
      } else if (state.view === 'dashboard') {
        setSelectedEventId(null);
        setView('dashboard');
      } else if (state.view === 'help') {
        setView('help');
      } else {
        setSelectedEventId(null);
        setView('login');
      }
      setSearchQuery('');
    },
  });

  // Khôi phục phiên đăng nhập nếu đã có token hợp lệ từ lần trước (F5, mở lại tab)
  // HOẶC xử lý khi backend redirect về sau khi đăng nhập Google xong:
  //   {FRONTEND_URL}/oauth2/callback?token=<accessToken>
  useEffect(() => {
    if (window.location.pathname === '/oauth2/callback') {
      const token = new URLSearchParams(window.location.search).get('token');
      // Dọn URL callback về "/" ngay, tránh xử lý lại token khi F5
      window.history.replaceState({}, '', '/');

      if (!token) {
        addToast('error', 'Đăng nhập Google thất bại. Vui lòng thử lại.');
        replace({ view: 'login' });
        setCheckingSession(false);
        return;
      }

      setToken(token);
      fetchCurrentUser()
        .then((loggedInUser) => {
          setUser(loggedInUser);
          setView('dashboard');
          replace({ view: 'dashboard' });
          addToast('success', `Xin chào, ${loggedInUser.name}! Đăng nhập thành công.`);
          loadEvents();
        })
        .catch(() => {
          clearToken();
          addToast('error', 'Không thể xác thực tài khoản. Vui lòng đăng nhập lại.');
          replace({ view: 'login' });
        })
        .finally(() => setCheckingSession(false));
      return;
    }

    const token = getToken();
    if (!token) {
      replace({ view: 'login' });
      setCheckingSession(false);
      return;
    }
    fetchCurrentUser()
      .then((restoredUser) => {
        setUser(restoredUser);
        setView('dashboard');
        replace({ view: 'dashboard' });
        loadEvents();
      })
      .catch(() => {
        // token hết hạn / không hợp lệ -> coi như chưa đăng nhập
        replace({ view: 'login' });
      })
      .finally(() => setCheckingSession(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // Xử lý VNPay chuyển hướng về app (chỉ xảy ra ở chế độ "real" — chế độ mock xử lý
  // ngay trong VnpayCheckoutModal, không cần rời trang).
  useEffect(() => {
    if (isMockPaymentMode) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('vnp_ResponseCode')) return;

    verifyVnpayReturn(window.location.search)
      .then((result) => {
        const pending = readPendingOrder();
        const plan = storagePlans.find((p) => p.id === (result.planId ?? pending?.planId));
        if (result.success && plan) {
          setStorageLimitBytes(plan.storageGB * 1024 * 1024 * 1024);
          addToast('success', `Thanh toán VNPay thành công! Đã nâng cấp gói ${plan.label} — ${plan.storageGB}GB. Mã GD: ${result.transactionNo ?? result.orderId}.`);
        } else {
          addToast('error', result.message || 'Thanh toán không thành công. Vui lòng thử lại.');
        }
        clearPendingOrder();
      })
      .catch(() => addToast('error', 'Không thể xác nhận kết quả thanh toán. Vui lòng liên hệ hỗ trợ nếu đã bị trừ tiền.'))
      .finally(() => {
        // Dọn query string VNPay khỏi URL để tránh xử lý lại khi F5
        window.history.replaceState({}, '', window.location.pathname);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    apiLogout();
    setUser(null);
    setView('login');
    setSelectedEventId(null);
    setSearchQuery('');
    replace({ view: 'login' });
  };

  const handleOpenEvent = (id: string) => {
    setSelectedEventId(id);
    setView('album');
    setSearchQuery('');
    push({ view: 'album', eventId: id }); // tạo entry mới -> Back sẽ quay về Dashboard
    loadEventPhotos(id);
  };

  const handleGoHome = () => {
    setView('dashboard');
    setSelectedEventId(null);
    setSearchQuery('');
    push({ view: 'dashboard' });
  };

  const handleOpenHelp = () => {
    setView('help');
    push({ view: 'help' });
  };

  const handleSaveProfileName = (name: string) => {
    setUser((prev) => (prev ? { ...prev, name } : prev));
    addToast('success', 'Đã cập nhật tên hiển thị.');
  };

  const handleSelectPlan = (plan: StoragePlan, result: VnpayReturnResult) => {
    setStorageLimitBytes(plan.storageGB * 1024 * 1024 * 1024);
    setCheckoutPlan(null);
    addToast(
      'success',
      `Thanh toán VNPay thành công! Đã nâng cấp gói ${plan.label} — ${plan.storageGB}GB lưu trữ. Mã giao dịch: ${result.transactionNo}.`
    );
  };

  const handleCreateEvent = async (data: EventFormData, coverFile?: File) => {
    const dto = await apiCreateEvent(data, coverFile);
    const newEvent = mapEventResponse(dto);
    setEvents((prev) => [newEvent, ...prev]);
    setShowCreateModal(false);
    addToast('success', `Sự kiện "${newEvent.name}" đã được tạo thành công!`);
  };

  const handleUploaded = async (uploadedCount: number) => {
    if (!selectedEventId) return;
    await loadEventPhotos(selectedEventId);
    addToast('success', `Đã tải lên ${uploadedCount} ảnh thành công!`);
    setShowUploadModal(false);
  };

  const handleDeletePhotos = async (ids: string[]) => {
    if (!selectedEventId) return;
    try {
      await Promise.all(ids.map((id) => apiDeletePhoto(Number(id))));
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedEventId
            ? {
                ...e,
                photos: e.photos.filter((p) => !ids.includes(p.id)),
                photoCount: Math.max(0, (e.photoCount ?? e.photos.length) - ids.length),
              }
            : e
        )
      );
      addToast('success', `Đã xóa ${ids.length} ảnh.`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Xóa ảnh thất bại.');
    }
  };

  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Login page has its own layout */}
      {view === 'login' ? (
        <LoginPage theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <>
          <Header
            user={user}
            onLogout={handleLogout}
            onGoHome={handleGoHome}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={view === 'dashboard' || view === 'album'}
            theme={theme}
            onToggleTheme={toggleTheme}
            usedBytes={storageUsedBytes}
            limitBytes={storageLimitBytes}
            onOpenProfile={() => setShowProfileModal(true)}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenHelp={handleOpenHelp}
            onOpenUpgrade={() => setShowUpgradeModal(true)}
          />

          <div className="flex-1">
            {view === 'dashboard' && (
              <Dashboard
                user={user!}
                events={events}
                searchQuery={searchQuery}
                onOpenEvent={handleOpenEvent}
                onCreateEvent={() => setShowCreateModal(true)}
              />
            )}

            {view === 'album' && selectedEvent && (
              <AlbumPage
                event={selectedEvent}
                user={user}
                searchQuery={searchQuery}
                onBack={handleGoHome}
                onUpload={() => {
                  if (!user) { addToast('warning', 'Vui lòng đăng nhập để tải ảnh lên.'); return; }
                  if (storageUsedBytes >= storageLimitBytes) {
                    addToast('warning', `Đã đầy dung lượng lưu trữ (${formatTotalSize(storageLimitBytes)}). Vui lòng nâng cấp để tiếp tục.`);
                    setShowUpgradeModal(true);
                    return;
                  }
                  setShowUploadModal(true);
                }}
                onDeletePhotos={handleDeletePhotos}
              />
            )}

            {view === 'help' && <HelpPage onBack={handleGoHome} />}
          </div>

          <Footer onOpenHelp={handleOpenHelp} />
        </>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateEventModal
          existingNames={events.map((e) => e.name)}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateEvent}
        />
      )}

      {showUploadModal && selectedEvent && (
        <UploadModal
          eventId={Number(selectedEvent.id)}
          existingPhotoNames={selectedEvent.photos.map((p) => p.name)}
          onClose={() => setShowUploadModal(false)}
          onUploaded={handleUploaded}
        />
      )}

      {showProfileModal && user && (
        <ProfileModal
          user={user}
          events={events}
          usedBytes={storageUsedBytes}
          limitBytes={storageLimitBytes}
          onClose={() => setShowProfileModal(false)}
          onSave={handleSaveProfileName}
          onOpenUpgrade={() => setShowUpgradeModal(true)}
        />
      )}

      {showSettingsModal && user && (
        <SettingsModal
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onClose={() => setShowSettingsModal(false)}
          onLogout={handleLogout}
          onToast={addToast}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal
          usedBytes={storageUsedBytes}
          limitBytes={storageLimitBytes}
          onClose={() => setShowUpgradeModal(false)}
          onProceedToCheckout={(plan) => {
            setShowUpgradeModal(false);
            setCheckoutPlan(plan);
          }}
        />
      )}

      {checkoutPlan && (
        <VnpayCheckoutModal
          plan={checkoutPlan}
          customerName={user?.name}
          onCancel={() => setCheckoutPlan(null)}
          onSuccess={handleSelectPlan}
        />
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}