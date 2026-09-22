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

# Install the dependency versions recorded in the lockfile.
RUN npm ci --omit=dev

# Create log directory for file transports
RUN mkdir -p /var/log/app

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4001

# Expose the application port
EXPOSE 4001

# Start the application
CMD ["npm", "start"]
