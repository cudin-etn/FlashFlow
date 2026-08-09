####
## FLASHFLOW INSTALLER SCRIPT (FIXED V4 - PRO EDITION)
## Fix lỗi PnPUtil Subdirs, dọn rác Uninstall và chống khóa Fastboot
####

!include "wails_tools.nsh"

VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"
VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

ManifestDPIAware true
RequestExecutionLevel admin

!include "MUI.nsh"
!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
    !define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe"
InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
ShowInstDetails show

Function .onInit
    !insertmacro wails.checkArchitecture
    # Kill app chính, adb và fastboot để giải phóng file 100% trước khi ghi đè
    nsExec::Exec 'taskkill /F /IM "${PRODUCT_EXECUTABLE}" /T'
    nsExec::Exec 'taskkill /F /IM adb.exe /T'
    nsExec::Exec 'taskkill /F /IM fastboot.exe /T'
    Sleep 3000
FunctionEnd

Section "MainSection" SEC01
    SetOutPath $INSTDIR

    # --- 1. WEBVIEW2 ---
    !insertmacro wails.webview2runtime

    # --- 2. CÀI APP CHÍNH (Ghi đè thủ công, né lỗi macro) ---
    SetOverwrite on
    File "/oname=${PRODUCT_EXECUTABLE}" "${ARG_WAILS_AMD64_BINARY}"

    # --- 3. CÀI TOOLS/DLLs ---
    SetOverwrite try
    DetailPrint "Updating Tools & Resources..."
    SetOutPath "$INSTDIR\tools\win"
    File /r "..\..\..\tools\win\*"
    
    # --- 4. DRIVERS (Sử dụng cờ /subdirs chuẩn Windows) ---
    SetOverwrite on
    DetailPrint "Installing Google Drivers..."
    nsExec::ExecToLog 'pnputil.exe /add-driver "$INSTDIR\tools\win\driver\google\usb_driver\*.inf" /subdirs /install'

    DetailPrint "Installing OnePlus Drivers..."
    ExecWait '"$INSTDIR\tools\win\driver\oneplus\oneplus.exe" /S'
    nsExec::ExecToLog 'pnputil.exe /add-driver "$INSTDIR\tools\win\driver\oneplus\Fastboot\*.inf" /subdirs /install'
    
    # --- 5. TẠO SHORTCUT ---
    SetOutPath "$INSTDIR"
    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext
    
    # Kill process trước khi xóa
    nsExec::Exec 'taskkill /F /IM "${PRODUCT_EXECUTABLE}" /T'
    nsExec::Exec 'taskkill /F /IM adb.exe /T'
    nsExec::Exec 'taskkill /F /IM fastboot.exe /T'
    Sleep 1000
    
    # Dọn dẹp rác AppData (Sửa thành tên Product thay vì đuôi .exe)
    RMDir /r "$AppData\${INFO_PRODUCTNAME}"
    RMDir /r "$LOCALAPPDATA\${INFO_PRODUCTNAME}" 
    
    # Xóa thư mục cài đặt và Shortcut
    RMDir /r $INSTDIR
    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"
    
    !insertmacro wails.deleteUninstaller
SectionEnd