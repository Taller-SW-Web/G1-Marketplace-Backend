FROM node:24.19.0-bookworm-slim
RUN npm install --global @stoplight/prism-cli@5.16.0
USER node
CMD ["prism", "mock", "/contract/openapi.yaml", "-h", "127.0.0.1", "-p", "4010"]
