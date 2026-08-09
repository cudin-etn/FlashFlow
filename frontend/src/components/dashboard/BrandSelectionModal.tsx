import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Smartphone, Zap, Cpu, Layers, Clock3 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export const BRAND_STORAGE_KEY = 'flashflow_saved_brand';
export const SKIP_BRAND_MODAL_KEY = 'flashflow_skip_brand_modal';

interface BrandSelectionModalProps {
    isOpen: boolean;
    onSelect: (brand: string) => void;
}

const brands = [
    { 
        id: 'OnePlus', 
        label: 'OnePlus', 
        desc: 'OxygenOS / ColorOS system optimization', 
        icon: Zap, 
        enabled: true, 
        badge: 'READY', 
        bgGlow: 'from-red-600 to-rose-600', 
    },
    { 
        id: 'Pixel', 
        label: 'Google Pixel', 
        desc: 'Stock Android experience for Pixel devices', 
        icon: Smartphone, 
        enabled: false, 
        badge: 'SOON', 
        bgGlow: 'from-cyan-500 to-blue-600', 
    },
    { 
        id: 'Xiaomi', 
        label: 'Xiaomi', 
        desc: 'MIUI / HyperOS flashing and management', 
        icon: Cpu, 
        enabled: false, 
        badge: 'SOON', 
        bgGlow: 'from-orange-500 to-amber-500', 
    },
];

export const BrandSelectionModal: React.FC<BrandSelectionModalProps> = ({ isOpen, onSelect }) => {
    const { t } = useLanguage();
    const [hoveredId, setHoveredId] = useState('OnePlus');
    const [dontAskAgain, setDontAskAgain] = useState(false);

    if (!isOpen) return null;

    const handleSelect = (brandId: string) => {
        if (dontAskAgain) {
            localStorage.setItem(BRAND_STORAGE_KEY, brandId);
            localStorage.setItem(SKIP_BRAND_MODAL_KEY, 'true');
        }
        onSelect(brandId);
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8 font-sans animate-in fade-in duration-500">
           {/* Nền Kính mờ có dải màu mờ ảo (Cosmic Background) */}
<div className="absolute inset-0 bg-white/60 dark:bg-[#020617] backdrop-blur-3xl cursor-default
    dark:bg-[radial-gradient(at_0%_0%,_rgba(30,58,138,0.3)_0px,_transparent_50%),radial-gradient(at_100%_100%,_rgba(88,28,135,0.2)_0px,_transparent_50%)]" 
/>
            <div className="relative w-full max-w-6xl h-[600px] flex gap-5 animate-in zoom-in-95 duration-300">
                {brands.map((brand) => {
                    const isActive = hoveredId === brand.id;
                    const Icon = brand.icon;
                    
                    return (
                        <button
                            key={brand.id}
                            onMouseEnter={() => setHoveredId(brand.id)}
                            onClick={() => brand.enabled && isActive && handleSelect(brand.id)}
                            className={`relative overflow-hidden rounded-[40px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-end p-10 border outline-none group
                                ${isActive 
                                    ? `flex-[3] bg-gradient-to-br ${brand.bgGlow} border-white/20 shadow-[0_40px_80px_rgba(0,0,0,0.6)]` 
                                    : `flex-[1] bg-white dark:bg-[#1A1C26] border-slate-200 dark:border-white/15 opacity-65 grayscale hover:opacity-90 shadow-lg`}
                                ${!brand.enabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {/* Texture Overlay cho thẻ Active */}
                            {isActive && (
                                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-[0.2] mix-blend-overlay pointer-events-none"></div>
                            )}

                            <div className="relative z-10 flex flex-col items-center text-center h-full justify-between">
                                {/* Badge (READY/SOON) */}
                                <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] mt-4 transition-all duration-500
                                    ${isActive 
                                        ? 'bg-white/20 text-white backdrop-blur-md border border-white/20' 
                                        : 'bg-slate-200 dark:bg-white/5 text-slate-500 border border-slate-300 dark:border-white/10'}`}>
                                    {brand.badge}
                                </div>

                                {/* Khối Trung Tâm: Icon & Text */}
                                <div className={`flex flex-col items-center transition-all duration-700 ${isActive ? 'scale-100 translate-y-0' : 'scale-75 translate-y-12'}`}>
                                    <div className={`w-32 h-32 rounded-[32px] flex items-center justify-center transition-all duration-500 shadow-2xl mb-8
                                        ${isActive 
                                            ? 'bg-white/10 backdrop-blur-md text-white border border-white/30' 
                                            : 'bg-slate-100 dark:bg-black/20 text-slate-400 border border-transparent shadow-inner'}`}>
                                        <Icon size={64} strokeWidth={1.5} className={isActive ? "drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" : "opacity-40"} />
                                    </div>
                                    
                                    <div className={`transition-all duration-500 overflow-hidden ${isActive ? 'opacity-100 max-h-60 translate-y-0' : 'opacity-0 max-h-0 translate-y-10'}`}>
                                        <h2 className="text-4xl font-black text-white tracking-tight mb-3 drop-shadow-md whitespace-nowrap">
                                            {brand.label}
                                        </h2>
                                        <p className="text-sm font-medium text-white/90 leading-relaxed max-w-[280px]">
                                            {brand.desc}
                                        </p>
                                    </div>
                                </div>

                                {/* Icon Trạng Thái Phía Dưới */}
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 mb-2
                                    ${isActive 
                                        ? 'bg-white text-slate-900 shadow-2xl scale-100 group-hover:scale-110' 
                                        : 'bg-slate-200 dark:bg-white/5 text-slate-500 scale-75 border border-transparent dark:border-white/5'}`}>
                                    {brand.enabled ? (
                                        <ChevronRight size={28} strokeWidth={3} className={isActive ? "animate-pulse" : ""} />
                                    ) : (
                                        <Clock3 size={24} strokeWidth={2.5} className={isActive ? "animate-spin-slow" : ""} />
                                    )}
                                </div>
                            </div>

                            {/* Lớp phủ sáng nhẹ khi Hover dành cho thẻ có thể bấm */}
                            {isActive && brand.enabled && (
                                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none"></div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* "Không hỏi lại" Checkbox */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group/check">
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={dontAskAgain}
                            onChange={(e) => setDontAskAgain(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-5 h-5 rounded-md border-2 border-white/30 dark:border-white/30 bg-white/10 dark:bg-white/5 backdrop-blur-sm
                            peer-checked:bg-white/20 peer-checked:border-white/60
                            transition-all duration-200 flex items-center justify-center
                            group-hover/check:border-white/50">
                            {dontAskAgain && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                    </div>
                    <span className="text-sm font-medium text-white/70 group-hover/check:text-white/90 transition-colors duration-200">
                        {t('brand_dont_ask_again' as any)}
                    </span>
                </label>
            </div>
            
            {/* Title Overlay mờ phía trên */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-3 opacity-20 pointer-events-none">
                <Layers size={20} className="text-white" />
                <span className="text-xs font-black text-white uppercase tracking-[0.4em]">{t('brand_title' as any)}</span>
            </div>
        </div>,
        document.body,
    );
};