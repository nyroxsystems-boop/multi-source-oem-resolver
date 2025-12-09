# Base image with Playwright + Chromium
FROM apify/actor-node-playwright-chrome:20

# Ensure we have permissions to install dependencies
USER root
WORKDIR /usr/src/app

# Install dependencies first (production, but with TS available)
COPY package*.json ./
RUN chown -R node:node /usr/src/app
USER node
RUN npm ci --legacy-peer-deps --unsafe-perm

# Copy source as node user
COPY --chown=node:node . ./

# Build TypeScript -> dist
RUN npm run build

# Start the actor
CMD ["npm", "start"]
