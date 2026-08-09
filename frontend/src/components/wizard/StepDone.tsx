import React, { useState, useEffect, useRef } from 'react';
import WizardLayout from './WizardLayout';
import { RebootSystem, WipeDataSafe } from "../../../wailsjs/go/main/App";
import { RotateCcw, Trash2, LayoutDashboard, ScrollText, AlertTriangle, CheckCircle2, Loader2, XCircle, Power, Info } from 'lucide-react';
import Lottie from "lottie-react";
import doneAnim from "../../assets/lottie/done.json";
import { toast } from 'sonner';
import { EventsOn } from '../../../wailsjs/runtime';
import { useLanguage } from '../../i18n/LanguageContext';

interface StepDoneProps {
    success?: boolean;
    logs?: string[];
    onExit?: () => void;
    [key: string]: any; 
}

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

const StepDone: React.FC<StepDoneProps> = ({ success = true, logs: initialLogs = [], onExit }) => {
    const { t } = useLanguage();
    
    const [wipeStatus, setWipeStatus] = useState<ActionStatus>('idle');
    const [wipeErrorMsg, setWipeErrorMsg] = useState<string>("");
    const [rebootStatus, setRebootStatus] = useState<ActionStatus>('idle');
    
    const [localLogs, setLocalLogs] = useState<string[]>(initialLogs);
    const logEndRef = useRef<HTMLDivElement | null>(null);

    // [FIX LOGIC] Sử dụng unsubscribe cho EventsOn
    useEffect(() => {
        const unsubLog = EventsOn("flash_log", (msg: string) => {
            setLocalLogs(prev => [...prev, msg]);
        });
        return () => { if (unsubLog) unsubLog(); };
    }, []);

    useEffect(() => {
        if (wipeStatus === 'error' || !success) {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [localLogs, wipeStatus, success]);

    const handleReboot = async () => {
        if (rebootStatus === 'loading') return;
        setRebootStatus('loading');
        try {
            toast.info(t('done_msg_rebooting'));
            await RebootSystem();
            setRebootStatus('success');
            setTimeout(() => { onExit?.(); }, 1000);
        } catch (e: any) {
            toast.error(t('error') + ": " + e.message);
            setRebootStatus('idle');
        }
    };

    const handleWipe = async () => {
        if (wipeStatus === 'success' || wipeStatus === 'loading') return;
        setWipeStatus('loading');
        setWipeErrorMsg(""); 
        setLocalLogs(prev => [...prev, ">>> USER REQUEST: WIPE DATA..."]);

        try {
            toast.info(t('done_msg_wiping'));
            await WipeDataSafe();
            setWipeStatus('success');
            setLocalLogs(prev => [...prev, ">>> WIPE SUCCESS."]);
            toast.success(t('done_msg_wipe_ok'));
        } catch (e: any) {
            setWipeStatus('error');
            setWipeErrorMsg(e.toString());
            setLocalLogs(prev => [...prev, "!!! WIPE ERROR: " + e.toString()]);
            toast.error(t('done_msg_wipe_fail'));
        }
    };

    const shouldShowLog = !success || wipeStatus === 'error';

    return (
        <WizardLayout title="" hideNavigation={true} onExit={onExit}>
            <div className="w-full h-full min-h-0 flex items-center justify-center pb-10 font-sans">
                <div className="w-full max-w-2xl bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/5 rounded-[2.5rem] p-8 sm:p-10 flex flex-col items-center text-center shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
                    
                    <div className={`absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${success ? 'from-green-500 to-transparent' : 'from-red-500 to-transparent'}`}></div>

                    <div className="relative mb-8 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className={`w-32 h-32 sm:w-48 sm:h-48 rounded-full animate-ping opacity-10 ${success ? "bg-emerald-500" : "bg-red-500"}`} style={{ animationDuration: '3s' }} />
                        </div>
                        <div className="relative w-32 h-32 sm:w-40 sm:h-40 drop-shadow-xl">
                            {success ? (
                                <Lottie animationData={doneAnim} loop={false} className="w-full h-full" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-500/10 rounded-full border-4 border-red-200 dark:border-red-500/20 text-red-500">
                                    <AlertTriangle size={56} strokeWidth={1.5} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="relative z-10 mb-8">
                        <h2 className={`text-2xl sm:text-3xl font-black mb-3 tracking-tight ${success ? 'text-slate-800 dark:text-slate-100' : 'text-red-600 dark:text-red-400'}`}>
                            {success ? t('done_title_success') : t('done_title_fail')}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-bold max-w-md mx-auto leading-relaxed">
                            {success ? t('done_desc_success') : t('done_desc_fail')}
                        </p>
                    </div>

                    {shouldShowLog && localLogs.length > 0 && (
                        <div className="w-full bg-slate-50 dark:bg-[#1E1F22] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden mb-8 relative z-10 text-left animate-in fade-in shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 dark:bg-black/20 border-b border-slate-200 dark:border-white/5 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <ScrollText size={14}/> {wipeStatus === 'error' ? "Wipe Error Log" : "Flash Error Log"}
                            </div>
                            <pre className="p-4 text-xs font-mono text-slate-600 dark:text-slate-300 max-h-32 overflow-auto whitespace-pre-wrap custom-scrollbar">
                                {localLogs.slice(-8).join('\n')}
                                <div ref={logEndRef}></div>
                            </pre>
                        </div>
                    )}

                    <div className="w-full flex flex-col gap-3 relative z-10">
                        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                            {success ? (
                                <>
                                    <button 
                                        onClick={handleReboot} 
                                        disabled={rebootStatus === 'loading'}
                                        className={`flex-1 group flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
                                            ${rebootStatus === 'loading' 
                                                ? 'bg-slate-100 dark:bg-[#1E1F22] text-slate-400 cursor-not-allowed' 
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20'}`}
                                    >
                                        {rebootStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} strokeWidth={2.5}/>}
                                        <span>{rebootStatus === 'loading' ? t('loading') : t('done_btn_reboot')}</span>
                                    </button>

                                    <button 
                                        onClick={handleWipe} 
                                        disabled={wipeStatus === 'loading' || wipeStatus === 'success'} 
                                        className={`flex-1 group flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] border
                                            ${wipeStatus === 'loading' ? 'bg-slate-100 dark:bg-[#1E1F22] text-slate-400 border-transparent cursor-not-allowed' :
                                              wipeStatus === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 cursor-default' :
                                              wipeStatus === 'error'   ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20' :
                                              'bg-slate-50 dark:bg-[#1E1F22] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/10'
                                            }`}
                                    >
                                        {wipeStatus === 'loading' ? <Loader2 size={16} className="animate-spin"/> : 
                                         wipeStatus === 'success' ? <CheckCircle2 size={16}/> : 
                                         wipeStatus === 'error' ? <XCircle size={16}/> : <Trash2 size={16}/>}
                                        
                                        <span>
                                            {wipeStatus === 'loading' ? t('loading') : 
                                             wipeStatus === 'success' ? t('done_btn_wiped') : 
                                             wipeStatus === 'error' ? t('done_btn_retry_wipe') : t('done_btn_wipe')}
                                        </span>
                                    </button>
                                </>
                            ) : (
                                <button onClick={onExit} className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                                    <RotateCcw size={16} strokeWidth={2.5}/>
                                    <span>{t('side_btn_start_flash') || "Nạp lại ROM"}</span>
                                </button>
                            )}
                        </div>
                        
                        {wipeStatus === 'error' && (
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-orange-700 dark:text-orange-400 text-xs font-bold bg-orange-50 dark:bg-orange-500/10 py-3 px-4 rounded-xl border border-orange-200 dark:border-orange-500/20 animate-in fade-in mt-2">
                                <Info size={16} className="shrink-0"/>
                                <span className="text-center sm:text-left">{t('done_wipe_manual_hint')}</span>
                            </div>
                        )}

                         <button onClick={onExit} className="mx-auto mt-4 px-6 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white text-xs font-bold transition-colors flex items-center gap-2">
                            <LayoutDashboard size={14} />
                            <span>{t('done_btn_home')}</span>
                        </button>
                    </div>

                </div>
            </div>
        </WizardLayout>
    );
};

export default StepDone;