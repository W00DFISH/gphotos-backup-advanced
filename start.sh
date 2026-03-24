#!/bin/sh
set -e
mkdir -p /config /data /data/logs
rclone rcd   --rc-no-auth   --rc-web-gui   --rc-web-gui-no-open-browser   --rc-addr=:5573   --config=/config/rclone.conf   --log-level=INFO &
node backend/server.js
