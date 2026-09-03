FROM node:22-alpine
WORKDIR /app
COPY assets ./assets
COPY services/api ./services/api
EXPOSE 8080
CMD ["node","services/api/server.js"]
