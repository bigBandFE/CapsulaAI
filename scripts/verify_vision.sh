#!/bin/sh
echo "Testing LLM Vision Strategy..."

# 1. Update Strategy Config (Triggered via specific Tag or Env var in real app)
# For this test, we assume the code defaults to Local, but we can't easily change static state via API yet.
# Feature Request: Add API to switch Vision Strategy? 
# OR: We just test the default path again, and I manually switch the code to check LLM path?

# Let's send a request and see logs to confirm it uses the configured strategy.
curl -X POST http://localhost:3000/api/capsules \
  -H "Content-Type: application/json" \
  -d '{
    "originalContent": "",
    "sourceType": "IMAGE"
  }'

echo "\nVision test submitted."
