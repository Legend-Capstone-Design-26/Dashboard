FROM node:20-alpine AS base

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY dashboard-be/package.json ./dashboard-be/package.json
COPY dashboard-fe/package.json ./dashboard-fe/package.json
COPY vendor ./vendor

RUN npm ci --omit=dev

COPY dashboard-be ./dashboard-be
COPY dashboard-fe ./dashboard-fe
COPY README.md ./README.md
COPY docs ./docs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["npm", "run", "dev", "--workspace", "dashboard-be"]
