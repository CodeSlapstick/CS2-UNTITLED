FROM node:26.13.0-alpine
WORKDIR /service
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
USER node
EXPOSE 8091
CMD ["node", "server.mjs"]
