# Music MIC Driver — PROGRESS

> Build: **42** (`APP_BUILD` / `version.json` / `sw.js` CACHE `mm-drive-cache-v42` / `index.html?v=42`)  
> Repo: https://github.com/prodnvn7-creator/MusicMICDrive  
> PWA: https://prodnvn7-creator.github.io/MusicMICDrive/  
> Cập nhật inventory: **2026-10-28**

---

## QUY TẮC BẮT BUỘC

1. **100% code / file / UI / tính năng đã có = VÙNG CẤM ĐỤNG.**
2. **Chỉ sửa khi user yêu cầu đích danh** đúng tính năng / file / màn hình đó. Không đụng chỗ khác.
3. **Cấm** tự ý: xóa code đang chạy · đổi tên file/id DOM/IndexedDB/API plugin · đổi cấu trúc thư mục · refactor “cho sạch” · sửa kèm ngoài phạm vi yêu cầu.
4. Inventory dưới đây = baseline ổn định. Sửa ngoài phạm vi yêu cầu = vi phạm.
5. Nguồn chỉnh ở **root** (`index.html`, `app.js`, `style.css`, `sw.js`…). `www/` là bản `build.js` — không sửa tay trừ khi đang ship.
6. **Onboarding / tip / toast trạng thái / sheet hướng dẫn = CHỈ 1 LẦN.**
   - Hiện xong → ghi cờ (`localStorage`) ngay.
   - **Cấm nhắc lại** mỗi lần mở app, reload, hay quay lại màn hình.
   - Cờ đang dùng: `mm_ios_install_v1`, `mm_duration_fix_toast_v1`.

---

## TRẠNG THÁI MỚI NHẤT (build 42)

### Đã làm xong (2026-10-28)

| Mục | Chi tiết |
|-----|----------|
| **Quyền Downloads “Cho phép 1 lần”** | Chrome tab thường **không** giữ quyền FS vĩnh viễn (chỉ đến khi đóng hết tab). App copy bài sang **OPFS** sau khi user Cho phép → lần sau phát từ OPFS, **không hỏi lại**. |
| **`ensureSongPlayable`** | Ưu tiên: `opfsName` → `_sessionFile` / `audioBlob` → mới tới `fileHandle` (+ `requestPermission` chỉ khi thật sự cần). |
| **`persistSongsToOpfsBackground`** | Copy cả bài có `fileHandle` nếu `queryPermission === 'granted'` — **không** gọi `requestPermission` trong nền. |
| **`queueOpfsBackupForLibrary`** | Hàng đợi 1 lần: backup OPFS toàn thư viện thiếu `opfsName`. |
| **Boot / `reindexFromSavedDirHandle({ silent })`** | Chỉ `queryPermission` — **không** tự hiện hộp “Cho phép xem và sao chép tệp” lúc mở app. |
| **Import / quét thư mục** | Giữ `_sessionFile` ngay khi nạp → copy OPFS trong phiên Cho phép. |
| **iOS install sheet** | Ghi `mm_ios_install_v1` **ngay khi hiện** → không nhắc lại. |
| **Toast boot** | Bỏ toast `Thư viện: N bài` mỗi lần mở. Toast sửa thời lượng tối đa 1 lần (`mm_duration_fix_toast_v1`). |
| **Ship stamp** | `APP_BUILD` / `version.json` / `sw.js` / `?v=` = **42**; đã `node build.js` → `www/`. |

### Cách dùng đúng (PWA Chrome)

1. Quét / chọn Downloads hoặc thư mục → bấm **Cho phép** (nếu Chrome hỏi).
2. Đợi toast kiểu **“Lưu bền xong…”** / copy nền xong.
3. Thoát app → mở lại: phát bình thường, **không** bị hỏi lại quyền Downloads (nếu đã có `opfsName`).
4. Nên **Cài đặt ứng dụng** (PWA standalone) — Chrome giữ quyền FS tốt hơn trên app đã cài; OPFS vẫn là đường chính để khỏi phụ thuộc hộp thoại.

