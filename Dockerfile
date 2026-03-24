FROM node:20-alpine
RUN apk add --no-cache rclone bash
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend  && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY backend ./backend
COPY frontend ./frontend
COPY start.sh .
RUN chmod +x start.sh
EXPOSE 5572 5573
CMD ["./start.sh"]
