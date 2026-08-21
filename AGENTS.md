# FlashFlow — hướng dẫn cho AI agent và người bảo trì

## Đọc trước khi làm việc

Đọc toàn bộ `PROJECT_STATE.md` trước khi chẩn đoán, sửa flash engine, thay đổi
update, build hoặc phát hành. File đó là nguồn trạng thái hiện hành: release
đang public, source chưa phát hành, luồng OnePlus, sự cố đang theo dõi và các
quyết định đã chốt.

## Phân biệt đúng loại yêu cầu

- **Đối chiếu / nghiên cứu / xem nguyên nhân:** chỉ đọc, so sánh và báo bằng
  chứng. Không sửa code, commit, build, xóa hoặc publish nếu không được yêu
  cầu rõ.
- **Sửa / làm / triển khai:** thực hiện thay đổi trong phạm vi yêu cầu, test
  phù hợp, cập nhật `PROJECT_STATE.md`, rồi commit riêng với message rõ nghĩa.
- **Phát hành / publish:** phải bump version trước. Không được build source
  sau một release rồi gọi lại đúng version/tag release cũ.

## Update và release

- Version nằm ở `wails.json` và `CurrentVersion` trong `app.go`; hai giá trị
  phải khớp.
- Client v2.1.2+ đọc release `cudin-etn/FlashFlow`.
- Client v2.1.0 còn đọc `cudin-etn/t-dev-studio`; khi phát hành cần tạo cùng
  release FlashFlow ở cả hai repository cho đến khi nhóm v2.1.0 không còn.
- Tag phải có dạng `flashflow-vX.Y.Z`, chứa chữ `flashflow`; không xóa release
  hoặc tag khi chưa xác minh đúng target và được yêu cầu rõ.
- Trước publish: chạy `go test -race ./...`, `go vet ./...`,
  `npm --prefix frontend test`, `npm --prefix frontend run build`; build asset
  Windows x64 và macOS Universal; kiểm tra asset/link ở cả hai release feed.

## Bất biến của flash OnePlus

- Pin mọi lệnh Fastboot vào serial đã chọn.
- Không đặt timeout cho `fastboot flash`; Cancel chỉ có hiệu lực giữa các
  partition, không giết lệnh đang truyền image.
- Device watcher phải pause trong phiên flash; giữ global tool lock để lệnh
  ADB/Fastboot không chen vào.
- Phân nhánh theo image sau dump: có `super.img` và không có `super.img`,
  không dựa chỉ vào nhãn “Full OTA”.
- ROM có `super.img`: boot group + `super` chạy trước; FastbootD flash toàn bộ
  image rời còn lại, gồm logical image đi kèm.
- ROM không có `super.img`: logical partition được provision A/B rồi flash
  slot A. Đây là thay đổi mới so với v2.0.3; cẩn trọng và cập nhật tài liệu
  nếu đụng vào.
- ARB Safe và MTK Safe là bảo vệ có chủ đích; không bỏ hoặc mở rộng phạm vi
  chúng nếu không có yêu cầu rõ.

## Chẩn đoán và tài liệu

- Đọc flash report trước khi kết luận. Phân biệt lỗi phía thiết bị (`FAILED
  (remote: ...)`) với lỗi Fastboot client/đọc sparse/USB.
- Cache ROM hiện chưa kiểm tra checksum từng image. Với lỗi transfer image lớn,
  coi cache, ổ đĩa, antivirus và USB là các khả năng cần kiểm tra.
- Khi kết luận thay đổi hoặc rủi ro mới, cập nhật `PROJECT_STATE.md` trong cùng
  commit. Không sửa quá tay ngoài yêu cầu của người dùng.

## Artefact build

- Không commit `build/release-*` hay các gói `.zip`/`.dmg` sinh ra khi build.
- Giữ artifact hiện hành khi cần kiểm tra release; chỉ dọn artifact cũ sau khi
  xác định chính xác version và có yêu cầu dọn dẹp.
