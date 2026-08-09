import React from 'react';
import { Clock, X, ShoppingBag } from 'lucide-react';

export const ExpirationModal = ({ isOpen, onClose, onOpenStore, t }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-xl" onClick={onClose} />
            <div className="relative bg-white/90 dark:bg-[#1C1C1E]/90 border border-white/40 dark:border-white/10 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300 overflow-hidden backdrop-blur-2xl">
                <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-rose-500/20 to-transparent pointer-events-none"></div>
                <div className="relative mb-6 mt-2 group">
                    <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-20"></div>
                    <div className="relative w-24 h-24 bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-500/20 dark:to-rose-600/20 rounded-full flex items-center justify-center border-4 border-white dark:border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.4)] z-10 transition-transform duration-300 group-hover:scale-110">
                        <Clock size={48} className="text-rose-600 dark:text-rose-400 drop-shadow-lg transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-12" />
                    </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">{t('expire_title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-8 leading-relaxed">{t('expire_desc')}</p>
                <div className="grid grid-cols-2 gap-4 w-full relative z-10">
                    <button onClick={onClose} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-slate-100/50 text-slate-600 hover:bg-slate-200/50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 transition-all group">
                        <X size={18} className="group-hover:scale-125 transition-transform" /> {t('close')}
                    </button>
                    <button onClick={onOpenStore} className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all group">
                        <ShoppingBag size={18} className="group-hover:-translate-y-1 group-hover:scale-110 transition-transform" /> {t('btn_open_store')}
                    </button>
                </div>
            </div>
        </div>
    );
};