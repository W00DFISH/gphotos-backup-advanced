FROM node:20-alpine
RUN apk add --no-cache rclone bash wget
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend  && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY backend ./backend
COPY frontend ./frontend
COPY start.sh .
RUN chmod +x start.sh
EXPOSE 5572 5573
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD wget -qO- http://localhost:5572/health || exit 1
CMD ["./start.sh"]
