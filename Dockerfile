
FROM node:20-alpine
RUN apk add --no-cache rclone bash wget git
ENV NODE_ENV=production
WORKDIR /app
COPY .git ./.git
RUN git log -1 --format="%cd - %s (%h)" --date=iso > /app/version.txt || echo "Unknown" > /app/version.txt
RUN rm -rf .git
COPY backend/package*.json ./backend/
RUN cd backend  && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY backend ./backend
COPY frontend ./frontend
COPY start.sh .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh
EXPOSE 5572 5573
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD wget -qO- http://localhost:5572/health || exit 1
CMD ["./start.sh"]
