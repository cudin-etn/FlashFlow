import React, { useState, useEffect } from 'react';
import WizardLayout from './WizardLayout';
import { AnalyzeRomSource } from '../../../wailsjs/go/main/App';
import { 
    Globe, CheckCircle2, AlertCircle, ArrowUpRight,
    FolderSearch, X, Cloud, Archive, FolderOpen, Boxes, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import Lottie from "lottie-react";
import chooseAnimation from "../../assets/lottie/choose.json";

interface StepRomSelectProps {
    device: any;
    onNext: (romInfo?: any) => void;
    onBack: () => void;
    onExit?: () => void;
    mode?: string;
    filePath?: string;
}

const StepRomSelect: React.FC<StepRomSelectProps> = ({ device, onNext, onBack, onExit, mode, filePath }) => {
    const { t } = useLanguage();
    
    // --- STATE ---
    const [manualFileInfo, setManualFileInfo] = useState<any>(null);
    const [isAnalyzingSource, setIsAnalyzingSource] = useState(false);

    // Xác định hãng để phân luồng UI
    const vendor = (device?.vendor || "").toLowerCase();
    const isWebSupported = vendor === "oneplus";

    // --- LOGIC: Xử lý file từ Library truyền vào ---
    useEffect(() => {
        if (mode === 'manual' && filePath) {
            analyzeLocalPath(filePath);
        }
    }, [mode, filePath]);


    const analyzeLocalPath = async (path: string, sourceType: 'zip' | 'folder' = 'zip') => {
        const fileName = path.split(/[\\/]/).filter(Boolean).pop() || "Unknown ROM";
        setIsAnalyzingSource(true);
        setManualFileInfo({
            path,
            name: fileName,
            type: t('rom_analyzing') || "Đang phân tích ROM source...",
            isValid: false,
            sourceType,
            badges: [{ key: 'scan', label: t('rom_badge_scanning') || 'Scanning', active: true }],
        });

        try {
            const analysis = await AnalyzeRomSource(path);
            const badges = [
                analysis.hasPayload ? { key: 'payload', label: 'payload.bin', active: true } : null,
                analysis.imageCount > 0 ? { key: 'images', label: `${analysis.imageCount} .img`, active: true } : null,
                analysis.sourceType === 'folder_images' ? { key: 'folder_images', label: t('rom_badge_unpacked') || 'Unpacked images', active: true } : null,
                analysis.sourceType === 'folder_payload' ? { key: 'folder_payload', label: t('rom_badge_folder_payload') || 'Folder payload', active: true } : null,
                analysis.sourceType === 'zip_payload' ? { key: 'zip_payload', label: t('rom_badge_full_ota') || 'Full OTA', active: true } : null,
            ].filter(Boolean);

            setManualFileInfo({
                path,
                name: analysis.name || fileName,
                type: analysis.message || (analysis.valid ? "ROM source ready" : "Unsupported"),
                isValid: analysis.valid,
                sourceType,
                analysis,
                badges,
            });

            if (analysis.valid) {
                toast.success(t('rom_msg_local_success') || "ROM loaded successfully!");
            } else {
                toast.error(analysis.message || (t('rom_invalid_source') || "Invalid ROM source"));
            }
        } catch (error) {
            setManualFileInfo({ path, name: fileName, type: String(error), isValid: false, sourceType, badges: [] });
            toast.error((t('error') || "Lỗi") + ": " + error);
        } finally {
            setIsAnalyzingSource(false);
        }
    };

    const handleSelectFile = async () => {
        try {
            const path = await (window as any).go.main.App.SelectRomFile();
            if (path) {
                analyzeLocalPath(path, 'zip');
            }
        } catch (error) {
            toast.error((t('error') || "Lỗi") + ": " + error);
        }
    };

    const handleSelectFolder = async () => {
        try {
            const path = await (window as any).go.main.App.SelectRomFolder();
            if (path) {
                analyzeLocalPath(path, 'folder');
            }
        } catch (error) {
            toast.error((t('error') || "Lỗi") + ": " + error);
        }
    };


    // --- UI COMPONENT: LOCAL ROM ZIP/FOLDER CARD ---
    const LocalFileSelector = () => (
        <div
            className={`flex flex-col h-[400px] rounded-[2rem] transition-all duration-300 overflow-hidden relative group border
                ${manualFileInfo?.isValid
                    ? 'border-violet-400/60 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 shadow-xl shadow-violet-500/10'
                    : 'border-violet-200/70 dark:border-violet-900/30 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 hover:border-violet-400/70 dark:hover:border-violet-700/50 shadow-xl shadow-violet-500/5'}`}
        >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_34%)]" />

            {manualFileInfo?.isValid && (
                <button
                    onClick={(e) => { e.stopPropagation(); setManualFileInfo(null); }}
                    disabled={isAnalyzingSource}
                    className="absolute top-4 right-4 p-2 bg-white/80 dark:bg-black/40 rounded-full text-slate-400 hover:text-red-500 shadow-sm z-10"
                >
                    <X size={16} />
                </button>
            )}

            {!manualFileInfo ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 dark:text-slate-400 transition-colors relative z-10">
                    <div className="w-24 h-24 rounded-full bg-white/70 dark:bg-white/5 border border-violet-200/70 dark:border-violet-800/30 flex items-center justify-center mb-6 shadow-inner">
                        <FolderSearch size={40} />
                    </div>
                    <h3 className="font-black text-lg mb-2 text-slate-800 dark:text-slate-100 uppercase tracking-widest">{t('rom_local_title') || 'Local ROM'}</h3>
                    <p className="text-sm font-medium text-center px-4 text-slate-600 dark:text-slate-300">
                        {t('rom_local_desc') || 'Choose a ROM .zip file or an unpacked ROM folder.'}
                    </p>
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                        <button
                            type="button"
                            onClick={handleSelectFile}
                            className="rounded-2xl border border-violet-200 dark:border-violet-800/40 bg-white/80 dark:bg-white/5 px-4 py-4 text-left transition-all hover:-translate-y-1 hover:border-violet-400 hover:shadow-lg"
                        >
                            <Archive size={20} className="mb-3 text-violet-500" />
                            <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">ROM .ZIP</div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('rom_zip_desc') || 'Full OTA / Super ROM archive'}</div>
                        </button>
                        <button
                            type="button"
                            onClick={handleSelectFolder}
                            className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-white/80 dark:bg-white/5 px-4 py-4 text-left transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"
                        >
                            <FolderOpen size={20} className="mb-3 text-blue-500" />
                            <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">{t('rom_folder_title') || 'Unpacked Folder'}</div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('rom_folder_desc') || 'Folder containing .img files'}</div>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                    <div className={`w-20 h-20 rounded-full ${isAnalyzingSource ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300' : manualFileInfo.isValid ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300' : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300'} flex items-center justify-center mb-6 shadow-inner`}>
                        {isAnalyzingSource ? <FolderSearch size={36} className="animate-pulse" /> : manualFileInfo.isValid ? <CheckCircle2 size={40} strokeWidth={2.5} /> : <AlertCircle size={40} strokeWidth={2.5} />}
                    </div>
                    <div className="text-center w-full">
                        <span className="inline-block px-3 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-black uppercase tracking-widest rounded-full mb-3">
                            {isAnalyzingSource ? (t('rom_badge_scanning') || 'SCANNING') : manualFileInfo.sourceType === 'folder' ? (t('rom_folder_ready') || 'FOLDER READY') : 'ROM .ZIP READY'}
                        </span>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white break-all leading-tight mb-3 px-4 line-clamp-2">
                            {manualFileInfo.name}
                        </h3>
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-4">
                            {manualFileInfo.type}
                        </div>
                        <div className="mb-4 flex flex-wrap justify-center gap-2">
                            {(manualFileInfo.badges || []).map((badge: any) => (
                                <span key={badge.key} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                    <Boxes size={12} /> {badge.label}
                                </span>
                            ))}
                        </div>
                        {manualFileInfo.analysis?.prepareMode && (
                            <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-blue-200/70 dark:border-blue-800/40 bg-blue-50/80 dark:bg-blue-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                <Activity size={14} /> {manualFileInfo.analysis.prepareMode.replaceAll('_', ' ')}
                            </div>
                        )}
                        <div className="inline-flex items-center gap-2 p-2 px-4 bg-white/70 dark:bg-black/30 rounded-xl border border-violet-200/60 dark:border-violet-900/30 font-mono text-[10px] text-slate-500 max-w-[80%]">
                            <FolderSearch size={12} className="shrink-0" />
                            <span className="truncate">{manualFileInfo.path}</span>
                        </div>
                    </div>
                </div>
            )}

            {!manualFileInfo?.isValid && manualFileInfo !== null && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 text-red-600 font-bold bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-200 dark:border-red-900/30 text-xs w-[80%] z-10">
                    <AlertCircle size={16} /> {t('rom_invalid_source') || 'Only ROM .zip files or unpacked ROM folders are supported here.'}
                </div>
            )}
        </div>
    );

    return (
        <WizardLayout
            title={t('step_rom_title') || "Lựa chọn Firmware"}
            subtitle={`${t('step_rom_subtitle') || "Xác định tệp tin ROM để nạp vào thiết bị"} (${device?.model || 'Unknown'})`}
            onBack={onBack}
            onNext={() => onNext({ isLocal: true, path: manualFileInfo?.path, analysis: manualFileInfo?.analysis })}
            canNext={!!manualFileInfo?.isValid && !isAnalyzingSource}
            onExit={onExit}
            nextLabel={t('btn_next_flash') || "TIẾP TỤC FLASH"}
        >
            {isWebSupported ? (
                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* CỘT 1: WEB DOWNLOAD ROM ONEPLUS (DANIEL SPRINGER) */}
                    <div className="flex flex-col h-[400px] bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border border-red-200 dark:border-red-900/30 rounded-[2rem] overflow-hidden shadow-xl shadow-red-500/5 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                            <Cloud size={120} />
                        </div>
                        <div className="px-6 py-5 border-b border-red-200/50 dark:border-red-900/30 flex justify-between items-center shrink-0 z-10 bg-white/40 dark:bg-black/20 backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl">
                                    <Globe size={20} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm text-slate-800 dark:text-white uppercase tracking-tight">Trạm Tải OnePlus</h3>
                                    <p className="text-[10px] font-bold text-slate-500">Nguồn: Daniel Springer</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 relative">
                            <div className="w-28 h-28 mb-4 bg-white/50 dark:bg-white/5 rounded-full flex items-center justify-center shadow-inner">
                                <Lottie animationData={chooseAnimation} loop={true} className="w-20 h-20" />
                            </div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white mb-4">Tải Firmware Chính Thức</h4>
                            <div className="space-y-2 mb-6 text-left w-full px-2">
                                <div className="flex items-start gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                    <CheckCircle2 size={16} className="text-red-500 shrink-0 mt-0.5" />
                                    <span>Tìm đúng dòng máy (VD: OnePlus 9 Pro).</span>
                                </div>
                                <div className="flex items-start gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                    <CheckCircle2 size={16} className="text-red-500 shrink-0 mt-0.5" />
                                    <span>Chọn bản ROM định dạng <b>.zip</b> (Full OTA / Super ROM).</span>
                                </div>
                            </div>
                            <button
                                onClick={() => (window as any).runtime.BrowserOpenURL("https://roms.danielspringer.at/")}
                                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/30 flex items-center justify-center gap-2 transition-all hover:-translate-y-1 active:scale-95"
                            >
                                <ArrowUpRight size={18} /> MỞ TRANG TẢI ROM
                            </button>
                        </div>
                    </div>

                    {/* CỘT 2: LOCAL ROM ZIP */}
                    <LocalFileSelector />
                </div>
            ) : (
                <div className="mt-6 max-w-2xl mx-auto">
                    <LocalFileSelector />
                </div>
            )}
        </WizardLayout>
    );
};

export default StepRomSelect;