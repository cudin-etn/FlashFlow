import React from 'react';
import { ArrowLeftCircle, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';

interface WizardActionBarProps {
    onBack?: () => void;
    onNext?: () => void;
    nextLabel?: string;
    backLabel?: string;
    canNext?: boolean;
    canBack?: boolean;
    loading?: boolean;
    onExit?: () => void;
}

const WizardActionBar: React.FC<WizardActionBarProps> = ({ 
    onBack, onNext, nextLabel = "Tiếp tục", backLabel = "Quay lại", 
    canNext = true, canBack = true, loading = false, onExit
}) => {
    return (
        <div className="h-24 px-10 flex items-center justify-between shrink-0 z-30
  bg-white/80 dark:bg-[#09090b]/90 backdrop-blur-xl
  border-t border-slate-200 dark:border-white/10">
            {/* TRÁI: Nút Thoát */}
            <div className="flex items-center">
                {onExit && (
                    <button
                      onClick={onExit}
                      className="group flex items-center gap-3 px-7 py-3.5 rounded-2xl
    text-sm font-semibold tracking-wide uppercase
    text-red-600 dark:text-red-400
    bg-red-50 dark:bg-red-500/10
    border border-red-500/30 dark:border-red-400/30
    hover:bg-red-500 hover:text-white
    hover:shadow-xl hover:shadow-red-500/40
    transition-all active:scale-95"
                    >
                      <XCircle size={20} strokeWidth={1.5} />
                      Hủy
                    </button>
                )}
            </div>
            {/* PHẢI: Điều hướng */}
            <div className="flex items-center gap-4">
                {onBack && (
                    <button
                      onClick={onBack}
                      disabled={!canBack || loading}
                      className={`group flex items-center gap-3 px-7 py-3.5 rounded-2xl
    text-sm font-semibold tracking-wide
    transition-all active:scale-95
    ${!canBack || loading
      ? 'opacity-0 hidden'
      : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-500 hover:text-white hover:shadow-xl hover:shadow-blue-500/40'}
  `}
                    >
                      <ArrowLeftCircle size={20} strokeWidth={1.5} />
                      {backLabel}
                    </button>
                )}
                {onNext && (
                    <button
                      onClick={onNext}
                      disabled={!canNext || loading}
                      className={`relative group flex items-center gap-3 px-8 py-3.5 rounded-2xl
    text-sm font-semibold tracking-wide
    transition-all duration-300 active:scale-95
    ${!canNext || loading
      ? 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-600 cursor-not-allowed border border-slate-200 dark:border-white/5'
      : 'bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 text-white shadow-xl shadow-blue-500/40 hover:from-indigo-600 hover:to-cyan-600'}
  `}
                    >
                      {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-2xl">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      <span className={loading ? 'opacity-0' : ''}>{nextLabel}</span>
                      {!loading && <PlayCircle size={22} strokeWidth={1.5} />}
                    </button>
                )}
            </div>
        </div>
    );
};

export default WizardActionBar;