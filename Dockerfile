FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app.js auth.js config.js db.js errors.js migrate.js records.js start.js users.js validation.js workspace-api.js ./src/
COPY 001-crm.sql ./migrations/001-crm.sql
COPY backend-panel.html ./public/index.html
COPY panel.css panel.js ./public/
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
