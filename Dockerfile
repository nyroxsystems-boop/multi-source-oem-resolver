# Start from Apify image that already includes Playwright + Chrome/Chromium binaries
FROM apify/actor-node-playwright-chrome:20

WORKDIR /usr/src/app

# Install deps (includes postinstall build)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source
COPY . ./

# Build TS -> dist (noop if already built by postinstall)
RUN npm run build

# Default start
CMD ["npm", "start"]
