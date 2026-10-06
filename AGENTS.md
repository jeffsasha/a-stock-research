# Project instructions

For actual A-share data retrieval or new data adapters, read vendor/a-stock-data/SKILL.md carefully. It is the original upstream skill, not an importable Python package. Preserve that file and the upstream license. Follow its ticker normalization, units, date checks, preferred providers, prerequisite helpers and Eastmoney serial rate limits. Do not load it for conceptual questions requiring no retrieval.

The website uses lib/market.mjs to adapt the relevant embedded Python definitions to JavaScript HTTP handlers. Keep provider transport, date validation, caching, source metadata and missing-value handling shared between the UI and API. Never convert missing data to zero or evaluate executable provider responses. News and reports must keep original links and dates.

Use npm ci to install locked dependencies. npm run local starts the loopback-only Node server; npm run build targets Cloudflare Workers. The Node host is the fallback when Windows workerd cannot start. Tests: node --test tests/market.test.mjs; node node_modules/typescript/bin/tsc --noEmit. Real source checks: node scripts/live-test.mjs and node scripts/local-server.mjs --check. Check verification/*.json for the latest test dates.

Do not commit node_modules, .env files, credentials, local tool state or build caches. Original upstream files remain in vendor/a-stock-data; keep application changes outside that directory. Data source coverage varies by stock; report individual source failures explicitly.
