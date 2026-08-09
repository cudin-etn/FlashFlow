import React from 'react';
import { Archive, CheckCircle2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

/** Shared placeholder for capabilities that are intentionally not enabled yet. */
export const ComingSoonModal: React.FC<ComingSoonModalProps> = ({
  isOpen,
  onClose,
  title = 'Backup & Restore',
  description = 'Tính năng đang được hoàn thiện để hỗ trợ thiết bị đã root, bao gồm backup và khôi phục đầy đủ dữ liệu ứng dụng.',
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[30px] border border-slate-200 bg-white p-7 text-center shadow-2xl dark:border-white/5 dark:bg-[#13141C]">
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-red-500 hover:text-white dark:bg-white/5"
        >
          <X size={16} />
        </button>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/20">
          <Archive size={30} />
        </div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
          <CheckCircle2 size={12} /> Coming soon
        </div>
        <h3 className="mb-3 text-xl font-black tracking-tight text-slate-800 dark:text-white">{title}</h3>
        <p className="text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
        >
          Đã hiểu
        </button>
      </div>
    </div>,
    document.body,
  );
};

