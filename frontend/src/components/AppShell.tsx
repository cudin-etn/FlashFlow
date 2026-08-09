import { ReactNode, useEffect, useState } from "react";
import { Zap, Smartphone, Activity, Crown, Store, ShieldCheck, Clock, Building2, Timer } from "lucide-react";
import Logo from "../assets/images/logo_new.svg";
import { EventsOn } from "../../wailsjs/runtime"; 

type DeviceStatus = {
  connected: boolean;
  mode: string;
};

type LicenseInfo = {
  type: string;      
  days_left: number;
  isPro: boolean;
  message: string;
  expiry_ts?: number;
};

export default function AppShell({
  children,
  deviceStatus,
}: {
  children: ReactNode;
  deviceStatus: DeviceStatus;
}) {
  const { connected, mode } = deviceStatus;
  
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [countdownString, setCountdownString] = useState("");

  useEffect(() => {
    const stopListen = EventsOn("license_checked", (data: LicenseInfo) => {
      setLicense(data);
    });

    const handleTechnicianUnlock = () => {
        setLicense({
            type: "TECHNICIAN",
            days_left: 1, 
            isPro: true,
            message: "Technician Mode Active",
            expiry_ts: 0
        });
    };
    window.addEventListener("technician_activated", handleTechnicianUnlock);

    return () => {
      window.removeEventListener("technician_activated", handleTechnicianUnlock);
    };
  }, []);

  useEffect(() => {
    if (license?.type === "RE_4H" && license.expiry_ts && license.expiry_ts > 0) {
        const updateTimer = () => {
            const now = new Date().getTime();
            const distance = license.expiry_ts! - now;
            if (distance < 0) {
                setCountdownString("Hết giờ");
                // Dispatch a custom event so DashboardPage can detect local expiry
                window.dispatchEvent(new CustomEvent("re4h_local_expired", {
                    detail: { type: "RE_4H", message: "Gói RE_4H (4 giờ) đã hết hạn" }
                }));
            } else {
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                const hStr = hours < 10 ? `0${hours}` : hours;
                const mStr = minutes < 10 ? `0${minutes}` : minutes;
                const sStr = seconds < 10 ? `0${seconds}` : seconds;
                setCountdownString(`${hStr}:${mStr}:${sStr}`);
            }
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }
  }, [license]);

  const renderLicenseBadge = () => {
    if (!license) return null; 

    let badgeClass = "";
    let icon = null;
    let text = "";

    switch (license.type) {
      case "TECHNICIAN":
        badgeClass = "bg-purple-500/10 border-purple-500/30 text-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.2)] animate-pulse";
        icon = <ShieldCheck size={12} className="text-purple-500" fill="currentColor"/>;
        text = "Technician Mode";
        break;

      case "RE_4H":
        badgeClass = "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.2)]";
        icon = <Timer size={12} className="text-orange-500 animate-spin-slow" />; 
        text = countdownString ? countdownString : "Rescue Mode";
        break;

      case "PRO":
      case "PRO_6M":
        badgeClass = "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]";
        icon = <Crown size={12} className="text-indigo-500" fill="currentColor"/>;
        text = "Pro License";
        break;

      case "SHOP_SMALL":
      case "SHOP_BIG":
        badgeClass = "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]";
        icon = <Store size={12} className="text-orange-500" />;
        text = license.type === "SHOP_BIG" ? "Shop Lớn (VIP)" : "Shop License";
        break;

      case "WHITE_LABEL":
        badgeClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]";
        icon = <Building2 size={12} className="text-emerald-500" />;
        text = "White Label (VIP)";
        break;

      default:
        badgeClass = "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400";
        icon = <Clock size={12} />;
        text = `Dùng thử: ${license.days_left} ngày`;
        if (license.days_left <= 0) {
           badgeClass = "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.2)]";
           text = "Hết hạn";
        }
        break;
    }

    return (
    <div className="h-screen w-screen text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-300 selection:bg-indigo-500/30 bg-[#F4F5F8] dark:bg-[#0D0E15]">
      <main className="relative z-10 flex-1 flex flex-col w-full h-full overflow-hidden">
          {children}
      </main>
    </div>
  );
  };

  return (
    <div className="h-screen w-screen text-slate-900 dark:text-slate-200 overflow-hidden font-sans transition-colors duration-300 selection:bg-indigo-500/30 flex flex-col
        bg-white
        bg-[radial-gradient(at_0%_0%,_rgba(99,102,241,0.16)_0px,_transparent_58%),radial-gradient(at_100%_0%,_rgba(239,68,68,0.12)_0px,_transparent_52%),radial-gradient(at_100%_100%,_rgba(168,85,247,0.14)_0px,_transparent_58%),radial-gradient(at_0%_100%,_rgba(14,165,233,0.12)_0px,_transparent_56%)]
        dark:bg-[#020617]
        dark:bg-[radial-gradient(at_0%_0%,_rgba(79,70,229,0.42)_0px,_transparent_68%),radial-gradient(at_100%_0%,_rgba(220,38,38,0.20)_0px,_transparent_54%),radial-gradient(at_100%_100%,_rgba(126,34,206,0.34)_0px,_transparent_66%),radial-gradient(at_0%_100%,_rgba(8,145,178,0.28)_0px,_transparent_64%)]
    ">
      <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMTUwLCAxNTAsIDE1MCwgMC4wNSkiLz48L3N2Zz4=')] opacity-100"></div>
      
      

      <main className="relative z-10 flex-1 flex flex-col w-full h-full overflow-hidden">
        <div className="flex-1 z-10 w-full h-full flex flex-col relative overflow-hidden">
            {children}
        </div>
      </main>
    </div>
  );
}