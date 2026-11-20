FROM node:22.20.0-alpine
WORKDIR /app
RUN addgroup -S staging && adduser -S staging -G staging
COPY worker/guard/g05-staging/server.ts ./server.ts
ENV NODE_ENV=production
ENV G05_STAGING_HOST=0.0.0.0
ENV G05_STAGING_PORT=4115
USER staging
EXPOSE 4115
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+(process.env.G05_STAGING_PORT||'4115')+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "server.ts"]
