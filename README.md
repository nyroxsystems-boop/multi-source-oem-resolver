# Multi-Source OEM Resolver

This actor scrapes multiple sources (RealOEM, PartSouq, 7zap, Autodoc) to resolve OEM part numbers from VIN/model/part queries using Playwright + Apify/Crawlee.

## Inputs
- `rawQuery` (required)
- `vin`, `brand`, `model`, `year`, `engineCode` (optional helpers)
- `partQuery` (part name)
- Or `queries: [...]` array of the above

## Proxy (ScraperAPI example)
To route through ScraperAPI, configure `proxyConfiguration` in `src/main.ts`:
```ts
// proxyConfiguration: await Actor.createProxyConfiguration({
//   proxyUrls: ['http://scraperapi:YOUR_API_KEY@proxy-server.scraperapi.com:8001'],
// }),
```
For simple HTTP fetches (non-Playwright), you can call:
`https://api.scraperapi.com/?api_key=YOUR_KEY&url=ENCODED_URL`

## Run
```bash
npm install
npm run build
apify run
```

## Notes
- EPC sources are prioritized; Autodoc used as cross-ref.
- Logging reports OEM parse counts and sample OEMs per provider.
