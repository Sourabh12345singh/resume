FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . ./

# Expose the Vite dev server port.
EXPOSE 5173

# Start the app and bind to all interfaces for container access.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]