ARG SOURCE_DATE_EPOCH
FROM node:22.11.0-alpine3.20@sha256:b64ced2e7cd0a4816699fe308ce6e8a08ccba463c757c00c14cd372e3d2c763e AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --cache /tmp/npm-cache \
    && rm -rf /tmp/npm-cache /root/.npm

FROM node:22.11.0-alpine3.20@sha256:b64ced2e7cd0a4816699fe308ce6e8a08ccba463c757c00c14cd372e3d2c763e AS builder

WORKDIR /app
ARG NEXT_PUBLIC_UMAI_EXTENSION_ID
ENV NEXT_PUBLIC_UMAI_EXTENSION_ID=${NEXT_PUBLIC_UMAI_EXTENSION_ID}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=next_server_actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    npm run build

FROM node:22.11.0-alpine3.20@sha256:b64ced2e7cd0a4816699fe308ce6e8a08ccba463c757c00c14cd372e3d2c763e AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# The node image ships an unprivileged `node` user (uid 1000). Own the copied tree to
# it rather than creating another account, and run as it: this image was previously the
# only one in the release train still running as root.
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/next.config.mjs ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start"]
