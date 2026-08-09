import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Zap, Activity, Terminal, Unlock, ShieldCheck, X, Power, AlertTriangle, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

const GoApp: any = (window as any).go?.main?.App;

// --- STYLES NGHỆ THUẬT CHO MODAL ---
const styleTag = document.createElement("style");
styleTag.textContent = `
  .modal-hero-card {
    transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
  }
  @keyframes orbit-modal {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes orbit-modal-reverse {
    from { transform: translate(-50%, -50%) rotate(360deg); }
    to { transform: translate(-50%, -50%) rotate(0deg); }
  }
  .modal-ring-1 {
    position: absolute; top: 50%; left: 50%; width: 180px; height: 180px;
    border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 50%;
    animation: orbit-modal 15s linear infinite; pointer-events: none;
  }
  .modal-ring-2 {
    position: absolute; top: 50%; left: 50%; width: 260px; height: 260px;
    border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 50%;
    animation: orbit-modal-reverse 25s linear infinite; pointer-events: none;
  }
  .modal-orbit-dot {
    position: absolute; top: 0; left: 50%; width: 6px; height: 6px;
    background: #fff; border-radius: 50%;
    box-shadow: 0 0 10px 2px rgba(255,255,255,0.8);
    transform: translate(-50%, -50%);
  }
`;
document.head.appendChild(styleTag);

