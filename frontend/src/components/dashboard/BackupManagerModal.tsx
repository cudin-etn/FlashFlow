import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Archive, CheckCircle2, Clock, Download, HardDrive, Image, Loader2,
    MessageSquareText, RefreshCw, RotateCcw, Search, ShieldCheck,
    Smartphone, Trash2, UserRound, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';

interface BackupComponentMeta {
    name: string;
    type: string;
    source: string;
    size: number;
    status: string;
}

interface BackupItem {
    id: string;
    deviceName: string;
    createdAt: string;
    size: number;
    sizeStr: string;
    status: string;
    filename: string;
    components?: BackupComponentMeta[];
}

interface AppPackage {
    id: string;
    type: string;
}

interface BackupManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Panel = 'backup' | 'restore';

const DEFAULT_MEDIA_FOLDERS = ['DCIM', 'Pictures', 'Download'];

const componentLabel = (component: BackupComponentMeta): string => {
    if (component.type === 'contacts') return 'Danh bạ';
    if (component.type === 'sms') return 'Tin nhắn SMS';
    if (component.type === 'media') return component.source?.replace('/sdcard/', '').replace(/\/$/, '') || 'Ảnh / tệp';
    if (component.type === 'app_apk') return `${component.source || 'Ứng dụng'} (app)`;
    if (component.type === 'app_data') return `${component.source?.replace('/data/data/', '').replace(/\/$/, '') || 'Ứng dụng'} (data)`;
    return component.name;
};

