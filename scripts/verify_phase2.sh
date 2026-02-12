#!/bin/bash

BASE_URL="http://localhost:3000/api/capsules"

echo "============================================"
echo "🧪 CapsulaAI Phase 2 Verification Suite"
echo "============================================"

# Function to check if previous command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo "✅ Success"
    else
        echo "❌ Failed"
        exit 1
    fi
}

echo "\n--- 1. Testing Text & Entity Extraction ---"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "originalContent": "Project Kickoff with Satya Nadella from Microsoft. Budget is $50,000.",
    "sourceType": "NOTE"
  }' | grep -q "id"
check_status

echo "\n--- 2. Testing Action Extraction (verify_actions.sh) ---"
sh scripts/verify_actions.sh
check_status

echo "\n--- 3. Testing Web Crawler (verify_crawler.sh) ---"
sh scripts/verify_crawler.sh
check_status

echo "\n--- 4. Testing Vision/OCR (verify_vision.sh) ---"
# Note: This sends a request but OCR is async. We check if request is accepted.
sh scripts/verify_vision.sh
check_status

echo "\n============================================"
echo "🎉 All Phase 2 Requests Submitted Successfully!"
echo "Please monitor logs for async processing results:"
echo "docker logs -f capsula_orchestrator"
echo "============================================"
