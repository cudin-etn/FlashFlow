import React from 'react';
import { Smartphone, BatteryCharging, Disc, Split, Lock, LockOpen } from 'lucide-react';

interface TopStatusBarProps {
    device: any;
    currentBrand: string;
    onBrandChange: (brand: string) => void;
    onOpenDetails: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({ device, currentBrand, onBrandChange, onOpenDetails }) => {
    const brands = [
        { id: 'pixel', label: 'Pixel', color: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500/30' },
        { id: 'oneplus', label: 'OnePlus', color: 'bg-red-500', text: 'text-red-500', border: 'border-red-500/30' },
        { id: 'xiaomi', label: 'Xiaomi', color: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500/30' },
    ];

    return (
        <div className="w-full flex justify-between items-center px-8 pt-4 pb-2 z-50 no-drag">
            
            {/* LEFT: DEVICE INFO PILL (Expanded Version) */}
            <button 
                onClick={onOpenDetails}
                className="group flex items-center gap-3 bg-white/60 dark:bg-black/40 backdrop-blur-md border border-slate-200 dark:border-white/10 pr-5 pl-3 py-2.5 rounded-full shadow-sm hover:bg-white/80 dark:hover:bg-white/10 transition-all clickable"
            >
                {/* Icon Circle */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${device.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'}`}>
                    <Smartphone size={16} strokeWidth={2.5} />
                </div>

                {/* Text Info */}
                <div className="flex flex-col items-start leading-none gap-1.5">
                    <span className={`text-xs font-bold ${device.connected ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                        {device.model}
                    </span>
                    
                    {/* Detailed Stats Row */}
                    <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        {device.connected ? (
                            <>
                                {/* Battery */}
                                <span className="flex items-center gap-1" title="Pin">
                                    <BatteryCharging size={10} className="text-emerald-500"/> {device.battery}
                                </span>
                                <span className="w-px h-2.5 bg-slate-300 dark:bg-white/20"></span>
                                
                                {/* OS */}
                                <span className="flex items-center gap-1" title="Android Version">
                                    <Disc size={10} className="text-blue-500"/> Android {device.os}
                                </span>
                                <span className="w-px h-2.5 bg-slate-300 dark:bg-white/20"></span>

                                {/* Slot */}
                                <span className="flex items-center gap-1" title="Current Slot">
                                    <Split size={10} className="text-purple-500"/> Slot {device.slot === '--' ? '?' : device.slot}
                                </span>
                                <span className="w-px h-2.5 bg-slate-300 dark:bg-white/20"></span>

                                {/* Bootloader */}
                                <span className={`flex items-center gap-1 ${device.bootloaderColor === 'red' ? 'text-red-500' : (device.bootloaderColor === 'emerald' ? 'text-emerald-500' : '')}`}>
                                    {device.bootloader === 'UNLOCKED' ? <LockOpen size={10}/> : <Lock size={10}/>}
                                    {device.bootloader}
                                </span>
                            </>
                        ) : (
                            <span className="italic opacity-70">Đang chờ kết nối thiết bị...</span>
                        )}
                    </div>
                </div>
            </button>

            {/* RIGHT: BRAND SELECTOR */}
            <div className="flex bg-white/60 dark:bg-black/40 backdrop-blur-md p-1 rounded-full border border-slate-200 dark:border-white/10 shadow-sm">
                {brands.map(b => {
                    const isActive = currentBrand?.toLowerCase() === b.id;
                    return (
                        <button
                            key={b.id}
                            onClick={() => onBrandChange(b.id)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide transition-all clickable flex items-center gap-1.5 ${
                                isActive 
                                ? `${b.color} text-white shadow-md` 
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                            {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                            {b.label}
                        </button>
                    )
                })}
            </div>
        </div>
    );
};