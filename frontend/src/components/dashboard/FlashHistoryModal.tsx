import React, { useState, useEffect } from "react";
import { X, Trash2, ChevronDown, ChevronUp, Clock, Smartphone, HardDrive, AlertCircle, CheckCircle2, XCircle, FileText } from "lucide-react";

interface FlashReportSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  deviceName: string;
  rom: string;
  result: string;
  vendor: string;
}

interface FlashReportDetail {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  deviceName: string;
  vendor: string;
  rom: string;
  wipe: boolean;
  arbMode: string;
  result: string;
  flashedPartitions: string[];
  skippedArbPartitions: string[];
  failures: string[];
  logs: string[];
}

// Wails Go bindings
const GoApp: any = (window as any).go?.main?.App || {};

function formatDate(iso: string): string {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function calcDuration(start: string, end: string): string {
  if (!start || !end) return "--";
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return "--";
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    if (mins > 0) return `${mins}m ${remainSecs}s`;
    return `${remainSecs}s`;
  } catch {
    return "--";
  }
}

function StatusBadge({ result }: { result: string }) {
  const lower = (result || "").toLowerCase();
  if (lower === "success" || lower === "completed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/30">
        <CheckCircle2 size={10} /> Success
      </span>
    );
  }
  if (lower === "failed" || lower === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-[10px] font-bold border border-red-200 dark:border-red-500/30">
        <XCircle size={10} /> Failed
      </span>
    );
  }
  if (lower === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-500/30">
        <AlertCircle size={10} /> Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-white/10">
      {result || "Unknown"}
    </span>
  );
}

export function FlashHistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [reports, setReports] = useState<FlashReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlashReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReports();
    } else {
      setExpandedId(null);
      setDetail(null);
      setDeleteConfirm(null);
    }
  }, [isOpen]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await GoApp.GetFlashReports?.();
      setReports(data || []);
    } catch (err) {
      console.error("Failed to load flash reports:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (sessionId: string) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(sessionId);
    setDetailLoading(true);
    try {
      const data = await GoApp.GetFlashReportDetail?.(sessionId);
      setDetail(data || null);
    } catch (err) {
      console.error("Failed to load report detail:", err);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await GoApp.DeleteFlashReport?.(sessionId);
      setReports((prev) => prev.filter((r) => r.sessionId !== sessionId));
      if (expandedId === sessionId) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (err) {
      console.error("Failed to delete report:", err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-[#1C1E26] rounded-[24px] shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Flash History</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{reports.length} report{reports.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 transition-all outline-none">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No flash reports yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Reports will appear here after flashing a ROM</p>
            </div>
          ) : (
            reports.map((report) => (
              <div key={report.sessionId} className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 overflow-hidden transition-all">
                {/* Summary row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  onClick={() => handleExpand(report.sessionId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-white truncate">{report.deviceName || "Unknown Device"}</span>
                      <StatusBadge result={report.result} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Clock size={10} />{formatDate(report.startedAt)}</span>
                      <span className="flex items-center gap-1"><HardDrive size={10} />{report.rom || "--"}</span>
                      {report.vendor && <span className="flex items-center gap-1"><Smartphone size={10} />{report.vendor}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {deleteConfirm === report.sessionId ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(report.sessionId); }}
                          className="px-2 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:bg-red-600 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                          className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[10px] font-bold hover:bg-slate-300 dark:hover:bg-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(report.sessionId); }}
                        className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {expandedId === report.sessionId ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </div>

                {/* Detail view */}
                {expandedId === report.sessionId && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-white/5">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : detail ? (
                      <div className="pt-3 space-y-3">
                        {/* Duration & Config */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-white dark:bg-[#1C1E26] p-2.5 border border-slate-100 dark:border-white/5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Duration</p>
                            <p className="text-xs font-black text-slate-700 dark:text-white">{calcDuration(detail.startedAt, detail.endedAt)}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-[#1C1E26] p-2.5 border border-slate-100 dark:border-white/5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Wipe</p>
                            <p className="text-xs font-black text-slate-700 dark:text-white">{detail.wipe ? "Yes" : "No"}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-[#1C1E26] p-2.5 border border-slate-100 dark:border-white/5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">ARB Mode</p>
                            <p className="text-xs font-black text-slate-700 dark:text-white">{detail.arbMode || "--"}</p>
                          </div>
                        </div>

                        {/* Flashed Partitions */}
                        {detail.flashedPartitions && detail.flashedPartitions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Flashed Partitions ({detail.flashedPartitions.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {detail.flashedPartitions.map((p, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold border border-emerald-100 dark:border-emerald-500/20">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Skipped ARB Partitions */}
                        {detail.skippedArbPartitions && detail.skippedArbPartitions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Skipped ARB ({detail.skippedArbPartitions.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {detail.skippedArbPartitions.map((p, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-100 dark:border-amber-500/20">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Failures */}
                        {detail.failures && detail.failures.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-red-500 dark:text-red-400 mb-1">Failures ({detail.failures.length})</p>
                            <div className="space-y-1">
                              {detail.failures.map((f, i) => (
                                <p key={i} className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-2 py-1 border border-red-100 dark:border-red-500/20">
                                  {f}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-3">Could not load report details</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
