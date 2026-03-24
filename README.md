# Google Photos Backup for Synology (Advanced, Multi‑Account)

**Repo:** https://github.com/W00DFISH/gphotos-backup-advanced

> Phiên bản **v2.1**: bỏ `env_file: .env` khỏi `docker-compose.yml` để tránh lỗi Portainer `env file .../.env not found`. Biến môi trường cấu hình trực tiếp trong `environment:` hoặc Portainer UI.

## Triển khai (Portainer)
- Repository URL: `https://github.com/W00DFISH/gphotos-backup-advanced.git`
- Branch: `main`
- Compose path: `docker-compose.yml`
- Auth: Username `W00DFISH` + GitHub PAT (scope: repo)

### Volumes cần có sẵn trên DSM
- `/volume1/docker/rclone/config` (tạo nếu chưa có)
- `/volume1/photo` (thư mục dữ liệu bạn muốn hiển thị trong DSM)

Sau khi deploy:
- UI: `http://NAS_IP:5572`
- Rclone Web GUI: `http://NAS_IP:5573`

## Lưu ý
- Thư mục đích backup **không hardcode**; người dùng nhập trong UI theo từng account.
- Secrets (OAuth) nằm ở `/config/rclone.conf` (volume DSM), **không commit lên Git**.
