# Requirements Document — FlashFlow v2 Upgrade

## Giới thiệu

FlashFlow v2 là bản nâng cấp toàn diện cho ứng dụng desktop flash ROM Android (Go + React/TypeScript, Wails framework). Phiên bản này tập trung vào: (1) Tính năng Backup/Restore toàn bộ dữ liệu một chạm (yêu cầu root), (2) Cải thiện hệ thống Leaderboard, (3) Sửa lỗi và tối ưu hiệu năng, (4) Cải thiện UX/UI, (5) Tính năng trích xuất file .img từ ROM.

**Lưu ý quan trọng:** Pixel và Xiaomi vẫn giữ trạng thái "Coming Soon" — KHÔNG thay đổi logic flash cho 2 dòng máy này trong phiên bản v2.

## Glossary

- **FlashFlow_App**: Ứng dụng desktop FlashFlow chạy trên macOS/Windows/Linux
- **Backup_Engine**: Module Go backend xử lý logic backup/restore dữ liệu thiết bị Android (yêu cầu root)
- **Restore_Engine**: Module Go backend xử lý logic khôi phục dữ liệu từ bản backup (yêu cầu root)
- **Leaderboard_Service**: Module frontend kết nối Supabase để hiển thị bảng xếp hạng người dùng
- **Device_Manager**: Module Go quản lý kết nối và phát hiện thiết bị Android qua ADB/Fastboot
- **Flash_Engine**: Module Go thực hiện quá trình flash ROM cho OnePlus (chính)
- **ROM_Library**: Hệ thống quản lý và cache ROM đã tải về trên máy tính
- **ROM_Extractor**: Module trích xuất file .img riêng lẻ từ ROM ZIP hoặc payload.bin
- **Supabase_Backend**: Dịch vụ cloud database lưu trữ dữ liệu người dùng và bảng xếp hạng
- **ADB**: Android Debug Bridge — công cụ giao tiếp với thiết bị Android qua USB
- **Root_Access**: Quyền truy cập cao nhất trên thiết bị Android, cần thiết cho backup/restore toàn bộ dữ liệu
- **Partition**: Phân vùng lưu trữ trên thiết bị Android (system, data, boot, etc.)
- **Stability_Delay**: Thời gian chờ sau khi thiết bị chuyển mode (bootloader/fastbootd) trước khi gửi lệnh tiếp theo, đảm bảo thiết bị thực sự sẵn sàng

---

## Requirements

### Requirement 1: Backup toàn bộ dữ liệu thiết bị (One-Click Full Backup)

**User Story:** Là một thợ sửa điện thoại, tôi muốn backup toàn bộ dữ liệu khách hàng chỉ với một nút bấm, để đảm bảo an toàn dữ liệu trước khi flash ROM.

#### Acceptance Criteria

1. WHEN người dùng bấm nút "Backup toàn bộ", THE Backup_Engine SHALL kiểm tra thiết bị có root hay không trong vòng 5 giây và trả về kết quả (có root / không có root / không phản hồi)
2. IF thiết bị không có root, THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi chỉ rõ thiết bị chưa được root, kèm nút gợi ý chuyển đến tính năng Root của FlashFlow, và chặn không cho tiến hành backup
3. WHEN thiết bị có root và người dùng xác nhận backup qua dialog xác nhận, THE Backup_Engine SHALL kiểm tra dung lượng trống trên máy tính lớn hơn ít nhất 1.5 lần dung lượng dữ liệu cần backup trước khi bắt đầu, sau đó tạo bản backup bao gồm: dữ liệu ứng dụng (/data/data), tin nhắn SMS, danh bạ, cài đặt hệ thống, và ảnh/video (/sdcard)
4. IF dung lượng trống trên máy tính không đủ để chứa bản backup, THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi chỉ rõ dung lượng cần thiết và dung lượng hiện có, và không bắt đầu quá trình backup
5. WHILE quá trình backup đang chạy, THE FlashFlow_App SHALL hiển thị thanh tiến trình cập nhật mỗi 2 giây với phần trăm hoàn thành (0-100%) và tên thành phần đang được backup (ví dụ: "Đang backup: Danh bạ")
6. WHEN backup hoàn tất, THE Backup_Engine SHALL lưu file backup vào thư mục Library của FlashFlow với tên theo định dạng: {tên_thiết_bị}_{YYYYMMDD}_{HHmmss}.zip
7. IF quá trình backup bị gián đoạn do mất kết nối USB hoặc pin thiết bị dưới 5%, THEN THE Backup_Engine SHALL dừng quá trình backup, giữ nguyên dữ liệu đã pull thành công về máy tính, xóa file tạm chưa hoàn chỉnh, và hiển thị thông báo cho người dùng chỉ rõ nguyên nhân gián đoạn cùng danh sách thành phần đã backup được
8. THE Backup_Engine SHALL ghi log mỗi bước backup vào flash_log bao gồm: thời gian bắt đầu/kết thúc mỗi thành phần, kích thước dữ liệu đã pull, và trạng thái (thành công/thất bại)
9. THE Backup_Engine SHALL nén toàn bộ dữ liệu backup thành một file ZIP duy nhất để dễ quản lý và di chuyển

