@echo off
setlocal enabledelayedexpansion
title Mafengwo Scraper Pro - Trinh Dong Goi Gui Khach

echo ===============================================================================
echo            MAFENGWO SCRAPER PRO - DONG GOI BAN PHAT HANH CHO NGUOI DUNG
echo ===============================================================================
echo.
echo [1/4] Kiem tra thu vien va moi truong...

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [THONG BAO] Dang cai dat thu vien npm install...
    call npm install
    if errorlevel 1 (
        echo [LOI] Khong the cai dat thu vien.
        pause
        exit /b 1
    )
)

echo [2/4] Tien hanh dong goi file thuc thi Portable .exe...
echo Vui long doi trong giay lat...
echo.

call npm run build

if errorlevel 1 (
    echo.
    echo ===============================================================================
    echo [LOI] Qua trinh dong goi that bai!
    echo ===============================================================================
    pause
    exit /b 1
)

echo.
echo [3/4] Tao thu muc Release doc lap de gui cho nguoi khac...

set "SOURCE_EXE=%~dp0dist\Mafengwo Scraper Pro.exe"
set "RELEASE_DIR=%~dp0Release_Mafengwo_Scraper"
set "ZIP_FILE=%~dp0Mafengwo_Scraper_Pro_Portable.zip"

if not exist "%SOURCE_EXE%" (
    echo [LOI] Khong tim thay file build trong dist.
    pause
    exit /b 1
)

:: Xoa thu muc va file zip cu neu co
if exist "%RELEASE_DIR%" rd /s /q "%RELEASE_DIR%"
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"

:: Tao thu muc Release moi va cac thu muc data, logError san sang
mkdir "%RELEASE_DIR%"
mkdir "%RELEASE_DIR%\data"
mkdir "%RELEASE_DIR%\logError"

:: Tao file placeholder de giu thu muc khi nen Zip
echo Folder tu dong luu bai viet cao duoc > "%RELEASE_DIR%\data\.gitkeep"
echo Folder tu dong luu log loi theo ngay > "%RELEASE_DIR%\logError\.gitkeep"

:: Sao chep file .exe va file huong dan su dung
copy /y "%SOURCE_EXE%" "%RELEASE_DIR%\Mafengwo Scraper Pro.exe" >nul
if exist "%~dp0HUONG_DAN_SU_DUNG.txt" (
    copy /y "%~dp0HUONG_DAN_SU_DUNG.txt" "%RELEASE_DIR%\HUONG_DAN_SU_DUNG.txt" >nul
)

:: Giu 1 ban .exe truc tiep o thu muc goc project va tren Desktop
copy /y "%SOURCE_EXE%" "%~dp0Mafengwo Scraper Pro.exe" >nul
copy /y "%SOURCE_EXE%" "C:\Users\vantr\OneDrive\Desktop\Mafengwo Scraper Pro.exe" >nul

echo [4/4] Tu dong nen file Zip de tien gui qua Zalo / Telegram / Drive...
powershell -Command "Compress-Archive -Path '%RELEASE_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force" >nul 2>&1

echo.
echo ===============================================================================
echo             🎉 TAO BAN PHAT HANH (RELEASE) GUI NGUOI KHAC THANH CONG! 🎉
echo ===============================================================================
echo.
echo Ban co the gui cho nguoi khac 1 trong 2 lua chon sau (khong lo lo source code):
echo.
echo 1. Thu muc doc lap: 
echo    %RELEASE_DIR%
echo.
echo 2. File Zip gon nhe de gui qua Zalo/Drive:
echo    %ZIP_FILE%
echo.
echo (Cua so thu muc se tu dong mo len de ban lay file gui di)
echo ===============================================================================

:: Mo thu muc Release trong Windows Explorer
explorer "%RELEASE_DIR%"

echo.
echo Nhan phim bat ky de ket thuc...
pause >nul
