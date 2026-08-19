# Product C app shell

This is the Product C customer-support app shell for Riverside Books. It is the storefront-facing
chat interface for stock checks, hours, policy questions, and event inquiries.

## Current state

The app currently delivers a styled support-bot mockup and a working local smoke test.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## Notes

The app intentionally keeps the model provider behind a future abstraction layer and uses a
grounded, facts-first support flow instead of a generic AI assistant.