### Remote

- Đã push **build 42** lên `origin/main` (2026-10-28). GitHub Pages sẽ phục vụ bản mới sau khi deploy xong (~1–2 phút).

---

## [VÙNG CẤM ĐỤNG - ĐANG CHẠY TỐT]

### A. File & cấu trúc

#### Web / PWA (nguồn — root)

| File | Vai trò |
|------|---------|
| `index.html` | Shell UI (`?v=42`) |
| `app.js` | Logic app — build **42** |
| `style.css` | Style custom |
| `sw.js` | Service Worker `mm-drive-cache-v42` |
| `version.json` | `{ "build": 42, "name": "Music MIC Driver" }` |
| `manifest.json` | PWA manifest |
| `jsmediatags.min.js` | ID3 |
| `tailwind.js` | Tailwind runtime |
| `logo.png` / `favicon.png` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` | Brand & icons |
| `build.js` | Copy → `www/` |
| `server.js` | Local static server |
| `start.bat` / `push_to_github.bat` | Script Windows |
| `package.json` / `package-lock.json` | Node deps |
| `capacitor.config.json` | Capacitor |
| `.nojekyll` | GitHub Pages |
| `.well-known/assetlinks.json` | Android App Links |
| `.gitignore` | Ignore |
| `README.md` | Mô tả |
| `PROGRESS.md` | File này |

#### Đồng bộ Capacitor

| Path | Vai trò |
|------|---------|
| `www/**` | Copy web assets — **không chỉnh tay** |
| `android/app/src/main/assets/public/**` | Copy trong APK — đồng bộ qua Capacitor sync |

#### Android (Capacitor)

| Path | Vai trò |
|------|---------|
| `android/.../MainActivity.java` | Activity Capacitor |
| `android/.../MediaStoreScannerPlugin.java` | Quét MediaStore + rescan thư mục |
| `android/.../AndroidManifest.xml` | Quyền audio/storage |
| `android/.../res/**` | Layout, strings, icons, splash, `file_paths.xml` |
| `android/**/*.gradle` / `gradle.properties` / `gradlew*` / `gradle/wrapper/**` | Build |
| `android/app/proguard-rules.pro` | Proguard |
| `android/**/test/**` / `androidTest/**` | Test mẫu |
| `android/.gitignore` | Ignore |

#### IDE local

| Path | Vai trò |
|------|---------|
| `.idea/**` | JetBrains/Android Studio — không phải runtime |

---

### B. UI đang có

#### Nền & khung
- Mesh `meshBlob1/2/3` + overlay
- App wrapper + safe-area iOS

#### Header thư viện
- Logo/brand: `headerLogoBtn`, `headerLogo`
- `scanMusicBtn` / `pickFileBtn` / `libraryOptionsBtn`
- `searchInput` + `clearSearchBtn`
- `trackCountBadge` / `storageInfoBadge`
- `quickShuffleAllBtn`

#### Thư viện `libraryView`
- Empty: `emptyState`, `emptyStateScanBtn`, `emptyStatePickFileBtn`
- List: `trackList` (cover, title, artist, duration, xóa, soundwave)

#### Mini player `miniPlayerDock`
- `miniPlayerCard`, `miniProgressBar`, `miniCover` / `miniTitle` / `miniArtist`
- `miniPlayBtn` / `miniNextBtn` → mở Full Player

#### Full Player `fullPlayer`
- Backdrop: `fullPlayerBackdropBlur`
- Đóng vuốt: `fpDragSurface`, `swipeHandle`, `closeFullPlayerBtn`
- Queue: `openQueueBtn`
- Artwork: `artworkContainerBtn`, `fullCover`, `changeCoverBadgeBtn`, `coverPickerInput`
- `fullTitle` / `fullArtist` / `favoriteBtn`
- Seek: `seekBar`, `currentTimeDisplay`, `remainingTimeDisplay`
- Controls: `shuffleBtn`, `prevBtn`, `bigPlayBtn`, `nextBtn`, `repeatBtn`
- `volumeBar`

#### Khác
- Queue: `queueDrawer`, `queueList`, `queueSubtitle`, `closeQueueBtn`
- Scan modal: `scanSourceModal` (+ Downloads / Folder / Cancel)
- Options: `optionsModal` (quét / thêm / xóa all / đóng)
- Toast: `toast`, `toastIcon`, `toastMsg`
- Progress: `scanProgressOverlay` + bar/count/pct/title/sub/file
- Audio ẩn: `deckA`, `deckB`
- Input ẩn: `scanAudioInput`, `scanFolderInput`, `freeFileInput`, `downloadsFileInput`
- iOS install **1 lần**: `iosInstallSheet`, `iosInstallClose`, `iosInstallGotIt` — cờ `mm_ios_install_v1` (ghi khi **hiện**, không chỉ khi dismiss)

---

### C. Tính năng / logic đang có

#### Thư viện & lưu (build 42)
- IndexedDB `MusicMeltingDriveDB` (songs + settings) — **không** nhét blob GB vào IDB
- File System Access handles · **OPFS là nguồn phát bền** · `navigator.storage.persist()`
- Setting `libraryDirHandle` — chỉ reindex khi permission còn trong phiên; boot silent không prompt
- `queueOpfsBackupForLibrary` + `persistSongsToOpfsBackground`
- Khôi phục: OPFS / handle (nếu còn grant) / native URI
- Demo `?demo=1`

#### Quét / thêm
- PWA: chọn nhiều file Downloads; snapshot `FileList` trước await
- PWA: chọn thư mục đệ quy (+ `webkitdirectory`) / `showDirectoryPicker` (desktop)
- Sau import: giữ `_sessionFile` → copy OPFS trong phiên Cho phép
- Nhận diện audio: MIME · đuôi · magic bytes
- APK: `MediaStoreScanner` + rescan Downloads/Music/Zalo…
- Refresh MediaStore khi resume (throttle)
- Progress UI khi quét

#### Phát
- Dual-deck seamless handoff / crossfade
- Seamless Smart Shuffle
- Repeat off / all / one
- Volume + compressor leveling + soft ramps + DJ FX
- Media Session
- Preload / refine queue
- Đổi cover · Favorite
- `ensureSongPlayable`: **OPFS trước**, Downloads handle sau

#### Thời lượng
- Chuẩn hóa giây · `sanitizeSongDuration`
- Parse header MP3/WAV/FLAC/M4A · probe audio
- Repair boot + background; toast sửa thời lượng **tối đa 1 lần** (`mm_duration_fix_toast_v1`)

#### PWA / nền tảng
- SW + `version.json` auto-update (build **42**)
- Capacitor Android + MediaStore plugin
- `server.js` / `npm start` · `build.js` → `www/`

#### UX phụ — one-shot
- Tìm kiếm · xóa từng bài / all · toast theo **hành động** (không spam lúc boot)
- Page Visibility · drag-drop desktop
- iOS Add-to-Home-Screen: hiện **1 lần** rồi thôi
- Không toast `Thư viện: N bài` mỗi lần mở (badge đã đủ)

---

### D. Vận hành (không phải license sửa code)

- Ship: bump đồng bộ `APP_BUILD` + `version.json` + `sw.js` CACHE + `?v=` trong `index.html`
- PWA Chrome không quét kín máy — phải chọn file/thư mục; APK dùng MediaStore
- Hộp Chrome “Cho phép xem và sao chép tệp” = quyền FS tạm của trình duyệt; app vượt bằng **OPFS**, không “ép” Chrome nhớ vĩnh viễn trên tab thường

---

*Inventory khóa tại build 42 — toàn bộ mục trên = VÙNG CẤM cho đến khi có yêu cầu sửa đích danh.*
