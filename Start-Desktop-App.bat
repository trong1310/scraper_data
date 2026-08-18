@echo off
chcp 65001 >nul
title Mafengwo Scraper Pro - Khoi Dong Ung Dung
echo ======================================================================
echo           MAFENGWO SCRAPER PRO - UNG DUNG KEO BAI VIET
echo ======================================================================
echo  [1/2] Dang kiem tra moi truong...
cd /d "%~dp0"

if not exist "node_modules\electron" (
  echo  [!] Dang cai dat thu vien phu thuoc...
  call npm install
)

echo  [2/2] Dang khoi chay ung dung Desktop...
npx electron .
exit