### Requirement 2: Khôi phục dữ liệu từ bản backup (One-Click Restore)

**User Story:** Là một thợ sửa điện thoại, tôi muốn khôi phục toàn bộ dữ liệu khách hàng từ bản backup đã tạo, để hoàn tất quy trình flash ROM mà không mất dữ liệu.

#### Acceptance Criteria

1. WHEN người dùng chọn file backup và bấm "Khôi phục", THE Restore_Engine SHALL kiểm tra thiết bị có root hay không trong vòng 5 giây trước khi bắt đầu quá trình khôi phục
2. IF thiết bị không có root, THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi yêu cầu root để khôi phục toàn bộ dữ liệu (app + data), kèm gợi ý sử dụng tính năng Root của FlashFlow
3. WHEN thiết bị có root, THE Restore_Engine SHALL xác minh tính toàn vẹn của file backup (checksum) trong vòng 30 giây trước khi bắt đầu khôi phục
4. IF file backup bị hỏng (checksum không khớp) hoặc không tương thích (phiên bản backup format khác phiên bản app hiện tại), THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi chỉ rõ nguyên nhân: file hỏng hoặc phiên bản không khớp
5. IF dung lượng trống trên thiết bị không đủ để khôi phục toàn bộ dữ liệu từ bản backup, THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi kèm thông tin dung lượng cần thiết và dung lượng hiện có
6. WHEN quá trình restore bắt đầu, THE Restore_Engine SHALL khôi phục dữ liệu theo thứ tự: cài đặt hệ thống → ứng dụng → dữ liệu ứng dụng → media (ảnh/video)
7. WHILE quá trình restore đang chạy, THE FlashFlow_App SHALL hiển thị thanh tiến trình với phần trăm hoàn thành và tên thành phần đang được khôi phục
8. IF quá trình restore bị gián đoạn (mất kết nối USB, hết pin, người dùng hủy), THEN THE Restore_Engine SHALL giữ nguyên dữ liệu đã khôi phục thành công và hiển thị danh sách các thành phần chưa hoàn tất
9. WHEN restore hoàn tất, THE FlashFlow_App SHALL hiển thị báo cáo tóm tắt: số ứng dụng đã khôi phục, dung lượng dữ liệu, thời gian thực hiện
10. THE Restore_Engine SHALL ghi log chi tiết từng bước khôi phục vào flash_log để người dùng theo dõi tiến trình

### Requirement 3: Quản lý danh sách bản backup

**User Story:** Là một thợ sửa điện thoại, tôi muốn xem và quản lý các bản backup đã tạo, để dễ dàng tìm và chọn bản backup cần khôi phục.

#### Acceptance Criteria

