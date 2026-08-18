import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, Send, X, Loader2, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { GetClientMessages, SendClientMessage, MarkClientMessagesRead } from '../../../wailsjs/go/main/App';
import { main } from '../../../wailsjs/go/models';

interface AdminMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AdminMessageModal: React.FC<AdminMessageModalProps> = ({ isOpen, onClose }) => {
    const [messages, setMessages] = useState<main.ClientMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const list = await GetClientMessages();
            setMessages(list || []);
            MarkClientMessagesRead().catch(() => {});
        } catch (err) {
            console.error("Fetch client messages failed:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchMessages();
        }
    }, [isOpen]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = inputText.trim();
        if (!text || sending) return;

        setSending(true);
        try {
            await SendClientMessage(text);
            setInputText('');
            toast.success("Đã gửi phản hồi tới Admin!");
            await fetchMessages();
        } catch (err: any) {
            toast.error("Gửi phản hồi thất bại: " + (err?.message || String(err)));
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        MarkClientMessagesRead().catch(() => {});
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4 sm:p-6 font-sans animate-in fade-in duration-300">
            {/* Nền Kính Mờ */}
            <div className="absolute inset-0 bg-slate-900/60 dark:bg-[#05050A]/80 backdrop-blur-2xl cursor-default" onClick={handleClose} />

            {/* Khung Bento Chat Chính */}
            <div className="relative flex flex-col w-full max-w-lg h-[540px] bg-white dark:bg-[#13141C] border border-slate-200 dark:border-white/10 rounded-[32px] shadow-2xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                            <MessageSquareText size={20} strokeWidth={2.2} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-800 dark:text-white tracking-tight">Tin nhắn từ Admin</h3>
                            <p className="text-[11px] font-medium text-slate-400">Hộp thoại hỗ trợ trực tiếp</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors outline-none"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body - Message history */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-3.5 custom-scrollbar">
                    {loading && messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <Loader2 size={24} className="animate-spin text-indigo-500" />
                            <span className="text-xs font-medium">Đang tải tin nhắn...</span>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-6">
                            <MessageSquareText size={36} className="text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Chưa có tin nhắn mới</p>
                            <p className="text-xs text-slate-400 mt-1">Khi Admin gửi tin nhắn cho máy của bạn, nội dung sẽ xuất hiện tại đây.</p>
                        </div>
                    ) : (
                        messages.map((m) => {
                            const isAdmin = m.sender === 'admin';
                            return (
                                <div 
                                    key={m.id} 
                                    className={`flex flex-col max-w-[82%] ${isAdmin ? 'self-start items-start' : 'self-end items-end'}`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] font-bold text-slate-400">
                                        {isAdmin ? (
                                            <>
                                                <ShieldCheck size={12} className="text-indigo-500" />
                                                <span className="text-indigo-500 font-black">Admin</span>
                                            </>
                                        ) : (
                                            <>
                                                <User size={12} className="text-slate-400" />
                                                <span>Bạn</span>
                                            </>
                                        )}
                                        <span>• {m.created_at}</span>
                                    </div>
                                    <div 
                                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap word-break shadow-sm ${
                                            isAdmin 
                                                ? 'bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-100 rounded-tl-sm border border-slate-200/50 dark:border-white/5' 
                                                : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-tr-sm'
                                        }`}
                                    >
                                        {m.message}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer - Input & Send */}
                <form onSubmit={handleSend} className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-2">
                    <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Nhập phản hồi gửi Admin..."
                        className="flex-1 px-4 py-3 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-2xl text-sm text-slate-800 dark:text-white outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                        disabled={sending}
                    />
                    <button 
                        type="submit" 
                        disabled={!inputText.trim() || sending}
                        className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0 outline-none"
                    >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        <span>Gửi</span>
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
};
