#!/bin/sh
echo "Testing Headless Crawler..."
curl -X POST http://localhost:3000/api/ingest/url \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com", "tags": ["test", "headless"] }'
echo "\nCrawler test submitted."
