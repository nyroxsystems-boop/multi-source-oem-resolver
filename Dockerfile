# Base image with Playwright + Chromium
FROM apify/actor-node-playwright-chrome:20

USER root
WORKDIR /usr/src/app

# Install dependencies (browsers already included in base image)
COPY package*.json ./
RUN chown -R node:node /usr/src/app

USER node
RUN npm ci --legacy-peer-deps --unsafe-perm --ignore-scripts

# Use preinstalled Playwright browsers from the base image; skip downloads
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/pw-browsers
ENV APIFY_DISABLE_BROWSER_INSTALL=1

# Copy full source with proper ownership
COPY --chown=node:node . ./

# Now run build (tsconfig/src present)
RUN npm run build

CMD ["npm", "start"]
