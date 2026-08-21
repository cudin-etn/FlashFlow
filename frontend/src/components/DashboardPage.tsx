import React, { useState, useEffect, useRef } from "react";
import {
  Zap, Layers, Database, ShoppingBag,
  LayoutGrid, ShieldCheck, Cog, ChevronRight, Crown, Sun, Moon, Lock, Copy, Archive, Scissors, FileText, MessageSquareText
} from "lucide-react";
import { WindowSetDarkTheme, WindowSetLightTheme, WindowSetSystemDefaultTheme } from "../../wailsjs/runtime/runtime";
import { Toaster, toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { useFlash } from '../context/FlashContext';
import { ControlCenterModal } from "./dashboard/ControlCenterModal";
import { SettingsModal } from "./dashboard/SettingsModal";
 import { LibraryModal } from "./dashboard/LibraryModal";
 import { StoreModal } from "./dashboard/StoreModal";
 import { PreCheckModal } from "./dashboard/PreCheckModal";
 import { ExpirationModal } from "./dashboard/ExpirationModal";
 import { FeatureLockedModal } from "./dashboard/FeatureLockedModal";
 import { GetHWID, IsFreeMode } from "../../wailsjs/go/main/App";
 import { DevicePanel } from "./dashboard/DevicePanel";
 import { FlashHistoryModal } from "./dashboard/FlashHistoryModal";
import { AdvancedToolsModal } from "./dashboard/AdvancedToolsModal";
import { ComingSoonModal } from "./dashboard/ComingSoonModal";
import { AdminMessageModal } from "./dashboard/AdminMessageModal";

// --- LOGIC BINDINGS ---
const EventsOn = (eventName: string, callback: any) => {
  if (window && (window as any).runtime) return (window as any).runtime.EventsOn(eventName, callback);
  return () => { };
};

const GoApp: any = (window as any).go?.main?.App || {
  CheckDevice: async () => ({ connected: false }),
  SetDeviceBrand: async (brand: string) => {},
  GetInstalledApps: async () => [],
  UninstallPackage: async (pkg: string) => "Success",
  GetHWID: async () => "UNKNOWN-HWID"
};

type LicenseInfo = {
  type: string;      
  days_left: number;
  isPro: boolean;
  message: string;
  expiry_ts?: number;
};

// --- STYLES NGHỆ THUẬT ---
const DASHBOARD_STYLES = `
  .app-drag-region { position: fixed; top: 0; left: 0; width: 100%; height: 44px; z-index: 50; --wails-draggable: drag; }
  button, .no-drag { --wails-draggable: no-drag; }
  
  .creative-card {
    border-radius: 32px; 
    position: relative;
    overflow: hidden;
    transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
  }

  @keyframes orbit {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes orbit-reverse {
    from { transform: translate(-50%, -50%) rotate(360deg); }
    to { transform: translate(-50%, -50%) rotate(0deg); }
  }
  @keyframes float-gentle {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-8px) scale(1.02); }
  }
  
  .orbit-ring-1 {
    position: absolute; top: 50%; left: 50%; width: 240px; height: 240px;
    border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 50%;
    animation: orbit 15s linear infinite;
  }
  .orbit-ring-2 {
    position: absolute; top: 50%; left: 50%; width: 340px; height: 340px;
    border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 50%;
    animation: orbit-reverse 25s linear infinite;
  }
  .orbit-dot {
    position: absolute; top: 0; left: 50%; width: 6px; height: 6px;
    background: #fff; border-radius: 50%;
    box-shadow: 0 0 10px 2px rgba(255,255,255,0.8);
    transform: translate(-50%, -50%);
  }
  .icon-float { animation: float-gentle 6s ease-in-out infinite; }
`;

export default function Dashboard({ onStartAIMode, brandSelected = false }: any) {
  const { t } = useLanguage();
  const { isFlashing } = useFlash();

  // Inject dashboard styles into document.head with cleanup on unmount
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-dashboard-styles", "true");
    styleEl.textContent = DASHBOARD_STYLES;
    document.head.appendChild(styleEl);

    // Show window controls only on Windows (frameless mode)
    const controls = document.getElementById('window-controls');
    if (controls) {
      // Wails sets navigator.platform or we can check userAgent
      const isWindows = navigator.platform?.includes('Win') || navigator.userAgent?.includes('Windows');
      controls.style.display = isWindows ? 'flex' : 'none';
    }

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  const [device, setDevice] = useState({
    connected: false, model: t('status_disconnected'), state: "Offline",
    os: "--", battery: "0%", buildId: "--", slot: "--", bootloader: "--", bootloaderColor: "emerald", vendor: ""
  });
  
  // Mode switching state
  const [modeSwitching, setModeSwitching] = useState<{ active: boolean; target: string }>({
    active: false,
    target: "",
  });
  
  // Mode switch timeout state (30s UI-level safety net)
  const [modeSwitchTimeout, setModeSwitchTimeout] = useState<{ timedOut: boolean }>({
    timedOut: false,
  });
  const modeSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const deviceRef = useRef(device);
  useEffect(() => { deviceRef.current = device; }, [device]);

  const [theme, setTheme] = useState(localStorage.getItem("theme") || "system");

  // License Logic
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [myHWID, setMyHWID] = useState("");
  const [realPackage, setRealPackage] = useState("FREE"); 
  const [sessionPackage, setSessionPackage] = useState<string | null>(null);
  const [freeAccessMode, setFreeAccessMode] = useState(true);
  const userPackage = freeAccessMode ? "FREE" : (sessionPackage || realPackage);

  // MODAL STATES
  const [showControl, setShowControl] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showBackupComingSoon, setShowBackupComingSoon] = useState(false);
  const [showFlashHistory, setShowFlashHistory] = useState(false);
  const [showAdminMessage, setShowAdminMessage] = useState(false);

  useEffect(() => {
      if (GetHWID) GetHWID().then((id: string) => setMyHWID(id)).catch(console.error);
      IsFreeMode().then(setFreeAccessMode).catch((error) => {
        console.error("Không thể đọc access mode từ backend", error);
        setFreeAccessMode(true);
      });
      const stopListenLicense = EventsOn("license_checked", (data: LicenseInfo) => { setLicense(data); });
      
      // Listen for RE_4H expiry notification
      const stopListenRE4HExpiry = EventsOn("license_re4h_expired", (data: any) => {
        // Show notification with package name and status
        toast.error(
          `${data?.message || "Gói RE_4H (4 giờ) đã hết hạn"}`,
          {
            description: "Trạng thái: Đã hết hạn — Chuyển về chế độ TRIAL",
            duration: 5000,
          }
        );
        // Show the expiration modal
        setShowExpiredModal(true);
        // Update local license state to reflect expiry
        setRealPackage("TRIAL");
        setSessionPackage(null);
      });

      // Listen for local RE_4H timer expiry (from AppShell countdown)
      let re4hLocalHandled = false;
      const handleRE4HLocalExpiry = (e: Event) => {
        if (re4hLocalHandled) return; // Only handle once
        re4hLocalHandled = true;
        const detail = (e as CustomEvent).detail;
        toast.error(
          `${detail?.message || "Gói RE_4H (4 giờ) đã hết hạn"}`,
          {
            description: "Trạng thái: Đã hết hạn — Chuyển về chế độ TRIAL",
            duration: 5000,
          }
        );
        setShowExpiredModal(true);
        setRealPackage("TRIAL");
        setSessionPackage(null);
      };
      window.addEventListener("re4h_local_expired", handleRE4HLocalExpiry);

      return () => {
          if(stopListenLicense) stopListenLicense();
          if(stopListenRE4HExpiry) stopListenRE4HExpiry();
          window.removeEventListener("re4h_local_expired", handleRE4HLocalExpiry);
      };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    let activeTheme = theme;
    if (theme === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      try { WindowSetSystemDefaultTheme(); } catch(e) {}
    } else {
      if (theme === "dark") try { WindowSetDarkTheme(); } catch(e) {}
      else try { WindowSetLightTheme(); } catch(e) {}
    }
    root.classList.add(activeTheme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const updateDeviceState = (res: any) => {
    const prev = deviceRef.current;
    if (!prev.connected && res.connected) toast.success(t('toast_connected'), { description: res.model });
    else if (prev.connected && !res.connected) toast.error(t('toast_disconnected'));

    if (res && res.connected) {
      const blRaw = (res.bootloader || "").toLowerCase();
      let blStatus = "--";
      if (blRaw.includes("unlocked") || blRaw.includes("yes")) { blStatus = "UNLOCKED"; }
      else if (blRaw.includes("locked") || blRaw.includes("no")) { blStatus = "LOCKED"; }

      setDevice({ 
        ...prev, 
        connected: true, 
        model: res.model || "Android Device", 
        state: res.state || "Connected", 
        battery: res.battery || "0%", 
        os: res.os || "--",
        bootloader: blStatus,
        vendor: res.vendor && res.vendor !== "unknown" ? res.vendor : prev.vendor 
      });
      // Clear mode switching when device reconnects
      setModeSwitching({ active: false, target: "" });
      // Clear timeout when device reconnects
      if (modeSwitchTimerRef.current) {
        clearTimeout(modeSwitchTimerRef.current);
        modeSwitchTimerRef.current = null;
      }
      setModeSwitchTimeout({ timedOut: false });
    } else {
      setDevice(prev => ({ ...prev, connected: false, model: t('status_disconnected'), state: "Offline", battery: "0%", os: "--", bootloader: "--" }));
    }
  };

  useEffect(() => {
    GoApp.CheckDevice?.().then(updateDeviceState);
    const off = EventsOn("device_changed", updateDeviceState);
    
    const offModeSwitching = EventsOn("device_mode_switching", (payload: any) => {
      setModeSwitching({ active: true, target: payload?.target || "" });
      setModeSwitchTimeout({ timedOut: false });
      
      // Start 30s timeout timer
      if (modeSwitchTimerRef.current) {
        clearTimeout(modeSwitchTimerRef.current);
      }
      modeSwitchTimerRef.current = setTimeout(() => {
        // 30s passed without resolution — show timeout error
        setModeSwitching({ active: false, target: "" });
        setModeSwitchTimeout({ timedOut: true });
        modeSwitchTimerRef.current = null;
      }, 30000);
    });
    
    const offModeSwitchDone = EventsOn("device_mode_switch_done", (payload: any) => {
      // Clear the 30s timer
      if (modeSwitchTimerRef.current) {
        clearTimeout(modeSwitchTimerRef.current);
        modeSwitchTimerRef.current = null;
      }
      
      setModeSwitching({ active: false, target: "" });
      
      // If success is false (backend 40s timeout or failure), show error
      if (payload && payload.success === false) {
        setModeSwitchTimeout({ timedOut: true });
      } else {
        setModeSwitchTimeout({ timedOut: false });
      }
    });

    const offAdminMsg = EventsOn("admin_message_received", (payload: any) => {
      setShowAdminMessage(true);
    });

    return () => { 
      if (off) off(); 
      if (offModeSwitching) offModeSwitching();
      if (offModeSwitchDone) offModeSwitchDone();
      if (offAdminMsg) offAdminMsg();
      // Cleanup timer on unmount
      if (modeSwitchTimerRef.current) {
        clearTimeout(modeSwitchTimerRef.current);
      }
    };
  }, [t]);

  const handleLockedFeature = (action: () => void) => {
    if (freeAccessMode) {
      action(); return;
    }
    if (["RE_4H", "PRO_6M", "PRO", "SHOP_SMALL", "SHOP_BIG", "WHITE_LABEL", "TECHNICIAN"].includes(userPackage)) {
      action(); return;
    }
    setShowLockedModal(true);
  };

  // Dismiss mode switch timeout error
  const handleDismissModeSwitchTimeout = () => {
    setModeSwitchTimeout({ timedOut: false });
  };

  const TABS = [
     { id: 'auto', label: t('tab_auto'), color: 'blue', icon: Zap, title: t('tab_auto_title'), desc: t('tab_auto_desc'), btnAction: () => setShowPreCheck(true), enabled: true },
     { id: 'advanced', label: 'Advanced', color: 'orange', icon: Layers, title: 'Advanced Tools', desc: 'Debloat, ROM Extractor và Flash IMG thủ công.', btnAction: () => handleLockedFeature(() => setShowAdvancedTools(true)), enabled: true },
     { id: 'lib', label: t('tab_lib'), color: 'emerald', icon: Database, title: t('lib_title'), desc: t('tab_lib_desc'), btnAction: () => setShowLibrary(true), enabled: true },
     { id: 'store', label: freeAccessMode ? 'Free' : t('tab_store'), color: 'pink', icon: ShoppingBag, title: freeAccessMode ? 'FlashFlow Free' : t('hero_store_title'), desc: freeAccessMode ? 'Toàn bộ tính năng đang mở miễn phí.' : t('tab_store_desc'), btnAction: () => setShowStore(true), enabled: true },
  ];

  const [activeTab, setActiveTab] = useState("auto");
  const currentTabObj = TABS.find(t => t.id === activeTab) || TABS[0];
  const isDisabled = !currentTabObj.enabled || (currentTabObj.id === 'auto' && !brandSelected);
  
  // Dải Gradient SÂU cho Center Card (Main Level)
  const bgCenter = currentTabObj.color === 'blue' ? 'bg-gradient-to-br from-[#4F46E5] to-[#2563EB]' : 
                   currentTabObj.color === 'orange' ? 'bg-gradient-to-br from-[#F97316] to-[#DC2626]' : 
                   currentTabObj.color === 'emerald' ? 'bg-gradient-to-br from-[#10B881] to-[#059669]' : 
                   'bg-gradient-to-br from-[#DB2777] to-[#BE185D]';
                   


 // --- CHUẨN BỊ DỮ LIỆU THẬT CHO BENTO DEVICE PANEL ---
  let currentMode: 'ADB' | 'FASTBOOT' | 'RECOVERY' | 'DISCONNECTED' = 'DISCONNECTED';
  if (device.connected) {
      const s = (device.state || '').toUpperCase();
      if (s.includes('FASTBOOT')) currentMode = 'FASTBOOT';
      else if (s.includes('RECOVERY')) currentMode = 'RECOVERY';
      else currentMode = 'ADB';
  }

  const currentDeviceData = device.connected ? {
      name: device.model !== t('status_disconnected' as any) ? device.model : 'Unknown Device',
      codename: device.vendor || 'Unknown',
      mode: currentMode,
      battery: device.battery || "0%",
      bootloader: device.bootloader,
      osVersion: device.os
  } : null;

  return (
    <div className="relative flex h-screen w-full p-8 pt-14 selection:bg-indigo-500/30 font-sans no-drag z-10">
      <div className="app-drag-region" />
      
      {/* Custom Window Controls — only visible on Windows (frameless) */}
      <div className="fixed top-2.5 right-3 z-[100] flex items-center gap-0.5 no-drag hidden windows:flex" id="window-controls">
        <button onClick={() => (window as any).runtime?.WindowMinimise?.()} className="w-8 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-200/80 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors outline-none">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button onClick={() => (window as any).runtime?.WindowToggleMaximise?.()} className="w-8 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-200/80 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors outline-none">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><rect x="0.5" y="0.5" width="8" height="8" rx="1" stroke="currentColor"/></svg>
        </button>
        <button onClick={() => (window as any).runtime?.Quit?.()} className="w-8 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors outline-none">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
      
      {/* KHUNG LƯỚI 12 CỘT TỶ LỆ (3 - 5 - 4) */}
      <div className="w-full h-full grid grid-cols-12 gap-6">
         
         {/* ================= CỘT TRÁI (Navigation Only) - 3/12 ================= */}
         <div className="col-span-3 lg:col-span-3 creative-card bg-white dark:bg-gradient-to-b dark:from-[#1a1b2e] dark:to-[#151625] flex flex-col p-6 shadow-sm border border-slate-100 dark:border-indigo-500/10">
            
            {/* 1. Header: Logo, Brand & Nút Theme */}
            <div className="flex items-center justify-between mb-10 mt-2 cursor-default group">
               <div className="flex items-center gap-3">
                   <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform duration-300">
                      <span className="text-white font-black text-2xl drop-shadow-md">F</span>
                   </div>
                   <div className="flex flex-col">
                      <h1 className="text-l font-black text-slate-800 dark:text-white tracking-tight leading-none">Flash Flow</h1>
                      <div className="flex items-center gap-2 mt-1.5">
                         <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/5 text-[9px] font-black text-slate-600 dark:text-slate-300 shadow-sm">
                            v2.1.1
                         </span>
                      </div>
                   </div>
               </div>
               
               {/* Nút Theme cực gọn góc phải */}
               <div className="flex bg-slate-100 dark:bg-black/30 rounded-full p-1 border border-slate-200 dark:border-white/5">
                  <button onClick={() => setTheme('light')} className={`p-1.5 rounded-full transition-colors ${theme === 'light' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400'} outline-none`}><Sun size={14}/></button>
                  <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-full transition-colors ${theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'} outline-none`}><Moon size={14}/></button>
               </div>
            </div>

            {/* 2. Navigation Tabs */}
            <div className={`flex-1 flex flex-col gap-1.5 transition-opacity duration-300 ${isFlashing ? 'opacity-50 pointer-events-none' : ''}`}>
               {TABS.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                     <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                       disabled={isFlashing}
                       className={`flex items-center gap-4 px-4 py-4 rounded-[20px] font-bold text-sm transition-all duration-300 outline-none
                         ${isActive ? `bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white` : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-white'}
                         ${isFlashing ? 'cursor-not-allowed' : ''}`}>
                        <tab.icon size={20} className={isActive ? (tab.color === 'blue' ? 'text-indigo-500' : tab.color === 'orange' ? 'text-orange-500' : tab.color === 'emerald' ? 'text-emerald-500' : 'text-pink-500') : "text-slate-400"} />
                        {tab.label}
                     </button>
                  );
               })}
            </div>

            {/* Account / License — Bottom of left column */}
            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-white/5">
               <div className="flex items-center gap-3 p-3 rounded-[16px] bg-slate-50 dark:bg-white/5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0">
                     <Crown size={14} className="text-white" fill="currentColor"/>
                  </div>
                  <div className="flex-1 min-w-0">
                     <span className="font-black text-xs text-slate-700 dark:text-white block truncate">{userPackage}</span>
                     <button onClick={() => { if(myHWID) { navigator.clipboard.writeText(myHWID); toast.success("Đã copy mã HWID!"); } }}
                        className="text-[9px] font-mono text-slate-400 hover:text-indigo-500 transition-colors outline-none flex items-center gap-1 mt-0.5">
                        <Lock size={8}/> {myHWID ? myHWID.substring(0, 10) + '...' : '...'} <Copy size={9} className="opacity-60"/>
                     </button>
                  </div>
               </div>
            </div>

         </div>

         {/* ================= CỘT GIỮA (Hero + Tdev.Studio Tools) - 5/12 ================= */}
         <div className="col-span-5 lg:col-span-5 flex flex-col gap-6 h-full">
            {/* Hero Card (flex-1, takes remaining space) */}
            <div 
               onClick={!isDisabled && !isFlashing && currentTabObj.btnAction ? currentTabObj.btnAction : undefined}
               className={`flex-1 creative-card ${bgCenter} flex flex-col items-center justify-center text-center p-8 relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-500 group/card
               ${(!isDisabled && !isFlashing) ? 'cursor-pointer hover:shadow-[0_30px_70px_rgba(0,0,0,0.4)] hover:scale-[1.01]' : ''}`}>
               
               {/* Lớp lưới Texture nhẹ làm sâu khối màu */}
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-50 mix-blend-overlay pointer-events-none"></div>
               {/* Hover glow overlay */}
               <div className="absolute inset-0 bg-white/0 group-hover/card:bg-white/5 transition-colors duration-300 pointer-events-none rounded-[32px]"></div>
               <div className="relative w-full h-full flex flex-col items-center justify-center z-10">
                   <div className="relative flex items-center justify-center w-64 h-64 mb-24 icon-float">
                       <div className="orbit-ring-1"><div className="orbit-dot"></div></div>
                       <div className="orbit-ring-2"><div className="orbit-dot"></div><div className="orbit-dot" style={{ top: '100%' }}></div></div>
                       <currentTabObj.icon size={110} strokeWidth={1.5} className="text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.5)] relative z-10 group-hover/card:scale-105 transition-transform duration-500" />
                   </div>

                   <h2 className="text-3xl font-black text-white tracking-tight mb-4 drop-shadow-md">{currentTabObj.title}</h2>
                   <p className="text-sm font-medium text-white/80 max-w-[280px] leading-relaxed mb-8">{currentTabObj.desc}</p>

                   <div className={`px-10 py-4 rounded-full font-black text-sm bg-white text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all duration-300 flex items-center gap-2
                       ${(!isDisabled && !isFlashing) ? 'group-hover/card:scale-105 group-hover/card:shadow-[0_15px_40px_rgba(0,0,0,0.4)]' : 'opacity-50'}`}>
                       {currentTabObj.id === 'store' ? (freeAccessMode ? 'Xem Free' : t('btn_open_store')) : t('btn_next')} <ChevronRight size={18} strokeWidth={3}/>
                   </div>
               </div>
            </div>

            {/* Tdev.Studio Tools Card */}
            <div className={`creative-card bg-white/80 dark:bg-gradient-to-br dark:from-[#1e2040] dark:to-[#181a30] p-5 border border-slate-200 dark:border-indigo-500/10 shadow-sm flex flex-col items-center gap-3 transition-all duration-500 ${isFlashing ? 'opacity-50 pointer-events-none' : ''}`}>
               {/* Title on top */}
               <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Tdev.Studio Tools</span>
               
               {/* Icons with labels below each */}
               <div className="flex gap-8">
                  {[
                     { icon: LayoutGrid, action: () => setShowControl(true), label: 'Control', iconColor: 'text-indigo-500', bgColor: 'bg-indigo-50 dark:bg-indigo-500/10' },
                     { icon: ShieldCheck, action: () => setShowAdvancedTools(true), label: 'Advanced', iconColor: 'text-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-500/10' },
                     { icon: Cog, action: () => setShowSettings(true), label: 'Settings', iconColor: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-500/10' }
                  ].map((tool, idx) => (
                     <button key={idx} onClick={tool.action} disabled={isFlashing}
                        className={`flex flex-col items-center gap-1.5 group outline-none ${isFlashing ? 'cursor-not-allowed' : ''}`}>
                        <div className={`w-11 h-11 rounded-[14px] ${tool.bgColor} ${tool.iconColor} flex items-center justify-center group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300`}>
                           <tool.icon size={20} strokeWidth={1.8} />
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{tool.label}</span>
                     </button>
                  ))}
               </div>
            </div>
         </div>

         {/* ================= CỘT PHẢI (Device + Quick Actions + Account) - 4/12 ================= */}
         <div className="col-span-4 lg:col-span-4 flex flex-col gap-6 h-full">
            
            {/* 1. DEVICE PANEL (flex-[2]) */}
            <div className="flex-[2] flex flex-col overflow-y-auto custom-scrollbar pb-2">
               <DevicePanel device={currentDeviceData as any} modeSwitching={modeSwitching} modeSwitchTimeout={modeSwitchTimeout} onDismissTimeout={handleDismissModeSwitchTimeout} />
            </div>

            {/* 2. QUICK ACTIONS — Compact 2x2 grid */}
            <div className={`creative-card bg-white dark:bg-gradient-to-br dark:from-[#1a1b2e] dark:to-[#151625] p-4 border border-slate-100 dark:border-purple-500/10 shadow-sm transition-all duration-500 ${isFlashing ? 'opacity-50 pointer-events-none' : ''}`}>
               <div className="grid grid-cols-2 gap-2">
                  {[
                     { icon: Archive, label: 'Backup', action: () => !isFlashing && setShowBackupComingSoon(true), gradient: 'from-teal-500 to-emerald-500' },
                     { icon: Scissors, label: 'Advanced', action: () => !isFlashing && setShowAdvancedTools(true), gradient: 'from-violet-500 to-purple-500' },
                     { icon: FileText, label: 'History', action: () => !isFlashing && setShowFlashHistory(true), gradient: 'from-indigo-500 to-blue-500' },
                     { icon: MessageSquareText, label: 'Tin nhắn', action: () => !isFlashing && setShowAdminMessage(true), gradient: 'from-amber-500 to-rose-500' },
                  ].map((item, idx) => (
                     <button key={idx} onClick={item.action} disabled={isFlashing}
                        className={`py-2.5 px-3 rounded-[14px] bg-gradient-to-r ${item.gradient} text-white font-bold text-[11px] flex items-center justify-center gap-1.5 hover:-translate-y-0.5 shadow-sm hover:shadow-md transition-all outline-none
                        ${isFlashing ? 'cursor-not-allowed' : ''}`}>
                        <item.icon size={14} /> {item.label}
                     </button>
                  ))}
               </div>
            </div>

         </div>
      </div>

      {/* RENDER MODALS MẶC ĐỊNH */}
      <ControlCenterModal isOpen={showControl} onClose={() => setShowControl(false)} device={device} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} theme={theme} setTheme={setTheme} currentVendor={device.vendor} setVendor={(v: string) => setDevice({...device, vendor: v})} />
      <LibraryModal isOpen={showLibrary} onClose={() => setShowLibrary(false)} onSelectRom={(path: string) => { setShowLibrary(false); if(onStartAIMode) onStartAIMode(path); }} />
      <StoreModal isOpen={showStore} onClose={() => setShowStore(false)} freeMode={freeAccessMode} />
      <ExpirationModal isOpen={showExpiredModal} onClose={() => setShowExpiredModal(false)} onOpenStore={() => { setShowExpiredModal(false); setShowStore(true); }} t={t} />
      <FeatureLockedModal isOpen={showLockedModal} onClose={() => setShowLockedModal(false)} onOpenStore={() => { setShowLockedModal(false); setShowStore(true); }} t={t} />
      <PreCheckModal isOpen={showPreCheck} onClose={() => setShowPreCheck(false)} onConfirm={() => { setShowPreCheck(false); if (onStartAIMode) onStartAIMode(); }} />
      <AdvancedToolsModal isOpen={showAdvancedTools} onClose={() => setShowAdvancedTools(false)} device={device} currentBrand={device.vendor} />
      <ComingSoonModal isOpen={showBackupComingSoon} onClose={() => setShowBackupComingSoon(false)} />
      <FlashHistoryModal isOpen={showFlashHistory} onClose={() => setShowFlashHistory(false)} />
      <AdminMessageModal isOpen={showAdminMessage} onClose={() => setShowAdminMessage(false)} />

      <Toaster position="bottom-right" richColors theme={theme === 'dark' ? 'dark' : 'light'} closeButton />
    </div>
  );
}
