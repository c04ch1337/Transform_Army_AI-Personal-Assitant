# Multi-stage build for production
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Configure npm to handle SSL issues (if behind corporate proxy)
RUN npm config set strict-ssl false || true

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build arguments for API keys (optional, can be set at build time)
ARG OPENAI_API_KEY
ARG ANTHROPIC_API_KEY
ARG OPENROUTER_API_KEY
ARG OLLAMA_API_KEY
ARG LMSTUDIO_API_KEY
ARG LOCAL_LLM_API_KEY
ARG LOCAL_LLM_ENDPOINT
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ENV OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
ENV OLLAMA_API_KEY=${OLLAMA_API_KEY}
ENV LMSTUDIO_API_KEY=${LMSTUDIO_API_KEY}
ENV LOCAL_LLM_API_KEY=${LOCAL_LLM_API_KEY}
ENV LOCAL_LLM_ENDPOINT=${LOCAL_LLM_ENDPOINT}

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Install wget for healthchecks (handle SSL issues if behind proxy)
RUN apk add --no-cache --update-cache wget || \
    (apk add --no-cache --update-cache --allow-untrusted ca-certificates && \
     apk add --no-cache --update-cache wget) || true

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
RUN echo 'server { \
    listen 3000; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

