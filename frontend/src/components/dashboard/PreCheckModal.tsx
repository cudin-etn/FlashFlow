import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    AlertOctagon, Check, Smartphone, Cable, Unlock, 
    HardDrive, Download, Loader2, Database, ShieldCheck, 
    ArrowRight, ChevronLeft, X
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { toast } from 'sonner';
import { InstallDrivers, GetDiskFreeSpace } from '../../../wailsjs/go/main/App'; 

interface PreCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const PreCheckModal: React.FC<PreCheckModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const { t } = useLanguage();

    // --- STATES ---
    const [currentStep, setCurrentStep] = useState(0);
    const [dataAck, setDataAck] = useState(false);
    const [checked, setChecked] = useState({
        storage: false, driver: false, dev: false, usb: false, oem: false
    });
    const [storageGB, setStorageGB] = useState<number>(0);
    const [isInstalling, setIsInstalling] = useState(false);
    const [loadingStorage, setLoadingStorage] = useState(true);

    // --- LOGIC ---
    useEffect(() => {
        if (isOpen) {
            setCurrentStep(0);
            setDataAck(false);
            checkStorage();
        }
    }, [isOpen]);

    const checkStorage = async () => {
        setLoadingStorage(true);
        try {
            if (typeof GetDiskFreeSpace !== 'function') { setStorageGB(0); return; }
            const gb = await GetDiskFreeSpace();
            if (typeof gb !== 'number' || isNaN(gb)) { setStorageGB(0); return; }
            setStorageGB(parseFloat(gb.toFixed(1)));
            if (gb >= 20) {
                setChecked(prev => ({ ...prev, storage: true }));
            } else {
                setChecked(prev => ({ ...prev, storage: false }));
                // Vẫn giữ toast nhưng lát nữa sẽ hiển thị thêm UI text đỏ
                toast.error((t('pre_storage_err' as any) || "Dung lượng thấp") + `: ${gb.toFixed(1)}GB`);
            }
        } catch (e) {
            setStorageGB(0);
        } finally {
            setLoadingStorage(false);
        }
    };

    const handleInstallDriver = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isInstalling) return;
        setIsInstalling(true);
        toast.info(t('pre_installing' as any) || 'Đang cài đặt...');
        try {
            const res = await InstallDrivers();
            if (res === "Success") {
                toast.success(t('pre_install_done' as any) || 'Cài đặt thành công!');
                setChecked(prev => ({ ...prev, driver: true }));
            } else {
                toast.error((t('error' as any) || 'Lỗi') + ": " + res);
            }
        } catch (err: any) {
            toast.error("Lỗi: " + err);
        } finally {
            setIsInstalling(false);
        }
    };

    const toggle = (key: keyof typeof checked) => {
        if (key === 'storage') {
            if (storageGB < 20) {
                toast.warning(t('pre_storage_req' as any) || "Cần tối thiểu 20GB trống.");
                return;
            }
        }
        if (key === 'driver' && isInstalling) return;
        setChecked(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (!isOpen) return null;

    const isPhoneChecked = checked.dev && checked.usb && checked.oem;
    const isPcChecked = checked.storage && checked.driver;

    // --- UI HELPERS ---
    // Điều chỉnh căn giữa nhưng lệch trái 1 chút xíu bằng -translate-x-6
    const getCardStyle = (index: number) => {
        const offset = index - currentStep;
        if (offset === 0) { // Thẻ Active
            return "z-30 -translate-x-3 translate-y-0 scale-100 opacity-100 shadow-[0_20px_60px_rgba(0,0,0,0.3)]";
        }
        if (offset === 1) { // Thẻ tiếp theo (Lệch phải)
            return "z-20 translate-x-12 translate-y-6 scale-[0.95] opacity-60 shadow-lg cursor-not-allowed";
        }
        if (offset === 2) { // Thẻ tiếp theo nữa (Lệch phải thêm)
            return "z-10 translate-x-24 translate-y-12 scale-[0.90] opacity-30 cursor-not-allowed";
        }
        if (offset < 0) { // Thẻ đã hoàn thành (Lướt sang trái và biến mất)
            return "z-0 -translate-x-32 scale-95 opacity-0 pointer-events-none";
        }
        return "hidden";
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-8 animate-in fade-in duration-500 font-sans">
            {/* BACKDROP: Sạch sẽ tuyệt đối */}
            <div className="absolute inset-0 bg-slate-200/50 dark:bg-[#020617]/80 backdrop-blur-2xl" onClick={onClose} />
            
            {/* Nút Đóng gọn gàng */}
            <button onClick={onClose} className="absolute top-8 right-8 px-6 py-2.5 rounded-full bg-white dark:bg-white/10 text-slate-800 dark:text-white font-bold hover:bg-rose-500 hover:text-white transition-all z-50 shadow-sm border border-slate-200 dark:border-white/10 outline-none flex items-center gap-2 group">
                <X size={18} className="group-hover:rotate-90 transition-transform" /> {t('btn_close' as any) || "Đóng"}
            </button>

            {/* CONTAINER: Giờ đã căn giữa justify-center thay vì justify-start */}
            <div className="relative w-[800px] h-[600px] flex items-center justify-center perspective-1000">
                
                {/* ---------------- THẺ 1: CẢNH BÁO DỮ LIỆU (MÀU ĐỎ) ---------------- */}
                <div className={`absolute w-[600px] h-[550px] bg-white dark:bg-[#13141C] rounded-[40px] border border-slate-200 dark:border-white/10 p-10 flex flex-col transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${getCardStyle(0)}`}>
                    
                    <div className="flex justify-between items-center mb-8">
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{t('pre_step_1' as any) || "Bước 1 / 3"}</span>
                        <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-[16px] flex items-center justify-center"><AlertOctagon size={24} strokeWidth={2}/></div>
                    </div>

                    <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-4">{t('pre_wipe_title' as any) || "Cảnh báo Mất Dữ Liệu"}</h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                        {t('pre_wipe_desc' as any) || "Quá trình cài đặt ROM mới sẽ Format Data (Xóa sạch bộ nhớ trong) của thiết bị. Toàn bộ hình ảnh, video, danh bạ và ứng dụng sẽ bị xóa vĩnh viễn."}
                    </p>

                    <button onClick={() => setDataAck(!dataAck)} className={`mt-auto w-full p-6 rounded-[24px] border-2 transition-all duration-300 text-left outline-none group flex items-center gap-5
                        ${dataAck ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500 shadow-inner' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-rose-300'}`}>
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${dataAck ? 'bg-rose-500 border-rose-500' : 'border-slate-300 dark:border-slate-600'}`}>
                            {dataAck && <Check size={16} className="text-white" strokeWidth={3} />}
                        </div>
                        <div>
                            <h4 className={`font-black text-lg transition-colors ${dataAck ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-white'}`}>{t('pre_wipe_ack' as any) || "Tôi đã sao lưu dữ liệu"}</h4>
                            <p className="text-xs text-slate-500 font-medium mt-1">{t('pre_wipe_ack_desc' as any) || "Đồng ý xóa sạch 100% dữ liệu trên điện thoại."}</p>
                        </div>
                    </button>

                    {/* Nút Tiếp Theo: Đã bỏ in hoa, font-black mềm mại hơn */}
                    <button onClick={() => setCurrentStep(1)} disabled={!dataAck} className={`w-full py-4 rounded-[20px] font-black text-lg transition-all duration-300 mt-6 flex items-center justify-center gap-2 outline-none
                        ${dataAck ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-[0_10px_30px_rgba(244,63,94,0.4)] hover:-translate-y-1' : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'}`}>
                        {t('btn_next' as any) || "Tiếp theo"} <ArrowRight size={20}/>
                    </button>
                </div>

                {/* ---------------- THẺ 2: CẤU HÌNH ĐIỆN THOẠI (MÀU TÍM/XANH) ---------------- */}
                <div className={`absolute w-[600px] h-[550px] bg-white dark:bg-[#13141C] rounded-[40px] border border-slate-200 dark:border-white/10 p-10 flex flex-col transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${getCardStyle(1)}`}>
                    
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setCurrentStep(0)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-indigo-500 hover:text-white flex items-center justify-center transition-colors outline-none"><ChevronLeft size={20}/></button>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{t('pre_step_2' as any) || "Bước 2 / 3"}</span>
                    </div>

                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-2">{t('pre_phone_title' as any) || "Chuẩn bị Điện thoại"}</h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">{t('pre_phone_desc' as any) || "Vui lòng thao tác trên điện thoại và đánh dấu vào các bước đã hoàn thành."}</p>

                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2">
                        <CheckItem id="dev" icon={Smartphone} title={t('pre_item_dev' as any) || "1. Tùy chọn Nhà Phát Triển"} desc={t('pre_sub_dev' as any) || "Vào Cài đặt > Giới thiệu điện thoại > Chạm 7 lần Số bản dựng."} checked={checked.dev} onToggle={() => toggle('dev')} color="indigo"/>
                        <CheckItem id="usb" icon={Cable} title={t('pre_item_usb' as any) || "2. Bật Gỡ lỗi USB"} desc={t('pre_sub_usb' as any) || "Vào Cài đặt > Tùy chọn nhà phát triển > Bật Gỡ lỗi USB."} checked={checked.usb} onToggle={() => toggle('usb')} color="blue"/>
                        <CheckItem id="oem" icon={Unlock} title={t('pre_item_oem' as any) || "3. Bật Mở khóa OEM"} desc={t('pre_sub_oem' as any) || "Vào Cài đặt > Tùy chọn nhà phát triển > Bật Mở khóa OEM."} checked={checked.oem} onToggle={() => toggle('oem')} color="purple"/>
                    </div>

                    <button onClick={() => setCurrentStep(2)} disabled={!isPhoneChecked} className={`w-full py-4 rounded-[20px] font-black text-lg transition-all duration-300 mt-6 flex items-center justify-center gap-2 outline-none
                        ${isPhoneChecked ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-[0_10px_30px_rgba(99,102,241,0.4)] hover:-translate-y-1' : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'}`}>
                        {t('btn_next' as any) || "Tiếp theo"} <ArrowRight size={20}/>
                    </button>
                </div>

                {/* ---------------- THẺ 3: MÔI TRƯỜNG PC & XÁC NHẬN (MÀU XANH LÁ) ---------------- */}
                <div className={`absolute w-[600px] h-[550px] bg-white dark:bg-[#13141C] rounded-[40px] border border-slate-200 dark:border-white/10 p-10 flex flex-col transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${getCardStyle(2)}`}>
                    
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setCurrentStep(1)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-colors outline-none"><ChevronLeft size={20}/></button>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{t('pre_step_3' as any) || "Bước 3 / 3"}</span>
                    </div>

                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-2">{t('pre_pc_title' as any) || "Kiểm tra Máy tính (PC)"}</h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">{t('pre_pc_desc' as any) || "Xác nhận dung lượng và trình điều khiển (Driver) trên máy tính."}</p>

                    <div className="flex-1 flex flex-col gap-4">
                        {/* Storage Box - Đã thêm cảnh báo Đỏ khi thiếu dung lượng */}
                        <div onClick={() => toggle('storage')} className={`p-5 rounded-[24px] border transition-all flex items-center gap-5 cursor-pointer 
                            ${checked.storage ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 shadow-inner' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}>
                            {/* Icon lúc rảnh cũng có màu Emerald */}
                            <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 transition-all
                                ${checked.storage ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500'}`}>
                                {loadingStorage ? <Loader2 size={24} className="animate-spin"/> : <Database size={24}/>}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 dark:text-white mb-1">{t('pre_storage_title' as any) || "Dung lượng ổ cứng"}</h4>
                                <p className={`text-xs ${(!checked.storage && storageGB > 0 && storageGB < 20) ? 'text-rose-500 font-bold' : 'text-slate-500'}`}>
                                    {loadingStorage ? (t('status_scanning' as any) || "Đang quét hệ thống...") : 
                                    (!checked.storage && storageGB > 0 && storageGB < 20) ? `⚠️ ${t('pre_storage_err' as any) || "Không đủ dung lượng"} (${storageGB}GB < 20GB)` : `Trống: ${storageGB}GB (Yêu cầu >20GB)`}
                                </p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${checked.storage ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                {checked.storage && <Check size={14} className="text-white" strokeWidth={3} />}
                            </div>
                        </div>

                        {/* Driver Box - Đã buff Nút Cài đặt và màu Idle Cyan */}
                        <div onClick={() => toggle('driver')} className={`p-5 rounded-[24px] border transition-all flex items-center gap-5 cursor-pointer 
                            ${checked.driver ? 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20 shadow-inner' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}>
                            {/* Icon lúc rảnh cũng có màu Cyan */}
                            <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 transition-all
                                ${checked.driver ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-500'}`}>
                                <HardDrive size={24}/>
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 dark:text-white mb-1">{t('pre_item_driver' as any) || "Driver Fastboot"}</h4>
                                <p className="text-xs text-slate-500">{t('pre_sub_driver' as any) || "Giúp PC nhận diện điện thoại."}</p>
                            </div>
                            {!checked.driver ? (
                                // Nút Cài đặt đầy màu sắc rực rỡ và hiệu ứng Hover
                                <button onClick={handleInstallDriver} disabled={isInstalling} 
                                    className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/30 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 transition-all outline-none">
                                    {isInstalling ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} {t('btn_install' as any) || "Cài đặt"}
                                </button>
                            ) : (
                                <div className="w-6 h-6 rounded-full border-2 bg-cyan-500 border-cyan-500 flex items-center justify-center transition-all">
                                    <Check size={14} className="text-white" strokeWidth={3} />
                                </div>
                            )}
                        </div>
                    </div>

                    <button onClick={onConfirm} disabled={!isPcChecked} className={`w-full py-5 rounded-[24px] font-black text-lg uppercase tracking-widest transition-all duration-300 mt-6 flex items-center justify-center gap-3 outline-none
                        ${isPcChecked ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-[0_15px_40px_rgba(16,185,129,0.4)] hover:-translate-y-1' : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'}`}>
                        <ShieldCheck size={24} className={isPcChecked ? "animate-pulse" : ""} /> {t('pre_btn_confirm' as any) || "XÁC NHẬN FLASH"}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

// Component cho danh sách Check của Bước 2
const CheckItem = ({ id, icon: Icon, title, desc, checked, onToggle, color }: any) => {
    
    // Màu Active
    const activeColorClasses = {
        indigo: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 shadow-inner',
        blue: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 shadow-inner',
        purple: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 shadow-inner',
    }[color as 'indigo' | 'blue' | 'purple'];

    const activeIconColor = {
        indigo: 'bg-indigo-500 text-white shadow-indigo-500/30',
        blue: 'bg-blue-500 text-white shadow-blue-500/30',
        purple: 'bg-purple-500 text-white shadow-purple-500/30',
    }[color as 'indigo' | 'blue' | 'purple'];

    // Màu Idle (Chưa tick) - Vẫn giữ màu của Icon
    const idleIconColor = {
        indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500',
        blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-500',
        purple: 'bg-purple-50 dark:bg-purple-500/10 text-purple-500',
    }[color as 'indigo' | 'blue' | 'purple'];

    return (
        <button onClick={onToggle} className={`w-full text-left p-4 rounded-[20px] border transition-all duration-300 flex items-start gap-4 outline-none group
            ${checked ? activeColorClasses : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}>
            <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 transition-all shadow-sm
                ${checked ? activeIconColor : idleIconColor}`}>
                <Icon size={20} strokeWidth={2}/>
            </div>
            <div className="flex-1 mt-0.5">
                <h4 className={`font-bold text-sm mb-1 transition-colors ${checked ? '' : 'text-slate-800 dark:text-white'}`}>{title}</h4>
                <p className="text-[11px] font-medium text-slate-500 opacity-80 leading-relaxed pr-2">{desc}</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-2 transition-all
                ${checked ? 'border-current bg-current' : 'border-slate-300 dark:border-slate-600'}`}>
                {checked && <Check size={14} className="text-white" strokeWidth={3} />}
            </div>
        </button>
    );
};