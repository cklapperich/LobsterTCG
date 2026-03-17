# Image Caching Upgrade: Vercel API Proxy

## Current Architecture

Card images are loaded directly from the Limitless TCG CDN:
```
https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/{SET}/{SET}_{LOCALID}_EN.webp
```

Each user's browser fetches images individually from the external CDN.

## Future Upgrade: Vercel Serverless Proxy

A Vercel serverless function at `/api/card-image` would proxy requests to Limitless with cache headers, giving us a shared CDN cache layer via Vercel's edge network.

### How It Works

1. Client requests `/api/card-image?set=A1&id=001`
2. Vercel function fetches from Limitless CDN (cache miss) or serves from Vercel's edge cache (cache hit)
3. Response includes `Cache-Control` headers for long-term caching (images don't change)

### Benefits

- **Shared cache**: One fetch from Limitless serves all users via Vercel's edge
- **Reduced external bandwidth**: Less load on the Limitless CDN
- **Faster loads**: Vercel edge nodes are geographically distributed
- **Resilience**: Could add fallback logic if the upstream CDN is unavailable

### Trade-offs

- Additional infrastructure to deploy and maintain
- Vercel serverless function costs (likely minimal for image proxying)
- Added latency on cache misses (extra hop)

### When to Implement

Consider this upgrade if:
- Image load times become a user-facing concern
- We want to reduce dependency on external CDN availability
- We need to transform images (resize, format conversion, etc.)
