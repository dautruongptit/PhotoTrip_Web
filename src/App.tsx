import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppView, StoragePlan, TravelEvent, ToastItem, Photo, User } from './types';
import { mockEvents, storagePlans } from './mockData';
import { generateId, formatTotalSize, FREE_STORAGE_BYTES } from './utils';
import { useTheme } from './hooks/useTheme';
import { useHistoryNavigation } from './hooks/useHistoryNavigation';
import { getToken, setToken, clearToken } from './lib/apiClient';
import { fetchCurrentUser, logout as apiLogout } from './lib/authApi';
import { verifyVnpayReturn, readPendingOrder, clearPendingOrder, isMockPaymentMode, type VnpayReturnResult } from './lib/paymentApi';

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
  const [events, setEvents] = useState<TravelEvent[]>(mockEvents);
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
    () => events.reduce((sum, e) => sum + e.photos.reduce((s, p) => s + p.size, 0), 0),
    [events]
  );

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Đồng bộ Dashboard/Album/Login với nút Back-Forward của trình duyệt
  const { push, replace } = useHistoryNavigation({
    onNavigate: (state) => {
      if (state.view === 'album') {
        setSelectedEventId(state.eventId);
        setView('album');
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
    debugger
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

  const handleCreateEvent = (event: TravelEvent) => {
    setEvents((prev) => [event, ...prev]);
    setShowCreateModal(false);
    addToast('success', `Sự kiện "${event.name}" đã được tạo thành công!`);
  };

  const handleUploaded = (photos: Photo[]) => {
    if (!selectedEventId) return;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === selectedEventId ? { ...e, photos: [...e.photos, ...photos] } : e
      )
    );
    addToast('success', `Đã tải lên ${photos.length} ảnh thành công!`);
    setShowUploadModal(false);
  };

  const handleDeletePhotos = (ids: string[]) => {
    if (!selectedEventId) return;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === selectedEventId
          ? { ...e, photos: e.photos.filter((p) => !ids.includes(p.id)) }
          : e
      )
    );
    addToast('success', `Đã xóa ${ids.length} ảnh.`);
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