# FlashFlow — trạng thái dự án

> Phạm vi: ứng dụng desktop FlashFlow trong repository này. Dashboard quản trị
> license nằm ở repository khác, không được mô tả chi tiết ở đây.
>
> Cập nhật: 2026-08-21 (UTC+7). Cập nhật file này mỗi khi thay đổi flash engine
> hoặc chuẩn bị phát hành.

## Trạng thái Git và phát hành

- Release công khai hiện tại: **v2.1.4** (`flashflow-v2.1.4`), tạo từ commit
  `eb32856` — `fix: provision OnePlus dynamic partitions before flashing`.
- Mã nguồn hiện tại còn có một commit **chưa đẩy/chưa phát hành**:
  `486d864` — `fix: flash loose images shipped with super ROMs`.
  Commit này khôi phục hành vi v2.0.3 cho ROM có `super.img`: sau khi flash
  `super`, tiếp tục flash toàn bộ image rời còn lại trong FastbootD.
- `main` đang ahead `origin/main` một commit. Không được gắn build từ commit
  này là v2.1.4; nếu phát hành, phải tăng phiên bản/tag mới (ví dụ v2.1.5),
  build lại và upload lại asset.
- Các thư mục `build/release-v213/` và `build/release-v214/` chỉ là artifact
  build cục bộ, đang untracked; không commit chúng vào source.

## Kênh update GitHub

- App từ **v2.1.2 trở lên** kiểm tra release tại
  `cudin-etn/FlashFlow` (`FlashFlowReleasesAPI` trong `app.go`).
- App **v2.1.0** cũ kiểm tra `cudin-etn/t-dev-studio`. Vì vậy mỗi release cần
  được tạo ở cả hai repository cho đến khi không còn client v2.1.0.
- Release `flashflow-v2.1.4` hiện có asset Windows x64 và macOS Universal ở
  cả hai kênh. Tên tag phải tiếp tục chứa `flashflow` để bộ lọc update nhận ra.

## Luồng flash OnePlus

### Chuẩn bị ROM

1. ZIP chứa `payload.bin` được nhận là Full OTA.
2. Tool trích `payload.bin`, dùng `payload-dumper-go` tạo các file `.img` vào
   Library/Cache, sau đó quét toàn bộ `.img` theo cây thư mục.
3. Không quyết định nhánh dựa trên nhãn "Full OTA"; nhánh được quyết định bởi
   việc sau khi dump có `super.img` hay không.

### ROM có `super.img`

- Nhóm boot (`boot`, `dtbo`, `init_boot`, `modem`, `recovery`, `vbmeta*`,
  `vendor_boot`) flash trong Bootloader.
- `super.img` flash trong Bootloader.
- Vào FastbootD, flash **mọi `.img` còn lại** trong package, kể cả `system`,
  `vendor`, `my_*`, `system_dlkm_oki`… Nhóm boot và `super` không chạy lại vì
  đã được flash ở phase trước.
- Đây là hành vi của v2.0.3, được khôi phục trong commit local `486d864`.

### ROM không có `super.img` (thường là Full OTA sau dump)

- Nhóm boot vẫn flash trong Bootloader.
- Firmware/physical image còn lại flash ở FastbootD.
- Logical image (`system`, `vendor`, `odm`, `my_*`, `*_dlkm`…) được xử lý trong
  FastbootD bằng luồng mới: xóa logical `_a/_b` và COW cũ, tạo `_a/_b`, rồi
  flash image vào `_a`.
- Đây là khác biệt lớn nhất so với backup v2.0.3. Backup flash logical trực
  tiếp vào tên gốc, không dựng lại layout. Luồng mới được thêm để xử lý lỗi
  `partition size: 0` / partition không tồn tại nhưng cần test phần cứng thật.

## Các bảo vệ hiện có

- Mọi lệnh Fastboot trong OnePlus engine được pin vào đúng serial đã chọn.
- Lệnh flash lớn không có timeout 60 giây và Cancel chỉ dừng giữa partition;
  không giết process đang truyền image.
- Device watcher bị pause trong phiên flash; global tool lock ngăn ADB/Fastboot
  khác chen vào.
- Reboot sang FastbootD trên Windows được xác minh lại khi process `reboot
  fastboot` timeout.
- Chế độ ARB Safe bỏ `xbl`, `abl`, `xbl_config`, `xbl_ramdump`; Full ARB flash
  chúng. MediaTek Safe Mode giữ preloader/firmware sớm của MTK.

## Sự cố cần theo dõi: Full OTA canoe, `odm.img` 3/11

Report: `flash_report_20260821_213112.json`.

- v2.1.4 đã resize `odm_a` thành công, gửi/ghi thành công 3 trên 11 sparse
  chunk; lỗi ở chunk 4 với `Error reading sparse file`.
- Không phải lỗi sai mode: v2.0.3 cũng flash `odm` trong FastbootD. Khác nhau
  là backup target tên gốc `odm`, còn v2.1.4 target `odm_a` sau provisioning.
- `Invalid sparse file format at header magic` có thể là raw image được
  Fastboot tự re-sparse, không tự nó chứng minh ROM hỏng.
- `fastboot.exe` và `payload-dumper-go.exe` Windows giữa backup và v2.1.4 có
  checksum giống nhau. Nghi vấn còn lại: cache/image hỏng, ổ đĩa/antivirus,
  USB transport, hoặc Fastboot Windows khi gửi raw image lớn.

### Hạn chế cache hiện tại

Cache chỉ dùng `tên ZIP + kích thước ZIP`, marker `.completed` và kiểm tra có
ít nhất một `.img`. Nó chưa xác minh hash/kích thước từng image, chưa ghi nhận
cache được dùng hay dump mới trong flash report, và không làm sạch toàn bộ thư
mục trước khi dump lại. Đây là điểm cần ưu tiên nếu sửa tiếp lỗi 3/11.

## Quy tắc làm việc tiếp theo

1. Khi yêu cầu là **đối chiếu/nghiên cứu**, chỉ đọc và báo kết quả; không sửa,
   commit, build hoặc publish nếu chưa được yêu cầu rõ.
2. Trước khi thay đổi flash engine, cập nhật phần liên quan trong file này.
3. Một thay đổi release phải có: bump version, test Go + frontend, build macOS
   và Windows, kiểm tra update từ v2.1.0 qua `t-dev-studio`, tạo release ở cả
   hai repository, rồi cập nhật trạng thái ở đây.
4. Không xóa release/tag/build artifact khi chưa kiểm tra rõ target và không
   có yêu cầu phát hành hoặc dọn dẹp cụ thể.
