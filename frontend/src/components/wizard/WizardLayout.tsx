import React from 'react';
import WizardActionBar from './WizardActionBar';

interface WizardLayoutProps {
    title: React.ReactNode;
    subtitle?: string;
    children: React.ReactNode;
    onBack?: () => void;
    onNext?: () => void;
    onExit?: () => void;
    nextLabel?: string;
    backLabel?: string;
    canNext?: boolean;
    canBack?: boolean;
    loading?: boolean;
    hideNavigation?: boolean; 
}

const WizardLayout: React.FC<WizardLayoutProps> = ({
    title, subtitle, children,
    onBack, onNext, onExit, nextLabel, backLabel, canNext, canBack, loading,
    hideNavigation = false 
}) => {
    return (
        <div className="w-full h-full min-h-0 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500 font-sans overflow-hidden
            bg-white/90 dark:bg-[#020617]/95 
            bg-[radial-gradient(at_0%_0%,_rgba(168,85,247,0.15)_0px,_transparent_60%),radial-gradient(at_100%_100%,_rgba(14,165,233,0.15)_0px,_transparent_60%)]
            dark:bg-[radial-gradient(at_0%_0%,_rgba(88,28,135,0.4)_0px,_transparent_70%),radial-gradient(at_100%_100%,_rgba(8,145,178,0.3)_0px,_transparent_70%)]
        ">
            {/* HEADER AREA */}
            <div className="px-10 pt-8 pb-4 shrink-0 z-10">
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                    {title}
                </h2>
                {subtitle && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm font-medium max-w-3xl leading-relaxed">
                        {subtitle}
                    </p>
                )}
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 min-h-0 overflow-y-auto px-10 py-2 custom-scrollbar scroll-smooth">
                <div className="flex flex-col flex-1 min-h-0 h-full max-w-5xl mx-auto w-full">
                    {children}
                </div>
            </div>

            {/* ACTION BAR */}
            {!hideNavigation && (
                <div className="shrink-0 border-t border-slate-100 dark:border-white/5 bg-white/60 dark:bg-[#121212]/60 backdrop-blur-xl">
                    <WizardActionBar 
                        onBack={onBack}
                        onNext={onNext}
                        onExit={onExit}
                        nextLabel={nextLabel}
                        backLabel={backLabel}
                        canNext={canNext}
                        canBack={canBack}
                        loading={loading}
                    />
                </div>
            )}
        </div>
    );
};

export default WizardLayout;