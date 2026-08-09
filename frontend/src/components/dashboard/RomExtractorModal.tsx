import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FolderOpen, FileArchive, CheckSquare, Square,
  Play, StopCircle, Loader2, CheckCircle2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';

interface PartitionInfo {
  name: string;
  size: number;
  type: string;
}

interface ExtractProgress {
  current: string;
  percent: number;
  totalFiles: number;
  doneFiles: number;
}

interface RomExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoApp: any = (window as any).go?.main?.App || {};

const EventsOn = (eventName: string, callback: any) => {
  if (window && (window as any).runtime) return (window as any).runtime.EventsOn(eventName, callback);
  return () => {};
};

export const RomExtractorModal: React.FC<RomExtractorModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [romPath, setRomPath] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [partitions, setPartitions] = useState<PartitionInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Listen for extract_progress events
  useEffect(() => {
    const off = EventsOn('extract_progress', (data: ExtractProgress) => {
      setProgress(data);
      if (data.percent >= 100) {
        setExtracting(false);
        setDone(true);
      }
    });
    return () => { if (off) off(); };
  }, []);

  const handleSelectRom = async () => {
    try {
      const path = await GoApp.SelectRomFile();
      if (!path) return;
      setRomPath(path);
      setPartitions([]);
      setSelected(new Set());
      setError('');
      setDone(false);
      setProgress(null);

      // Load partitions
      setLoading(true);
      const list: PartitionInfo[] = await GoApp.ListRomPartitions(path);
      setPartitions(list || []);
      if (!list || list.length === 0) {
        setError('Không tìm thấy partition nào trong file ROM này.');
      }
    } catch (e: any) {
      setError(e?.toString() || 'Lỗi khi đọc ROM');
      toast.error('Lỗi đọc ROM: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOutput = async () => {
    try {
      const path = await GoApp.SelectOutputDirectory();
      if (path) setOutputDir(path);
    } catch (e: any) {
      toast.error('Lỗi chọn thư mục: ' + e);
    }
  };

  const togglePartition = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === partitions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(partitions.map(p => p.name)));
    }
  };

  const handleExtract = async () => {
    if (!romPath || selected.size === 0 || !outputDir) {
      toast.error('Vui lòng chọn ROM, partition và thư mục output');
      return;
    }

    setExtracting(true);
    setDone(false);
    setError('');
    setProgress(null);

    try {
      await GoApp.ExtractPartitions({
        romPath,
        partitions: Array.from(selected),
        outputDir,
      });
      setDone(true);
      toast.success('Extract hoàn tất!');
    } catch (e: any) {
      const msg = e?.toString() || 'Lỗi extract';
      if (msg.includes('hủy')) {
        toast.info('Đã hủy extract');
      } else {
        setError(msg);
        toast.error('Lỗi: ' + msg);
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await GoApp.CancelExtract();
      toast.info('Đang hủy extract...');
    } catch (e: any) {
      toast.error('Lỗi hủy: ' + e);
    }
  };

  const handleClose = () => {
    if (extracting) return; // Don't close while extracting
    setRomPath('');
    setOutputDir('');
    setPartitions([]);
    setSelected(new Set());
    setProgress(null);
    setError('');
    setDone(false);
    onClose();
  };

  const formatSize = (bytes: number): string => {
    if (bytes <= 0) return '--';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-[#1C1E26] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <FileArchive size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">ROM Extractor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Trích xuất file .img từ ROM ZIP hoặc payload.bin</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={extracting}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ROM File Picker */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">File ROM</label>
            <button
              onClick={handleSelectRom}
              disabled={extracting}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 hover:border-violet-400 dark:hover:border-violet-500/50 bg-slate-50 dark:bg-black/20 transition-all disabled:opacity-50"
            >
              <FolderOpen size={18} className="text-violet-500" />
              <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1 text-left">
                {romPath || 'Chọn file ROM (.zip)...'}
              </span>
            </button>
          </div>

          {/* Output Directory Picker */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Thư mục Output</label>
            <button
              onClick={handleSelectOutput}
              disabled={extracting}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 hover:border-violet-400 dark:hover:border-violet-500/50 bg-slate-50 dark:bg-black/20 transition-all disabled:opacity-50"
            >
              <FolderOpen size={18} className="text-emerald-500" />
              <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1 text-left">
                {outputDir || 'Chọn thư mục lưu file extract...'}
              </span>
            </button>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-violet-500" />
              <span className="ml-3 text-sm text-slate-500">Đang đọc danh sách partition...</span>
            </div>
          )}

          {/* Partition List */}
          {partitions.length > 0 && !loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Partitions ({selected.size}/{partitions.length})
                </label>
                <button
                  onClick={toggleAll}
                  disabled={extracting}
                  className="text-xs font-bold text-violet-500 hover:text-violet-600 transition-colors disabled:opacity-50"
                >
                  {selected.size === partitions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 divide-y divide-slate-100 dark:divide-white/5">
                {partitions.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => !extracting && togglePartition(p.name)}
                    disabled={extracting}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-70 text-left"
                  >
                    {selected.has(p.name) ? (
                      <CheckSquare size={18} className="text-violet-500 flex-shrink-0" />
                    ) : (
                      <Square size={18} className="text-slate-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">
                      {p.name}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                      {formatSize(p.size)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-mono flex-shrink-0">
                      .{p.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress Display */}
          {(extracting || done) && progress && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {done ? 'Hoàn tất' : 'Đang extract...'}
                </span>
                <span className="text-sm font-mono text-violet-500">
                  {progress.doneFiles}/{progress.totalFiles}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-violet-500'}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : (
                  <Loader2 size={14} className="animate-spin text-violet-500" />
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {progress.current}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-3">
          {extracting ? (
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors flex items-center gap-2"
            >
              <StopCircle size={16} /> Hủy
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 font-bold text-sm transition-colors"
              >
                Đóng
              </button>
              <button
                onClick={handleExtract}
                disabled={!romPath || selected.size === 0 || !outputDir || done}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Play size={16} /> Extract ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
