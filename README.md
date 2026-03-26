# gphotos-backup-advanced (v2.4)

## Mới trong v2.4:
- Thêm **Global Threshold (Bảo vệ NAS)**: Tự động ngắt đồng bộ nếu dung lượng NAS tụt xuống mức nguy hiểm.
- Thêm **Hạn mức (Quota)** cho từng tài khoản: Giới hạn dung lượng tải về của mỗi thư mục.
- Bổ sung **Công cụ ước lượng Size mây (Rclone size)** giúp xem trước dung lượng Google Photos.

## Mới trong v2.3:
- Thêm `stack.env` ở ROOT để Portainer (Repository mode) không cảnh báo/đòi file.
- Compose build trực tiếp từ Git PUBLIC (không cần Auth).
- HEALTHCHECK `/health` giúp Portainer nhận trạng thái container.

Triển khai Portainer → Stacks → Repository:
- Repository URL: https://github.com/W00DFISH/gphotos-backup-advanced.git
- Repository reference: refs/heads/main
- Compose path: docker-compose.yml
- Authentication: OFF (repo public)

Folder DSM phải tồn tại:
- /volume1/docker/rclone/config
- /volume1/photo

Sau deploy:
- UI: http://NAS_IP:5572
- Rclone Web GUI: http://NAS_IP:5573
