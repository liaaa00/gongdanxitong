FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
ENV npm_config_nodedir=/usr/local
ENV npm_config_build_from_source=true
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/scripts/repair-onboarding-contact-bank-orders.ts ./scripts/repair-onboarding-contact-bank-orders.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
