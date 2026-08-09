import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    CheckCircle2,
    Cpu,
    FileCode,
    FolderPlus,
    Layers,
    Loader2,
    Play,
    Power,
    Shield,
    Trash2,
    UploadCloud,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

const COLOR_MAP: Record<string, string> = {
    cyan: '#0891B2',
    blue: '#2563EB',
    purple: '#9333EA',
    orange: '#EA580C',
    rose: '#E11D48',
    emerald: '#059669',
};

const EventsOn = (eventName: string, callback: any) => {
    if (window && (window as any).runtime) {
        return (window as any).runtime.EventsOn(eventName, callback);
    }
    return () => {};
};

interface FlashItem {
    id: string;
    path: string;
    name: string;
    partition: string;
    status: 'pending' | 'processing' | 'done' | 'error';
}

const BOOTLOADER_PARTITIONS = new Set([
    'boot', 'vendor_boot', 'init_boot', 'dtbo', 'vbmeta', 'vbmeta_system', 'vbmeta_vendor',
    'recovery', 'modem',
    'super', 'super_empty',
]);

const getPredictedGroup = (partition: string) => {
    const base = partition.replace(/_a$|_b$/i, '').toLowerCase();
    return BOOTLOADER_PARTITIONS.has(base) ? 'Bootloader' : 'FastbootD';
};

