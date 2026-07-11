# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stage 2: runtime — API server + built frontend
FROM node:22-alpine
WORKDIR /app/server
# better-sqlite3 needs build tools for its native module
RUN apk add --no-cache python3 make g++
COPY server/package.json ./
RUN npm install --omit=dev && apk del python3 make g++
COPY server/ ./
COPY --from=frontend /app/dist /app/dist

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3001
VOLUME /data
EXPOSE 3001
CMD ["node", "index.js"]
