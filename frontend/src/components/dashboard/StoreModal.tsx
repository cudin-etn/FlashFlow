import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { ActivateLicense, GetHWID } from "../../../wailsjs/go/main/App";

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kept for backwards compatibility. Set to false to re-enable license UI later. */
  freeMode?: boolean;
}

interface LicenseInfo {
  result?: string;
  type?: string;
  days_left?: number;
  expiry_ts?: number;
  isPro?: boolean;
  message?: string;
}

/**
 * Store is intentionally a small status page while FREE_MODE is enabled.
 * The license endpoint and response schema remain untouched so premium can be
 * re-enabled later without migrating existing Excel/Google Script data.
 */
export const StoreModal: React.FC<StoreModalProps> = ({ isOpen, onClose, freeMode = false }) => {
  const [hwid, setHwid] = useState("Đang tải...");
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const loadLicense = async () => {
    setChecking(true);
    try {
      const [id, status] = await Promise.all([GetHWID(), ActivateLicense("")]);
      setHwid(id || "UNKNOWN-HWID");
      setLicense(status || null);
    } catch (error) {
      console.error("License status check failed", error);
      toast.error("Không thể kiểm tra trạng thái license.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    GetHWID().then((id) => setHwid(id || "UNKNOWN-HWID")).catch(() => setHwid("UNKNOWN-HWID"));
    // Do not contact the licensing server in free mode. The startup check is
    // still preserved in the backend for analytics and future reactivation.
    if (!freeMode) void loadLicense();
  }, [isOpen, freeMode]);

  const copyHWID = async () => {
    try {
      await navigator.clipboard.writeText(hwid);
      toast.success("Đã copy mã máy tính.");
    } catch {
      toast.error("Không thể copy mã máy tính.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-md">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#111426] dark:text-white">
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-5 top-5 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="mb-7 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
            <ShieldCheck size={30} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-300">FlashFlow</p>
            <h2 className="text-2xl font-black tracking-tight">Trạng thái tính năng</h2>
          </div>
        </div>

        {freeMode ? (
          <>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
                <Check size={20} strokeWidth={3} />
                <h3 className="text-base font-black">Toàn bộ tính năng hiện đang miễn phí</h3>
              </div>
              <p className="mt-3 text-sm font-medium leading-relaxed text-emerald-800/80 dark:text-emerald-200/80">
                Không cần mua gói hoặc nhập mã kích hoạt. Anh có thể sử dụng Auto Flash, Flash .img, Library và các công cụ Advanced như bình thường.
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Mã máy tính</p>
              <button onClick={copyHWID} className="mt-2 flex w-full items-center justify-between gap-3 text-left font-mono text-xs text-slate-600 transition hover:text-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300">
                <span className="truncate">{hwid}</span>
                <Copy size={15} className="shrink-0" />
              </button>
              <p className="mt-2 text-xs text-slate-400">Mã này chỉ dùng để thống kê máy tính và được giữ tương thích với hệ thống license cũ.</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-400/20 dark:bg-indigo-500/10">
              <h3 className="text-base font-black text-indigo-700 dark:text-indigo-300">License</h3>
              <p className="mt-2 text-sm font-medium text-indigo-900/75 dark:text-indigo-100/75">
                Premium được quản lý qua hệ thống license hiện tại. Không cần cài lại ứng dụng hoặc thay đổi dữ liệu cũ.
              </p>
              {license && <p className="mt-3 text-xs font-bold text-indigo-700 dark:text-indigo-200">Trạng thái: {license.result || "UNKNOWN"} · Gói: {license.type || "TRIAL"}</p>}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Mã máy tính</p>
                <p className="mt-2 truncate font-mono text-xs text-slate-600 dark:text-slate-300">{hwid}</p>
              </div>
              <button onClick={copyHWID} className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-indigo-500 dark:hover:bg-white/10" aria-label="Copy HWID"><Copy size={16} /></button>
            </div>
            <button onClick={() => void loadLicense()} disabled={checking} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-60">
              {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Kiểm tra lại license
            </button>
          </>
        )}

        <button onClick={onClose} className="mt-7 w-full rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-black text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">Đã hiểu</button>
      </div>
    </div>,
    document.body,
  );
};
