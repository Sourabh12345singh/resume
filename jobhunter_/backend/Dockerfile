FROM oven/bun:1.2.13-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY tsconfig.json ./
COPY src ./src
COPY uploads ./uploads

EXPOSE 3001

CMD ["bun", "run", "start"]
