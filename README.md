# 🎵 Music Melting Drive (MM Drive)
> **Trình phát nhạc Offline cá nhân theo chuẩn PWA mang phong cách iOS Apple Music.**

Ứng dụng chạy mượt mà trên cả **iOS (Safari)** và **Android (Chrome)**, có thể cài đặt trực tiếp vào màn hình chính (Add to Home Screen) và hoạt động **100% Offline**.

---

## ✨ Tính Năng Nổi Bật

### 1. Thương hiệu & Giao diện chuẩn Apple Music (iOS UI)
- **Tên ứng dụng**: `Music Melting Drive` (Tên ngắn hiển thị màn hình chính: `MM Drive`).
- **Logo Placeholder**: File [logo.png](file:///c:/Users/Administrator/Desktop/Nghe%20nhac%20truc%20tuyen/logo.png) đặt tại góc trên thanh tiêu đề và dùng làm ảnh bìa mặc định khi bài hát không có cover (bạn có thể thay thế bằng ảnh của bạn bất cứ lúc nào).
- **Dynamic Mesh Gradient**: Nền kính mờ chuyển động mượt mà (`Glassmorphism` + `backdrop-filter: blur`), tự động trích xuất và biến đổi theo tông màu ảnh bìa (Artwork) của bài hát đang phát.
- **Hiệu ứng Artwork chuẩn iOS**: Bo góc mềm mại (`rounded-3xl`), tự động phóng to và đổ bóng sâu phát sáng rực rỡ khi **Play**, thu nhỏ nhẹ và giảm bóng khi **Pause**.
- **Font & Điều khiển iOS**: Font hệ thống `-apple-system`, SF Pro, thanh Seekbar tinh tế, các nút bấm tròn chuẩn Apple Music.
- **Cử chỉ vuốt (Gesture)**: 
  - Vuốt lên từ Mini Player để mở trình phát toàn màn hình (Full Player).
  - Vuốt thanh kéo xuống (Grab handle) để thu gọn thành Mini Player.

### 2. Chuyển bài mượt mà (Crossfade 3s) & Phát ngẫu nhiên (Smart Shuffle)
- **Smart Shuffle**: Áp dụng thuật toán **Fisher-Yates** xáo trộn danh sách thông minh, không bị lặp lại bài vừa nghe trong suốt chu kỳ phát.
- **Crossfade 3 giây**: 
  - Khi bài hiện tại còn 3 giây cuối (hoặc khi bấm Next), bài tiếp theo sẽ tự động fade-in với âm lượng tăng dần trong khi bài cũ fade-out giảm dần.
- **Kiến trúc âm thanh 2 Deck (Deck A & Deck B) tối ưu cho iOS**:
  - **Khi mở màn hình (`!document.hidden`)**: Chạy chế độ Crossfade mượt mà bằng việc luân phiên 2 thẻ `<audio>` và điều chỉnh volume.
  - **Khi tắt màn hình / chạy ngầm (`document.hidden === true`)**: Tự động chuyển sang chế độ **Direct / Gapless transition** để tránh lỗi iOS Safari chặn AudioContext hoặc khóa thuộc tính volume khi khóa máy, đảm bảo nhạc phát liên tục không bao giờ bị ngắt.

### 3. Lưu trữ Offline (IndexedDB) & Điều khiển chạy ngầm (Media Session API)
- **Hỗ trợ định dạng**: `.mp3, .wav, .flac, .m4a, .aac, .ogg`.
- **Tự động đọc thẻ ID3**: Sử dụng thư viện `jsmediatags` để trích xuất tên bài hát, nghệ sĩ, album và ảnh bìa.
- **Lưu trực tiếp vào IndexedDB**: Dữ liệu âm thanh và ảnh bìa được lưu vĩnh viễn trên máy của bạn. Mở app lần sau tự động có sẵn mà không cần mạng.
- **Media Session API**: Đồng bộ thông tin tên bài, nghệ sĩ, ảnh bìa và hỗ trợ đầy đủ các nút bấm Play/Pause/Next/Prev/Seek trên màn hình khóa của iPhone và Android.
- **Chuẩn PWA 100% Offline**: File [manifest.json](file:///c:/Users/Administrator/Desktop/Nghe%20nhac%20truc%20tuyen/manifest.json) cấu hình `standalone`, hỗ trợ `viewport-fit=cover` tràn viền tai thỏ/Dynamic Island và [sw.js](file:///c:/Users/Administrator/Desktop/Nghe%20nhac%20truc%20tuyen/sw.js) (Service Worker) lưu đệm toàn bộ ứng dụng.

---

## 🚀 Hướng Dẫn Sử Dụng

### Khởi động nhanh:
1. Nhấp đúp vào file **`start.bat`** trên máy tính (hoặc chạy lệnh `node server.js`).
2. Trình duyệt sẽ tự động mở địa chỉ: `http://localhost:3000`.

### Cài đặt lên điện thoại (iOS / Android):
1. Đảm bảo điện thoại và máy tính kết nối cùng mạng Wi-Fi.
2. Nhìn vào cửa sổ console của máy chủ để thấy địa chỉ IP (ví dụ: `http://192.168.1.X:3000`).
3. Mở địa chỉ trên trình duyệt điện thoại:
   - **Trên iOS (Safari)**: Bấm vào biểu tượng **Chia sẻ (Share)** -> Chọn **"Thêm vào MH chính" (Add to Home Screen)**.
   - **Trên Android (Chrome)**: Bấm vào menu 3 chấm -> Chọn **"Thêm vào màn hình chính" (Install app / Add to Home screen)**.
4. Thoát ra màn hình chính, bạn sẽ thấy icon ứng dụng **MM Drive** đẹp mắt, mở lên dùng tràn viền và phát nhạc hoàn toàn không cần Internet!

### Thay đổi logo riêng:
- Chỉ cần chép ảnh của bạn đè lên file [logo.png](file:///c:/Users/Administrator/Desktop/Nghe%20nhac%20truc%20tuyen/logo.png) trong thư mục này.
