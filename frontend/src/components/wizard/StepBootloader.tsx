import React, { useState, useEffect, useRef } from "react";
import WizardLayout from "./WizardLayout";
import { Lock, Unlock, ShieldAlert, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import Lottie from "lottie-react";
import thiefAnim from "../../assets/lottie/thief-unlock.json";
import { CheckDevice, RebootBootloader, UnlockBootloader } from "../../../wailsjs/go/main/App";
import { toast } from "sonner";
import { useLanguage } from '../../i18n/LanguageContext';

interface StepBootloaderProps {
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}

type BootloaderState = "checking" | "rebooting" | "locked" | "unlocked";

const StepBootloader: React.FC<StepBootloaderProps> = ({ onNext, onBack, onExit }) => {
  const { t } = useLanguage();
  const [state, setState] = useState<BootloaderState>("checking");
  const isProcessing = useRef(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  
  // Ref để quản lý interval, tránh Memory Leak khi thoát Modal ngang chừng
  const pollInterval = useRef<any>(null);

  const checkStatus = async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setState("checking");

    try {
      const device = await CheckDevice();
      
      if (device.connected && !device.state.includes("fastboot") && device.state !== "bootloader") {
        setState("rebooting");
        toast.info(t('step_bootloader_toast_rebooting'));
        await RebootBootloader();
        
        let attempts = 0;
        if (pollInterval.current) clearInterval(pollInterval.current);
        
        pollInterval.current = setInterval(async () => {
            attempts++;
            const d = await CheckDevice();
            if (d.connected && (d.state.includes("fastboot") || d.state === "bootloader")) {
                clearInterval(pollInterval.current);
                analyzeBootloaderStatus(d);
            }
            if (attempts > 60) {
                clearInterval(pollInterval.current);
                toast.error(t('step_bootloader_error_enter_bootloader'));
                setState("checking");
                isProcessing.current = false;
            }
        }, 1000);
        return;
      }

      if (device.connected) {
          analyzeBootloaderStatus(device);
      } else {
          toast.error(t('step_bootloader_error_no_device'));
          setState("checking");
          isProcessing.current = false;
      }

    } catch (e) {
      toast.error(t('step_bootloader_error_check_failed'));
      setState("checking");
      isProcessing.current = false;
    }
  };

  const analyzeBootloaderStatus = (device: any) => {
      const blStatus = (device.bootloader || "").toLowerCase();
      setState((blStatus.includes("unlocked") || blStatus.includes("yes")) ? "unlocked" : "locked");
      isProcessing.current = false;
  };

  useEffect(() => {
    checkStatus();
    // Dọn dẹp tuyệt đối khi component bị unmount
    return () => {
        if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const handleUnlock = async () => {
      setIsUnlocking(true);
      const toastId = toast.loading(t('step_bootloader_toast_sending_unlock'));
      try {
          await UnlockBootloader();
          toast.dismiss(toastId);
          toast.success(t('step_bootloader_toast_unlock_sent_title'), {
              description: t('step_bootloader_toast_unlock_sent_desc'),
              duration: 5000
          });
          setTimeout(() => onExit(), 2000);
      } catch (e) {
          toast.dismiss(toastId);
          toast.error(t('step_bootloader_toast_unlock_failed') + String(e));
          setIsUnlocking(false);
      }
  };

  const canNext = state === "unlocked";
  const canUnlock = state === "locked";

  return (
    <WizardLayout
      title={t('step_bootloader_title')}
      subtitle={t('step_bootloader_subtitle')}
      onBack={onBack}
      onExit={onExit}
      canNext={canNext || canUnlock} 
      nextLabel={isUnlocking ? t('step_bootloader_next_loading') : (state === "unlocked" ? t('step_bootloader_next_continue') : t('step_bootloader_next_unlock'))}
      onNext={state === "unlocked" ? onNext : (state === "locked" ? handleUnlock : undefined)}
      loading={state === "checking" || state === "rebooting" || isUnlocking}
    >
      <div className="flex flex-col items-center w-full h-full pt-4 px-6 overflow-y-auto custom-scrollbar">
        <div className="relative w-72 h-72 flex items-center justify-center shrink-0 mb-6">
            <div className={`absolute inset-0 rounded-full blur-3xl opacity-10 transition-colors duration-1000
                ${state === "unlocked" ? "bg-emerald-500" : state === "locked" ? "bg-orange-500" : "bg-blue-500"}`} 
            />
            <Lottie animationData={thiefAnim} loop={true} className="w-full h-full relative z-10 drop-shadow-xl" />
            <div className="absolute bottom-4 right-10 z-20">
                {state === "checking" || state === "rebooting" ? (
                    <div className="bg-white dark:bg-[#1E1F22] p-3 rounded-full shadow-lg animate-spin border border-slate-100 dark:border-white/5"><Loader2 size={28} className="text-blue-500" /></div>
                ) : state === "unlocked" ? (
                    <div className="bg-emerald-500 p-3 rounded-full shadow-lg animate-in zoom-in border-4 border-white dark:border-[#131314]"><Unlock size={28} className="text-white" /></div>
                ) : (
                    <div className="bg-orange-500 p-3 rounded-full shadow-lg animate-in zoom-in border-4 border-white dark:border-[#131314]"><Lock size={28} className="text-white" /></div>
                )}
            </div>
        </div>

        <div className="w-full max-w-lg text-center space-y-4">
            {(state === "checking" || state === "rebooting") && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">
                        {state === "rebooting" ? t('step_bootloader_rebooting_title') : t('step_bootloader_checking_title')}
                    </h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">{t('step_bootloader_checking_subtitle')}</p>
                </div>
            )}

            {state === "unlocked" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 bg-emerald-50/50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-5 rounded-2xl">
                    <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-2 tracking-tight">
                        <CheckCircle2 size={20} /> {t('step_bootloader_unlocked_title')}
                    </h3>
                    <p className="text-sm font-medium text-emerald-600/80 dark:text-emerald-400/80 mt-1">{t('step_bootloader_unlocked_subtitle')}</p>
                </div>
            )}

            {state === "locked" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 w-full">
                    <div className="bg-orange-50/50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 p-5 rounded-2xl mb-4 text-center">
                        <h3 className="text-lg font-black text-orange-700 dark:text-orange-400 flex items-center justify-center gap-2 tracking-tight">
                            <Lock size={20} /> {t('step_bootloader_locked_title')}
                        </h3>
                        <p className="text-sm font-medium text-orange-600/80 dark:text-orange-400/80 mt-1">{t('step_bootloader_locked_subtitle')}</p>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 text-left">
                        <ShieldAlert size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 leading-relaxed">{t('step_bootloader_locked_warning')}</p>
                    </div>
                </div>
            )}
        </div>
        
        {state !== "rebooting" && state !== "checking" && (
             <button onClick={checkStatus} className="mt-8 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-500 transition-colors uppercase tracking-widest">
                <RefreshCw size={14} /> {t('step_bootloader_recheck')}
             </button>
        )}
      </div>
    </WizardLayout>
  );
};

export default StepBootloader;