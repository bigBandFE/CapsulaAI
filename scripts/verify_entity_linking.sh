#!/bin/bash

echo "🧪 Testing Entity Linking (Graph)"
echo "=================================="

# Submit a capsule with multiple entities
CAPSULE_ID=$(curl -s -X POST http://localhost:3000/api/capsules \
  -H "Content-Type: application/json" \
  -d '{
    "originalContent": "Had lunch with Elon Musk from Tesla and discussed SpaceX partnership. Budget approved: $100,000.",
    "sourceType": "NOTE"
  }' | jq -r '.id')

echo "✅ Capsule created: $CAPSULE_ID"
echo "⏳ Waiting for processing (20s)..."
sleep 20

echo ""
echo "📊 Checking Entity Graph..."
docker exec capsula_postgres psql -U capsula -d capsula_core -c "
  SELECT e.name, e.type, COUNT(c.id) as capsule_count
  FROM \"Entity\" e
  LEFT JOIN \"_CapsuleToEntity\" ce ON e.id = ce.\"B\"
  LEFT JOIN \"Capsule\" c ON ce.\"A\" = c.id
  GROUP BY e.id, e.name, e.type
  ORDER BY capsule_count DESC;
"

echo ""
echo "✅ Entity Linking Test Complete!"