1. THE FlashFlow_App SHALL hiển thị danh sách tất cả bản backup đã tạo, sắp xếp theo ngày tạo mới nhất lên đầu, với thông tin mỗi mục: tên thiết bị, ngày giờ tạo (định dạng dd/MM/yyyy HH:mm), dung lượng (hiển thị đơn vị MB nếu dưới 1GB, GB nếu từ 1GB trở lên), trạng thái (hoàn chỉnh/không hoàn chỉnh)
2. WHEN người dùng chọn xóa một bản backup, THE FlashFlow_App SHALL hiển thị dialog xác nhận chứa tên thiết bị và ngày tạo của bản backup sắp xóa, và chỉ thực hiện xóa khi người dùng xác nhận
3. IF xóa bản backup thất bại (file bị khóa hoặc lỗi quyền truy cập), THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi chỉ rõ nguyên nhân và giữ nguyên bản backup trong danh sách
4. THE FlashFlow_App SHALL hiển thị tổng dung lượng các bản backup đang chiếm trên ổ đĩa (đơn vị MB hoặc GB tương tự criterion 1)
5. IF dung lượng trống trên ổ đĩa chứa thư mục Library còn dưới 5GB, THEN THE FlashFlow_App SHALL hiển thị cảnh báo cho người dùng trước khi cho phép tạo backup mới
6. IF không có bản backup nào trong thư mục Library, THEN THE FlashFlow_App SHALL hiển thị trạng thái trống với hướng dẫn cách tạo bản backup đầu tiên

### Requirement 4: Cải thiện hệ thống Leaderboard (Bảng Vàng)

**User Story:** Là một người dùng FlashFlow, tôi muốn hệ thống bảng xếp hạng hoạt động chính xác với dữ liệu thật, để tạo động lực sử dụng app.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL chỉ hiển thị 2 tab: "Vua Flash" (xếp hạng theo tổng số lần flash thành công) và "Cú Đêm" (xếp hạng theo số lần flash trong khung giờ 01:00 AM - 04:00 AM theo múi giờ UTC+7) — bỏ tab Tốc độ và Brick
2. WHEN người dùng mở Bảng Vàng, THE Leaderboard_Service SHALL tải tối đa 10 người dùng xếp hạng cao nhất từ Supabase cho cả 2 tab trong vòng 3 giây
3. WHEN người dùng flash ROM thành công, IF người dùng đã đăng nhập Telegram, THEN THE FlashFlow_App SHALL gửi bản ghi flash (bao gồm telegram_id, tên thiết bị, tên ROM, và timestamp) lên Supabase trong nền mà không chặn luồng UI
4. THE Leaderboard_Service SHALL ghi nhận timestamp (theo múi giờ UTC+7) của mỗi lần flash, và tab "Cú Đêm" SHALL xếp hạng người dùng theo tổng số lần flash thực hiện trong khung giờ 01:00 AM - 04:00 AM (UTC+7)
5. IF kết nối mạng bị mất khi tải leaderboard, THEN THE Leaderboard_Service SHALL hiển thị thông báo lỗi mô tả nguyên nhân (mất kết nối mạng) và một nút "Thử lại" cho phép người dùng tải lại dữ liệu
6. IF người dùng đã đăng nhập Telegram, THEN THE Leaderboard_Service SHALL hiển thị vị trí xếp hạng hiện tại của người dùng đó ở cuối bảng xếp hạng, bao gồm số thứ tự, tên, và điểm số
7. IF việc gửi bản ghi flash lên Supabase thất bại (lỗi mạng hoặc server từ chối), THEN THE FlashFlow_App SHALL lưu bản ghi vào hàng đợi cục bộ (tối đa 50 bản ghi) và tự động gửi lại khi có kết nối mạng trở lại

### Requirement 5: Sửa lỗi và tối ưu Flash Engine

**User Story:** Là một thợ sửa điện thoại, tôi muốn quá trình flash ROM ổn định và ít lỗi hơn, để tiết kiệm thời gian và giảm rủi ro brick máy.

#### Acceptance Criteria

