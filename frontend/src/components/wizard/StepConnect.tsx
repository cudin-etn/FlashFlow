import React, { useState, useEffect } from 'react';
import WizardLayout from './WizardLayout';
import { CheckDevice } from '../../../wailsjs/go/main/App';
import { Smartphone, AlertCircle, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface StepConnectProps {
    onNext: (device: any) => void;
    onExit: () => void;
}

// --- CSS ANIMATIONS (Giữ nguyên vì đẹp) ---
const style = `
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }
  @keyframes cable-connect {
    0% { transform: translateY(30px); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: translateY(-2px); opacity: 1; }
  }
  @keyframes cable-idle {
    0%, 100% { transform: translateY(15px); }
    50% { transform: translateY(25px); }
  }
  .animate-float { animation: float 3s ease-in-out infinite; }
  .animate-cable-connect { animation: cable-connect 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .animate-cable-idle { animation: cable-idle 2s ease-in-out infinite; }
`;

const EventsOn = (eventName: string, callback: any) => {
    if ((window as any).runtime) {
        return (window as any).runtime.EventsOn(eventName, callback);
    }
    return () => { };
};

const StepConnect: React.FC<StepConnectProps> = ({ onNext, onExit }) => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [device, setDevice] = useState<any>(null);

    // --- LOGIC 1: TỰ ĐỘNG CẬP NHẬT UI (CHỈ HIỂN THỊ, KHÔNG CHUYỂN TRANG) ---
    useEffect(() => {
        let cancelListener: any = null;

        const handleFound = (d: any) => {
            if (d && d.connected) {
                // Chỉ cập nhật trạng thái để hiện Tích Xanh & Nút Tiếp Tục
                setDevice(d);
                setError("");
                // KHÔNG GỌI onNext() TỰ ĐỘNG NỮA
            } else {
                // Nếu rút cáp thì reset về trạng thái chờ
                setDevice(null);
            }
        };

        // 1. Check ngay khi vào (nếu đã cắm sẵn)
        CheckDevice().then(handleFound).catch(() => {});

        // 2. Lắng nghe sự kiện cắm/rút
        cancelListener = EventsOn("device_changed", handleFound);

        return () => { if (cancelListener) cancelListener(); };
    }, []);

    // --- LOGIC 2: NÚT BẤM THÔNG MINH (QUÉT HOẶC TIẾP TỤC) ---
    const handleButtonClick = async () => {
        // TRƯỜNG HỢP 1: Đã có thiết bị -> Bấm để TIẾP TỤC
        if (device && device.connected) {
            onNext(device);
            return;
        }

        // TRƯỜNG HỢP 2: Chưa có thiết bị -> Bấm để QUÉT LẠI
        setLoading(true); setError("");
        try {
            // Delay giả lập 1 xíu cho cảm giác đang quét
            await new Promise(r => setTimeout(r, 300)); 
            
            const result = await CheckDevice();
            if (result && result.connected) {
                setDevice(result);
                setError("");
            } else {
                setError(t('step_connect_error_not_found'));
                setDevice(null);
            }
        } catch (e: any) { 
            setError(t('step_connect_error_retry') + " " + (e?.message || "")); 
        } finally { 
            setLoading(false); 
        }
    };

    const titleText = t('step_connect_title');
    const subtitleText = t('step_connect_subtitle');
    const nextScanText = t('step_connect_next_scan');
    const nextContinueText = t('step_connect_next_continue');
    const nextLoadingText = t('step_connect_next_loading');

    const successTitleText = t('step_connect_success_title');
    const successHintText = t('step_connect_success_hint');
    const waitingTitleText = t('step_connect_waiting_title');
    const waitingHintLine1Text = t('step_connect_waiting_hint_line1');
    const waitingHintLine2Text = t('step_connect_waiting_hint_line2');

    return (
        <WizardLayout
            title={titleText}
            subtitle={subtitleText}
            // Nút bấm: Luôn luôn trỏ vào handleButtonClick
            onNext={handleButtonClick}
            onExit={onExit}
            // Label thay đổi thông minh
            nextLabel={device ? nextContinueText : (loading ? nextLoadingText : nextScanText)}
            // Chỉ disable khi đang loading thật (đang quét), còn khi có device thì SÁNG LÊN để bấm
            loading={loading} 
            canBack={false}
        >
            <style>{style}</style>

            <div className="flex-1 flex flex-col items-center justify-start pt-10 space-y-12 min-h-[450px]">
                
                {/* ANIMATION (Giữ nguyên) */}
                <div className="relative w-64 h-64 flex justify-center">
                    <div className={`relative z-10 w-36 h-[72px] rounded-[2.5rem] border-[6px] bg-white dark:bg-[#18181b] transition-all duration-500 ease-out overflow-hidden
                        ${device 
                            ? 'border-emerald-500 shadow-[0_20px_50px_-10px_rgba(16,185,129,0.3)] scale-105' 
                            : 'border-slate-300 dark:border-slate-700 shadow-xl animate-float'
                        }
                    `}>
                        <div className={`absolute inset-2 rounded-[1.8rem] flex items-center justify-center transition-all duration-700
                             ${device ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-[#09090b]'}`}>
                            <div className={`w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-500 delay-200
                                ${device ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-180'}`}>
                                <Check size={32} strokeWidth={4} />
                            </div>
                        </div>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-b-lg"></div>
                    </div>

                    <div className={`absolute bottom-0 flex flex-col items-center transition-all duration-500
                        ${device ? 'translate-y-[-4px] z-20 animate-cable-connect' : 'translate-y-8 z-0 animate-cable-idle opacity-60'}`}>
                        <div className={`w-12 h-8 rounded-t-lg border-[4px] border-b-0 transition-colors duration-500
                            ${device ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-700'}`}></div>
                        <div className={`w-10 h-5 rounded-b-md transition-colors duration-500
                            ${device ? 'bg-emerald-600' : 'bg-slate-400 dark:bg-slate-600'}`}></div>
                        <div className={`w-1.5 h-24 transition-colors duration-500
                            ${device ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                    </div>
                </div>

                {/* INFO AREA */}
                <div className="text-center space-y-4 max-w-lg relative z-30">
                    {device ? (
                        <div className="animate-in slide-in-from-bottom-4 fade-in duration-700">
                            <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-3">{successTitleText}</h3>
                            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold shadow-sm">
                                <Smartphone size={20} className="text-emerald-500" /> 
                                <span>{device.model || "Android Device"}</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-2 font-medium">{successHintText}</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-300">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-gray-200">{waitingTitleText}</h3>
                            <p className="text-slate-500 dark:text-gray-500 mt-3 text-lg font-medium leading-relaxed">
                                {waitingHintLine1Text} <br/>
                                <span className="font-black text-blue-600 dark:text-blue-400">{waitingHintLine2Text}</span>
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="animate-in slide-in-from-bottom-4 fade-in flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 rounded-2xl font-bold shadow-sm z-30">
                        <AlertCircle size={24} shrink-0 /> {error}
                    </div>
                )}
            </div>
        </WizardLayout>
    );
};

export default StepConnect;