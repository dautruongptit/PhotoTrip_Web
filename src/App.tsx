import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNotes } from "./hooks/useNotes";
import { useRename } from "./hooks/useRename";
import { useAutoSave } from "./hooks/useAutoSave";
import { useDriveSync } from "./hooks/useDriveSync";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useSelectMode } from "./hooks/useSelectMode";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useAuth, type AuthStatus } from "./hooks/useAuth";
import { authApi } from "./api/authApi";
import { driveApi } from "./api/driveApi";
import type { NotesMode } from "./api/notesRepo";
import { migrateLocalNotesToServer } from "./utils/migrateLocalNotes";
import { DriveCallbackScreen } from "./components/auth/DriveCallbackScreen";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { EditorPane } from "./components/layout/EditorPane";
import { Sidebar } from "./components/sidebar/Sidebar";
import { SidebarResizer } from "./components/sidebar/SidebarResizer";
import { ContextMenu } from "./components/ContextMenu";
import { DeleteConfirmModal } from "./components/modals/DeleteConfirmModal";
import { BulkDeleteConfirmModal } from "./components/modals/BulkDeleteConfirmModal";
import { RenameModal } from "./components/modals/RenameModal";
import { DrivePanel } from "./components/modals/DrivePanel";

// SEC-15: BO cong chan cung (khong con "chua dang nhap thi khong cho dung
// app" nhu SEC-10) - dung theo yeu cau moi: "chi khi nguoi dung DONG BO moi
// yeu cau dang nhap Google". App gio la LOCAL-FIRST:
//
//  - Mo app lan dau (chua dang nhap) -> "Local Mode": note luu HOAN TOAN
//    trong IndexedDB cua trinh duyet (xem localNotesStore.ts), dung day du
//    moi tinh nang (tao/sua/xoa/doi ten/duplicate/tai xuong), KHONG can mang,
//    KHONG can dang nhap.
//  - Bam nut "Dang nhap & Dong bo" -> dieu huong sang Google (giong SEC-01/06)
//    -> dang nhap xong quay ve app -> TU DONG day toan bo note dang co trong
//    Local Mode len server (migrateLocalNotesToServer, tai su dung endpoint
//    /api/sync/batch da co san tu SEC-05) -> chuyen sang "Server Mode".
//  - Server Mode: dung CHINH XAC nhu SEC-08/SEC-10 truoc day - note nam tren
//    backend (MySQL + disk Ubuntu ca nhan), nen mo app tren MAY THU HAI (cung
//    dang nhap 1 tai khoan) se thay LAI dung phien lam viec, KE CA KHI CHUA
//    tung ket noi Google Drive rieng (Drive la lop backup KHAC, tach biet -
//    xem DrivePanel/useDriveSync, khong lien quan gi den viec nay).
export default function App() {
  // "/drive/callback": backend (DriveController.callback(), SEC-09) redirect
  // trinh duyet ve day sau khi hoan tat luong ket noi Google Drive (KHAC voi
  // luong dang nhap thong thuong). Repo khong dung router library nen tu
  // kiem tra pathname truc tiep - an toan vi App() khong goi hook nao truoc do.
  if (window.location.pathname === "/drive/callback") {
    return <DriveCallbackScreen />;
  }
  return <AuthGate />;
}

