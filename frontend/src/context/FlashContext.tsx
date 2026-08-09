import React, { createContext, useContext, useEffect, useState } from 'react';
import { EventsOn } from "../../wailsjs/runtime/runtime";

export interface FlashContextType {
  isFlashing: boolean;
}

const FlashContext = createContext<FlashContextType>({ isFlashing: false });

export const FlashProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    // Khi nhận được flash_progress → flash đang chạy
    const offProgress = EventsOn("flash_progress", () => {
      setIsFlashing(true);
    });

    // Khi nhận được flash_complete → flash đã kết thúc
    const offComplete = EventsOn("flash_complete", () => {
      setIsFlashing(false);
    });

    return () => {
      if (offProgress) offProgress();
      if (offComplete) offComplete();
    };
  }, []);

  return (
    <FlashContext.Provider value={{ isFlashing }}>
      {children}
    </FlashContext.Provider>
  );
};

export const useFlash = () => useContext(FlashContext);
