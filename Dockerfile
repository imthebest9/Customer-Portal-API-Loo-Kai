# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript to dist/ ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production dependencies + compiled output only ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
# Strip any CR before making it executable. .gitattributes already pins this file
# to LF, but a checkout with unusual git settings could still deliver CRLF — and
# /bin/sh would then read the `\r` as part of the interpreter path and die with
# "no such file or directory". Cheap insurance for the one script that must run.
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 3000
# Entrypoint runs migrations + seed, then starts the API.
ENTRYPOINT ["./docker-entrypoint.sh"]