1. WHEN thiết bị chuyển mode (bootloader → fastbootd hoặc ngược lại), THE Flash_Engine SHALL chờ Stability_Delay tối thiểu 4 giây SAU KHI phát hiện thiết bị đã kết nối lại (qua fastboot devices hoặc getvar is-userspace), trước khi gửi lệnh flash tiếp theo; IF thiết bị không kết nối lại trong vòng 40 giây, THEN THE Flash_Engine SHALL báo lỗi timeout và dừng quá trình flash
2. IF quá trình flash bị lỗi ở một partition, THEN THE Flash_Engine SHALL ghi log bao gồm: tên partition bị lỗi, mode hiện tại (bootloader/fastbootd), nội dung lỗi trả về từ fastboot, và hiển thị gợi ý khắc phục dựa trên loại lỗi (ví dụ: "partition not found" → kiểm tra tên partition, "FAILED (remote)" → kiểm tra kết nối USB)
3. WHILE flash đang chạy, THE Device_Manager SHALL tạm dừng device watcher polling loop (không gọi fastboot devices hoặc adb devices cho mục đích detect) để tránh xung đột USB; WHEN flash kết thúc (thành công hoặc thất bại), THE Device_Manager SHALL khôi phục device watcher về trạng thái hoạt động bình thường
4. WHEN flash hoàn tất (thành công hoặc thất bại), THE Flash_Engine SHALL tạo Flash Report chứa: thời gian bắt đầu/kết thúc, danh sách partition đã flash thành công, danh sách partition bị lỗi (nếu có) kèm mã lỗi, tên ROM, tên thiết bị, và trạng thái cuối cùng (success/failed/cancelled); report được lưu dưới dạng file trong thư mục Reports với tên chứa timestamp
5. WHEN người dùng bấm nút dừng (cancel) trong khi flash đang chạy, THE Flash_Engine SHALL chờ lệnh fastboot hiện tại hoàn tất (tối đa 60 giây), sau đó dừng quá trình flash mà không gửi thêm lệnh flash nào; trạng thái các partition đã flash trước đó được giữ nguyên (không rollback)
6. IF payload-dumper-go trả về exit code khác 0 hoặc thư mục output không chứa file .img nào sau khi dump, THEN THE Flash_Engine SHALL hiển thị thông báo lỗi cho biết payload-dumper-go không thể extract ROM này, kèm gợi ý người dùng thử extract thủ công bằng công cụ khác hoặc tải ROM dạng đã giải nén sẵn
7. THE Flash_Engine SHALL sửa lỗi hàm `findFirstMatch` trong flash_helpers.go: loại bỏ lần gọi WalkDir đầu tiên (không có tác dụng), chỉ giữ lại một lần WalkDir duy nhất với early-exit khi tìm thấy file khớp pattern; kết quả trả về phải giống hệt logic cũ (trả về path đầu tiên khớp hoặc chuỗi rỗng)
8. IF lệnh fastboot flash trả về lỗi và quá trình flash đang ở chế độ tự động (FlashOnePlusROM hoặc FlashImagesSmartGroup), THEN THE Flash_Engine SHALL dừng toàn bộ chuỗi flash còn lại (không tiếp tục flash partition tiếp theo) và emit event flash_complete với trạng thái false

### Requirement 6: Cải thiện UX/UI tổng thể

**User Story:** Là một người dùng FlashFlow, tôi muốn giao diện mượt mà, dễ hiểu và phản hồi nhanh, để thao tác hiệu quả hơn.

#### Acceptance Criteria

1. WHEN thiết bị kết nối hoặc ngắt kết nối, THE FlashFlow_App SHALL cập nhật trạng thái kết nối (mode: ADB/FASTBOOT/RECOVERY/DISCONNECTED) trên DevicePanel trong vòng 2 giây kể từ khi sự kiện USB được phát hiện
2. THE FlashFlow_App SHALL hiển thị tùy chọn "Không hỏi lại" (checkbox) trên modal chọn Brand, WHEN người dùng tick chọn và xác nhận brand, THE FlashFlow_App SHALL lưu brand đã chọn vào localStorage và bỏ qua modal ở các lần khởi động tiếp theo, tự động sử dụng brand đã lưu
3. THE FlashFlow_App SHALL cung cấp mục "Đặt lại Brand mặc định" trong Settings để người dùng xóa lựa chọn đã lưu và hiển thị lại modal chọn Brand ở lần khởi động kế tiếp
4. WHEN người dùng chuyển đổi theme (Light/Dark/System), THE FlashFlow_App SHALL áp dụng theme mới lên toàn bộ giao diện trong vòng 500ms mà không cần khởi động lại ứng dụng
5. THE FlashFlow_App SHALL hỗ trợ đa ngôn ngữ (Tiếng Việt và Tiếng Anh) cho toàn bộ giao diện bao gồm cả thông báo lỗi, IF một key chưa có bản dịch cho ngôn ngữ hiện tại, THEN THE FlashFlow_App SHALL hiển thị key gốc thay vì chuỗi rỗng
6. WHILE quá trình flash đang chạy, THE FlashFlow_App SHALL vô hiệu hóa (disabled + giảm opacity xuống mức nhận biết được trạng thái không tương tác) tất cả các nút điều hướng sidebar và các quick action trên Dashboard để tránh thao tác nhầm
7. THE FlashFlow_App SHALL hiển thị nút "Copy Log" cạnh vùng hiển thị log flash, WHEN người dùng nhấn nút "Copy Log", THE FlashFlow_App SHALL sao chép toàn bộ nội dung log (tối đa 1MB) vào clipboard và hiển thị thông báo xác nhận đã sao chép thành công trong tối thiểu 2 giây
8. WHILE thiết bị đang chuyển mode (reboot bootloader/fastbootd/recovery), THE FlashFlow_App SHALL hiển thị trạng thái loading gồm spinner animation kèm text mô tả hành động đang thực hiện (ví dụ: "Đang khởi động lại vào Fastboot...") thay vì hiển thị trạng thái "Mất kết nối"
9. IF thiết bị không phản hồi sau 30 giây kể từ khi bắt đầu chuyển mode, THEN THE FlashFlow_App SHALL hiển thị thông báo lỗi cho biết quá trình chuyển mode thất bại kèm gợi ý kiểm tra kết nối USB

