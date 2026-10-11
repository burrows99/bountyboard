FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --no-save tsx@4.20.6
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY assets ./assets
COPY program/target/idl ./program/target/idl
ENV PORT=4545
EXPOSE 4545
CMD ["npx", "tsx", "src/server.ts"]
