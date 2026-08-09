import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
// [MỚI] Import Provider ngôn ngữ
import { LanguageProvider } from './i18n/LanguageContext'; 
// [QUAN TRỌNG] Import Provider màu sắc (Fix lỗi màn hình đen)
import { ThemeProvider } from './context/ThemeContext';
// [MỚI] Import Provider trạng thái flash (disable UI khi đang flash)
import { FlashProvider } from './context/FlashContext';

// Hàm này giúp áp dụng Dark/Light mode ngay lập tức khi mở App (tránh bị nháy trắng)
function applyInitialTheme() {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    let theme = saved || "system";
    let isDark = theme === "dark" || (theme === "system" && prefersDark);

    const html = document.documentElement;
    html.classList.toggle("dark", isDark);
}

// Chạy logic theme ngay lập tức
applyInitialTheme();

const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
    <React.StrictMode>
        {/* Bọc LanguageProvider ra ngoài cùng */}
        <LanguageProvider>
            {/* [FIX] Bọc ThemeProvider vào trong để App và SettingsModal dùng được màu sắc */}
            <ThemeProvider>
                {/* [MỚI] FlashProvider theo dõi trạng thái flash để disable UI */}
                <FlashProvider>
                    <App />
                </FlashProvider>
            </ThemeProvider>
        </LanguageProvider>
    </React.StrictMode>
)