### Requirement 7: Trích xuất file .img từ ROM (ROM Extractor)

**User Story:** Là một thợ sửa điện thoại, tôi muốn trích xuất riêng từng file .img từ ROM ZIP mà không cần dump toàn bộ, để lấy nhanh file cần thiết (ví dụ boot.img để root).

#### Acceptance Criteria

1. WHEN người dùng chọn một file ROM ZIP chưa giải nén, THE ROM_Extractor SHALL hiển thị danh sách các partition/file .img bên trong (tên, dung lượng ước tính)
2. WHEN người dùng chọn extract một hoặc nhiều file .img, THE ROM_Extractor SHALL giải nén chỉ file được chọn vào thư mục do người dùng chỉ định
3. IF ROM chứa payload.bin, THEN THE ROM_Extractor SHALL cho phép dump từng partition riêng lẻ (sử dụng payload-dumper-go với flag chọn partition) thay vì dump toàn bộ
4. WHILE quá trình extract đang chạy, THE FlashFlow_App SHALL hiển thị tiến trình và cho phép hủy
5. WHEN ROM đã được giải nén và nằm trong Library, THE ROM_Extractor SHALL cho phép copy trực tiếp file .img từ thư mục cache mà không cần extract lại

### Requirement 8: Cải thiện hệ thống License và bảo mật

**User Story:** Là chủ sản phẩm FlashFlow, tôi muốn hệ thống license hoạt động ổn định và bảo mật hơn, để bảo vệ doanh thu từ các gói trả phí.

#### Acceptance Criteria

1. WHEN ứng dụng khởi động, THE FlashFlow_App SHALL gọi API kiểm tra license trong goroutine riêng và hoàn tất khởi động giao diện trong tối đa 3 giây kể từ lúc người dùng mở ứng dụng, bất kể kết quả kiểm tra license đã trả về hay chưa
2. IF license hết hạn trong khi đang flash, THEN THE Flash_Engine SHALL cho phép hoàn tất phiên flash hiện tại (tất cả partition trong danh sách đã chọn) mà không dừng giữa chừng, sau đó chuyển trạng thái license về EXPIRED và chặn các phiên flash mới
3. THE FlashFlow_App SHALL lưu trạng thái license hợp lệ gần nhất vào bộ nhớ cục bộ với thời hạn tối đa 24 giờ kể từ lần kiểm tra server thành công cuối cùng, cho phép sử dụng ứng dụng khi không có kết nối mạng trong khoảng thời gian đó
4. IF bộ nhớ cache license đã quá 24 giờ và không có kết nối mạng, THEN THE FlashFlow_App SHALL chặn thao tác flash mới và hiển thị thông báo yêu cầu người dùng kết nối Internet để xác thực lại license
5. WHEN gói RE_4H (4 giờ) hết hạn, THE FlashFlow_App SHALL hiển thị thông báo chứa tên gói đã hết hạn và trạng thái hiện tại, đồng thời chuyển về chế độ TRIAL trong vòng 5 giây kể từ khi server trả về trạng thái EXPIRED
6. THE FlashFlow_App SHALL đọc Supabase key từ biến môi trường hoặc file cấu hình nằm ngoài thư mục source code, và file cấu hình đó phải được liệt kê trong .gitignore để không bị commit vào repository
