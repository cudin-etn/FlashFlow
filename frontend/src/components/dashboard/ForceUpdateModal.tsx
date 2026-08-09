import React from 'react';
import { Sparkles, FileText, Rocket, ArrowRight } from 'lucide-react';
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { useLanguage } from '../../i18n/LanguageContext';

interface ForceUpdateModalProps {
    isOpen: boolean;
    updateInfo: {
        latestVer: string;
        link: string;
        changelog?: string; 
    } | null;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({ isOpen, updateInfo }) => {
    const { t } = useLanguage();

    if (!isOpen || !updateInfo) return null;

    const handleUpdate = () => {
        if (updateInfo.link) {
            BrowserOpenURL(updateInfo.link);
        }
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-500 font-sans">
            {/* Lớp nền tối mịt, khóa chết không cho click ra ngoài */}
            <div className="absolute inset-0 bg-[#020617]/90 backdrop-blur-3xl" />
            
            {/* CONTAINER BENTO CHÍNH */}
            <div className="relative w-full max-w-[420px] bg-[#0F111A] rounded-[40px] shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col items-center p-10 overflow-hidden animate-in zoom-in-95 duration-500">
                
                {/* Ánh sáng Aurora hắt từ trên xuống */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-gradient-to-b from-indigo-500/30 via-purple-500/10 to-transparent blur-[60px] pointer-events-none"></div>

                {/* ICON TÊN LỬA (ROCKET) */}
                <div className="relative w-20 h-20 mb-8">
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-[24px] blur-xl opacity-40 animate-pulse"></div>
                    <div className="relative w-full h-full bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-[24px] flex items-center justify-center shadow-inner border border-white/20">
                        <Rocket size={36} className="text-white drop-shadow-md -translate-y-0.5 translate-x-0.5" strokeWidth={1.5} />
                    </div>
                    {/* Hạt Sparkles nhỏ lấp lánh */}
                    <Sparkles size={18} className="absolute -top-3 -right-3 text-yellow-400 animate-bounce" />
                </div>

                {/* TIÊU ĐỀ & PHIÊN BẢN */}
                <h2 className="text-3xl font-black text-white tracking-tight mb-4 text-center">
                    {t('update_title' as any) || "Phiên bản mới"}
                </h2>
                
                <div className="flex items-center gap-3 mb-8">
                    <span className="text-sm font-medium text-slate-400">
                        {t('update_available' as any) || "Đã có bản cập nhật"}
                    </span>
                    <span className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-xs font-black text-indigo-300 tracking-[0.1em] shadow-inner">
                        v{updateInfo.latestVer}
                    </span>
                </div>

                {/* CHANGELOG BENTO BOX */}
                {updateInfo.changelog && (
                    <div className="w-full mb-8 flex flex-col bg-black/40 rounded-[24px] border border-white/5 overflow-hidden shadow-inner relative group">
                        {/* Glow nhẹ khi hover */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        
                        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2 relative z-10 bg-white/5 backdrop-blur-sm">
                            <FileText size={14} className="text-indigo-400"/>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">
                                {t('update_whats_new' as any) || "Tính năng mới"}
                            </span>
                        </div>
                        
                        <div className="p-5 max-h-[160px] overflow-y-auto custom-scrollbar relative z-10">
                            <p className="text-[12px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed opacity-90">
                                {updateInfo.changelog}
                            </p>
                        </div>
                    </div>
                )}

                {/* NÚT CẬP NHẬT (Kêu gọi hành động cực mạnh) */}
                <button 
                    onClick={handleUpdate}
                    className="w-full py-4 rounded-[20px] bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-lg tracking-wide shadow-[0_10px_30px_rgba(99,102,241,0.4)] hover:shadow-[0_15px_40px_rgba(99,102,241,0.6)] hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3 group outline-none"
                >
                    {t('btn_download_update' as any) || "Nâng cấp ngay"} 
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/>
                </button>

                {/* DÒNG CẢNH BÁO NHỎ BÊN DƯỚI */}
                <p className="mt-6 text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black opacity-60">
                    {t('update_required_msg' as any) || "Cập nhật bắt buộc để tiếp tục"}
                </p>
            </div>
        </div>
    );
};