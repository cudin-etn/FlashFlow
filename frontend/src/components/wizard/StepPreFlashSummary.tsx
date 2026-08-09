import React from 'react';
import WizardLayout from './WizardLayout';
import { Activity, AlertTriangle, CheckCircle2, Database, FolderSearch, HardDrive, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface StepPreFlashSummaryProps {
    device: any;
    selectedRom: any;
    onNext: () => void;
    onBack: () => void;
    onExit?: () => void;
}

const sourceLabel = (sourceType?: string) => {
    switch (sourceType) {
        case 'folder_images': return 'Folder images';
        case 'folder_payload': return 'Folder payload.bin';
        case 'zip_payload': return 'Full OTA ZIP payload.bin';
        case 'zip_images': return 'ZIP images';
        default: return 'ROM source';
    }
};

const StepPreFlashSummary: React.FC<StepPreFlashSummaryProps> = ({ device, selectedRom, onNext, onBack, onExit }) => {
    const { t } = useLanguage();
    const analysis = selectedRom?.analysis;
    const path = selectedRom?.path || selectedRom?.romPath || '';

    const cards = [
        { icon: Smartphone, label: t('summary_device') || 'Thiết bị', value: `${device?.vendor || 'OnePlus'} ${device?.model || ''}`.trim() || 'Unknown', hint: device?.state || 'fastboot' },
        { icon: FolderSearch, label: t('summary_source') || 'ROM source', value: analysis?.name || path.split(/[\\/]/).pop() || 'Selected ROM', hint: sourceLabel(analysis?.sourceType) },
        { icon: Database, label: t('summary_prepare') || 'Chuẩn bị', value: (analysis?.prepareMode || 'standard_prepare').replaceAll('_', ' '), hint: analysis?.message || 'Ready' },
        { icon: HardDrive, label: t('summary_wipe') || 'Wipe data', value: t('summary_wipe_later') || 'Sau flash có nút wipe riêng', hint: t('summary_wipe_hint') || 'Có fallback -w → erase → format' },
    ];

    return (
        <WizardLayout
            title={t('summary_title') || 'Xác nhận trước khi Flash'}
            subtitle={t('summary_subtitle') || 'Kiểm tra nguồn ROM và thiết bị trước khi bắt đầu.'}
            onBack={onBack}
            onNext={onNext}
            canNext={true}
            onExit={onExit}
            nextLabel={t('summary_start_flash') || 'BẮT ĐẦU FLASH'}
        >
            <div className="mt-6 max-w-5xl mx-auto space-y-6">
                <div className="relative overflow-hidden rounded-[2rem] border border-emerald-200/70 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 dark:from-emerald-950/20 dark:via-cyan-950/10 dark:to-blue-950/20 p-7 shadow-2xl shadow-emerald-500/10">
                    <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
                    <div className="relative flex items-start gap-4">
                        <div className="rounded-2xl bg-emerald-500 p-3 text-white shadow-lg shadow-emerald-500/30">
                            <ShieldCheck size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">{t('summary_ready_title') || 'Nguồn ROM đã sẵn sàng'}</h3>
                            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600 dark:text-slate-300">
                                {t('summary_ready_desc') || 'FlashFlow đã phân tích source. Bước tiếp theo mới bắt đầu extract/dump/flash thật, navigation sẽ bị khóa cho tới khi hoàn tất hoặc lỗi chính thức.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.label} className="rounded-[1.5rem] border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-5 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
                                <div className="flex items-start gap-4">
                                    <div className="rounded-2xl bg-blue-100 dark:bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300">
                                        <Icon size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</div>
                                        <div className="mt-1 break-words text-sm font-black text-slate-800 dark:text-white">{card.value}</div>
                                        <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{card.hint}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="rounded-[1.5rem] border border-amber-200/70 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/10 p-5">
                    <div className="flex gap-3 text-amber-800 dark:text-amber-200">
                        <AlertTriangle size={20} className="shrink-0" />
                        <div className="text-sm font-bold">
                            {t('summary_warning') || 'Không rút cáp, không đổi mode, không bấm phím cứng khi quá trình bắt đầu. Nếu có ARB risk, FlashFlow sẽ hỏi lại bằng popup riêng.'}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 size={16} /> {t('summary_guard') || 'OnePlus order/mode giữ nguyên'} <Activity size={16} /> <Zap size={16} />
                </div>
            </div>
        </WizardLayout>
    );
};

export default StepPreFlashSummary;
