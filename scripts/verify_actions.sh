#!/bin/sh
echo "Testing Action Extraction..."
curl -X POST http://localhost:3000/api/capsules \
  -H "Content-Type: application/json" \
  -d '{
    "originalContent": "Please remind me to submit the Q4 report by next Friday at 5pm. Also need to follow up with Alice about the design review.",
    "sourceType": "NOTE"
  }'
echo "\nAction Extraction test submitted."
