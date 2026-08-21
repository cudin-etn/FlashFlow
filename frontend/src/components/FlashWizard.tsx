import React, { useState } from 'react';
import StepConnect from './wizard/StepConnect';
import StepBootloader from './wizard/StepBootloader';
import StepRomSelect from './wizard/StepRomSelect';
import StepFlash from './wizard/StepFlash';
import StepPreFlashSummary from './wizard/StepPreFlashSummary';
import StepDone from './wizard/StepDone';
import { Smartphone, Unlock, Download, Zap, CheckCircle2, FileCog, ChevronRight, Activity, ShieldCheck } from 'lucide-react';

interface FlashWizardProps {
    mode: "ai" | "manual";
    filePath?: string;
    onExit: () => void;
}

enum WizardStep {
    Connect = 1,
    Bootloader = 2,
    RomSelect = 3,
    Summary = 4,
    Flash = 5,
    Finish = 6,
}

const FlashWizard: React.FC<FlashWizardProps> = ({ mode, filePath, onExit }) => {
    const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.Connect);
    const [device, setDevice] = useState<any>(null);
    const [selectedRom, setSelectedRom] = useState<any>(null);
    const [flashSuccess, setFlashSuccess] = useState(false);

    // --- HANDLERS ---
    const handleDeviceConnected = (deviceInfo: any) => { 
        setDevice(deviceInfo); 
        setCurrentStep(WizardStep.Bootloader); 
    };

    // [LOGIC NHẢY CÓC AN TOÀN]
    const handleBootloaderChecked = () => { 
        // Nếu có filePath (từ Library) -> Tạo data ảo và nhảy thẳng vào Flash
        if (mode === 'ai' && filePath && filePath.length > 0) {
            console.log(">>> Fast Track: Using preselected ROM/package path:", filePath);
            setSelectedRom({ romPath: filePath, type: 'library_auto' });
            setCurrentStep(WizardStep.Flash); 
        } else {
            // Nếu không có file (Home -> Auto Flash) -> Vào bước chọn ROM
            console.log(">>> Normal Track: Going to package selection");
            setCurrentStep(WizardStep.RomSelect); 
        }
    };

    const handleRomSelected = (romData: any) => {
        setSelectedRom(romData);
        setCurrentStep(WizardStep.Summary);
    };

    const handleSummaryConfirmed = () => {
        setCurrentStep(WizardStep.Flash);
    };
    
    const handleFlashFinish = (success: boolean) => { 
        setFlashSuccess(success); 
        setCurrentStep(WizardStep.Finish); 
    };

    const handleBack = () => {
        // Logic back thông minh: Nếu đi tắt thì back về Bootloader luôn
        if (currentStep === WizardStep.Flash && mode === 'ai' && filePath) {
             setCurrentStep(WizardStep.Bootloader);
             return;
        }
        if (currentStep > WizardStep.Connect && currentStep < WizardStep.Finish) {
            setCurrentStep(currentStep - 1);
        } else {
            onExit();
        }
    };

    // --- SIDEBAR ITEM (Giữ nguyên giao diện đẹp của anh) ---
    const SidebarItem = ({ step, title, subtitle, icon: Icon, isLast }: any) => {
        const isActive = currentStep === step;
        const isCompleted = currentStep > step;
        
        // Hack: Nếu đi tắt qua bước RomSelect, hiển thị nó là đã xong
        const isSkippedButDone = (step === WizardStep.RomSelect) && (mode === 'ai' && !!filePath) && currentStep > WizardStep.RomSelect;

        return (
            <div className="relative flex flex-col z-10 group mb-1">
                {!isLast && (
                    <div className="absolute left-[1.65rem] top-10 bottom-[-1.5rem] w-[2px] bg-slate-200 dark:bg-[#222] -z-10">
                        <div className={`w-full bg-emerald-500 transition-all duration-700 ease-in-out ${isCompleted ? 'h-full' : 'h-0'}`}/>
                    </div>
                )}
                <div className={`relative flex items-center p-3 rounded-2xl cursor-default transition-all duration-300 border ${isActive ? 'bg-blue-600 border-blue-500 shadow-xl shadow-blue-500/20 translate-x-1' : 'bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                    <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center mr-4 shrink-0 transition-all duration-500 ${isCompleted || isSkippedButDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : isActive ? 'bg-white text-blue-600 shadow-inner' : 'bg-slate-200 dark:bg-[#1a1a1a] text-slate-400 dark:text-[#444]'}`}>
                        {isCompleted || isSkippedButDone ? <CheckCircle2 size={18} strokeWidth={3} className="animate-in zoom-in duration-300" /> : <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />}
                        {isActive && <span className="absolute -inset-1 rounded-xl bg-white/20 animate-pulse"></span>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center h-10">
                        <h3 className={`text-sm font-bold truncate transition-colors duration-300 leading-none mb-1.5 ${isActive ? 'text-white' : (isCompleted || isSkippedButDone) ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-500'}`}>{title}</h3>
                        <p className={`text-[11px] font-medium truncate transition-colors duration-300 leading-none ${isActive ? 'text-blue-100' : 'text-slate-400 dark:text-gray-600'}`}>{isSkippedButDone ? "Đã chọn từ thư viện" : subtitle}</p>
                    </div>
                    <div className={`transition-all duration-300 transform ${isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}><ChevronRight size={16} className="text-white/80" /></div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex w-full h-full bg-[#f8fafc] dark:bg-[#000000] text-slate-900 dark:text-white overflow-hidden font-sans select-none">
            {/* SIDEBAR */}
            <div className="w-80 bg-white dark:bg-[#0a0a0a] border-r border-slate-200 dark:border-[#1a1a1a] flex flex-col z-20 relative transition-colors duration-300">
                <div className="px-6 py-8 pb-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30"><Activity size={18} className="text-white" /></div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">FlashFlow</h1>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${mode === 'ai' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'}`}>{mode === 'ai' ? "AUTO FLOW" : "MANUAL FLOW"}</span>
                        <span className="text-[10px] font-semibold text-slate-400">v2.1.2</span>
                    </div>
                </div>
                <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto custom-scrollbar">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-[#444] uppercase tracking-widest px-3 mb-3">Tiến trình cài đặt</div>
                    <SidebarItem step={WizardStep.Connect} title="Kết nối" subtitle="Kiểm tra thiết bị" icon={Smartphone} />
                    <SidebarItem step={WizardStep.Bootloader} title="Bootloader" subtitle="Trạng thái khóa" icon={Unlock} />
                    <SidebarItem step={WizardStep.RomSelect} title={mode === 'ai' ? "Chọn gói ROM" : "Chọn gói ROM"} subtitle={mode === 'ai' ? "ROM Zip / Full OTA" : "ROM Zip / Full OTA"} icon={mode === 'ai' ? Download : FileCog} />
                    <SidebarItem step={WizardStep.Summary} title="Xác nhận" subtitle="Kiểm tra trước flash" icon={ShieldCheck} />
                    <SidebarItem step={WizardStep.Flash} title="Tiến hành" subtitle="Flash ROM và hoàn tất" icon={Zap} isLast={true} />
                </div>
                <div className="p-6 border-t border-slate-100 dark:border-[#1a1a1a]">
                    <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Flash engine ready</span>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative overflow-hidden bg-[#f1f5f9] dark:bg-[#050505] flex flex-col">
                <div className="absolute inset-0 opacity-[0.4] dark:opacity-[0.2]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                <div className="flex-1 relative z-10 w-full h-full">
                    {currentStep === WizardStep.Connect && <StepConnect onNext={handleDeviceConnected} onExit={onExit} />}
                    {currentStep === WizardStep.Bootloader && <StepBootloader onNext={handleBootloaderChecked} onBack={handleBack} onExit={onExit} />}
                    {currentStep === WizardStep.RomSelect && <StepRomSelect mode={mode} filePath={filePath} device={device} onNext={handleRomSelected} onBack={handleBack} onExit={onExit} />}
                    {currentStep === WizardStep.Summary && <StepPreFlashSummary device={device} selectedRom={selectedRom} onNext={handleSummaryConfirmed} onBack={handleBack} onExit={onExit} />}
                    {currentStep === WizardStep.Flash && <StepFlash device={device} selectedRom={selectedRom} onNext={handleFlashFinish} onBack={handleBack} onExit={onExit} />}
                    {currentStep === WizardStep.Finish && <StepDone success={flashSuccess} onExit={onExit} />}
                </div>
            </div>
        </div>
    );
};

export default FlashWizard;
