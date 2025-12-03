# Use Node.js LTS version with full image (not slim) for Sharp compatibility
FROM node:20

# Set working directory
WORKDIR /app

# Install system dependencies required for Sharp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies with better timeout and retry settings
RUN npm install --timeout=300000 --retry=3

# Install node-cache
RUN npm install node-cache

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4001
ENV REDIS_URL=redis://redis:6379

# Expose the application port
EXPOSE 4001

# Start the application
CMD ["npm", "start"]