function AuthGate() {
  const auth = useAuth();

  useEffect(() => {
    // Doc "?token=..." tu URL NEU trang vua duoc backend redirect ve sau
    // luong dang nhap Google (authApi.loginWithGoogle, backend SEC-01/06).
    if (authApi.handleOAuthCallback()) {
      void auth.checkAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KHONG con "if (checking) return blank" / "if (!authenticated) return
  // LoginScreen" nua - Workspace LUON duoc render NGAY LAP TUC (Local Mode),
  // "auth" chi anh huong "mode" ben trong Workspace (xem useEffect trong do).
  return <Workspace authStatus={auth.status} />;
}

function Workspace({ authStatus }: { authStatus: AuthStatus }) {
  const [dark, setDark] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [cursorLine, setCursorLine] = useState(1);
  const [mode, setMode] = useState<NotesMode>("local");
  const [migrating, setMigrating] = useState(false);
  const migratedRef = useRef(false); // chan migrate chay lai nhieu lan (StrictMode/re-render)

  // Ngay khi phat hien DA dang nhap (auth.status === "authenticated") - du la
  // do vua bam "Dang nhap & Dong bo" HAY do trinh duyet con phien cu (cookie
  // refresh_token con hieu luc, xem useAuth.ts) - day toan bo note Local Mode
  // len server 1 LAN, ROI MOI chuyen mode sang "server" (thu tu quan trong:
  // phai migrate XONG truoc khi useNotes() doi sang server list(), neu khong
  // note vua day len se khong xuat hien ngay).
  useEffect(() => {
    if (authStatus !== "authenticated" || migratedRef.current) return;
    migratedRef.current = true;

    (async () => {
      setMigrating(true);
      try {
        await migrateLocalNotesToServer();
      } finally {
        setMigrating(false);
        setMode("server");
      }
    })();
  }, [authStatus]);

  // Kenh thu 3 cua "Debounce Sync": flush dong bo NGAY khi nguoi dung dong
  // tab/roi trang (chi co tac dung o Server Mode - Local Mode khong co gi de
  // flush len Drive). Dung ca 'pagehide' LAN 'visibilitychange' (kiem tra
  // document.visibilityState === "hidden") de bao phu nhieu tinh huong nhat:
  // 'pagehide' bat duoc dong tab/dong trinh duyet, 'visibilitychange' con bat
  // duoc them ca truong hop chuyen sang tab/app khac (mobile OS hay tam dung
  // tab an, khong phai luc nao cung bat 'pagehide' kip truoc khi bi kill).
  useEffect(() => {
    if (mode !== "server") return;

    const flush = () => driveApi.flushOnUnload();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mode]);

  // DUY NHAT 1 instance useOfflineSync o cap cao nhat nay - xem giai thich
  // trong useAutoSave.ts ve ly do khong duoc goi hook nay o nhieu noi.
  const offlineSync = useOfflineSync();

  // notesApi.newNote() calls markSaved() once autosave is initialized below.
  // Safe: this closure only runs on user interaction, well after render.
  const notesApi = useNotes(mode, () => autosave.markSaved());
  const autosave = useAutoSave(
    mode, notesApi.notes, notesApi.setNotes, notesApi.activeId, notesApi.active?.content,
    offlineSync.queueChange, offlineSync.pendingCount,
  );
  const drive = useDriveSync(mode, notesApi.notes, autosave.status, notesApi.activeId, notesApi.refreshSyncStates);
  const sidebarResize = useSidebarResize();
  const selectModeApi = useSelectMode(
    notesApi.notes, notesApi.setNotes,
    notesApi.tabs, notesApi.setTabs,
    notesApi.activeId, notesApi.setActiveId,
    () => notesApi.setMenuId(null),
    notesApi.newNote,
  );
  const renameApi = useRename(notesApi.notes, notesApi.setNotes, () => notesApi.setMenuId(null));

  const handleChangeContent = (value: string) => {
    notesApi.setNotes((items) =>
      items.map((note) => (note.id === notesApi.activeId ? { ...note, content: value } : note))
    );
    autosave.markUnsaved();
  };

  const menuNote = notesApi.menuId !== null ? notesApi.notes.find((n) => n.id === notesApi.menuId) : null;
  const deleteNote = notesApi.deleteId !== null ? notesApi.notes.find((n) => n.id === notesApi.deleteId) : null;

  return (
    <main className={dark ? "app dark" : "app"} onClick={() => notesApi.setMenuId(null)}>
      <TopBar
        dark={dark}
        onToggleSidebar={() => setSidebarVisible((v) => !v)}
        tabs={notesApi.tabs}
        notes={notesApi.notes}
        activeId={notesApi.activeId}
        status={autosave.status}
        onSelectTab={notesApi.setActiveId}
        onCloseTab={notesApi.closeTab}
        onNewNote={notesApi.newNote}
        onManualSave={autosave.manualSave}
        onToggleDark={() => setDark((d) => !d)}
      />

      <section className="workspace">
        <Sidebar
          visible={sidebarVisible}
          width={sidebarResize.sidebarWidth}
          notes={notesApi.notes}
          activeId={notesApi.activeId}
          selectMode={selectModeApi.selectMode}
          selected={selectModeApi.selected}
          driveConnected={drive.driveConnected}
          syncStatus={drive.syncStatus}
          lastSynced={drive.lastSynced}
          noteSyncMap={drive.noteSyncMap}
          onOpenNote={(id) => notesApi.openNote(id, selectModeApi.selectMode)}
          onNewNote={notesApi.newNote}
          onEnterSelectMode={() => selectModeApi.enterSelectMode()}
          onExitSelectMode={selectModeApi.exitSelectMode}
          onToggleSelect={selectModeApi.toggleSelect}
          onBulkDeleteRequest={() => selectModeApi.setBulkDeleteConfirm(true)}
          onTouchStart={selectModeApi.handleTouchStart}
          onTouchEnd={selectModeApi.handleTouchEnd}
          onMoreClick={notesApi.handleMoreClick}
        />

        {sidebarVisible && (
          <SidebarResizer onMouseDown={sidebarResize.startResize} onDoubleClick={sidebarResize.resetWidth} />
        )}

        {notesApi.active && (
          <EditorPane
            content={notesApi.active.content}
            lines={notesApi.lines}
            cursorLine={cursorLine}
            textareaRef={notesApi.textarea}
            onCursorMove={setCursorLine}
            onChange={handleChangeContent}
          />
        )}
      </section>

      <StatusBar
        status={autosave.status}
        statusLabel={autosave.statusLabel()}
        driveConnected={drive.driveConnected}
        syncStatus={drive.syncStatus}
        driveIconChar={drive.driveIcon()}
        onOpenDrivePanel={() => drive.setShowDrivePanel(true)}
        cursorLine={cursorLine}
        linesCount={notesApi.lines.length}
        charCount={notesApi.active?.content.length ?? 0}
      />

      {/* Fixed-position dropdown — escapes all overflow containers */}
      {menuNote && (
        <ContextMenu
          pos={notesApi.menuPos}
          onDuplicate={() => notesApi.duplicate(menuNote.id)}
          onRename={() => renameApi.openRename(menuNote.id)}
          onDownload={() => notesApi.download(menuNote.id)}
          onDeleteRequest={() => { notesApi.setDeleteId(menuNote.id); notesApi.setMenuId(null); }}
        />
      )}

      {deleteNote && (
        <DeleteConfirmModal
          noteName={deleteNote.name}
          onCancel={() => notesApi.setDeleteId(null)}
          onConfirm={notesApi.deleteNote}
        />
      )}

      {selectModeApi.bulkDeleteConfirm && (
        <BulkDeleteConfirmModal
          count={selectModeApi.selected.size}
          onCancel={() => selectModeApi.setBulkDeleteConfirm(false)}
          onConfirm={selectModeApi.confirmBulkDelete}
        />
      )}

      {renameApi.renameId && (
        <RenameModal
          name={renameApi.renameName}
          error={renameApi.renameError}
          inputRef={renameApi.renameInput}
          onChange={renameApi.onRenameChange}
          onCancel={() => renameApi.setRenameId(null)}
          onCommit={renameApi.commitRename}
        />
      )}

      {drive.showDrivePanel && (
        <DrivePanel
          notes={notesApi.notes}
          driveConnected={drive.driveConnected}
          driveConnecting={drive.driveConnecting}
          syncStatus={drive.syncStatus}
          lastSynced={drive.lastSynced}
          noteSyncMap={drive.noteSyncMap}
          driveIconChar={drive.driveIcon()}
          onClose={() => drive.setShowDrivePanel(false)}
          onConnect={drive.connectDrive}
          onCancelConnecting={drive.cancelConnecting}
          onSyncNow={drive.doSync}
          onDisconnect={drive.disconnectDrive}
        />
      )}

      {/* Banner "Dang nhap & Dong bo" - CHI hien o Local Mode (chua dang nhap),
          bam vao se dieu huong dang nhap Google, sau do TU DONG day note len
          server (xem useEffect migrate o tren). Dung inline style (giong
          LoginScreen/DriveCallbackScreen, SEC-10) de khong dong den index.css. */}
      {mode === "local" && authStatus !== "checking" && (
        <button style={syncBannerStyle} onClick={() => authApi.loginWithGoogle()}>
          ☁ Đăng nhập & Đồng bộ
        </button>
      )}

      {migrating && (
        <div style={migratingOverlayStyle}>Đang đồng bộ ghi chú lên tài khoản của bạn...</div>
      )}
    </main>
  );
}

const syncBannerStyle: CSSProperties = {
  position: "fixed", bottom: 16, right: 16, zIndex: 50,
  padding: "10px 16px", borderRadius: 8, border: "1px solid #26262a",
  background: "#f2f2f3", color: "#0b0b0c", fontWeight: 600, fontSize: 13,
  cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};

const migratingOverlayStyle: CSSProperties = {
  position: "fixed", bottom: 16, right: 16, zIndex: 50,
  padding: "10px 16px", borderRadius: 8, border: "1px solid #26262a",
  background: "#141416", color: "#f2f2f3", fontSize: 13,
};
