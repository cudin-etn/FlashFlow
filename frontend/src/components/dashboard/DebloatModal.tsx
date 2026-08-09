import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Eraser, Trash2, Search, RefreshCw, 
    Sparkles, User, Box, Smartphone, Undo2, 
    Recycle, AlertTriangle, Cpu, CheckSquare, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

// --- DATABASE BLOATWARE GIỮ NGUYÊN ---
interface BloatInfo { name: string; desc: string; risk: 'safe' | 'warning'; }

const BLOAT_DB: Record<string, Record<string, BloatInfo>> = {
    'xiaomi': {
        'com.miui.analytics': { name: 'MIUI Analytics', desc: 'Thu thập dữ liệu hành vi', risk: 'safe' },
        'com.miui.msa.global': { name: 'MSA (System Ads)', desc: 'Dịch vụ quảng cáo hệ thống', risk: 'safe' },
        'com.facebook.system': { name: 'Facebook App Installer', desc: 'Cài đặt ngầm Facebook', risk: 'safe' },
        'com.facebook.appmanager': { name: 'Facebook App Manager', desc: 'Quản lý dịch vụ Facebook', risk: 'safe' },
        'com.facebook.services': { name: 'Facebook Services', desc: 'Dịch vụ nền Facebook', risk: 'safe' },
        'com.miui.cloudservice': { name: 'Mi Cloud', desc: 'Đồng bộ đám mây Xiaomi', risk: 'warning' },
        'com.miui.cloudbackup': { name: 'Cloud Backup', desc: 'Sao lưu đám mây', risk: 'safe' },
        'com.miui.micloudsync': { name: 'Cloud Sync', desc: 'Đồng bộ nền', risk: 'safe' },
        'com.miui.vsimcore': { name: 'Virtual SIM', desc: 'Dịch vụ SIM ảo (Roam)', risk: 'safe' },
        'com.miui.yellowpage': { name: 'Yellow Pages', desc: 'Danh bạ trang vàng (Spam)', risk: 'safe' },
        'com.miui.bugreport': { name: 'Bug Report', desc: 'Gửi báo cáo lỗi', risk: 'safe' },
        'com.xiaomi.payment': { name: 'Mi Pay', desc: 'Thanh toán Xiaomi', risk: 'safe' },
        'com.mipay.wallet.in': { name: 'Mi Wallet', desc: 'Ví điện tử', risk: 'safe' },
        'com.xiaomi.midrop': { name: 'Mi Drop (ShareMe)', desc: 'Chia sẻ file', risk: 'safe' },
        'com.miui.player': { name: 'Mi Music', desc: 'Trình phát nhạc (QC)', risk: 'safe' },
        'com.miui.videoplayer': { name: 'Mi Video', desc: 'Trình phát video (QC)', risk: 'safe' },
        'com.miui.browser': { name: 'Mi Browser', desc: 'Trình duyệt mặc định', risk: 'safe' },
        'com.android.browser': { name: 'Mi Browser (Gốc)', desc: 'Trình duyệt hệ thống', risk: 'safe' },
        'com.google.android.apps.youtube.music': { name: 'YouTube Music', desc: 'Nhạc mặc định Google', risk: 'safe' },
        'com.google.android.videos': { name: 'Google TV', desc: 'Phim & TV', risk: 'safe' },
        'com.google.android.apps.tachyon': { name: 'Google Duo', desc: 'Gọi video', risk: 'safe' },
    },
    'oneplus': {
        'com.heytap.browser': { name: 'HeyTap Browser', desc: 'Trình duyệt rác Oppo', risk: 'safe' },
        'com.heytap.cloud': { name: 'HeyTap Cloud', desc: 'Cloud của Oppo', risk: 'warning' },
        'com.heytap.market': { name: 'App Market', desc: 'Chợ ứng dụng TQ', risk: 'safe' },
        'com.heytap.usercenter': { name: 'HeyTap User Center', desc: 'Tài khoản Oppo', risk: 'safe' },
        'com.heytap.themestore': { name: 'Theme Store', desc: 'Cửa hàng chủ đề', risk: 'safe' },
        'com.heytap.pictorial': { name: 'Lockscreen Magazine', desc: 'Tạp chí màn hình khóa', risk: 'safe' },
        'android.autoinstalls.config.oneplus': { name: 'Auto Installs', desc: 'Tự động tải app rác', risk: 'safe' },
        'com.coloros.childrenspace': { name: 'Kid Space', desc: 'Không gian trẻ em', risk: 'safe' },
        'com.coloros.smartsidebar': { name: 'Smart Sidebar', desc: 'Thanh bên thông minh', risk: 'safe' },
        'com.coloros.floatassistant': { name: 'Float Assistant', desc: 'Bóng trợ lý', risk: 'safe' },
        'com.coloros.operationManual': { name: 'User Manual', desc: 'Hướng dẫn sử dụng', risk: 'safe' },
        'com.coloros.scenemode': { name: 'Scene Mode', desc: 'Chế độ ngữ cảnh', risk: 'safe' },
        'com.coloros.assistantscreen': { name: 'Breeno Feed', desc: 'Trang tin tức (China)', risk: 'safe' },
        'com.coloros.karaoke': { name: 'Karaoke', desc: 'Chế độ Karaoke', risk: 'safe' },
        'com.google.android.apps.nbu.files': { name: 'Files by Google', desc: 'Quản lý file thừa', risk: 'safe' },
        'com.netflix.partner.activation': { name: 'Netflix Activation', desc: 'Kích hoạt Netflix', risk: 'safe' },
        'com.facebook.appmanager': { name: 'Facebook Manager', desc: 'Dịch vụ nền FB', risk: 'safe' },
    },
    'pixel': {
        'com.google.android.apps.tips': { name: 'Pixel Tips', desc: 'Mẹo sử dụng', risk: 'safe' },
        'com.google.android.apps.youtube.music': { name: 'YouTube Music', desc: 'Nhạc mặc định', risk: 'safe' },
        'com.google.android.videos': { name: 'Google TV', desc: 'Phim & TV', risk: 'safe' },
        'com.google.android.apps.podcasts': { name: 'Google Podcasts', desc: 'Nghe Podcast', risk: 'safe' },
        'com.google.android.apps.tachyon': { name: 'Google Duo', desc: 'Gọi video', risk: 'safe' },
        'com.google.android.apps.docs': { name: 'Google Docs', desc: 'Soạn thảo văn bản', risk: 'safe' },
        'com.google.ar.lens': { name: 'Google Lens', desc: 'Google Ống kính', risk: 'safe' },
        'com.google.android.apps.fitness': { name: 'Google Fit', desc: 'Theo dõi sức khỏe', risk: 'safe' },
        'com.google.android.projection.gearhead': { name: 'Android Auto', desc: 'Kết nối ô tô', risk: 'safe' },
    }
};

