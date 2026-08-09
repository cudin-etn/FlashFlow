import React from 'react';
import { 
    Smartphone, Battery, Lock, Unlock, 
    Cpu, Zap, Activity, Loader2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface DeviceInfo {
    name: string;
    codename: string;
    mode: 'ADB' | 'FASTBOOT' | 'RECOVERY' | 'DISCONNECTED';
    battery: string;
    bootloader: string;
    osVersion: string;
}

interface ModeSwitchingState {
    active: boolean;
    target: string;
}

interface ModeSwitchTimeoutState {
    timedOut: boolean;
}

interface DevicePanelProps {
    device?: DeviceInfo | null;
    modeSwitching?: ModeSwitchingState;
    modeSwitchTimeout?: ModeSwitchTimeoutState;
    onDismissTimeout?: () => void;
}

export const DevicePanel: React.FC<DevicePanelProps> = ({ device, modeSwitching, modeSwitchTimeout, onDismissTimeout }) => {
    const { t } = useLanguage();

    // Determine if we're in mode switching state
    const isSwitchingMode = modeSwitching?.active ?? false;
    const isTimedOut = modeSwitchTimeout?.timedOut ?? false;

    // Get descriptive text for mode switching target
    const getModeSwitchText = (target: string): string => {
        switch (target) {
            case 'fastbootd': return 'Đang khởi động lại vào FastbootD...';
            case 'bootloader': return 'Đang khởi động lại vào Bootloader...';
            case 'recovery': return 'Đang khởi động lại vào Recovery...';
            default: return 'Đang chuyển chế độ thiết bị...';
        }
    };

    const isConnected = isTimedOut ? false : (isSwitchingMode ? true : (device && device.mode !== 'DISCONNECTED'));
    const activeDevice = device || {
        name: t('dash_no_device' as any) || 'Chưa kết nối', 
        codename: t('dash_waiting_connection' as any) || 'waiting_for_connection', 
        mode: 'DISCONNECTED',
        battery: '0%', 
        bootloader: 'LOCKED', 
        osVersion: t('dash_os_unknown' as any) || 'N/A'
    } as DeviceInfo;

    const getModeTheme = (mode: string) => {
        switch(mode) {
            case 'ADB': return { glow: 'from-emerald-500 to-teal-600', text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', innerGlow: 'bg-emerald-500' };
            case 'FASTBOOT': return { glow: 'from-orange-500 to-amber-500', text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', innerGlow: 'bg-orange-500' };
            case 'RECOVERY': return { glow: 'from-purple-500 to-indigo-600', text: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30', innerGlow: 'bg-purple-500' };
            default: return { glow: 'from-slate-600 to-slate-800', text: 'text-slate-500', bg: 'bg-slate-800/30', border: 'border-slate-700/50', innerGlow: 'bg-slate-500' };
        }
    };

    const theme = getModeTheme(activeDevice.mode);
    const isUnlocked = activeDevice.bootloader === 'UNLOCKED';

    return (
        // OUTER MAIN CARD: Bọc toàn bộ Panel, tạo khối Bento hoàn chỉnh
        <div className="w-full h-full bg-white dark:bg-gradient-to-b dark:from-[#1a1b2e] dark:to-[#151625] rounded-[32px] p-6 shadow-sm border border-slate-100 dark:border-indigo-500/10 flex flex-col relative overflow-hidden transition-all duration-500 animate-in fade-in">
            
            {/* Lớp màu hắt nhẹ ở góc thẻ chính (Chỉ hiện khi cắm cáp hoặc đang chuyển mode) */}
            {(isConnected || isSwitchingMode || isTimedOut) && (
                <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${isTimedOut ? 'from-red-500 to-orange-600' : isSwitchingMode ? 'from-indigo-500 to-purple-600' : theme.glow} rounded-full blur-[80px] opacity-10 pointer-events-none -translate-y-1/2 translate-x-1/2 transition-opacity duration-700`}></div>
            )}

            {/* HEADER KHAY */}
            <div className="flex items-center justify-between mb-5 relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                        <Activity size={16} strokeWidth={2.5}/>
                    </div>
                    <span className="text-sm font-black text-slate-800 dark:text-white tracking-tight">{t('dash_device_title' as any) || 'Thông tin Thiết bị'}</span>
                </div>
                
                <div className={`px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border transition-colors duration-500
                    ${isTimedOut ? 'bg-red-50 dark:bg-red-500/10 text-red-500 border-red-200 dark:border-red-500/30 shadow-sm' :
                      isSwitchingMode ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 border-indigo-200 dark:border-indigo-500/30 shadow-sm' :
                      isConnected ? `bg-white dark:${theme.bg} ${theme.text} ${theme.border} shadow-sm` : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-slate-200 dark:border-white/5'}`}>
                    {isTimedOut && <AlertTriangle size={10} className="text-red-500" />}
                    {!isTimedOut && isSwitchingMode && <Loader2 size={10} className="text-indigo-500 animate-spin" />}
                    {!isTimedOut && !isSwitchingMode && isConnected && <div className={`w-1.5 h-1.5 rounded-full ${theme.innerGlow} animate-pulse`}></div>}
                    {isTimedOut ? 'Lỗi' : isSwitchingMode ? 'Đang chuyển...' : isConnected ? activeDevice.mode : (t('dash_status_waiting' as any) || 'Đang chờ...')}
                </div>
            </div>

            {/* CONTAINER CÁC CHIP THÔNG TIN BÊN TRONG */}
            <div className="flex flex-col gap-3 relative z-10 flex-1 justify-center">
                
                {/* 1. HERO CHIP (Tên máy) */}
                <div className={`rounded-[24px] p-5 relative overflow-hidden transition-all duration-700 flex justify-between items-center group border
                    ${isTimedOut ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/20 shadow-inner' :
                      isConnected ? 'bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/5 shadow-inner' : 'bg-slate-50 dark:bg-black/10 border-dashed border-slate-300 dark:border-white/5 opacity-80'}`}>
                    
                    <div className="relative z-10">
                        {isTimedOut ? (
                            <>
                                <div className="flex items-center gap-2.5 mb-2">
                                    <AlertTriangle size={20} className="text-red-500" />
                                    <h3 className="text-lg font-black tracking-tight text-red-600 dark:text-red-400 leading-none">
                                        Chuyển mode thất bại
                                    </h3>
                                </div>
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono mb-3">
                                    Kiểm tra kết nối USB và thử lại
                                </p>
                                <button 
                                    onClick={onDismissTimeout}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 shadow-sm hover:bg-red-200 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
                                >
                                    <RefreshCw size={12} className="text-red-500"/>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-300">
                                        Thử lại
                                    </span>
                                </button>
                            </>
                        ) : isSwitchingMode ? (
                            <>
                                <div className="flex items-center gap-2.5 mb-2">
                                    <Loader2 size={20} className="text-indigo-500 animate-spin" />
                                    <h3 className="text-lg font-black tracking-tight text-indigo-600 dark:text-indigo-400 leading-none">
                                        {getModeSwitchText(modeSwitching?.target || '')}
                                    </h3>
                                </div>
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono mb-3">
                                    Vui lòng chờ thiết bị khởi động lại...
                                </p>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 shadow-sm">
                                    <Activity size={12} className="text-indigo-400 animate-pulse"/>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300">
                                        Đang chuyển mode
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className={`text-2xl font-black tracking-tight mb-1 transition-colors leading-none ${isConnected ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                                    {isConnected ? activeDevice.name : (t('dash_no_device' as any) || 'Chưa kết nối')}
                                </h3>
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono mb-3">
                                    {isConnected ? activeDevice.codename : (t('dash_waiting_connection' as any) || 'waiting_for_connection')}
                                </p>
                                
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 shadow-sm">
                                    <Cpu size={12} className={isConnected ? "text-indigo-400" : "text-slate-400"}/>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isConnected ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                                        {isConnected ? activeDevice.osVersion : (t('dash_os_unknown' as any) || 'OS Unknown')}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className={`w-14 h-14 rounded-[18px] flex items-center justify-center transition-all duration-700 relative z-10 shrink-0
                        ${isTimedOut ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-[0_10px_20px_rgba(0,0,0,0.2)] scale-100' :
                          isSwitchingMode ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(0,0,0,0.2)] scale-100' :
                          isConnected ? `bg-gradient-to-br ${theme.glow} text-white shadow-[0_10px_20px_rgba(0,0,0,0.2)] scale-100` : 'bg-slate-200 dark:bg-white/5 text-slate-500 scale-95'}`}>
                        {isTimedOut ? (
                            <AlertTriangle size={28} strokeWidth={1.5} />
                        ) : isSwitchingMode ? (
                            <Loader2 size={28} strokeWidth={1.5} className="animate-spin" />
                        ) : (
                            <Smartphone size={28} strokeWidth={1.5} className={isConnected ? "drop-shadow-sm" : ""} />
                        )}
                    </div>
                </div>

                {/* 2. SPLIT CHIPS: PIN & BOOTLOADER */}
                <div className="grid grid-cols-2 gap-3">
                    
                    {/* Pin Box */}
                    <div className={`rounded-[20px] p-4 relative overflow-hidden transition-all duration-500 border flex flex-col justify-between group
                        ${isConnected ? 'bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/5 shadow-inner' : 'bg-slate-50 dark:bg-black/10 border-slate-200 dark:border-white/5 opacity-60'}`}>
                        <div className="flex items-center gap-2 mb-2 text-green-500">
                            <Battery size={16} strokeWidth={2.5}/>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('dash_battery' as any) || 'Pin'}</span>
                        </div>
                        <div className={`text-2xl font-black tracking-tighter ${isConnected ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                            {activeDevice.battery}
                        </div>
                    </div>

                    {/* Bootloader Box */}
                    <div className={`rounded-[20px] p-4 relative overflow-hidden transition-all duration-500 border flex flex-col justify-between group
                        ${isConnected ? 'bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/5 shadow-inner' : 'bg-slate-50 dark:bg-black/10 border-slate-200 dark:border-white/5 opacity-60'}`}>
                        <div className={`flex items-center gap-2 mb-2 ${isUnlocked ? 'text-orange-500' : 'text-slate-500'}`}>
                            {isUnlocked ? <Unlock size={16} strokeWidth={2.5}/> : <Lock size={16} strokeWidth={2.5}/>}
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('dash_bl_status' as any) || 'BL Status'}</span>
                        </div>
                        <div className={`text-[13px] font-black uppercase truncate ${isConnected ? (isUnlocked ? 'text-orange-500' : 'text-slate-800 dark:text-white') : 'text-slate-500'}`}>
                            {activeDevice.bootloader}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};