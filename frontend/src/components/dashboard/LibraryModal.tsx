import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    HardDrive, FolderOpen, Trash2, 
    Database, Archive, Clock, 
    Settings, Edit3, MapPin, Rocket, LogOut, ChevronRight,
    Smartphone, Save, X, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';

// --- STYLES NGHỆ THUẬT QUỸ ĐẠO ---
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes orbit-lib {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes orbit-lib-reverse {
    from { transform: translate(-50%, -50%) rotate(360deg); }
    to { transform: translate(-50%, -50%) rotate(0deg); }
  }
  .lib-ring-1 {
    position: absolute; top: 50%; left: 50%; width: 160px; height: 160px;
    border: 1px solid rgba(150, 150, 150, 0.2); border-radius: 50%;
    animation: orbit-lib 15s linear infinite; pointer-events: none;
  }
  .lib-ring-2 {
    position: absolute; top: 50%; left: 50%; width: 240px; height: 240px;
    border: 1px dashed rgba(150, 150, 150, 0.15); border-radius: 50%;
    animation: orbit-lib-reverse 25s linear infinite; pointer-events: none;
  }
  .lib-orbit-dot {
    position: absolute; top: 0; left: 50%; width: 6px; height: 6px;
    background: currentColor; border-radius: 50%;
    box-shadow: 0 0 10px 2px currentColor;
    transform: translate(-50%, -50%);
  }
  .lib-float { animation: float-gentle 6s ease-in-out infinite; }
`;
document.head.appendChild(styleTag);

interface LibraryItem {
    id: string;
    name: string;
    path: string;
    size: string;
    date: string;
    type: string;
    deviceTag: string;
}

interface LibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectRom: (path: string) => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, onSelectRom }) => {
    const { t } = useLanguage();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    const [editState, setEditState] = useState<{
        isOpen: boolean, 
        path: string, 
        currentName: string,
        oldName: string, 
        currentTag: string 
    } | null>(null);

    const [deletePath, setDeletePath] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadLibrary();
            setSelectedPath(null);
            setEditState(null);
            setDeletePath(null);
        }
    }, [isOpen]);

    const loadLibrary = async () => {
        setLoading(true);
        try {
            const list = await (window as any).go.main.App.GetLibraryList();
            setItems(list || []);
        } catch (e) {
            toast.error(t('error') + ": " + e);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    // Bộ cấu hình Màu sắc & Icon chuẩn PromptPal
    const getBrandConfig = (tag: string) => {
        switch(tag) {
            case 'OnePlus': return { bgGlow: 'from-red-500 to-rose-600', text: 'text-red-500', shadow: 'shadow-red-500/30', glow: 'rgba(239,68,68,0.2)', label: '1+' };
            case 'Pixel': return { bgGlow: 'from-cyan-500 to-blue-600', text: 'text-blue-500', shadow: 'shadow-blue-500/30', glow: 'rgba(59,130,246,0.2)', label: 'G' };
            case 'Xiaomi': return { bgGlow: 'from-orange-400 to-amber-600', text: 'text-orange-500', shadow: 'shadow-orange-500/30', glow: 'rgba(249,115,22,0.2)', label: 'Mi' };
            default: return { bgGlow: 'from-purple-500 to-fuchsia-600', text: 'text-purple-500', shadow: 'shadow-purple-500/30', glow: 'rgba(168,85,247,0.2)', label: 'A' };
        }
    };

    const handleOpenFolder = (path: string) => (window as any).go.main.App.OpenLibraryFolder(path);

    const handleChangeLibraryPath = async () => {
        try {
            const result = await (window as any).go.main.App.ChangeLibraryPath(); 
            if (result === "OK") {
                toast.success(t('success'));
                loadLibrary();
            }
        } catch (e) { toast.error(t('error') + ": " + e); }
    };

    const openEditModal = (item: LibraryItem) => {
        setEditState({
            isOpen: true,
            path: item.path,
            currentName: item.name,
            oldName: item.name,
            currentTag: item.deviceTag
        });
    };

    const saveChanges = async () => {
        if (!editState || !editState.currentName.trim()) return;

        try {
            if (editState.currentName !== editState.oldName) {
                 await (window as any).go.main.App.RenameLibraryItem(editState.path, editState.currentName);
            }
            
            let targetPath = editState.path;
            if (editState.currentName !== editState.oldName) {
                const parent = editState.path.substring(0, editState.path.lastIndexOf(window.navigator.userAgent.includes("Windows") ? "\\" : "/"));
                targetPath = parent + (window.navigator.userAgent.includes("Windows") ? "\\" : "/") + editState.currentName;
            }

            await (window as any).go.main.App.SetRomTag(targetPath, editState.currentTag);
            toast.success(t('success'));
            setEditState(null); 
            loadLibrary();      
        } catch (e) {
            toast.error(t('error') + ": " + e);
        }
    };

    const handleDeleteClick = (path: string) => setDeletePath(path);

    const confirmDelete = async () => {
        if (!deletePath) return;
        try {
            await (window as any).go.main.App.DeleteLibraryItem(deletePath);
            toast.success(t('lib_confirm_delete'));
            if (selectedPath === deletePath) setSelectedPath(null);
            setDeletePath(null);
            loadLibrary(); 
        } catch (error) { 
            toast.error(t('error') + ": " + error); 
        }
    };

    const handleFlash = () => { 
        if (selectedPath) onSelectRom(selectedPath); 
    };

    const selectedItem = items.find(i => i.path === selectedPath);
    const activeBrand = selectedItem ? getBrandConfig(selectedItem.deviceTag) : getBrandConfig('Default');

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300 font-sans">
            
            {/* Nền Kính Mờ Tối Đa */}
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl cursor-default" onClick={onClose} />

            {/* ================= MODAL XÓA ROM ================= */}
            {deletePath && (
                <div className="absolute inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#13141C] w-full max-w-sm rounded-[32px] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 flex flex-col text-center p-8 relative">
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-500 shadow-inner border border-red-100 dark:border-red-500/20">
                            <Trash2 size={32} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t('lib_delete_title')}</h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            {t('lib_delete_desc')} <b className="text-red-500">{t('lib_delete_warn')}</b>.
                        </p>
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <button onClick={() => setDeletePath(null)} className="py-3.5 rounded-[16px] font-bold text-sm bg-slate-100 dark:bg-[#1C1E26] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 transition-colors outline-none">
                                {t('btn_later')}
                            </button>
                            <button onClick={confirmDelete} className="py-3.5 rounded-[16px] bg-red-500 hover:bg-red-600 text-white font-bold text-sm shadow-[0_10px_20px_rgba(239,68,68,0.3)] transition-all flex items-center justify-center gap-2 outline-none">
                                <Trash2 size={16}/> {t('lib_btn_delete_confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MODAL CHỈNH SỬA ROM ================= */}
            {editState && editState.isOpen && (
                <div className="absolute inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#13141C] w-full max-w-md rounded-[32px] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 flex flex-col">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-[#1C1E26]/50">
                            <h3 className="text-xl font-black flex items-center gap-3 text-slate-800 dark:text-white tracking-tight">
                                <div className="p-2 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 rounded-[12px]"><Settings size={20} /></div>
                                {t('lib_edit_title')}
                            </h3>
                            <button onClick={() => setEditState(null)} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors text-slate-500 outline-none">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('lib_label_name')}</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={editState.currentName}
                                        onChange={(e) => setEditState({...editState, currentName: e.target.value})}
                                        className="w-full pl-12 pr-4 py-3.5 rounded-[16px] bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 outline-none focus:border-amber-500 font-bold transition-all text-slate-900 dark:text-white text-sm"
                                    />
                                    <Edit3 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('lib_label_tag')}</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['OnePlus', 'Pixel', 'Xiaomi'].map((tag) => (
                                        <button
                                            key={tag}
                                            onClick={() => setEditState({...editState, currentTag: tag})}
                                            className={`py-3.5 rounded-[16px] text-sm font-bold border transition-all flex flex-col items-center justify-center gap-1.5 outline-none
                                                ${editState.currentTag === tag 
                                                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-500 shadow-sm' 
                                                    : 'bg-slate-50 dark:bg-[#1C1E26] border-slate-100 dark:border-white/5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10'}`}
                                        >
                                            <Smartphone size={18} />
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button onClick={() => handleOpenFolder(editState.path)} className="w-full py-4 rounded-[16px] border border-dashed border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#1C1E26] text-slate-500 dark:text-slate-400 font-bold text-sm hover:border-blue-500 hover:text-blue-500 transition-all flex items-center justify-center gap-2 group outline-none">
                                <FolderOpen size={18} className="group-hover:scale-110 transition-transform" /> {t('lib_btn_open_folder')}
                            </button>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-white/5 flex gap-4 bg-slate-50 dark:bg-[#0F1016]">
                            <button onClick={() => setEditState(null)} className="flex-1 py-4 rounded-[16px] font-bold text-sm bg-slate-200 dark:bg-[#1C1E26] text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/10 transition-colors outline-none">{t('close')}</button>
                            <button onClick={saveChanges} className="flex-1 py-4 rounded-[16px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-[0_10px_20px_rgba(245,158,11,0.3)] transition-all flex items-center justify-center gap-2 active:scale-95 outline-none">
                                <Save size={18} /> {t('lib_btn_save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= KHUNG BENTO MASTER-DETAIL LỚN ================= */}
            <div className="relative w-full max-w-5xl bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 rounded-[32px] shadow-2xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col md:flex-row h-[600px]">
                
                {/* ---------- CỘT TRÁI (SIDEBAR MENU) - 4/12 ---------- */}
                <div className="w-full md:w-[320px] bg-slate-50 dark:bg-[#1A1C26] border-r border-slate-200 dark:border-white/5 flex flex-col z-10 shrink-0">
                    <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <Archive size={20} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">{t('lib_title')}</h3>
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">{items.length} {t('lib_rom_count')}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
                        {loading ? (
                            <div className="text-center py-10 text-slate-400 text-xs font-medium">{t('loading')}</div> 
                        ) : items.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 text-xs font-medium px-4">{t('lib_empty')}</div> 
                        ) : (
                            items.map((item) => {
                                const isSelected = selectedPath === item.path;
                                const brandConfig = getBrandConfig(item.deviceTag);
                                return (
                                    <button key={item.id} onClick={() => setSelectedPath(item.path)} className={`w-full text-left group relative p-3.5 rounded-[18px] transition-all duration-300 outline-none flex items-center gap-3 border ${isSelected ? `bg-white dark:bg-[#282A36] border-slate-200 dark:border-white/10 shadow-sm` : 'bg-transparent border-transparent hover:bg-slate-200/50 dark:hover:bg-white/5'}`}>
                                        {/* Cột màu highlight bên trái khi Active */}
                                        {isSelected && <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b ${brandConfig.bgGlow}`}></div>}

                                        <div className={`w-10 h-10 rounded-[14px] flex items-center justify-center text-sm font-black shrink-0 transition-colors duration-300 ${isSelected ? `bg-gradient-to-br ${brandConfig.bgGlow} text-white shadow-md` : 'bg-slate-200 dark:bg-black/30 text-slate-500'}`}>
                                            {brandConfig.label}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-[13px] font-black truncate transition-colors duration-300 ${isSelected ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{item.name}</h4>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.size}</span>
                                                {isSelected && <ChevronRight size={14} className={brandConfig.text}/>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-slate-200 dark:border-white/5 shrink-0 flex gap-2">
                        <button onClick={handleChangeLibraryPath} className="flex-1 flex items-center justify-center py-3 rounded-xl bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/10 transition-colors outline-none">
                            <Settings size={18} />
                        </button>
                        <button onClick={onClose} className="flex-1 flex items-center justify-center py-3 rounded-xl bg-slate-200 dark:bg-white/5 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 transition-colors text-slate-600 dark:text-slate-300 outline-none">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>

                {/* ---------- CỘT PHẢI (HERO CONTENT) - 8/12 ---------- */}
                <div className="flex-1 relative flex flex-col bg-white dark:bg-[#13141C] overflow-hidden">
                    
                    <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors z-50 outline-none">
                        <X size={20} />
                    </button>

                    {selectedItem ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 animate-in zoom-in-95 duration-300">
                            
                            {/* Orb Glow Nền Siêu Đẹp (Lấy màu theo hãng) */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[100px] pointer-events-none transition-colors duration-700 opacity-15 dark:opacity-20" style={{ background: activeBrand.glow }}></div>

                            {/* Quả Cầu Icon Hero */}
                            <div className={`relative flex items-center justify-center w-48 h-48 mb-8 lib-float ${activeBrand.text}`}>
                                <div className="lib-ring-1"><div className="lib-orbit-dot"></div></div>
                                <div className="lib-ring-2"><div className="lib-orbit-dot"></div><div className="lib-orbit-dot" style={{ top: '100%' }}></div></div>
                                
                                <div className={`relative w-24 h-24 rounded-[24px] bg-gradient-to-br ${activeBrand.bgGlow} flex items-center justify-center text-white text-4xl font-black shadow-2xl z-10 ${activeBrand.shadow}`}>
                                    {activeBrand.label}
                                </div>
                            </div>

                            {/* Tên ROM & Badge */}
                            <div className="text-center relative z-10 mb-8 max-w-lg">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 mb-4 shadow-sm`}>
                                    <ShieldCheck size={14} className={activeBrand.text} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{selectedItem.deviceTag} Firmware</span>
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight break-words">{selectedItem.name}</h2>
                            </div>
                            
                            {/* Bento Grid Stats */}
                            <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8 relative z-10">
                                <div className="bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm">
                                    <Database size={20} className="text-slate-400 mb-2"/>
                                    <span className="text-[13px] font-black text-slate-800 dark:text-white">{selectedItem.size}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm">
                                    <Clock size={20} className="text-slate-400 mb-2"/>
                                    <span className="text-[13px] font-black text-slate-800 dark:text-white">{selectedItem.date}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm">
                                    <HardDrive size={20} className="text-slate-400 mb-2"/>
                                    <span className="text-[13px] font-black text-slate-800 dark:text-white">{selectedItem.type}</span>
                                </div>
                            </div>
                            
                            {/* Action Buttons (Solid Color for Flash) */}
                            <div className="flex w-full max-w-md gap-3 relative z-10">
                                <button onClick={handleFlash} className={`flex-1 py-4 rounded-[16px] bg-gradient-to-br ${activeBrand.bgGlow} text-white font-black text-sm shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 outline-none ${activeBrand.shadow}`}>
                                    <Rocket size={18} /> {t('lib_btn_flash')}
                                </button>
                                
                                <button onClick={() => openEditModal(selectedItem)} className="px-5 py-4 rounded-[16px] bg-slate-100 dark:bg-[#1C1E26] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 font-bold text-sm transition-all flex items-center justify-center outline-none">
                                    <Settings size={20} />
                                </button>
                                
                                <button onClick={() => handleDeleteClick(selectedItem.path)} className="px-5 py-4 rounded-[16px] bg-slate-100 dark:bg-[#1C1E26] text-slate-500 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 transition-all flex items-center justify-center outline-none">
                                    <Trash2 size={20} />
                                </button>
                            </div>

                        </div>
                    ) : (
                        /* Empty State Cột Phải */
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60 animate-in fade-in duration-500">
                            <div className="w-32 h-32 rounded-[28px] bg-slate-100 dark:bg-[#1C1E26] border border-slate-200 dark:border-white/5 flex items-center justify-center mb-6 shadow-sm">
                                <Archive size={48} strokeWidth={1.5} />
                            </div>
                            <p className="text-xl font-black text-slate-500 dark:text-slate-400 mb-2">{t('lib_selected_rom')}</p>
                            <p className="text-xs font-bold uppercase tracking-widest">{t('lib_hint_select')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
