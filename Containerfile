# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R 1001:0 /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html \
    && chmod -R g=u /var/cache/nginx /var/run /var/log/nginx
USER 1001
EXPOSE 8080
