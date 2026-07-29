FROM node:22-slim AS builder
WORKDIR /app
# .npmrc carries legacy-peer-deps=true, required because react-simple-maps@3
# declares a react <=18 peer. It must land before npm ci, not with COPY . .
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NODE_ENV=production
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
EXPOSE 3001
CMD ["npm", "run", "start", "--", "-p", "3001"]