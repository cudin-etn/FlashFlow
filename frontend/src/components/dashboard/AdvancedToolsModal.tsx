import React, { lazy, Suspense, useState } from 'react';
import { Eraser, FileCode, Scissors, X } from 'lucide-react';

// These tools are intentionally loaded only after the user opens one of them.
// Keeping the entry-point lightweight avoids pulling their sizeable UI and
// backend binding code into the initial Dashboard bundle.
const DebloatModal = lazy(() => import('./DebloatModal').then((module) => ({ default: module.DebloatModal })));
const FlashImageModal = lazy(() => import('./FlashImageModal').then((module) => ({ default: module.FlashImageModal })));
const RomExtractorModal = lazy(() => import('./RomExtractorModal').then((module) => ({ default: module.RomExtractorModal })));

interface AdvancedToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  device?: any;
  currentBrand?: string;
}

type Tool = 'debloat' | 'extractor' | 'image';

/** One entry point for optional tools; the existing tools keep their own UI and behavior. */
export const AdvancedToolsModal: React.FC<AdvancedToolsModalProps> = ({ isOpen, onClose, device, currentBrand }) => {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  if (!isOpen) return null;

  const closeTool = () => setActiveTool(null);
  const tools: Array<{ id: Tool; label: string; description: string; icon: React.ElementType; color: string }> = [
    { id: 'debloat', label: 'Debloat', description: 'Quản lý ứng dụng hệ thống', icon: Eraser, color: 'rose' },
    { id: 'extractor', label: 'ROM Extractor', description: 'Giải nén payload / ROM', icon: Scissors, color: 'violet' },
    { id: 'image', label: 'Flash IMG', description: 'Flash image thủ công', icon: FileCode, color: 'orange' },
  ];
  const iconStyles: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10',
    violet: 'bg-violet-50 text-violet-500 dark:bg-violet-500/10',
    orange: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10',
  };

  return (
    <>
      <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 font-sans">
        <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl" onClick={onClose} />
        <div className="relative w-full max-w-lg rounded-[30px] border border-slate-200 bg-white p-7 shadow-2xl dark:border-white/5 dark:bg-[#13141C]">
          <button onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-red-500 hover:text-white dark:bg-white/5">
            <X size={16} />
          </button>
          <h3 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">Advanced Tools</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Các công cụ bổ sung dành cho thao tác nâng cao.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {tools.map(({ id, label, description, icon: Icon, color }) => (
              <button key={id} onClick={() => setActiveTool(id)} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white dark:border-white/5 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]">
                <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${iconStyles[color]}`}><Icon size={20} /></span>
                <span className="block text-xs font-black text-slate-700 dark:text-slate-200">{label}</span>
                <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-400">{description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <DebloatModal isOpen={activeTool === 'debloat'} onClose={closeTool} currentBrand={currentBrand || ''} />
        <RomExtractorModal isOpen={activeTool === 'extractor'} onClose={closeTool} />
        <FlashImageModal isOpen={activeTool === 'image'} onClose={closeTool} device={device} />
      </Suspense>
    </>
  );
};
