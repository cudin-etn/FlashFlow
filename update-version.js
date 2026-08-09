const fs = require('fs');
const path = require('path');

// Lấy version từ tham số dòng lệnh (Ví dụ: node update-version.js 1.0.2)
const newVersion = process.argv[2];

if (!newVersion) {
    console.error('❌ Lỗi: Vui lòng nhập version mới. Ví dụ: node update-version.js 1.0.2');
    process.exit(1);
}

// Hàm hỗ trợ đọc/ghi file
function updateFile(filePath, regex, replacement, fileDescription) {
    try {
        const fullPath = path.join(__dirname, filePath);
        if (!fs.existsSync(fullPath)) {
            console.warn(`⚠️  Không tìm thấy file ${fileDescription} tại: ${filePath}`);
            return;
        }

        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Kiểm tra xem pattern có khớp không trước khi thay thế
        if (!regex.test(content)) {
            console.warn(`⚠️  Không tìm thấy chuỗi version cũ trong ${fileDescription}. (File: ${filePath})`);
            return;
        }

        const newContent = content.replace(regex, replacement);
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`✅ Đã cập nhật ${fileDescription} -> v${newVersion}`);
    } catch (error) {
        console.error(`❌ Lỗi khi cập nhật ${fileDescription}:`, error.message);
    }
}

console.log(`🚀 Bắt đầu cập nhật version lên: ${newVersion}...\n`);

// 1. Cập nhật wails.json
// Tìm dòng: "version": "x.x.x" và "productVersion": "x.x.x"
updateFile(
    'wails.json',
    /"version":\s*"[^"]*"/,
    `"version": "${newVersion}"`,
    'File Cấu hình (wails.json)'
);

updateFile(
    'wails.json',
    /"productVersion":\s*"[^"]*"/,
    `"productVersion": "${newVersion}"`,
    'macOS productVersion (wails.json)'
);

// 2. Cập nhật Frontend
// Tìm dòng hiển thị vX.X.X trong thẻ span
// Regex này tìm chữ v theo sau bởi số và chấm
[
    'frontend/src/components/DashboardPage.tsx',
    'frontend/src/components/FlashWizard.tsx',
].forEach((filePath) => {
    updateFile(
        filePath,
        /v\d+\.\d+\.\d+/g,
        `v${newVersion}`,
        `Frontend UI (${filePath})`
    );
});

// 3. Cập nhật Backend (app.go)
// Tìm dòng: const CurrentVersion = "x.x.x"
updateFile(
    'app.go',
    /const CurrentVersion = "[^"]*"/,
    `const CurrentVersion = "${newVersion}"`,
    'Backend Logic (app.go)'
);

// 4. Cập nhật script release
updateFile(
    'build_release.sh',
    /VERSION="[^"]*"/,
    `VERSION="${newVersion}"`,
    'Build Release Script (build_release.sh)'
);

console.log('\n✨ Hoàn tất! Hãy chạy lệnh build ngay đi anh.');