const COLOR_MAP: Record<string, string> = {
    'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7',
    'orange': '#f97316', 'rose': '#f43f5e', 'emerald': '#10b981'
};

interface AppItem { id: string; type: string; path?: string; }
const getGoApp = () => (window as any).go?.main?.App || null;

export const DebloatModal = ({ isOpen, onClose, currentBrand }: any) => {
    const { t } = useLanguage();
    const { color: themeName } = useTheme(); 
    const activeHex = COLOR_MAP[themeName] || COLOR_MAP['cyan'];

    const [allApps, setAllApps] = useState<AppItem[]>([]);
    const [displayApps, setDisplayApps] = useState<AppItem[]>([]);
    const [selectedApps, setSelectedApps] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'recommend' | 'system' | 'user' | 'restore'>('recommend');

    const [uninstalledHistory, setUninstalledHistory] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('debloat-history') || '[]'); } catch { return []; }
    });

    useEffect(() => {
        localStorage.setItem('debloat-history', JSON.stringify(uninstalledHistory));
    }, [uninstalledHistory]);

    const toggleApp = (id: string) => {
        setSelectedApps(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
    };

    const handleSelectAll = () => {
        const allIds = displayApps.map(app => app.id);
        setSelectedApps(allIds);
    };

    const fetchApps = async () => {
        setIsLoading(true);
        try {
            const backend = getGoApp();
            if (backend) {
                const apps = await backend.GetInstalledApps();
                setAllApps(apps || []);
            }
        } catch (e) { toast.error(t('error' as any) + ": " + e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (isOpen) { fetchApps(); setSelectedApps([]); } }, [isOpen]);

    useEffect(() => {
        const term = searchTerm.toLowerCase();
        let brandKey = (currentBrand || "").toLowerCase().trim();
        if (!BLOAT_DB[brandKey]) brandKey = 'xiaomi';
        
        const bloatInfoMap = BLOAT_DB[brandKey] || {};
        const installedIds = allApps.map(a => a.id);

        let filtered: AppItem[] = [];
        if (activeFilter === 'restore') {
            const combinedList = Array.from(new Set([...Object.keys(bloatInfoMap), ...uninstalledHistory]));
            filtered = combinedList
                .filter((id: string) => !installedIds.includes(id))
                .map((id: string) => ({ id, type: 'restore' }));
        } else if (activeFilter === 'recommend') {
            filtered = allApps.filter((app: AppItem) => !!bloatInfoMap[app.id]);
        } else {
            filtered = allApps.filter((app: AppItem) => app.type === activeFilter);
        }
        
        if (term) filtered = filtered.filter((app: AppItem) => app.id.toLowerCase().includes(term));
        setDisplayApps(filtered);
    }, [allApps, activeFilter, searchTerm, currentBrand, uninstalledHistory]);

    const handleAction = async () => {
        if (selectedApps.length === 0 || isProcessing) return;
        const isRestoreMode = activeFilter === 'restore';
        setIsProcessing(true);
        const backend = getGoApp();

        if (!backend) {
            setIsProcessing(false);
            alert('Không tìm thấy backend Wails: window.go.main.App');
            return;
        }

        let successCount = 0;
        let logs = '';

        for (const pkg of selectedApps) {
            try {
                const result = isRestoreMode
                    ? await backend.RestorePackage(pkg)
                    : await backend.UninstallPackage(pkg);

                const raw = (result || '').toString().trim();
                const lowered = raw.toLowerCase();

                if (lowered.includes('success') || lowered.includes('installed') || lowered.includes('installed for user')) {
                    successCount++;
                    if (!isRestoreMode) {
                        setUninstalledHistory(prev => Array.from(new Set([...prev, pkg])));
                    } else {
                        setUninstalledHistory(prev => prev.filter(id => id !== pkg));
                    }
                } else {
                    logs += `${pkg}: ${raw || 'Không có output từ adb'}\n`;
                }
            } catch (e: any) {
                const errText = e?.message || e;
                logs += `${pkg}: ${errText}\n`;
            }
        }

        setIsProcessing(false);

        if (successCount > 0) {
            toast.success(isRestoreMode ? `Đã khôi phục ${successCount} app` : `Đã gỡ ${successCount} app`);
        }
        if (logs.trim()) {
            toast.error(isRestoreMode ? 'Có lỗi xảy ra, check console' : 'Gỡ thất bại một số app');
            console.warn('[Debloat] Some packages failed:', logs);
        }
        await fetchApps();
        setSelectedApps([]);
    };

    if (!isOpen) return null;

    const getAppDisplayInfo = (id: string) => {
        let brandKey = (currentBrand || "").toLowerCase().trim();
        if (!BLOAT_DB[brandKey]) brandKey = 'xiaomi';
        const info = BLOAT_DB[brandKey]?.[id];

        if (info) return { name: info.name, desc: info.desc, risk: info.risk };
        
        const parts = id.split('.');
        const name = parts.length > 0 ? parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1) : id;
        return { name: name, desc: id, risk: 'unknown' };
    };

    const brandStyle = (() => {
        const br = (currentBrand || "").toLowerCase();
        if (br.includes('xiaomi')) return { bg: 'bg-orange-500', icon: 'text-orange-200' };
        if (br.includes('oneplus')) return { bg: 'bg-red-500', icon: 'text-red-200' };
        if (br.includes('pixel')) return { bg: 'bg-blue-500', icon: 'text-blue-100' };
        return { bg: 'bg-slate-500', icon: 'text-slate-300' };
    })();

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-500 font-sans">
            <div className="absolute inset-0 bg-slate-900/60 dark:bg-[#020617]/80 backdrop-blur-3xl" onClick={onClose} />
            
            <div className="relative w-full max-w-6xl h-[720px] bg-slate-50/90 dark:bg-[#0F111A]/90 backdrop-blur-2xl rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 flex overflow-hidden animate-in zoom-in-95 duration-500">
                
                {/* ================= SIDEBAR ================= */}
                <div className="w-[280px] bg-white/40 dark:bg-slate-900/30 border-r border-slate-200/50 dark:border-white/5 p-8 flex flex-col gap-6 shrink-0 relative z-20">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-[16px] text-white shadow-lg flex items-center justify-center" style={{ backgroundColor: activeHex }}><Eraser size={24} strokeWidth={2.5} /></div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none">Debloat<br/><span className="text-sm font-bold text-slate-400">System App</span></h3>
                    </div>

                    <div className={`rounded-[24px] p-6 ${brandStyle.bg} relative overflow-hidden shadow-xl group`}>
                         <div className={`absolute -right-4 -bottom-4 opacity-20 transform rotate-12 group-hover:scale-110 transition-transform duration-700 ${brandStyle.icon}`}><Smartphone size={100} fill="currentColor" /></div>
                         <div className="relative z-10 text-white">
                             <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Target Device</div>
                             <div className="text-3xl font-black tracking-tight drop-shadow-md mb-6">{currentBrand || "Unknown"}</div>
                             
                             <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between text-xs font-bold bg-black/20 px-3 py-2 rounded-xl backdrop-blur-sm">
                                    <span>Tổng số App</span>
                                    <span>{allApps.length}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-bold bg-white/20 px-3 py-2 rounded-xl backdrop-blur-sm text-white">
                                    <span>Lịch sử đã gỡ</span>
                                    <span>{uninstalledHistory.length}</span>
                                </div>
                             </div>
                         </div>
                    </div>
                </div>

                {/* ================= CONTENT ================= */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                    
                    {/* Header: Search & Filter Tabs */}
                    <div className="px-8 pt-8 pb-4 flex flex-col gap-4 relative z-20 border-b border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-[#0F111A]/50 backdrop-blur-md">
                        
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative group">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-700 dark:group-focus-within:text-white transition-colors"/>
                                <input type="text" placeholder={t('search_placeholder' as any) || "Tìm app rác..."} 
                                       className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-black/30 rounded-2xl outline-none focus:ring-2 dark:text-white transition-all shadow-sm border border-slate-200/50 dark:border-white/5" 
                                       style={{ '--tw-ring-color': activeHex } as any}
                                       value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>
                            <button onClick={handleSelectAll} title="Chọn tất cả" className="p-3.5 bg-white dark:bg-black/30 rounded-2xl shadow-sm border border-slate-200/50 dark:border-white/5 hover:scale-105 active:scale-95 transition-all text-slate-600 dark:text-slate-300 outline-none"><CheckSquare size={20} /></button>
                            <button onClick={fetchApps} className="p-3.5 bg-white dark:bg-black/30 rounded-2xl shadow-sm border border-slate-200/50 dark:border-white/5 hover:scale-105 active:scale-95 transition-all text-slate-600 dark:text-slate-300 outline-none"><RefreshCw size={20} className={isLoading ? "animate-spin" : ""} /></button>
                            <button onClick={onClose} className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all outline-none"><X size={20} strokeWidth={2.5}/></button>
                        </div>

                        <div className="flex bg-slate-200/50 dark:bg-black/30 p-1.5 rounded-[20px] backdrop-blur-md w-max border border-white/20 dark:border-white/5 shadow-inner">
                            <FilterTab active={activeFilter === 'recommend'} onClick={() => setActiveFilter('recommend')} icon={Sparkles} label={t('filter_recommend' as any) || "Khuyên gỡ"} activeHex={activeHex} />
                            <FilterTab active={activeFilter === 'system'} onClick={() => setActiveFilter('system')} icon={Cpu} label={t('filter_system' as any) || "Hệ thống"} activeHex={activeHex} />
                            <FilterTab active={activeFilter === 'user'} onClick={() => setActiveFilter('user')} icon={User} label={t('filter_user' as any) || "Người dùng"} activeHex={activeHex} />
                            <FilterTab active={activeFilter === 'restore'} onClick={() => setActiveFilter('restore')} icon={Undo2} label="Khôi phục" activeHex={activeHex} />
                        </div>
                    </div>

                    {/* App List (Dạng Row dịu mắt) */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar pb-32">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400">
                                <RefreshCw className="animate-spin" style={{ color: activeHex }} size={40} strokeWidth={2}/>
                                <span className="text-sm font-black tracking-widest uppercase animate-pulse">{t('status_scanning' as any) || "Đang quét hệ thống..."}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {displayApps.map((app: AppItem) => {
                                    const isSelected = selectedApps.includes(app.id);
                                    const info = getAppDisplayInfo(app.id);
                                    
                                    let AppIcon = Box;
                                    if (activeFilter === 'restore') AppIcon = Recycle;
                                    else if (info.risk === 'warning') AppIcon = AlertTriangle;

                                    return (
                                        <button key={app.id} onClick={() => toggleApp(app.id)} 
                                            className={`flex items-center gap-4 p-4 rounded-[20px] transition-all duration-200 outline-none border text-left group
                                                ${isSelected 
                                                    ? 'shadow-sm' 
                                                    : 'bg-white dark:bg-black/20 border-slate-200/50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                            style={{ 
                                                borderColor: isSelected ? activeHex : '', 
                                                backgroundColor: isSelected ? `${activeHex}15` : '' 
                                            }}
                                        >
                                            {/* Checkbox tròn chuẩn iOS */}
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                                                ${isSelected ? 'border-transparent' : 'border-slate-300 dark:border-slate-600'}`}
                                                style={{ backgroundColor: isSelected ? activeHex : '' }}>
                                                {isSelected && <Check size={14} className="text-white" strokeWidth={3}/>}
                                            </div>

                                            {/* Icon */}
                                            <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 transition-colors
                                                ${info.risk === 'warning' && activeFilter !== 'restore' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500' : 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
                                                <AppIcon size={22} strokeWidth={2} />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                     <h4 className={`text-sm font-bold truncate ${isSelected ? '' : 'text-slate-800 dark:text-white'}`} style={{ color: isSelected ? activeHex : '' }}>{info.name}</h4>
                                                     {info.risk === 'warning' && activeFilter !== 'restore' && <span className="text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 px-1.5 py-0.5 rounded-md font-bold uppercase">Warning</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{info.desc}</p>
                                                    <span className="text-slate-300 dark:text-slate-600 text-[10px]">•</span>
                                                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">{app.id}</p>
                                                </div>
                                            </div>

                                            {/* Tag phân loại */}
                                            <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-widest shrink-0
                                                ${app.type === 'system' ? 'bg-rose-500/10 text-rose-500' : (activeFilter === 'restore' ? 'bg-amber-500/10 text-amber-500' : 'bg-sky-500/10 text-sky-500')}`}>
                                                {activeFilter === 'restore' ? 'Deleted' : app.type}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* FLOATING ACTION BAR (Viên thuốc lơ lửng) */}
                    <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-30 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                        ${selectedApps.length > 0 ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-90 pointer-events-none'}`}>
                        
                        <div className="bg-slate-900/90 dark:bg-white/10 backdrop-blur-xl p-2.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex items-center gap-4 min-w-[320px]">
                            <div className="flex items-center gap-3 pl-4">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white bg-white/20">
                                    {selectedApps.length}
                                </div>
                                <span className="text-sm font-bold text-white tracking-widest uppercase">{t('selected_count' as any) || "Đã chọn"}</span>
                            </div>
                            
                            <button onClick={() => setSelectedApps([])} className="p-2 text-slate-400 hover:text-white transition-colors ml-auto outline-none">
                                <X size={20}/>
                            </button>

                            <button type="button" onClick={handleAction} disabled={isProcessing} 
                                className="px-6 py-3 rounded-full font-black text-white shadow-lg transition-all active:scale-95 flex items-center gap-2 outline-none disabled:opacity-50"
                                style={{ backgroundColor: activeFilter === 'restore' ? '#f59e0b' : activeHex }}>
                                {isProcessing ? (
                                    <><RefreshCw size={18} className="animate-spin"/> {t('btn_processing' as any) || "Đang xử lý"}</>
                                ) : activeFilter === 'restore' ? (
                                    <><Undo2 size={18}/> Khôi phục</>
                                ) : (
                                    <><Trash2 size={18}/> {t('btn_uninstall' as any) || "Xóa App"}</>
                                )}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
};

const FilterTab = ({ active, onClick, icon: Icon, label, activeHex }: any) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black transition-all duration-300 relative outline-none
        ${active ? `text-white shadow-md scale-100` : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}
        style={{ backgroundColor: active ? activeHex : '' }}>
        <Icon size={16} strokeWidth={2.5}/> {label}
    </button>
);