export const BackupManagerModal: React.FC<BackupManagerModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [panel, setPanel] = useState<Panel>('backup');
    const [backups, setBackups] = useState<BackupItem[]>([]);
    const [apps, setApps] = useState<AppPackage[]>([]);
    const [loading, setLoading] = useState(false);
    const [backupRunning, setBackupRunning] = useState(false);
    const [restoreRunning, setRestoreRunning] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('');
    const [hasRoot, setHasRoot] = useState<boolean | null>(null);
    const [rootChecking, setRootChecking] = useState(false);
    const [totalUsage, setTotalUsage] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null);

    const [includeContacts, setIncludeContacts] = useState(true);
    const [includeSms, setIncludeSms] = useState(true);
    const [selectedApps, setSelectedApps] = useState<string[]>([]);
    const [mediaFolders, setMediaFolders] = useState<string[]>(DEFAULT_MEDIA_FOLDERS);
    const [appSearch, setAppSearch] = useState('');
    const [restoreSelection, setRestoreSelection] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (!isOpen) return;
        loadBackups();
        checkRoot();
    }, [isOpen]);

    useEffect(() => {
        if (hasRoot) loadApps();
        else setApps([]);
    }, [hasRoot]);

    useEffect(() => {
        const EventsOn = (window as any).runtime?.EventsOn;
        if (!EventsOn) return;
        const offBackup = EventsOn('backup_status', (data: any) => {
            if (data?.message) setStatusText(data.message);
        });
        const offRestore = EventsOn('restore_status', (data: any) => {
            if (data?.message) setStatusText(data.message);
        });
        const offBackupDone = EventsOn('backup_complete', () => {
            setBackupRunning(false);
            setStatusText('');
            loadBackups();
            setPanel('restore');
        });
        const offRestoreDone = EventsOn('restore_complete', () => {
            setRestoreRunning(null);
            setStatusText('');
        });
        return () => {
            if (offBackup) offBackup();
            if (offRestore) offRestore();
            if (offBackupDone) offBackupDone();
            if (offRestoreDone) offRestoreDone();
        };
    }, []);

    const filteredApps = useMemo(() => {
        const query = appSearch.trim().toLowerCase();
        return apps
            .filter(app => app.type === 'user')
            .filter(app => !query || app.id.toLowerCase().includes(query))
            .slice(0, 80);
    }, [apps, appSearch]);

    const selectedBackupCount = Number(includeContacts) + Number(includeSms) + selectedApps.length + mediaFolders.length;

    const checkRoot = async () => {
        setRootChecking(true);
        setStatusText('Hãy bấm Allow trên điện thoại nếu có popup root...');
        try {
            const report = await (window as any).go.main.App.DetectRootCapabilities?.();
            if (report) setHasRoot(!!report.hasRoot);
            else setHasRoot(await (window as any).go.main.App.CheckRootAccess());
        } catch {
            setHasRoot(false);
        } finally {
            setRootChecking(false);
            setStatusText('');
        }
    };

    const loadApps = async () => {
        try {
            const list = await (window as any).go.main.App.GetInstalledApps();
            setApps(list || []);
        } catch {
            setApps([]);
        }
    };

    const loadBackups = async () => {
        setLoading(true);
        try {
            const list = await (window as any).go.main.App.ListBackups();
            setBackups(list || []);
            setTotalUsage(await (window as any).go.main.App.GetBackupsDiskUsage() || 0);
        } catch (e) {
            toast.error(`${t('error')}: ${e}`);
            setBackups([]);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoDate: string): string => {
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime())) return isoDate;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const formatSize = (bytes: number): string => {
        if (!bytes) return '0 MB';
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const toggleApp = (pkg: string) => {
        setSelectedApps(prev => prev.includes(pkg) ? prev.filter(x => x !== pkg) : [...prev, pkg]);
    };

    const toggleMediaFolder = (folder: string) => {
        setMediaFolders(prev => prev.includes(folder) ? prev.filter(x => x !== folder) : [...prev, folder]);
    };

    const selectedComponentsFor = (item: BackupItem) => {
        const current = restoreSelection[item.filename];
        if (current) return current;
        return (item.components || []).filter(c => c.status === 'success').map(c => c.name);
    };

    const toggleRestoreComponent = (item: BackupItem, name: string) => {
        const current = selectedComponentsFor(item);
        const next = current.includes(name) ? current.filter(x => x !== name) : [...current, name];
        setRestoreSelection(prev => ({ ...prev, [item.filename]: next }));
    };

    const handleNewBackup = async () => {
        if (selectedBackupCount === 0) {
            toast.error('Chọn ít nhất một mục để backup');
            return;
        }
        if (!hasRoot) {
            toast.error('Cần cấp quyền root trước khi backup');
            return;
        }
        setBackupRunning(true);
        setStatusText('Đang chuẩn bị backup...');
        try {
            await (window as any).go.main.App.StartSelectiveBackup({
                contacts: includeContacts,
                sms: includeSms,
                appPackages: selectedApps,
                mediaFolders,
            });
            toast.success('Backup hoàn tất');
            loadBackups();
        } catch (e: any) {
            const msg = String(e || 'Backup thất bại');
            if (!msg.includes('gián đoạn')) toast.error(msg);
        } finally {
            setBackupRunning(false);
            setStatusText('');
        }
    };

    const handleRestore = async (item: BackupItem, checkOnly = false) => {
        const selectedComponents = selectedComponentsFor(item);
        if (selectedComponents.length === 0) {
            toast.error('Chọn ít nhất một mục để khôi phục');
            return;
        }
        if (!hasRoot) {
            toast.error('Cần cấp quyền root trước khi khôi phục');
            return;
        }
        setRestoreRunning(item.filename);
        setStatusText(checkOnly ? 'Đang kiểm tra bản backup...' : 'Đang khôi phục dữ liệu...');
        try {
            await (window as any).go.main.App.StartSelectiveRestore(item.filename, { dryRun: checkOnly, selectedComponents });
            toast.success(checkOnly ? 'Bản backup sẵn sàng để khôi phục' : 'Khôi phục hoàn tất');
        } catch (e: any) {
            toast.error(String(e || 'Khôi phục thất bại'));
        } finally {
            setRestoreRunning(null);
            setStatusText('');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await (window as any).go.main.App.DeleteBackup(deleteTarget.filename);
            toast.success(t('backup_deleted'));
            setDeleteTarget(null);
            loadBackups();
        } catch (e) {
            toast.error(`${t('error')}: ${e}`);
        }
    };

    const rootReadyText = rootChecking
        ? 'Đang kiểm tra quyền root...'
        : hasRoot
            ? 'Thiết bị root đã sẵn sàng'
            : 'Cần cấp quyền root trước khi backup/restore';

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300 font-sans">
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-[#05050A]/80 backdrop-blur-2xl" onClick={onClose} />

            {deleteTarget && (
                <div className="absolute inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#13141C] w-full max-w-sm rounded-[28px] shadow-2xl border border-slate-200 dark:border-white/5 p-7 text-center">
                        <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-500">
                            <Trash2 size={28} />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Xóa bản backup?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{deleteTarget.deviceName} • {formatDate(deleteTarget.createdAt)}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="py-3 rounded-2xl font-bold text-sm bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">Giữ lại</button>
                            <button onClick={handleDelete} className="py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2"><Trash2 size={15} /> Xóa</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative w-full max-w-4xl bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/5 rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
                <div className="px-7 py-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/70 dark:bg-[#1A1C26]/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-teal-500/20">
                            <Archive size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">Backup & Restore</h3>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">{backups.length} bản backup • {formatSize(totalUsage)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadBackups} className="w-9 h-9 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-teal-600 transition-colors"><RefreshCw size={16} /></button>
                        <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:bg-red-500 hover:text-white transition-colors"><X size={16} /></button>
                    </div>
                </div>

                <div className="px-7 pt-5 shrink-0">
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-black/20 rounded-2xl">
                        <button onClick={() => setPanel('backup')} className={`py-3 rounded-xl text-sm font-black transition-all ${panel === 'backup' ? 'bg-white dark:bg-white/10 text-teal-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Backup</button>
                        <button onClick={() => setPanel('restore')} className={`py-3 rounded-xl text-sm font-black transition-all ${panel === 'restore' ? 'bg-white dark:bg-white/10 text-teal-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Restore</button>
                    </div>
                </div>

                <div className="px-7 py-4 shrink-0">
                    <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border ${hasRoot ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-200' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                            {rootChecking ? <Loader2 size={17} className="animate-spin shrink-0" /> : <ShieldCheck size={17} className="shrink-0" />}
                            <span className="text-xs font-black truncate">{rootReadyText}</span>
                        </div>
                        {!hasRoot && (
                            <button onClick={checkRoot} disabled={rootChecking} className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-black text-white hover:bg-amber-600 disabled:opacity-60">
                                {rootChecking ? 'Đang chờ...' : 'Cấp quyền root'}
                            </button>
                        )}
                    </div>
                </div>

                {statusText && (
                    <div className="px-7 pb-4 shrink-0">
                        <div className="flex items-center gap-3 rounded-2xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 px-4 py-3">
                            <Loader2 size={16} className="text-teal-500 animate-spin shrink-0" />
                            <span className="text-xs font-bold text-teal-700 dark:text-teal-300 truncate">{statusText}</span>
                        </div>
                    </div>
                )}

                {!hasRoot ? (
                    <div className="flex-1 flex items-center justify-center px-7 pb-7">
                        <div className="w-full max-w-md rounded-[28px] border border-amber-200 bg-amber-50 p-7 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                                {rootChecking ? <Loader2 size={26} className="animate-spin" /> : <ShieldCheck size={26} />}
                            </div>
                            <h4 className="mb-2 text-lg font-black text-amber-900 dark:text-amber-100">Cần quyền root để tiếp tục</h4>
                            <p className="mb-5 text-sm font-semibold leading-relaxed text-amber-800/80 dark:text-amber-100/70">
                                Bấm nút bên dưới, rồi nhìn sang điện thoại và chọn Allow trong Magisk/KernelSU/APatch. Nếu không cấp quyền, FlashFlow sẽ không cho chạy backup hoặc restore.
                            </p>
                            <button onClick={checkRoot} disabled={rootChecking} className="w-full rounded-2xl bg-amber-500 py-3.5 text-sm font-black text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-60">
                                {rootChecking ? 'Đang chờ cấp quyền...' : 'Cấp quyền root'}
                            </button>
                        </div>
                    </div>
                ) : panel === 'backup' ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-7 pb-7 space-y-5">
                        <section>
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Chọn dữ liệu</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${includeContacts ? 'border-teal-300 bg-teal-50 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}`}>
                                    <input type="checkbox" checked={includeContacts} onChange={e => setIncludeContacts(e.target.checked)} />
                                    <UserRound size={19} className="text-teal-600" />
                                    <span className="text-sm font-black text-slate-800 dark:text-white">Danh bạ</span>
                                </label>
                                <label className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${includeSms ? 'border-teal-300 bg-teal-50 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}`}>
                                    <input type="checkbox" checked={includeSms} onChange={e => setIncludeSms(e.target.checked)} />
                                    <MessageSquareText size={19} className="text-teal-600" />
                                    <span className="text-sm font-black text-slate-800 dark:text-white">Tin nhắn SMS</span>
                                </label>
                            </div>
                        </section>

                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ứng dụng ({selectedApps.length})</div>
                                <button onClick={() => setSelectedApps([])} className="text-[11px] font-bold text-slate-400 hover:text-red-500">Bỏ chọn</button>
                            </div>
                            <div className="relative mb-3">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={appSearch} onChange={e => setAppSearch(e.target.value)} placeholder="Tìm app..." className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 pl-9 pr-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none" />
                            </div>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                                {filteredApps.length === 0 ? (
                                    <div className="text-sm text-slate-400 py-6">Kết nối thiết bị để đọc danh sách app.</div>
                                ) : filteredApps.map(app => (
                                    <label key={app.id} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 min-w-0 cursor-pointer">
                                        <input type="checkbox" checked={selectedApps.includes(app.id)} onChange={() => toggleApp(app.id)} />
                                        <span className="truncate">{app.id}</span>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section>
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Ảnh, video và tệp</div>
                            <div className="flex flex-wrap gap-2">
                                {DEFAULT_MEDIA_FOLDERS.map(folder => (
                                    <button key={folder} onClick={() => toggleMediaFolder(folder)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black border transition-all ${mediaFolders.includes(folder) ? 'bg-teal-500 border-teal-500 text-white' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}>
                                        <Image size={14} /> {folder}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <button onClick={handleNewBackup} disabled={backupRunning || hasRoot === false || selectedBackupCount === 0} className="w-full py-4 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-black text-sm shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {backupRunning ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            {backupRunning ? 'Đang backup...' : `Backup ${selectedBackupCount} mục đã chọn`}
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-7 pb-7 space-y-3">
                        {loading ? (
                            <div className="text-center py-16 text-slate-400 text-sm font-medium">{t('loading')}</div>
                        ) : backups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Archive size={46} className="text-slate-300 dark:text-slate-600 mb-4" />
                                <h4 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-2">Chưa có bản backup</h4>
                                <p className="text-sm text-slate-400 mb-5">Tạo backup trước, rồi quay lại đây để khôi phục.</p>
                                <button onClick={() => setPanel('backup')} className="px-5 py-3 rounded-2xl bg-teal-500 text-white text-sm font-black">Tạo backup</button>
                            </div>
                        ) : backups.map(item => {
                            const components = item.components || [];
                            const selected = selectedComponentsFor(item);
                            return (
                                <div key={item.id} className="rounded-2xl bg-slate-50 dark:bg-[#1C1E26] border border-slate-100 dark:border-white/5 p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0">
                                            <Smartphone size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="text-sm font-black text-slate-800 dark:text-white truncate">{item.deviceName || t('backup_unknown_device')}</h4>
                                                {item.status === 'complete' && <CheckCircle2 size={14} className="text-teal-500" />}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-400">
                                                <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(item.createdAt)}</span>
                                                <span className="flex items-center gap-1"><HardDrive size={11} /> {item.sizeStr}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setDeleteTarget(item)} className="w-9 h-9 rounded-xl bg-white dark:bg-white/5 text-slate-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {components.length > 0 && (
                                        <div className="mt-4 space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {components.map(component => (
                                                    <label key={component.name} className="flex items-center gap-2 rounded-xl bg-white dark:bg-black/10 border border-slate-100 dark:border-white/5 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 min-w-0 cursor-pointer">
                                                        <input type="checkbox" checked={selected.includes(component.name)} onChange={() => toggleRestoreComponent(item, component.name)} />
                                                        <span className="truncate">{componentLabel(component)}</span>
                                                        <span className="ml-auto text-[10px] text-slate-400">{formatSize(component.size || 0)}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => handleRestore(item, true)} disabled={restoreRunning === item.filename} className="py-3 rounded-2xl bg-white dark:bg-white/5 text-xs font-black text-slate-600 dark:text-slate-200 border border-slate-100 dark:border-white/5 flex items-center justify-center gap-2">
                                                    {restoreRunning === item.filename ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Kiểm tra trước
                                                </button>
                                                <button onClick={() => handleRestore(item, false)} disabled={restoreRunning === item.filename || hasRoot === false} className="py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-xs font-black text-white flex items-center justify-center gap-2 disabled:opacity-50">
                                                    <RotateCcw size={15} /> Khôi phục
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
