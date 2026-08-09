import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, Monitor, Globe, Zap, X, Check, Code, Smartphone, BookOpen, ChevronRight, Unlock, Terminal, MessageCircle, Link as LinkIcon, Briefcase, Palette, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
import { useTheme } from '../../context/ThemeContext';
import { BRAND_STORAGE_KEY, SKIP_BRAND_MODAL_KEY } from './BrandSelectionModal';

export const SettingsModal = ({ isOpen, onClose, theme, setTheme }: any) => {
  const { language, setLanguage, t } = useLanguage();
  const { color, setColor } = useTheme();
  
  const [activeTab, setActiveTab] = useState<'ui' | 'guide' | 'lang' | 'about'>('ui');
  const [guideTab, setGuideTab] = useState('general');
  const [brandResetDone, setBrandResetDone] = useState(false);

  // Đã bổ sung full gradient cho các thẻ
  const themes = [
      { id: 'light', label: t('theme_light' as any), icon: Sun, color: 'text-amber-500', glow: 'from-amber-400 to-orange-500', desc: 'Sáng sủa, dễ nhìn' },
      { id: 'dark', label: t('theme_dark' as any), icon: Moon, color: 'text-indigo-500', glow: 'from-indigo-600 to-purple-600', desc: 'Dịu mắt, huyền bí' },
      { id: 'system', label: t('theme_system' as any), icon: Monitor, color: 'text-slate-500', glow: 'from-slate-500 to-slate-700', desc: 'Đồng bộ OS' }
  ];

  const accentColors = [
      { id: 'blue', label: 'Blue', bg: 'bg-blue-500', ring: 'ring-blue-500', glow: 'shadow-blue-500/50' },
      { id: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', ring: 'ring-cyan-500', glow: 'shadow-cyan-500/50' },
      { id: 'purple', label: 'Purple', bg: 'bg-purple-500', ring: 'ring-purple-500', glow: 'shadow-purple-500/50' },
      { id: 'rose', label: 'Rose', bg: 'bg-rose-500', ring: 'ring-rose-500', glow: 'shadow-rose-500/50' },
      { id: 'orange', label: 'Orange', bg: 'bg-orange-500', ring: 'ring-orange-500', glow: 'shadow-orange-500/50' },
      { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-500', glow: 'shadow-emerald-500/50' },
  ];

  const languages = [
      { id: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', desc: 'Ngôn ngữ mẹ đẻ', glow: 'from-red-500 to-yellow-500' },
      { id: 'en', label: 'English', flag: '🇺🇸', desc: 'Global Language', glow: 'from-blue-500 to-indigo-600' }
  ];

  const guideSections = [
    { id: 'general', label: t('guide_general' as any) },
    { id: 'pixel', label: t('guide_pixel' as any) },
    { id: 'oneplus', label: t('guide_oneplus' as any) },
    { id: 'xiaomi', label: t('guide_xiaomi' as any) },
  ];

  // Định nghĩa màu sắc cho từng Tab trên Top Bar
  const navTabs = [
    {id: 'ui', label: t('tab_ui' as any), icon: Monitor, text: 'text-blue-500', bg: 'bg-blue-500/10', hover: 'hover:bg-blue-500/10 hover:text-blue-500'},
    {id: 'guide', label: t('tab_guide' as any), icon: BookOpen, text: 'text-orange-500', bg: 'bg-orange-500/10', hover: 'hover:bg-orange-500/10 hover:text-orange-500'},
    {id: 'lang', label: t('tab_lang' as any), icon: Globe, text: 'text-emerald-500', bg: 'bg-emerald-500/10', hover: 'hover:bg-emerald-500/10 hover:text-emerald-500'},
    {id: 'about', label: t('tab_about' as any), icon: Smartphone, text: 'text-purple-500', bg: 'bg-purple-500/10', hover: 'hover:bg-purple-500/10 hover:text-purple-500'},
  ];

  const renderGuideContent = () => {
    switch(guideTab) {
        case 'general':
            return (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col justify-center">
                    <div className="p-6 bg-red-50 dark:bg-red-500/10 rounded-[32px] border border-red-100 dark:border-red-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-red-500/30 transition-all"></div>
                        <h4 className="font-black text-red-600 dark:text-red-400 mb-3 flex items-center gap-3 text-lg tracking-tight relative z-10"><Unlock size={24}/> {t('guide_req_unlock' as any)}</h4>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed relative z-10">Bắt buộc phải <b className="text-red-600 dark:text-red-400">Unlock Bootloader</b> trước khi nạp ROM. Nếu Bootloader đang khóa (Locked), quá trình sẽ thất bại.</p>
                    </div>
                    <div className="p-6 bg-blue-50 dark:bg-blue-500/10 rounded-[32px] border border-blue-100 dark:border-blue-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-blue-500/30 transition-all"></div>
                        <h4 className="font-black text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-3 text-lg tracking-tight relative z-10"><Terminal size={24}/> {t('guide_req_usb' as any)}</h4>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed relative z-10">Cài đặt {'>'} Giới thiệu {'>'} Chạm 7 lần Số bản dựng.<br/>Vào Tùy chọn nhà phát triển {'>'} Bật <b className="text-blue-600 dark:text-blue-400">Gỡ lỗi USB</b>.</p>
                    </div>
                </div>
            );
        case 'pixel':
        case 'oneplus':
        case 'xiaomi':
            return (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col justify-center">
                    <div className="p-8 bg-white dark:bg-[#1A1C26] rounded-[40px] border border-slate-200 dark:border-white/5 shadow-xl relative overflow-hidden">
                        <h4 className="font-black text-slate-800 dark:text-white mb-6 text-xl tracking-tight">{t('guide_how_fastboot' as any)}</h4>
                        <ul className="space-y-4">
                            <li className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300"><div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Tắt nguồn hoàn toàn thiết bị.</li>
                            <li className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300"><div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Giữ <b className="text-slate-800 dark:text-white bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md">Giảm âm lượng</b> + <b className="text-slate-800 dark:text-white bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md">Nguồn</b>.</li>
                            {guideTab === 'xiaomi' && <li className="flex items-center gap-3 text-sm font-medium text-orange-500"><div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div> Giữ đến khi hiện chữ FASTBOOT màu cam.</li>}
                            {guideTab === 'pixel' && <li className="flex items-center gap-3 text-sm font-medium text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Thả tay khi thấy hình Robot Android.</li>}
                        </ul>
                    </div>
                    <div className="p-6 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-[32px] border border-purple-500/20 flex items-center gap-5">
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Zap size={24} className="text-purple-500" />
                        </div>
                        <div>
                            <h4 className="font-black text-purple-600 dark:text-purple-400 mb-1 text-sm uppercase tracking-widest">{t('guide_tip' as any)}</h4>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">Dùng nút <b>Điều khiển</b> trên Dashboard để vào Fastboot không cần phím cứng.</p>
                        </div>
                    </div>
                </div>
            );
        default: return null;
    }
  }

  const openLink = (url: string) => { try { BrowserOpenURL(url); } catch (e) { window.open(url, '_blank'); } };

  const handleResetBrand = () => {
    localStorage.removeItem(BRAND_STORAGE_KEY);
    localStorage.removeItem(SKIP_BRAND_MODAL_KEY);
    setBrandResetDone(true);
    setTimeout(() => setBrandResetDone(false), 3000);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-500 font-sans">
      
      {/* Nền Kính mờ siêu sâu */}
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#020617]/80 backdrop-blur-3xl" onClick={onClose}></div>
      
      {/* WRAPPER CHÍNH */}
      <div className="relative w-full max-w-5xl h-[650px] bg-slate-50/90 dark:bg-[#0F111A]/90 backdrop-blur-2xl rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
        
        {/* ================= HEADER BẤT ĐỐI XỨNG ================= */}
        <div className="flex justify-between items-center px-10 py-6 border-b border-slate-200/50 dark:border-white/5 relative z-20">
            <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 tracking-tight">
                <div className="w-10 h-10 bg-primary/20 rounded-[12px] flex items-center justify-center text-primary border border-primary/30">
                    <Zap size={20} fill="currentColor"/>
                </div>
                {t('settings_title' as any)}
            </h3>

            {/* Thanh Tab Đã Thêm Full Màu Icon Cực Đỉnh */}
            <div className="flex bg-slate-200/50 dark:bg-black/40 p-1.5 rounded-full backdrop-blur-md border border-white/20 dark:border-white/5 shadow-inner">
              {navTabs.map(tab => {
                 const isActive = activeTab === tab.id;
                 return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                        className={`px-5 py-2.5 rounded-full text-xs font-black transition-all duration-300 flex items-center gap-2 relative outline-none
                            ${isActive ? `${tab.bg} ${tab.text} shadow-sm scale-100` : `text-slate-500 dark:text-slate-400 ${tab.hover} scale-95 hover:scale-100`}`}>
                        {/* Icon có màu ở mọi trạng thái */}
                        <tab.icon size={16} strokeWidth={2.5} className={isActive ? "" : tab.text} /> 
                        {tab.label}
                    </button>
                 );
              })}
            </div>

            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-200/50 dark:bg-white/5 hover:bg-rose-500 hover:text-white text-slate-500 flex items-center justify-center transition-all duration-300 outline-none">
                <X size={20} strokeWidth={2.5}/>
            </button>
        </div>

        {/* ================= CONTENT (BENTO GRID AREA) ================= */}
        <div className="flex-1 p-8 relative z-10 overflow-hidden">
           
           {/* TAB 1: UI THEME & ACCENT COLOR (Layout 2 hàng ngang) */}
           {activeTab === 'ui' && (
              <div className="flex flex-col gap-6 h-full animate-in slide-in-from-bottom-8 duration-700">
                 
                 {/* HÀNG TRÊN: Khối Theme Sáng/Tối/System */}
                 <div className="flex gap-4 h-[65%]">
                    {themes.map(t => {
                        const isActive = theme === t.id;
                        return (
                            <button key={t.id} onClick={() => setTheme(t.id)} 
                                className={`relative overflow-hidden rounded-[36px] border transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-end p-8 text-left outline-none group
                                    ${isActive 
                                        ? `flex-[3] bg-gradient-to-br ${t.glow} border-transparent shadow-[0_20px_40px_rgba(0,0,0,0.3)]` 
                                        : 'flex-[1] bg-white dark:bg-[#1A1C26] border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-sm'}
                                `}>

                                <div className={`w-16 h-16 rounded-[20px] flex items-center justify-center mb-6 transition-all duration-700 relative z-10
                                    ${isActive ? `bg-white/20 text-white shadow-lg backdrop-blur-md` : `bg-slate-50 dark:bg-black/30 ${t.color}`}`}>
                                    <t.icon size={32} strokeWidth={2}/>
                                </div>
                                
                                <div className="relative z-10">
                                    <h4 className={`text-3xl font-black tracking-tight mb-2 transition-colors duration-500 ${isActive ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                                        {t.label}
                                    </h4>
                                    {/* Idle Label hiện rõ ràng với màu nhạt */}
                                    <p className={`text-sm font-medium transition-colors duration-500 ${isActive ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {t.desc}
                                    </p>
                                </div>

                                {/* Nút Active tròn nhỏ */}
                                {isActive && (
                                    <div className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center shadow-md animate-in zoom-in">
                                        <Check size={16} strokeWidth={3}/>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                 </div>

                 {/* HÀNG DƯỚI: Khối Accent Color (Dàn ngang) */}
                 <div className="bg-white dark:bg-[#1A1C26] rounded-[36px] border border-slate-200 dark:border-white/10 px-8 py-6 flex flex-col shadow-sm h-[35%] justify-center">
                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Palette size={16}/> {t('theme_color' as any) || "MÀU CHỦ ĐẠO TÍNH NĂNG"}
                    </h4>
                    
                    <div className="flex items-center gap-4 flex-1">
                        {accentColors.map((c) => (
                            <button key={c.id} onClick={() => setColor(c.id as any)}
                                className={`relative rounded-[24px] flex items-center justify-center transition-all duration-500 outline-none overflow-hidden group w-14 h-14
                                    ${color === c.id ? `bg-slate-50 dark:bg-[#13141C] border border-slate-200 dark:border-white/10 shadow-inner scale-110` : 'bg-transparent border border-transparent hover:bg-slate-100 dark:hover:bg-white/5 hover:scale-105'}
                                `}>
                                
                                {/* Viên màu */}
                                <div className={`w-10 h-10 rounded-full ${c.bg} transition-all duration-500 flex items-center justify-center
                                    ${color === c.id ? `shadow-md ${c.glow} scale-100` : 'opacity-80 group-hover:opacity-100 scale-90'}`}>
                                    {color === c.id && <Check size={16} className="text-white drop-shadow-md animate-in zoom-in" strokeWidth={3} />}
                                </div>
                            </button>
                        ))}

                        {/* Divider */}
                        <div className="w-px h-10 bg-slate-200 dark:bg-white/10 mx-2"></div>

                        {/* Reset Brand Button */}
                        <button onClick={handleResetBrand}
                            className={`relative rounded-[24px] flex items-center gap-3 px-5 py-3 transition-all duration-500 outline-none group border
                                ${brandResetDone 
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                                    : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 hover:border-red-300 dark:hover:border-red-500/30 hover:scale-105'}
                            `}>
                            {brandResetDone 
                                ? <Check size={16} strokeWidth={3} className="animate-in zoom-in" />
                                : <RotateCcw size={16} strokeWidth={2.5} />
                            }
                            <span className="text-xs font-black whitespace-nowrap">
                                {brandResetDone ? t('reset_brand_success' as any) : t('reset_brand_title' as any)}
                            </span>
                        </button>
                    </div>
                 </div>

              </div>
           )}

           {/* TAB 2: NGÔN NGỮ (LANG) */}
           {activeTab === 'lang' && (
              <div className="flex gap-6 h-full animate-in slide-in-from-bottom-8 duration-700">
                 {languages.map(lang => {
                    const isActive = language === lang.id;
                    return (
                        <button key={lang.id} onClick={() => setLanguage(lang.id as any)}
                            className={`relative overflow-hidden rounded-[40px] border transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-center items-center p-8 outline-none group
                                ${isActive 
                                    ? `flex-[3] bg-gradient-to-br ${lang.glow} border-transparent shadow-[0_20px_50px_rgba(0,0,0,0.3)]` 
                                    : 'flex-[1] bg-white dark:bg-[#1A1C26] border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-sm'}
                            `}>
                            
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 z-0
                                ${isActive ? 'text-[250px] opacity-[0.1] grayscale-0' : 'text-[150px] opacity-[0.03] grayscale'}`}>
                                {lang.flag}
                            </div>

                            <div className="relative z-10 flex flex-col items-center">
                                <span className={`text-8xl drop-shadow-2xl transition-all duration-700 mb-6 ${isActive ? 'scale-110' : 'scale-90 group-hover:scale-100 grayscale group-hover:grayscale-0'}`}>{lang.flag}</span>
                                
                                <div className="text-center">
                                    {/* Idle Label giữ nguyên, không ẩn đi */}
                                    <h4 className={`text-4xl font-black tracking-tight mb-3 transition-colors duration-500 ${isActive ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                                        {lang.label}
                                    </h4>
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors duration-500
                                        ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                                        {lang.desc}
                                    </span>
                                </div>
                            </div>
                            
                            {isActive && (
                                <div className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center shadow-lg animate-in zoom-in">
                                    <Check size={24} strokeWidth={3}/>
                                </div>
                            )}
                        </button>
                    )
                 })}
              </div>
           )}

           {/* TAB 3: HƯỚNG DẪN (GUIDE) */}
           {activeTab === 'guide' && (
              <div className="grid grid-cols-12 gap-6 h-full animate-in slide-in-from-bottom-8 duration-700">
                  {/* Menu Sidebar Trái (4 Cột) */}
                  <div className="col-span-4 bg-white dark:bg-[#1A1C26] rounded-[40px] border border-slate-200 dark:border-white/5 p-4 flex flex-col gap-2 shadow-xl">
                        {guideSections.map(s => (
                            <button key={s.id} onClick={() => setGuideTab(s.id)}
                                className={`text-left px-6 py-5 rounded-[28px] font-black transition-all duration-300 flex justify-between items-center group outline-none
                                ${guideTab === s.id 
                                    ? 'bg-primary text-white shadow-lg shadow-primary/30 text-lg' 
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 text-base'}`}>
                                {s.label}
                                {guideTab === s.id && <ChevronRight size={20} className="animate-pulse" />}
                            </button>
                        ))}
                  </div>
                  {/* Content Phải (8 Cột) */}
                  <div className="col-span-8 flex flex-col justify-center">
                        {renderGuideContent()}
                  </div>
              </div>
           )}

           {/* TAB 4: ABOUT (TDEV PORTFOLIO CARD) */}
           {activeTab === 'about' && (
              <div className="grid grid-cols-12 gap-6 h-full animate-in slide-in-from-bottom-8 duration-700">
                 {/* Hero Avatar Card (8 Cột) */}
                 <div className="col-span-8 relative rounded-[40px] overflow-hidden group border border-slate-200 dark:border-white/10 shadow-2xl bg-slate-900 flex flex-col justify-end p-10 cursor-pointer" onClick={() => openLink("https://tdev.site")}>
                    
                    <img src="https://ui-avatars.com/api/?name=Tung+Ha&background=0D8ABC&color=fff&size=512" alt="Background" 
                         className="absolute inset-0 w-full h-full object-cover opacity-40 blur-2xl group-hover:scale-110 group-hover:opacity-60 transition-all duration-1000 ease-out" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>

                    <div className="relative z-10 flex items-end justify-between w-full">
                        <div>
                            <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-[24px] border border-white/20 p-2 mb-6 shadow-2xl group-hover:-translate-y-2 transition-transform duration-500">
                                <img src="https://ui-avatars.com/api/?name=Tung+Ha&background=0D8ABC&color=fff&size=256" alt="Tung Ha" className="w-full h-full rounded-[16px] object-cover" />
                            </div>
                            <h3 className="text-5xl font-black text-white tracking-tight mb-2 drop-shadow-md">Tùng Hà</h3>
                            <p className="text-sm font-black text-indigo-400 uppercase tracking-[0.3em]">Full-Stack Developer</p>
                        </div>
                        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center border border-white/20 group-hover:bg-primary transition-colors duration-500 shadow-xl">
                            <Code size={24} />
                        </div>
                    </div>
                 </div>

                 {/* Social Floating Cards (4 Cột) */}
                 <div className="col-span-4 flex flex-col gap-4">
                    <button onClick={() => openLink("https://zalo.me/0977986982")} className="flex-1 rounded-[32px] bg-blue-500 hover:bg-blue-600 text-white p-6 flex flex-col justify-between transition-all group shadow-lg shadow-blue-500/20 outline-none">
                        <div className="flex justify-between items-start w-full">
                            <div className="w-12 h-12 rounded-[20px] bg-white/20 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform"><MessageCircle size={24} fill="currentColor"/></div>
                            <ChevronRight size={24} className="opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all"/>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 mb-1">Liên hệ Zalo</div>
                            <div className="text-2xl font-black tracking-tight">0977 986 982</div>
                        </div>
                    </button>

                    <button onClick={() => openLink("https://tdev.site")} className="flex-1 rounded-[32px] bg-purple-500 hover:bg-purple-600 text-white p-6 flex flex-col justify-between transition-all group shadow-lg shadow-purple-500/20 outline-none">
                        <div className="flex justify-between items-start w-full">
                            <div className="w-12 h-12 rounded-[20px] bg-white/20 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform"><Briefcase size={24} /></div>
                            <LinkIcon size={24} className="opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all"/>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200 mb-1">Portfolio</div>
                            <div className="text-2xl font-black tracking-tight">tdev.site</div>
                        </div>
                    </button>
                 </div>
              </div>
           )}

        </div>
      </div>
    </div>,
    document.body
  );
};
