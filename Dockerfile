FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 3000
ENV DATABASE_URL=${DATABASE_URL}
CMD ["node", "server/server.js"]