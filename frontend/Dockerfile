# frontend (React + Vite) — build เป็นไฟล์นิ่งแล้วให้ nginx เสิร์ฟ + ส่งต่อ /api ไปที่ service api
FROM node:26.13.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30.6-alpine
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=build /app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx \
 && chown nginx:nginx /run
USER nginx
EXPOSE 8080
