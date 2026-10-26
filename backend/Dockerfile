FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma prisma
COPY backend/src src
COPY backend/shared shared
COPY backend/scripts scripts
COPY backend/tsconfig.json tsconfig.json
RUN npm run db:generate && npm run build
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm start"]
