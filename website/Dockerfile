# Stage 1: Build the static Astro site
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG SITE_URL
ARG PUBLIC_APP_URL
ENV SITE_URL=$SITE_URL
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

COPY nginx-static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
