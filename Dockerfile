FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
USER node
ENV NODE_ENV=production PORT=8080 DEMO_MODE=false
EXPOSE 8080
CMD ["node", "server/index.js"]