export const FlashImageModal = ({ isOpen, onClose }: any) => {
    const { t } = useLanguage();
    const { color: themeName } = useTheme();
    const activeHex = COLOR_MAP[themeName] || COLOR_MAP.cyan;

    const [files, setFiles] = useState<FlashItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const unsubProgress = EventsOn('flash_progress', (p: number) => setProgress(p));
        const unsubLog = EventsOn('flash_log', (msg: string) => setLogs(prev => [...prev, msg]));

        return () => {
            if (unsubProgress) unsubProgress();
            if (unsubLog) unsubLog();
        };
    }, [isOpen]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const analyzeFile = (path: string): FlashItem => {
        const fileName = path.replace(/^.*[\\/]/, '');
        let partition = fileName.replace(/\.[^/.]+$/, '').toLowerCase();

        if (partition.endsWith('_a') || partition.endsWith('_b')) {
            partition = partition.slice(0, -2);
        }

        return {
            id: Math.random().toString(36).slice(2, 11),
            path,
            name: fileName,
            partition,
            status: 'pending',
        };
    };

    const bootloaderFiles = useMemo(
        () => files.filter(item => getPredictedGroup(item.partition) === 'Bootloader'),
        [files],
    );

    const fastbootdFiles = useMemo(
        () => files.filter(item => getPredictedGroup(item.partition) === 'FastbootD'),
        [files],
    );

    const addFilesFromPaths = (paths: string[]) => {
        const validPaths = paths.filter(path => path && path.toLowerCase().endsWith('.img'));
        if (validPaths.length === 0) return;

        setFiles(prev => {
            const existing = new Set(prev.map(f => f.path));
            const nextItems = validPaths
                .filter(path => !existing.has(path))
                .map(path => analyzeFile(path));

            return [...prev, ...nextItems];
        });
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);

        if (isProcessing) return;

        const paths = Array.from(event.dataTransfer.files || [])
            .map((file: any) => file.path || file.name)
            .filter(Boolean);

        addFilesFromPaths(paths);
    };

    const handleAddFile = async () => {
        if (isProcessing) return;

        try {
            const selected = await (window as any).go.main.App.SelectImageFiles();
            const paths: string[] = Array.isArray(selected) ? selected.filter(Boolean) : [];
            addFilesFromPaths(paths);
        } catch (e) {
            toast.error(t('error') + ': ' + e);
        }
    };

    const handleStart = async () => {
        if (files.length === 0) return;

        setIsProcessing(true);
        setIsSuccess(false);
        setProgress(0);
        setLogs(['>>> Flash IMG Smart Group']);

        const backendItems = files.map(f => ({
            id: 0,
            partition: f.partition,
            path: f.path,
        }));

        try {
            setFiles(prev => prev.map(f => ({ ...f, status: 'processing' })));
            setLogs(prev => [...prev, `>>> ${files.length} IMG selected. Backend will split BL/FBD.`]);

            await (window as any).go.main.App.FlashImagesSmartGroup(backendItems);

            setFiles(prev => prev.map(f => ({ ...f, status: 'done' })));
            setIsSuccess(true);
        } catch (e: any) {
            setLogs(prev => [...prev, '!!! ABORTED: ' + e]);
            setFiles(prev => prev.map(f => ({ ...f, status: 'error' })));
        } finally {
            setIsProcessing(false);
        }
    };

    const renderStatus = (item: FlashItem) => {
        if (item.status === 'done') return <span className="text-emerald-500">{t('status_done')}</span>;
        if (item.status === 'processing') return <span className="text-blue-500 animate-pulse">{t('status_processing')}</span>;
        if (item.status === 'error') return <span className="text-red-500">{t('status_error')}</span>;
        return <span className="text-slate-400">{t('status_pending')}</span>;
    };

    const renderFileRow = (item: FlashItem) => (
        <div
            key={item.id}
            className="group flex items-center gap-3 p-3 rounded-[16px] bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 transition-all hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-sm"
        >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#13141C] text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-white/5 shadow-sm">
                <FileCode size={18} strokeWidth={2} />
            </div>

            <div className="min-w-0 flex-1">
                <h4 className="truncate text-[13px] font-black text-slate-800 dark:text-slate-200">
                    {item.name}
                </h4>
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {item.path}
                </p>
            </div>

            <input
                className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700 outline-none transition-all focus:ring-2 dark:border-white/10 dark:bg-[#13141C] dark:text-slate-200"
                style={{ '--tw-ring-color': activeHex } as any}
                value={item.partition}
                onChange={(e) => setFiles(prev => prev.map(f => (
                    f.id === item.id ? { ...f, partition: e.target.value.toLowerCase() } : f
                )))}
                disabled={isProcessing}
            />

            <div className="w-16 text-center text-[10px] font-black uppercase tracking-widest">
                {renderStatus(item)}
            </div>

            <button
                onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))}
                disabled={isProcessing}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-500/20 outline-none"
            >
                <X size={16} strokeWidth={2.5} />
            </button>
        </div>
    );

    const renderGroupSection = (
        title: string,
        groupFiles: FlashItem[],
        icon: React.ReactNode,
    ) => (
        <section className="flex flex-col h-full bg-slate-50 dark:bg-[#1C1E26] rounded-[24px] border border-slate-200 dark:border-white/5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 px-5 py-4 bg-white dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5">
                        {icon}
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                        {title}
                    </h4>
                </div>
                <span className="rounded-full bg-slate-200 dark:bg-white/10 px-3 py-1 text-[10px] font-black text-slate-600 dark:text-slate-300">
                    {groupFiles.length}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {groupFiles.length === 0 ? (
                    <div className="flex h-full min-h-[100px] flex-col items-center justify-center text-center opacity-50">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {t('status_pending')}
                        </span>
                    </div>
                ) : (
                    groupFiles.map(renderFileRow)
                )}
            </div>
        </section>
    );

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 font-sans animate-in fade-in duration-300">
            
            {/* Nền Kính Mờ Tối Đa */}
            <div className="absolute inset-0 bg-slate-900/60 dark:bg-[#05050A]/80 backdrop-blur-2xl cursor-default" onClick={() => !isProcessing && onClose()} />

            {/* Khung Bento Modal Chính */}
            <div className="relative flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 shadow-2xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.8)] scale-100 animate-in zoom-in-95 duration-300">
                
                {/* Lớp Texture mờ ảo */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-[0.15] dark:opacity-[0.05] mix-blend-overlay pointer-events-none"></div>

                {/* Header Tối Giản Nghệ Thuật */}
                <div className="px-8 py-6 flex justify-between items-center relative z-10 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#1C1E26]/50 backdrop-blur-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-[16px] flex items-center justify-center shadow-lg text-white" style={{ background: `linear-gradient(135deg, ${activeHex}, ${activeHex}dd)` }}>
                        <Layers size={22} strokeWidth={2.5} />
                     </div>
                     <div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('flash_img_title')}</h3>
                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{t('flash_img_desc')}</p>
                     </div>
                   </div>
                   <button onClick={() => !isProcessing && onClose()} className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/5 border border-slate-300 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 flex items-center justify-center transition-all duration-300 outline-none hover:rotate-90 shadow-sm">
                       <X size={20}/>
                   </button>
                </div>

                {/* Main Content Area */}
                <div className="flex flex-1 min-h-0 relative z-10">
                    
                    {isSuccess ? (
                        /* SUCCESS SCREEN HERO (Chuẩn Bento PromptPal) */
                        <div className="w-full flex flex-col items-center justify-center p-12 bg-emerald-50 dark:bg-emerald-900/10">
                            <div className="relative flex items-center justify-center w-48 h-48 mb-8 animate-[float-gentle_6s_ease-in-out_infinite]">
                                <div className="absolute inset-0 bg-emerald-500 rounded-full blur-[50px] opacity-20"></div>
                                <div className="relative w-28 h-28 rounded-[28px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-2xl z-10">
                                    <CheckCircle2 size={50} strokeWidth={2} className="text-white drop-shadow-md" />
                                </div>
                            </div>
                            <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-3">
                                {t('done_title_success')}
                            </h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-10">
                                {t('flash_msg_success')}
                            </p>
                            <div className="flex gap-4">
                                <button onClick={onClose} className="px-8 py-3.5 rounded-full font-bold text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white transition-all outline-none">
                                    {t('done_btn_home')}
                                </button>
                                <button onClick={async () => { await (window as any).go.main.App.RebootSystem(); onClose(); }} 
                                    className="px-8 py-3.5 rounded-full font-bold text-sm text-white shadow-lg transition-all outline-none hover:scale-105 active:scale-95 flex items-center gap-2"
                                    style={{ background: `linear-gradient(135deg, ${activeHex}, ${activeHex}dd)` }}>
                                    <Power size={18} strokeWidth={2.5}/> {t('done_btn_reboot')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* BENTO GRID LAYOUT */
                        <div className="w-full h-full grid grid-cols-12 gap-6 p-6">
                            
                            {/* COL LEFT (7/12): Import & Danh sách Files */}
                            <div className="col-span-7 flex flex-col gap-4 min-h-0">
                                {/* Toolbar */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <button onClick={handleAddFile} disabled={isProcessing}
                                        className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black text-white shadow-md transition-all hover:opacity-90 active:scale-95 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ backgroundColor: activeHex }}>
                                        <FolderPlus size={16} strokeWidth={2.5} /> {t('flash_btn_add')}
                                    </button>
                                    <button onClick={() => setFiles([])} disabled={isProcessing || files.length === 0}
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-5 py-2.5 text-xs font-black text-slate-600 dark:text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed outline-none">
                                        <Trash2 size={16} strokeWidth={2.5} /> {t('flash_btn_clear')}
                                    </button>
                                </div>

                                {/* Main Area (Kéo thả hoặc Danh sách) */}
                                <div className="flex-1 bg-slate-50 dark:bg-[#1C1E26] rounded-[24px] border border-slate-200 dark:border-white/5 overflow-hidden relative">
                                    {files.length === 0 ? (
                                        <div onClick={handleAddFile}
                                            onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setIsDragging(true); }}
                                            onDragLeave={() => setIsDragging(false)}
                                            onDrop={handleDrop}
                                            className={`absolute inset-4 flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed transition-all cursor-pointer
                                                ${isDragging ? 'scale-[0.99] bg-blue-50/50 border-blue-400 dark:bg-blue-500/10 dark:border-blue-400' 
                                                : 'border-slate-300 dark:border-white/10 text-slate-400 hover:border-blue-400 hover:bg-slate-100 dark:hover:border-white/30 dark:hover:bg-white/5'}`}
                                            style={{ borderColor: isDragging ? activeHex : '' }}>
                                            
                                            <div className="w-20 h-20 rounded-3xl bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 shadow-sm flex items-center justify-center mb-6">
                                                <UploadCloud size={36} className="text-slate-400" />
                                            </div>
                                            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{t('flash_btn_add')}</h3>
                                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('flash_img_desc')}</p>
                                        </div>
                                    ) : (
                                        <div className="h-full p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar"
                                            onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setIsDragging(true); }}
                                            onDragLeave={() => setIsDragging(false)}
                                            onDrop={handleDrop}>
                                            {renderGroupSection(t('mode_bootloader'), bootloaderFiles, <Shield size={16} />)}
                                            {renderGroupSection(t('mode_fastbootd'), fastbootdFiles, <Cpu size={16} />)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* COL RIGHT (5/12): Stats, Terminal & Action */}
                            <div className="col-span-5 flex flex-col gap-4 min-h-0">
                                
                                {/* 3 Mini Bento Stats */}
                                <div className="grid grid-cols-3 gap-3 shrink-0">
                                    <div className="rounded-[20px] bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 p-4 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black text-slate-800 dark:text-white leading-none mb-1">{files.length}</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('flash_col_file')}</span>
                                    </div>
                                    <div className="rounded-[20px] bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 p-4 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black text-orange-600 dark:text-orange-400 leading-none mb-1">{bootloaderFiles.length}</span>
                                        <span className="text-[9px] font-bold text-orange-500 uppercase tracking-widest">{t('mode_bootloader')}</span>
                                    </div>
                                    <div className="rounded-[20px] bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none mb-1">{fastbootdFiles.length}</span>
                                        <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">{t('mode_fastbootd')}</span>
                                    </div>
                                </div>

                                {/* Terminal Log (Dark ngầu) */}
                                <div className="flex-1 bg-slate-900 dark:bg-[#0B0C10] rounded-[24px] border border-slate-800 dark:border-white/5 flex flex-col overflow-hidden shadow-inner">
                                    {/* Progress Line */}
                                    <div className="h-1 w-full bg-slate-800 dark:bg-white/5">
                                        <div className="h-full transition-all duration-300 ease-out" style={{ width: `${progress}%`, backgroundColor: activeHex }} />
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-relaxed custom-scrollbar">
                                        {logs.length === 0 ? (
                                            <div className="flex items-center gap-2 italic text-slate-500 h-full justify-center">
                                                <Loader2 size={14} className="animate-spin" /> {t('flash_msg_wait_conn')}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {logs.map((log, i) => (
                                                    <div key={i} className={`break-words ${
                                                        log.includes('OKAY') || log.includes('Success') ? 'text-emerald-400 font-bold'
                                                        : log.includes('!!!') ? 'text-rose-400 font-bold'
                                                        : log.startsWith('>>>') ? 'text-blue-400 font-bold'
                                                        : 'text-slate-400'
                                                    }`}>
                                                        {log}
                                                    </div>
                                                ))}
                                                <div ref={logsEndRef} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Nút Khởi Chạy Siêu To Khổng Lồ */}
                                <button onClick={handleStart} disabled={isProcessing || files.length === 0}
                                    className="shrink-0 relative overflow-hidden rounded-[20px] px-8 py-5 text-sm font-black text-white shadow-xl transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                    style={{ background: isProcessing || files.length === 0 ? '#64748B' : `linear-gradient(135deg, ${activeHex}, ${activeHex}dd)` }}>
                                    
                                    {isProcessing && <div className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300" style={{ width: `${progress}%` }} />}
                                    
                                    <span className="relative z-10 flex items-center justify-center gap-3">
                                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                                        {isProcessing ? `${t('status_processing')} ${progress}%` : t('flash_btn_start')}
                                    </span>
                                </button>

                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};
