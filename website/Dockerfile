# Stage 1: Build the static Astro site
FROM mirror.gcr.io/library/node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG SITE_URL
ARG PUBLIC_APP_URL
ENV SITE_URL=$SITE_URL
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL
ARG PUBLIC_TURNSTILE_SITE_KEY
ENV PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM mirror.gcr.io/library/nginx:alpine

COPY nginx-static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
