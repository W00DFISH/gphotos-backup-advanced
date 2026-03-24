# gphotos-backup-advanced (v2.3)

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
