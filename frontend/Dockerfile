FROM node:20-alpine AS build
ARG BUILD_VERSION
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV BUILD_VERSION=${BUILD_VERSION}
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
