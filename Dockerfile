# Use Node.js LTS version
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

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