export const ControlCenterModal = ({ isOpen, onClose, device }: any) => {
  const { t } = useLanguage();

  const buttons = [
    { 
        id: 'reboot', label: t('btn_reboot'), desc: t('control_wait_reboot_system') || 'Reboot device into normal OS.', icon: RefreshCw, 
        action: GoApp?.RebootSystem, color: 'blue'
    },
    { 
        id: 'fastboot', label: t('btn_fastboot'), desc: t('control_wait_bootloader_reboot') || 'Enter Bootloader for flashing.', icon: Zap, 
        action: GoApp?.RebootBootloader, color: 'amber'
    },
    { 
        id: 'recovery', label: t('btn_recovery'), desc: t('control_wait_recovery') || 'Enter Recovery mode.', icon: Activity, 
        action: GoApp?.RebootRecovery, color: 'purple'
    },
    { 
        id: 'fastbootd', label: t('btn_fastbootd'), desc: t('control_wait_fastbootd') || 'Switch device to FastbootD.', icon: Terminal, 
        action: GoApp?.RebootFastbootD, color: 'cyan'
    },
    { 
        id: 'unlock', label: t('btn_unlock_bl'), desc: t('msg_unlock_warn'), icon: Unlock, 
        action: GoApp?.UnlockBootloader, color: 'red', danger: true 
    },
    { 
        id: 'lock', label: t('btn_lock_bl'), desc: t('msg_lock_warn'), icon: ShieldCheck, 
        action: GoApp?.LockBootloader, color: 'emerald', danger: true 
    },
  ];

  // State lưu tab đang được chọn
  const [activeId, setActiveId] = useState(buttons[0].id);
  const activeBtn = buttons.find(b => b.id === activeId) || buttons[0];

  // Ánh xạ màu sắc Đỉnh Cao
  const styleMap: any = {
      blue: { bg: 'from-blue-600 to-indigo-600', solidBg: 'bg-gradient-to-br from-[#4F46E5] to-[#2563EB]' },
      amber: { bg: 'from-amber-500 to-orange-600', solidBg: 'bg-gradient-to-br from-[#F97316] to-[#DC2626]' },
      purple: { bg: 'from-purple-600 to-fuchsia-600', solidBg: 'bg-gradient-to-br from-[#9333EA] to-[#6B21A8]' },
      cyan: { bg: 'from-cyan-500 to-blue-600', solidBg: 'bg-gradient-to-br from-[#0891B2] to-[#0284C7]' },
      red: { bg: 'from-red-600 to-rose-600', solidBg: 'bg-gradient-to-br from-[#E11D48] to-[#BE123C]' },
      emerald: { bg: 'from-emerald-500 to-teal-600', solidBg: 'bg-gradient-to-br from-[#10B881] to-[#059669]' },
  };
  const currentStyle = styleMap[activeBtn.color];

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300 font-sans">
      
      {/* Nền Kính Mờ */}
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl cursor-default" onClick={onClose} />
      
      {/* Khung Bento Master-Detail (Mở rộng size to hơn) */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 rounded-[32px] shadow-2xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col md:flex-row h-[560px]">
        
        {/* ================= CỘT TRÁI (MENU CHỌN) - 4.5/12 ================= */}
        <div className="w-full md:w-[38%] bg-slate-50 dark:bg-[#1A1C26] border-r border-slate-200 dark:border-white/5 flex flex-col z-10 shrink-0">
            {/* Header Cột Trái */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white flex items-center justify-center">
                    <Power size={18} strokeWidth={2.5} />
                 </div>
                 <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">{t('control_title')}</h3>
                 </div>
               </div>
            </div>

            {/* Danh sách Tabs */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-2 custom-scrollbar">
              {buttons.map((btn) => {
                const isActive = activeId === btn.id;
                const btnStyle = styleMap[btn.color];
                
                return (
                    <button 
                        key={btn.id} 
                        onClick={() => setActiveId(btn.id)} 
                        className={`
                            relative flex items-center gap-3 px-4 py-3.5 rounded-[18px] transition-all duration-300 outline-none
                            ${isActive 
                                ? `bg-white dark:bg-[#282A36] shadow-sm border border-slate-200 dark:border-white/10` 
                                : `hover:bg-slate-200/50 dark:hover:bg-white/5 border border-transparent`
                            }
                        `}
                    >
                      {/* Cột màu highlight bên trái khi Active */}
                      {isActive && <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b ${btnStyle.bg}`}></div>}
                      
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${isActive ? `bg-gradient-to-br ${btnStyle.bg} text-white shadow-md` : 'bg-slate-200 dark:bg-black/30 text-slate-500'}`}>
                          <btn.icon size={18} strokeWidth={2} />
                      </div>
                      
                      <div className="flex flex-col text-left min-w-0 flex-1">
                          <span className={`text-[14px] font-black truncate transition-colors duration-300 ${isActive ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                              {btn.label}
                          </span>
                      </div>

                      {btn.danger && <AlertTriangle size={14} className={isActive ? "text-red-500" : "text-slate-400 opacity-50"} />}
                    </button>
                );
              })}
            </div>
        </div>

        {/* ================= CỘT PHẢI (HERO TRÀN VIỀN 100%) - 7.5/12 ================= */}
        <div className={`flex-1 relative flex flex-col overflow-hidden transition-colors duration-500 ${!device.connected ? 'bg-slate-200 dark:bg-slate-800' : currentStyle.solidBg}`}>
            
            {/* Lớp Texture mờ ảo giờ được đẩy ra áp dụng cho TOÀN BỘ cột phải */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-50 mix-blend-overlay pointer-events-none"></div>

            {/* Nút Đóng Modal */}
            <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/10 hover:bg-black/30 text-white flex items-center justify-center transition-all duration-300 outline-none hover:rotate-90 z-50">
               <X size={20}/>
            </button>

            {/* KHỐI NÚT HERO KHỔNG LỒ (Giờ để nền trong suốt vì cột phải đã gánh màu) */}
            <button 
                onClick={() => activeBtn.action?.()} 
                disabled={!device.connected}
                className={`
                    flex-1 flex flex-col items-center justify-center text-center p-10 relative group outline-none modal-hero-card w-full
                    ${!device.connected ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
                `}
            >
                {/* Hiệu ứng HOVER: Lớp phủ trắng chớp sáng lên báo hiệu click */}
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 group-active:opacity-20 transition-opacity duration-300 pointer-events-none"></div>

                {/* Quả Cầu Icon Khổng Lồ */}
                <div className="relative flex items-center justify-center w-56 h-56 mb-8 icon-float">
                    <div className="modal-ring-1"><div className="modal-orbit-dot"></div></div>
                    <div className="modal-ring-2"><div className="modal-orbit-dot"></div><div className="modal-orbit-dot" style={{ top: '100%' }}></div></div>
                    
                    <activeBtn.icon size={110} strokeWidth={1.5} className="text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.5)] relative z-10 group-hover:scale-110 group-active:scale-95 transition-transform duration-500" />
                </div>

                <div className="relative z-10 transition-transform duration-500 group-hover:-translate-y-2">
                    <h2 className="text-3xl font-black text-white tracking-tight mb-3">
                        {activeBtn.label}
                    </h2>
                    <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-white/90">
                        {activeBtn.desc}
                    </p>
                </div>

                {device.connected && (
                    <div className={`absolute bottom-10 flex items-center gap-2 px-6 py-3 rounded-full bg-white/20 text-white font-black text-sm opacity-0 group-hover:opacity-100 backdrop-blur-md border border-white/30 transition-all duration-500 translate-y-4 group-hover:translate-y-0 shadow-lg`}>
                        Execute Command <ChevronRight size={16} strokeWidth={3} />
                    </div>
                )}
            </button>

            {/* Thanh Trạng Thái Cột Phải (Dùng kính mờ thay vì nền xám đen) */}
            <div className="px-8 py-3 bg-black/10 border-t border-white/10 flex items-center justify-center shrink-0 z-20 backdrop-blur-sm">
                {!device.connected ? (
                    <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> {t('status_disconnected')}
                    </span>
                ) : (
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div> {t('status_ready')}
                    </span>
                )}
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
