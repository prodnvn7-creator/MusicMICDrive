@echo off
title Push Music Melting Drive to GitHub
echo ========================================================
echo    DANG CHUAN BI DAY CODE LEN GITHUB
echo    Repository: https://github.com/prodnvn7-creator/MusicMICDrive-.git
echo ========================================================
echo.
echo Luu y ve xac thuc GitHub:
echo - GitHub yeu cau dung Personal Access Token (PAT) lam mat khau.
echo - Tao token nhanh tai: https://github.com/settings/tokens (tich chon 'repo')
echo.
set /p GITHUB_TOKEN="Nhap GitHub Personal Access Token (hoac an Enter de nhap truc tiep): "

if "%GITHUB_TOKEN%"=="" (
  echo Dang push bang Git thong thuong...
  "C:\MinGit\cmd\git.exe" push -u origin main
) else (
  echo Dang push len GitHub...
  "C:\MinGit\cmd\git.exe" push -u https://%GITHUB_TOKEN%@github.com/prodnvn7-creator/MusicMICDrive-.git main
)

if %errorlevel% equ 0 (
  echo.
  echo ========================================================
  echo [THANH CONG] Code da duoc day len GitHub thanh cong!
  echo ========================================================
  echo Cac buoc de bat dau dung tren dien thoai:
  echo 1. Vao: https://github.com/prodnvn7-creator/MusicMICDrive-/settings/pages
  echo 2. Tai muc 'Build and deployment' ^> Source chon 'Deploy from a branch'
  echo 3. Chon Branch: 'main' ^> Nhan 'Save'
  echo 4. Cho khoang 1-2 phut, link PWA se san sang tai:
  echo    https://prodnvn7-creator.github.io/MusicMICDrive-/
  echo 5. Mo link tren tren Safari (iOS) hoac Chrome (Android) va chon:
  echo    'Them vao Man hinh chinh' (Add to Home Screen) de dung Offline!
  echo ========================================================
) else (
  echo.
  echo [LOI] Push chua thanh cong. Vui long kiem tra lai Token hoac quyen truy cap.
)
echo.
pause
