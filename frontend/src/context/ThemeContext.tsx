import React, { createContext, useContext, useEffect, useState } from 'react';

// Danh sách các màu hỗ trợ
export type ThemeColor = 'cyan' | 'blue' | 'purple' | 'orange' | 'rose' | 'emerald';

export interface ThemeContextType {
  theme: string;
  setTheme: (t: string) => void;
  color: string;      // Phải là 'color' để khớp với SettingsModal
  setColor: (c: string) => void;
} // [FIX] Đã thêm dấu đóng ngoặc ở đây

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // 1. Logic cho Dark/Light Mode (Đã bổ sung để hết lỗi undefined)
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');

    useEffect(() => {
        const root = document.documentElement;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const isDark = theme === "dark" || (theme === "system" && prefersDark);
        root.classList.toggle("dark", isDark);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 2. Logic cho Accent Color (Màu chủ đạo)
    const [color, setColorState] = useState<ThemeColor>(() => {
        return (localStorage.getItem('theme-color') as ThemeColor) || 'cyan';
    });

    useEffect(() => {
        const root = document.documentElement;
        
        // Xóa sạch các class theme cũ
        root.classList.remove('theme-cyan', 'theme-blue', 'theme-purple', 'theme-orange', 'theme-rose', 'theme-emerald');
        
        // Thêm class theme mới
        root.classList.add(`theme-${color}`);
        
        // Lưu vào bộ nhớ
        localStorage.setItem('theme-color', color);
    }, [color]);

    const setColor = (c: string) => setColorState(c as ThemeColor);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, color, setColor }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Hook để dùng ở mọi nơi
export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};