# Stage 1: Build React SPA
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Vite bakes these in at build time. In production the API is served from the same origin under /api/v1
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_STRIPE_PUBLISHABLE_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

COPY . .
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:alpine

COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
