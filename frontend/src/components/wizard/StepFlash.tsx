import React, { useEffect, useState, useRef } from 'react';
import WizardLayout from './WizardLayout';
import { EventsOn } from '../../../wailsjs/runtime';
import { StartFlashReal, ExportLatestFlashReport } from '../../../wailsjs/go/main/App';
import Lottie from "lottie-react";
import loading from "../../assets/lottie/loading.json";
import { Terminal, Activity, ShieldCheck, Zap, X, Info, ChevronDown, ChevronUp, Download, CheckCircle2, AlertTriangle, Circle, Copy, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface StepFlashProps {
    device: any;
    selectedRom: any;
    onNext: (success: boolean) => void;
    onBack: () => void;
    onExit: () => void;
}

const StepFlash: React.FC<StepFlashProps> = ({ device, selectedRom, onNext, onBack, onExit }) => {
    const { t } = useLanguage();
    const [status, setStatus] = useState<'idle' | 'flashing' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentStepName, setCurrentStepName] = useState(t('flash_preparing') || "Đang chuẩn bị...");
    
    const [showArbPopup, setShowArbPopup] = useState(false);
    const [arbData, setArbData] = useState<any>(null);
    const [fullFirmwareAccepted, setFullFirmwareAccepted] = useState(false);
    const [showRawLogs, setShowRawLogs] = useState(true);
    const [copied, setCopied] = useState(false);
    const [report, setReport] = useState<any>(null);
    const [exportPath, setExportPath] = useState<string>("");
    const [exportError, setExportError] = useState<string>("");
    const [isFlashFinalized, setIsFlashFinalized] = useState(false);

    const hasStartedRef = useRef(false);
    const logEndRef = useRef<HTMLDivElement | null>(null);
    const latestReportRef = useRef<any>(null);

    const timeline = [
        { key: 'preflight', label: t('flash_timeline_preflight') || 'Preflight', hint: t('flash_timeline_preflight_hint') || 'Kiểm tra thiết bị/tool' },
        { key: 'arb', label: t('flash_timeline_arb') || 'Firmware Warning', hint: t('flash_timeline_arb_hint') || 'User confirmation' },
        { key: 'prepare', label: t('flash_timeline_prepare') || 'Prepare', hint: t('flash_timeline_prepare_hint') || 'Giải nén / cache ROM' },
        { key: 'bootloader', label: t('flash_timeline_bootloader') || 'Bootloader', hint: t('flash_timeline_bootloader_hint') || 'Nạp boot/super' },
        { key: 'fastbootd', label: t('flash_timeline_fastbootd') || 'FastbootD', hint: t('flash_timeline_fastbootd_hint') || 'Nạp logical/FW' },
        { key: 'finish', label: t('flash_timeline_finish') || 'Finish', hint: t('flash_timeline_finish_hint') || 'Set slot / hoàn tất' },
    ];

    const stageState = (key: string) => {
        const text = `${currentStepName}\n${logs.join('\n')}`.toLowerCase();
        if (status === 'success') return 'success';
        if (status === 'error') {
            if (key === 'finish' || text.includes(key) || text.includes('lỗi') || text.includes('failed')) return 'failed';
        }
        if (key === 'preflight' && (text.includes('preflight') || progress < 15)) return 'running';
        if (key === 'arb' && (text.includes('arb') || showArbPopup)) return showArbPopup ? 'warning' : 'running';
        if (key === 'prepare' && (text.includes('[2/5]') || text.includes('cache') || text.includes('payload'))) return 'running';
        if (key === 'bootloader' && text.includes('[3/5]')) return 'running';
        if (key === 'fastbootd' && text.includes('[4/5]')) return 'running';
        if (key === 'finish' && text.includes('[5/5]')) return 'running';
        const thresholds: Record<string, number> = { preflight: 5, arb: 10, prepare: 25, bootloader: 45, fastbootd: 85, finish: 100 };
        return progress >= thresholds[key] ? 'success' : 'pending';
    };

    const handleExportReport = async () => {
        setExportError("");
        setExportPath("");
        try {
            const path = await ExportLatestFlashReport();
            setExportPath(path);
        } catch (e: any) {
            setExportError(String(e));
        }
    };

    const handleCopyLog = async () => {
        const MAX_COPY_SIZE = 1_048_576; // 1MB
        let logText = logs.join('\n');
        if (logText.length > MAX_COPY_SIZE) {
            logText = logText.slice(0, MAX_COPY_SIZE);
        }
        try {
            await navigator.clipboard.writeText(logText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('[CopyLog] Failed to copy:', e);
        }
    };

    const triggerFlash = async (path: string, skipFW: boolean, force: boolean) => {
        setShowArbPopup(false);
        setFullFirmwareAccepted(false);
        setIsFlashFinalized(false);
        setStatus('flashing'); 
        setCurrentStepName(skipFW ? (t('flash_block_arb') || "Đang nạp, bỏ qua firmware rủi ro...") : (t('flash_full') || "Đang nạp Full..."));
        try {
            await StartFlashReal(path, false, "", skipFW, force);
        } catch (e: any) {
            setLogs(prev => [...prev, "!!! ERROR: " + e]);
            setIsFlashFinalized(true);
            setStatus('error');
        }
    };

   const initFlashProcess = () => {
        if (hasStartedRef.current) return;
        
        // [FIX Ở ĐÂY] Thêm selectedRom?.path vào để hứng dữ liệu từ Auto Flash
        const finalPath = selectedRom?.path || selectedRom?.romPath || selectedRom?.localPath || "";
        
        if (!finalPath) {
             setStatus('error'); 
             setCurrentStepName("Lỗi: Thiếu file ROM");
             return;
        }
        hasStartedRef.current = true;
        setIsFlashFinalized(false);
        setStatus('flashing'); 
        setCurrentStepName(t('flash_analyzing') || "Đang phân tích ROM...");
        triggerFlash(finalPath, false, false);
    };

    // [FIX LOGIC] Xử lý rò rỉ bộ nhớ: Bắt sự kiện chuẩn xác bằng hàm unsubscribe
    useEffect(() => {
        const unsubArb = EventsOn("ask_arb_user", (data: any) => {
            setArbData(data);
            setShowArbPopup(true);
            setFullFirmwareAccepted(false);
            setStatus('idle');
            setCurrentStepName(t('flash_wait_arb') || "Chờ xác nhận tùy chọn...");
        });

        const unsubProg = EventsOn("flash_progress", (p: number) => setProgress(p));
        const unsubStep = EventsOn("flash_step", (s: string) => setCurrentStepName(s));
        const unsubLog = EventsOn("flash_log", (m: string) => {
            setLogs(p => [...p, m]);
        });
        const unsubComp = EventsOn("flash_complete", (success: boolean) => {
            setIsFlashFinalized(true);
            if (success) {
                setStatus('success');
                setProgress(100);
                setCurrentStepName(t('success') || "Hoàn tất!");

            } else {
                setStatus('error');
            }
        });
        const unsubReport = EventsOn("flash_report_update", (data: any) => {
            setReport(data);
            latestReportRef.current = data;
        });

        initFlashProcess();
        
        // Hủy đăng ký sự kiện cụ thể, không dùng EventsOff xóa toàn cục nữa
        return () => { 
            if (unsubProg) unsubProg(); 
            if (unsubStep) unsubStep(); 
            if (unsubLog) unsubLog(); 
            if (unsubComp) unsubComp();
            if (unsubReport) unsubReport();
            if (unsubArb) unsubArb(); 
        };
    }, []);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    const normalizeLog = (raw: string) => { let l = raw.trim(); if(!l) return null; if(l.startsWith(">>>")) return {level:"CMD", text:l.replace(/^>>> ?/,"")}; if(l.includes("ERROR")||l.includes("!!!")) return {level:"ERROR", text:l}; return {level:"INFO", text:l}; };
    
    const getLogClass = (level: string) => { 
        if(level==="ERROR") return "text-red-500 font-bold"; 
        if(level==="CMD") return "text-blue-500 dark:text-blue-400 font-bold"; 
        return "text-slate-600 dark:text-slate-300"; 
    };

    return (
        <WizardLayout
            title={status === 'flashing' ? (t('flash_title_running') || "Đang cài đặt / Flashing") : status === 'success' ? (t('flash_title_success') || "Thành công / Success") : status === 'error' ? (t('flash_title_error') || "Kết thúc / Finished") : (t('flash_title_prep') || "Đang chuẩn bị / Preparing")}
            subtitle={status === 'success' ? (t('flash_sub_success') || "Quá trình flash đã hoàn tất.") : status === 'error' ? (t('flash_sub_error') || "Kiểm tra log để xem bước bị lỗi.") : (t('flash_sub_running') || "Vui lòng duy trì kết nối cáp ổn định.")}
            onBack={onBack} canBack={false}
            onNext={() => onNext(status === 'success')} canNext={isFlashFinalized && (status === 'success' || status === 'error')}
            nextLabel={t('btn_next') || "Tiếp tục"}
            hideNavigation={!isFlashFinalized}
        >
            <div className="flex-1 flex flex-col min-h-0 pt-4 pb-2 gap-4 relative">
                
                {showArbPopup && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300 px-6">
                        <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md" />
                        <div className="relative bg-white dark:bg-[#131314] w-full max-w-md rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                            
                            <div className="p-6 pb-2 flex flex-col items-center text-center">
                                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4">
                                    <Info size={28} />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t('arb_title') || "Cảnh báo Firmware"}</h3>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 px-4 leading-relaxed">
                                    {t('arb_desc') || "ROM có firmware-risk images. FlashFlow không xác định ARB theo từng model; hãy tự kiểm tra trước khi flash full firmware."}
                                </p>
                            </div>

                            <div className="px-6 py-4 grid grid-cols-1 gap-3">
                                <button 
                                    onClick={() => triggerFlash(arbData.path, true, false)}
                                    className="relative group p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-all text-left hover:shadow-sm active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="p-1.5 bg-emerald-500 text-white rounded-lg">
                                            <ShieldCheck size={16} />
                                        </div>
                                        <span className="font-black text-emerald-700 dark:text-emerald-400 text-sm">{t('arb_btn_keep') || "Bỏ qua 4 file firmware"}</span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-500 dark:text-emerald-100/60 leading-tight">
                                        {t('arb_hint_keep') || "Không flash xbl, abl, xbl_config, xbl_ramdump."}
                                    </p>
                                </button>

                                <label className="flex items-start gap-3 rounded-2xl border border-orange-200 dark:border-orange-500/20 bg-orange-50/70 dark:bg-orange-500/5 p-4 text-left cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={fullFirmwareAccepted}
                                        onChange={(e) => setFullFirmwareAccepted(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <span className="text-xs font-bold leading-relaxed text-orange-800 dark:text-orange-200/80">
                                        {t('arb_ack_full') || "Tôi hiểu rủi ro downgrade/ARB và tự chịu trách nhiệm khi flash full firmware."}
                                    </span>
                                </label>

                                <button 
                                    onClick={() => triggerFlash(arbData.path, false, true)}
                                    disabled={!fullFirmwareAccepted}
                                    className="relative group p-4 rounded-2xl border border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/5 hover:bg-orange-100 dark:hover:bg-orange-500/10 transition-all text-left hover:shadow-sm active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-orange-50 dark:disabled:hover:bg-orange-500/5"
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="p-1.5 bg-orange-500 text-white rounded-lg">
                                            <Zap size={16} />
                                        </div>
                                        <span className="font-black text-orange-700 dark:text-orange-400 text-sm">{t('arb_btn_full') || "Flash Full Firmware"}</span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-500 dark:text-orange-100/60 leading-tight">
                                        {t('arb_hint_full') || "Flash toàn bộ firmware-risk images nếu có trong ROM."}
                                    </p>
                                </button>
                            </div>

                            <div className="p-6 pt-2 flex flex-col items-center">
                                <button 
                                    onClick={onExit}
                                    className="w-full py-3.5 rounded-xl bg-slate-100 dark:bg-[#1E1F22] hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <X size={16} strokeWidth={2.5} /> {t('btn_cancel') || "Hủy thao tác"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- CONSOLE UI --- */}
                <div className="flex-1 min-h-0 bg-white dark:bg-[#0c0c0c] rounded-[2rem] border border-slate-200 dark:border-[#222] shadow-xl overflow-hidden flex flex-col transition-colors duration-300">
                    <div className="flex items-center justify-between px-6 py-3 bg-slate-50 dark:bg-[#151515] border-b border-slate-200 dark:border-[#2a2a2a]">
                        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400">
                            <Terminal size={14} className="text-blue-500 dark:text-blue-400" />
                            {t('flash_log_title') || "Nhật ký thực thi"}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCopyLog}
                                disabled={logs.length === 0}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${
                                    copied
                                        ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                        : 'border-slate-200 dark:border-[#2b2b2b] bg-white/80 dark:bg-[#121212] text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181818]'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? (t('flash_copy_log_done') || "Đã sao chép!") : (t('flash_copy_log') || "Copy Log")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowRawLogs(prev => !prev)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-[#2b2b2b] bg-white/80 dark:bg-[#121212] px-3 py-1.5 text-xs font-bold tracking-wide text-slate-500 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-[#181818]"
                            >
                                {showRawLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showRawLogs ? (t('flash_hide_log') || "Ẩn Log") : (t('flash_show_log') || "Hiện Log")}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex flex-col px-8 py-6 bg-gradient-to-b from-slate-50/50 to-white dark:from-[#111] dark:to-[#0c0c0c] border-b border-slate-200 dark:border-[#222] relative overflow-hidden">
                        <div className="flex items-center gap-6 relative z-10">
                            <div className="shrink-0 p-1.5 rounded-full bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#333]">
                                {status === 'flashing' ? (
                                    <Lottie animationData={loading} loop autoplay style={{ height: 48, width: 48 }} />
                                ) : (
                                    <Activity size={32} className={status === 'success' ? "text-green-500" : "text-red-500"} />
                                )}
                            </div>
                            <div className="flex-1 flex flex-col gap-3.5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-[#2d2d2d] bg-white/80 dark:bg-[#141414] px-3 py-1 text-xs font-black tracking-widest text-slate-500 dark:text-slate-300">
                                            <span className={`w-2 h-2 rounded-full ${status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
                                            {status === 'flashing' ? (t('status_flashing') || "Đang xử lý") : status === 'success' ? (t('success') || "Hoàn tất") : (t('error') || "Lỗi")}
                                        </div>
                                        <div className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400 break-words">
                                            {currentStepName}
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-3xl font-black text-blue-600 dark:text-blue-400">{progress}%</span>
                                </div>
                                <div className="h-3 bg-slate-200 dark:bg-gray-800/50 rounded-full overflow-hidden border border-slate-300 dark:border-gray-700/30">
                                    <div className={`h-full rounded-full transition-all duration-300 ${status === 'success' ? 'bg-green-500 shadow-sm' : status === 'error' ? 'bg-red-500 shadow-sm' : 'bg-blue-500 shadow-sm'}`} style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 px-6 py-4 border-b border-slate-200 dark:border-[#222] bg-white/70 dark:bg-[#090909]">
                        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-white to-slate-50 dark:from-[#141414] dark:to-[#090909] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">{t('flash_timeline_title') || 'Flash Timeline'}</div>
                                    <div className="text-[11px] font-semibold text-slate-400 mt-1">{t('flash_timeline_desc') || 'Theo dõi từng stage nạp ROM'}</div>
                                </div>
                                <div className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-black text-blue-500">{report?.arbMode || 'normal'}</div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {timeline.map((item) => {
                                    const state = stageState(item.key);
                                    const color = state === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500' : state === 'running' ? 'border-blue-400/40 bg-blue-500/10 text-blue-500' : state === 'warning' ? 'border-amber-400/40 bg-amber-500/10 text-amber-500' : state === 'failed' ? 'border-red-400/40 bg-red-500/10 text-red-500' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-400';
                                    const Icon = state === 'success' ? CheckCircle2 : state === 'failed' ? AlertTriangle : state === 'running' ? Activity : Circle;
                                    return (
                                        <div key={item.key} className={`rounded-2xl border p-3 transition-all duration-300 ${color}`}>
                                            <div className="flex items-center gap-2">
                                                <Icon size={15} className={state === 'running' ? 'animate-pulse' : ''} />
                                                <span className="text-xs font-black">{item.label}</span>
                                            </div>
                                            <div className="mt-1 text-[10px] font-semibold opacity-75">{item.hint}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-4 text-white shadow-lg shadow-blue-950/20">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">{t('flash_report_title') || 'Flash Report'}</div>
                                    <div className="mt-2 text-sm font-bold truncate max-w-[320px]">{report?.rom || (t('flash_report_empty') || 'Chưa có phiên flash')}</div>
                                    <div className="mt-1 text-[11px] font-semibold text-slate-400">{report?.sessionId ? `${t('flash_report_session') || 'Session'} ${report.sessionId}` : (t('flash_report_after_preflight') || 'Report tạo sau preflight')}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleExportReport}
                                    disabled={!report}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <Download size={15} /> {t('flash_report_export') || 'Export'}
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-2xl bg-white/8 p-3">
                                    <div className="text-lg font-black text-emerald-300">{report?.flashedPartitions?.length || 0}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{t('flash_report_flashed') || 'Flashed'}</div>
                                </div>
                                <div className="rounded-2xl bg-white/8 p-3">
                                    <div className="text-lg font-black text-amber-300">{report?.skippedArbPartitions?.length || 0}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{t('flash_report_arb_skip') || 'ARB Skip'}</div>
                                </div>
                                <div className="rounded-2xl bg-white/8 p-3">
                                    <div className="text-lg font-black text-red-300">{report?.failures?.length || 0}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{t('flash_report_errors') || 'Errors'}</div>
                                </div>
                            </div>
                            {(exportPath || exportError) && (
                                <div className={`mt-3 rounded-2xl border px-3 py-2 text-[11px] font-bold ${exportPath ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-red-400/30 bg-red-400/10 text-red-200'}`}>
                                    {exportPath ? `${t('flash_report_exported') || 'Đã export'}: ${exportPath}` : exportError}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 relative group">
                        {showRawLogs ? (
                            <pre className="absolute inset-0 overflow-auto px-8 py-5 text-xs font-mono leading-relaxed custom-scrollbar">
                                {logs.map((raw, i) => {
                                    const n = normalizeLog(raw);
                                    if (!n) return null;
                                    return <div key={i} className={`break-words mb-1 ${getLogClass(n.level)}`}>{n.text}</div>;
                                })}
                                <div ref={logEndRef} />
                            </pre>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                                <div>
                                    <div className="text-sm font-black text-slate-700 dark:text-slate-200">{t('flash_hidden_log_title') || "Nhật ký đã ẩn"}</div>
                                    <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{t('flash_hidden_log_desc') || "Bấm hiện Log để xem chi tiết các lệnh ADB/Fastboot."}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </WizardLayout>
    );
};

export default StepFlash;
