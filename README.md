# gphotos-backup-advanced (v2.2)

**Tóm tắt fix:**
- Loại bỏ `env_file` (lỗi .env not found).
- Bỏ `container_name` (tránh conflict khi redeploy). 
- Thêm `/health` + `HEALTHCHECK` để Portainer nhận trạng thái container.
- Compose tối giản, build trực tiếp từ Git (PUBLIC).

## Triển khai qua Portainer (Repository - PUBLIC)
- Repository URL: `https://github.com/W00DFISH/gphotos-backup-advanced.git`
- Branch: `main`
- Compose path: `docker-compose.yml`
- Auth: OFF (repo public)
- Bảo đảm DSM có thư mục:
  - `/volume1/docker/rclone/config`
  - `/volume1/photo`

Sau deploy:
- UI: `http://NAS_IP:5572`
- Rclone Web GUI: `http://NAS_IP:5573`
