FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
# dev deps include a private git-hosted tool (alexander) the server never needs: drop them before installing
RUN npm pkg delete devDependencies && npm install --omit=dev --no-audit --no-fund && npm i --no-save --no-audit --no-fund tsx@4.20.6
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY assets ./assets
COPY program/target/idl ./program/target/idl
ENV PORT=4545
EXPOSE 4545
CMD ["npx", "tsx", "src/server.ts"]
