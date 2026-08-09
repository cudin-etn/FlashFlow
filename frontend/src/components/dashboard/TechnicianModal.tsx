import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Key, RefreshCw, X, Lock, Unlock, Copy, Server, Smartphone, CheckCircle2, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';

// [CẤU HÌNH] Thay ID Script của anh vào đây
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyHQ7HkatdET-GCn8kp-ZzaO1XTYVsqsoEO3eFCqODsUDicv9WinOMk4c1pDaIY8XFvOA/exec";

interface TechnicianModalProps {
    isOpen: boolean;
    onClose: () => void;
    myHwid: string;      
    onUnlockSuccess: () => void;
    userPackage: string; 
}

const ALLOWED_TO_GEN = ["SHOP_SMALL", "SHOP_BIG", "WHITE_LABEL"];

export const TechnicianModal: React.FC<TechnicianModalProps> = ({ 
    isOpen, onClose, myHwid, onUnlockSuccess, userPackage 
}) => {
    const { t } = useLanguage();
    
    const [activeTab, setActiveTab] = useState<'enter' | 'generate'>('enter');
    const [inputCode, setInputCode] = useState("");
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setActiveTab('enter');
            setGeneratedCode(null);
            setInputCode("");
            setIsSuccess(false); 
        }
    }, [isOpen]);

    useEffect(() => {
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft]);

    const handleSwitchTab = (tab: 'enter' | 'generate') => {
        if (tab === 'enter') {
            setActiveTab('enter');
        } else {
            if (ALLOWED_TO_GEN.includes(userPackage)) {
                setActiveTab('generate');
            } else {
                toast.error(t('tech_limit_title' as any) || "Tính năng giới hạn", {
                    description: t('tech_limit_desc' as any) || "Chỉ gói Cửa Hàng hoặc White Label mới được tạo mã."
                });
            }
        }
    };

    const handleVerify = async () => {
        if (inputCode.length !== 6) return toast.error(t('tech_err_length' as any) || "Mã xác thực phải có 6 chữ số!");
        
        setLoading(true);
        try {
            const res = await fetch(`${SCRIPT_URL}?action=verify_token&code=${inputCode}`);
            const data = await res.json();
            
            if (data.status === 'success') {
                onUnlockSuccess();
                setIsSuccess(true);
            } else {
                toast.error(t('tech_err_verify' as any) || "Lỗi xác thực", { description: data.msg || t('tech_err_invalid' as any) || "Mã không đúng hoặc đã hết hạn." });
            }
        } catch (e) { 
            toast.error(t('error_server' as any) || "Lỗi kết nối Server.");
        } finally { 
            setLoading(false); 
        }
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${SCRIPT_URL}?action=gen_token&hwid=${myHwid}`);
            const data = await res.json();
            
            if (data.status === 'success') {
                setGeneratedCode(data.data);
                setTimeLeft(900); 
                toast.success(t('tech_msg_gen_success' as any) || "Đã tạo mã mới");
            } else {
                toast.error(t('tech_err_denied' as any) || "Từ chối truy cập", { description: data.msg });
            }
        } catch (e) { 
            toast.error(t('error_server' as any) || "Lỗi kết nối Server."); 
        } finally { 
            setLoading(false); 
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!isOpen) return null;

    const canGenKey = ALLOWED_TO_GEN.includes(userPackage);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 font-sans animate-in fade-in duration-300">
            
            {/* Nền Kính Mờ Tối Đa */}
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl cursor-default" onClick={() => !loading && !isSuccess && onClose()} />

            {/* Khối Modal Chính */}
            <div className="relative w-full max-w-md bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 rounded-[32px] shadow-2xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                
                {isSuccess ? (
                    /* ================= MÀN HÌNH THÀNH CÔNG ================= */
                    <div className="flex flex-col items-center text-center p-10 relative">
                        {/* Orb Glow Xanh Lá */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none"></div>

                        <div className="relative mb-8 mt-4">
                            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 duration-1000"></div>
                            <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-[28px] flex items-center justify-center shadow-[0_20px_40px_rgba(16,185,129,0.3)] relative z-10">
                                <CheckCircle2 size={48} className="text-white drop-shadow-md" />
                            </div>
                            <div className="absolute -top-3 -right-3 bg-white dark:bg-slate-800 text-amber-500 p-2 rounded-full shadow-lg border border-slate-100 dark:border-white/10 animate-bounce z-20">
                                <PartyPopper size={20}/>
                            </div>
                        </div>

                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">{t('tech_success_title' as any) || 'Kích Hoạt Thành Công!'}</h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed px-4">
                            {t('tech_success_desc' as any) || 'Chế độ Kỹ Thuật Viên đã được mở khóa. Bạn có toàn quyền truy cập trong phiên làm việc này.'}
                        </p>

                       <button 
                            onClick={onClose}   
                            className="w-full py-4 rounded-[16px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 outline-none"
                        >
                            {t('btn_done' as any) || 'Hoàn Tất'}
                        </button>
                    </div>
                ) : (
                    /* ================= GIAO DIỆN NHẬP/TẠO MÃ ================= */
                    <>
                        {/* Orb Glow Tím Quyền Lực */}
                        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                        {/* Header Minimalist */}
                        <div className="px-8 pt-8 pb-6 relative z-10 flex flex-col items-center text-center">
                            <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-rose-500 hover:text-white dark:hover:bg-red-500 transition-colors text-slate-500 outline-none">
                                <X size={20}/>
                            </button>
                            
                            <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-[0_15px_30px_rgba(99,102,241,0.3)]">
                                <ShieldCheck size={32} className="text-white drop-shadow-md" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('tech_title' as any) || 'Technician Mode'}</h3>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-1.5">{t('tech_subtitle' as any) || 'Authorized Access Only'}</p>
                        </div>

                        {/* Switcher Tab Tròn Trịa */}
                        <div className="mx-8 bg-slate-100 dark:bg-[#1C1E26] p-1.5 rounded-[18px] border border-slate-200 dark:border-white/5 flex relative z-10 shadow-inner">
                            <button 
                                onClick={() => handleSwitchTab('enter')} 
                                className={`flex-1 py-3 rounded-[14px] text-xs font-bold transition-all flex items-center justify-center gap-2 outline-none
                                ${activeTab === 'enter' ? 'bg-white dark:bg-[#282A36] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
                            >
                                <Smartphone size={16}/> {t('tech_tab_client' as any) || 'Máy Khách'}
                            </button>
                            
                            <button 
                                onClick={() => handleSwitchTab('generate')} 
                                className={`flex-1 py-3 rounded-[14px] text-xs font-bold transition-all flex items-center justify-center gap-2 outline-none
                                ${activeTab === 'generate' ? 'bg-white dark:bg-[#282A36] text-purple-600 dark:text-purple-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 group'}`}
                            >
                                {!canGenKey && <Lock size={14} className="text-slate-400 dark:text-slate-600"/>}
                                <Server size={16}/> {t('tech_tab_shop' as any) || 'Máy Shop'}
                            </button>
                        </div>

                        <div className="p-8 relative z-10 min-h-[300px] flex flex-col justify-center">
                            
                            {/* TAB: MÁY KHÁCH NHẬP MÃ */}
                            {activeTab === 'enter' && (
                                <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-300">
                                    <div className="text-center space-y-1.5">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t('tech_enter_title' as any) || 'Nhập Mã Phiên Làm Việc'}</p>
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-xs mx-auto">{t('tech_enter_desc' as any) || 'Mã này được cung cấp bởi máy chủ Kỹ Thuật Viên. Phiên sẽ tự hủy khi tắt ứng dụng.'}</p>
                                    </div>

                                    <div className="relative group">
                                        <input 
                                            type="text" maxLength={6}
                                            className="w-full bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/10 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-[20px] py-6 text-center text-3xl font-mono font-black text-slate-800 dark:text-white tracking-[0.5em] outline-none transition-all placeholder:tracking-normal placeholder:text-sm placeholder:font-medium placeholder:text-slate-400 shadow-inner"
                                            placeholder="••••••"
                                            value={inputCode}
                                            onChange={(e) => setInputCode(e.target.value.replace(/[^0-9]/g, ''))}
                                            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                        />
                                        <Lock size={18} className="absolute top-1/2 -translate-y-1/2 left-6 text-slate-400 group-focus-within:text-indigo-500 transition-colors"/>
                                    </div>

                                    <button 
                                        onClick={handleVerify} disabled={loading}
                                        className="w-full py-4 rounded-[16px] bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-sm shadow-[0_10px_20px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:scale-100 outline-none"
                                    >
                                        {loading ? <RefreshCw className="animate-spin" size={20}/> : <Unlock size={20} />}
                                        {t('tech_btn_activate' as any) || 'KÍCH HOẠT NGAY'}
                                    </button>
                                </div>
                            )}

                            {/* TAB: MÁY SHOP TẠO MÃ */}
                            {activeTab === 'generate' && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                                    <div className="text-center space-y-1.5">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t('tech_gen_title' as any) || 'Tạo Mã Mở Khóa Từ Xa'}</p>
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('tech_gen_desc' as any) || 'Dành cho gói Shop/WhiteLabel. Mã hiệu lực 1 lần.'}</p>
                                    </div>
                                    
                                    {generatedCode ? (
                                        <div className="space-y-4">
                                            <div 
                                                className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-[24px] p-8 flex flex-col items-center gap-2 relative group cursor-pointer hover:border-purple-400 dark:hover:bg-purple-500/20 transition-all shadow-sm"
                                                onClick={() => { navigator.clipboard.writeText(generatedCode); toast.success(t('tech_btn_copy' as any) || "Đã copy mã!"); }}
                                            >
                                                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-black uppercase tracking-widest">{t('tech_lbl_session' as any) || 'Session Code'}</span>
                                                <span className="text-5xl font-black text-purple-700 dark:text-white tracking-widest font-mono drop-shadow-sm">{generatedCode}</span>
                                                
                                                <div className="mt-4 px-4 py-2 rounded-full bg-white dark:bg-black/40 border border-purple-100 dark:border-white/10 flex items-center gap-2 text-xs font-bold font-mono text-purple-600 dark:text-purple-300 shadow-sm">
                                                    <RefreshCw size={14} className="animate-spin-slow"/>
                                                    {t('tech_lbl_expire' as any) || 'Hết hạn sau:'} {formatTime(timeLeft)}
                                                </div>

                                                <div className="absolute inset-0 flex items-center justify-center bg-purple-900/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-[24px] backdrop-blur-[2px]">
                                                    <span className="text-white font-black flex gap-2 items-center"><Copy size={20}/> {t('tech_btn_copy' as any) || 'Bấm để Copy'}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => {setGeneratedCode(null); setTimeLeft(0);}} className="w-full py-3 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors outline-none">
                                                {t('tech_btn_cancel_gen' as any) || 'Hủy mã này & Tạo lại'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="h-44 border-2 border-dashed border-slate-300 dark:border-slate-700/50 rounded-[24px] flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50 dark:bg-white/5">
                                            <Key size={36} className="opacity-40"/>
                                            <span className="text-xs font-bold">{t('tech_msg_no_code' as any) || 'Chưa có mã nào được tạo'}</span>
                                        </div>
                                    )}

                                    {!generatedCode && (
                                        <button 
                                            onClick={handleGenerate} disabled={loading}
                                            className="w-full py-4 rounded-[16px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-[0_10px_20px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 outline-none"
                                        >
                                            {loading ? <RefreshCw className="animate-spin" size={20}/> : <Key size={20} />}
                                            {t('tech_btn_get_code' as any) || 'LẤY MÃ MỚI'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};