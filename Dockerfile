FROM node:22.11.0-alpine3.20 AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.11.0-alpine3.20 AS builder

WORKDIR /app
ARG NEXT_PUBLIC_UMAI_EXTENSION_ID
ENV NEXT_PUBLIC_UMAI_EXTENSION_ID=${NEXT_PUBLIC_UMAI_EXTENSION_ID}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.11.0-alpine3.20 AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start"]
