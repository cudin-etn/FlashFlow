import { useState, useEffect } from "react";
import AppShell from "./components/AppShell";
import Dashboard from "./components/DashboardPage";
import FlashWizard from "./components/FlashWizard";
import { BrandSelectionModal, BRAND_STORAGE_KEY, SKIP_BRAND_MODAL_KEY } from "./components/dashboard/BrandSelectionModal"; 
import { EventsOn } from "../wailsjs/runtime/runtime";
import { main } from "../wailsjs/go/models";
import { SetDeviceBrand } from "../wailsjs/go/main/App";
// Giữ lại import Icon nếu các component khác cần, nếu không có thể xóa bớt
import { Smartphone, Zap, Aperture, Scan } from "lucide-react";

// Trạng thái màn hình chính của app
type AppView = "dashboard" | "wizard-ai" | "wizard-manual";

// Animation rung lắc (Giữ nguyên style cũ của App)
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes scan-pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
  .scan-glow { animation: scan-pulse 3s infinite ease-in-out; }
`;
document.head.appendChild(styleTag);

function App() {
  const [currentView, setCurrentView] = useState<AppView>("dashboard");
  const [selectedFile, setSelectedFile] = useState<string>("");
  
  // State thiết bị cơ bản
  const [deviceStatus, setDeviceStatus] = useState<{ connected: boolean; mode: string }>({
    connected: false,
    mode: "Mất kết nối",
  });

  // State cho mode switching loading
  const [modeSwitching, setModeSwitching] = useState<{ active: boolean; target: string }>({
    active: false,
    target: "",
  });
  
  const [brand, setBrand] = useState<string | null>(() => {
    // Check if user previously saved a brand preference
    const skipModal = localStorage.getItem(SKIP_BRAND_MODAL_KEY);
    if (skipModal === 'true') {
      const savedBrand = localStorage.getItem(BRAND_STORAGE_KEY);
      if (savedBrand) {
        // Set brand in backend on startup
        try {
          SetDeviceBrand(savedBrand);
        } catch (err) {
          console.error("Failed to set saved device brand in backend", err);
        }
        return savedBrand;
      }
    }
    return null;
  });
  const [showBrandModal, setShowBrandModal] = useState<boolean>(() => {
    // Skip modal if user previously chose "Don't ask again"
    const skipModal = localStorage.getItem(SKIP_BRAND_MODAL_KEY);
    if (skipModal === 'true' && localStorage.getItem(BRAND_STORAGE_KEY)) {
      return false;
    }
    return true;
  });

  // [LOGIC GỐC] Hàm xử lý chọn Brand - GIỮ NGUYÊN 100%
  const handleChooseBrand = (chosen: string) => {
    // Gọi xuống Backend để set profile
    try {
      SetDeviceBrand(chosen);
    } catch (err) {
      console.error("Failed to set device brand in backend", err);
    }
    
    // Cập nhật UI
    setBrand(chosen);
    setShowBrandModal(false);
  };

  useEffect(() => {
    const off = EventsOn("device_update", (info: main.DeviceInfo) => {
      if (!info || !info.connected) {
        setDeviceStatus({ connected: false, mode: "Mất kết nối" });
        return;
      }
      const mode = info.state || "device";
      setDeviceStatus({
        connected: true,
        mode,
      });
      // Clear mode switching when device reconnects
      setModeSwitching({ active: false, target: "" });
    });

    const offModeSwitching = EventsOn("device_mode_switching", (payload: { target: string }) => {
      setModeSwitching({ active: true, target: payload?.target || "" });
    });

    const offModeSwitchDone = EventsOn("device_mode_switch_done", (payload: any) => {
      setModeSwitching({ active: false, target: "" });
    });

    return () => {
      if (off) off();
      if (offModeSwitching) offModeSwitching();
      if (offModeSwitchDone) offModeSwitchDone();
    };
  }, []);

  // Luồng AI Wizard
 const handleStartAIMode = (libraryPath?: string) => {
    if (libraryPath) {
        setSelectedFile(libraryPath);
    } else {
        setSelectedFile("");
    }
    setCurrentView("wizard-ai");
  };

  // Quay về Dashboard
  const handleExitWizard = () => {
    setSelectedFile("");
    setCurrentView("dashboard");
  };

  return (
    <>
      <AppShell deviceStatus={deviceStatus}>
        {/* 1. DASHBOARD */}
        {currentView === "dashboard" && (
          <Dashboard 
            onStartAIMode={handleStartAIMode}
            brandSelected={!!brand} 
          />
        )}

        {/* 2. AUTO FLASH WIZARD */}
        {currentView === "wizard-ai" && (
          <FlashWizard mode="ai" filePath={selectedFile} onExit={handleExitWizard} />
        )}

        {/* 3. LEGACY MANUAL WIZARD */}
        {currentView === "wizard-manual" && (
          <FlashWizard mode="manual" filePath={selectedFile} onExit={handleExitWizard} />
        )}
      </AppShell>

      {/* --- BRAND SELECTION MODAL (NEW UI) --- */}
      {/* Thay thế hoàn toàn khối div popup cũ bằng Component mới */}
      <BrandSelectionModal 
          isOpen={showBrandModal} 
          onSelect={handleChooseBrand} 
      />
    </>
  );
}

export default App;
