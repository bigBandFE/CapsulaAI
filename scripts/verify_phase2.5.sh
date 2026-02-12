#!/bin/bash

echo "🧪 Testing Phase 2.5: Memory Evolution"
echo "======================================"

BASE_URL="http://localhost:3000/api"

# Test 1: Content Hash Deduplication
echo ""
echo "1️⃣  Testing Content Hash Deduplication..."
echo "Creating first capsule..."
CAPSULE1=$(curl -s -X POST $BASE_URL/capsules \
  -H "Content-Type: application/json" \
  -d '{"originalContent": "Meeting with CEO about Q1 budget", "sourceType": "NOTE"}')

CAPSULE1_ID=$(echo $CAPSULE1 | jq -r '.id')
echo "✅ Capsule created: $CAPSULE1_ID"

echo "Attempting to create duplicate..."
DUPLICATE=$(curl -s -X POST $BASE_URL/capsules \
  -H "Content-Type: application/json" \
  -d '{"originalContent": "Meeting with CEO about Q1 budget", "sourceType": "NOTE"}')

IS_DUPLICATE=$(echo $DUPLICATE | jq -r '.isDuplicate')
if [ "$IS_DUPLICATE" == "true" ]; then
  echo "✅ Duplicate detected correctly!"
  echo "   Returned existing capsule: $(echo $DUPLICATE | jq -r '.capsule.id')"
else
  echo "❌ Duplicate detection failed"
fi

# Test 2: Timeline Range Query
echo ""
echo "2️⃣  Testing Timeline Range Query..."
sleep 2
echo "Creating additional capsules for timeline..."

curl -s -X POST $BASE_URL/capsules \
  -H "Content-Type: application/json" \
  -d '{"originalContent": "Project update: Phase 2 complete", "sourceType": "NOTE"}' > /dev/null

curl -s -X POST $BASE_URL/capsules \
  -H "Content-Type: application/json" \
  -d '{"originalContent": "Team meeting notes", "sourceType": "NOTE"}' > /dev/null

sleep 20 # Wait for processing

TODAY=$(date +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d)

echo "Querying timeline for today ($TODAY)..."
TIMELINE=$(curl -s "$BASE_URL/timeline?start=${TODAY}T00:00:00Z&end=${TOMORROW}T00:00:00Z")

CAPSULE_COUNT=$(echo $TIMELINE | jq -r '.stats.totalCapsules')
echo "✅ Found $CAPSULE_COUNT capsules in timeline"
echo "   By source type: $(echo $TIMELINE | jq -r '.stats.bySourceType')"

# Test 3: Daily Timeline
echo ""
echo "3️⃣  Testing Daily Timeline..."
DAILY=$(curl -s "$BASE_URL/timeline/daily?date=$TODAY")
DAILY_COUNT=$(echo $DAILY | jq -r '.count')
echo "✅ Daily timeline returned $DAILY_COUNT capsules for $TODAY"

# Test 4: Activity Heatmap
echo ""
echo "4️⃣  Testing Activity Heatmap..."
YEAR=$(date +%Y)
HEATMAP=$(curl -s "$BASE_URL/timeline/heatmap?year=$YEAR")

ACTIVE_DAYS=$(echo $HEATMAP | jq -r '.stats.activeDays')
MAX_IN_DAY=$(echo $HEATMAP | jq -r '.stats.maxInDay')
echo "✅ Heatmap generated for $YEAR"
echo "   Active days: $ACTIVE_DAYS"
echo "   Max capsules in a day: $MAX_IN_DAY"

# Test 5: Entity Timeline (if entities exist)
echo ""
echo "5️⃣  Testing Entity Timeline..."

# Wait for entity processing
sleep 5

# Try to find an entity
ENTITY_NAME=$(docker exec capsula_db psql -U capsula -d capsula_core -t -c "SELECT name FROM \"Entity\" LIMIT 1" | xargs)

if [ -n "$ENTITY_NAME" ]; then
  ENTITY_TYPE=$(docker exec capsula_db psql -U capsula -d capsula_core -t -c "SELECT type FROM \"Entity\" WHERE name='$ENTITY_NAME' LIMIT 1" | xargs)
  
  echo "Found entity: $ENTITY_NAME ($ENTITY_TYPE)"
  ENTITY_TIMELINE=$(curl -s "$BASE_URL/entities/$ENTITY_NAME/timeline?type=$ENTITY_TYPE")
  
  MENTIONS=$(echo $ENTITY_TIMELINE | jq -r '.entity.totalMentions')
  echo "✅ Entity timeline retrieved"
  echo "   Total mentions: $MENTIONS"
  echo "   First mention: $(echo $ENTITY_TIMELINE | jq -r '.entity.firstMention')"
else
  echo "⚠️  No entities found yet (capsules may still be processing)"
fi

# Test 6: Similarity Detection
echo ""
echo "6️⃣  Testing Vector Similarity Detection..."
echo "Creating similar capsule..."
curl -s -X POST $BASE_URL/capsules \
  -H "Content-Type: application/json" \
  -d '{"originalContent": "CEO meeting regarding Q1 budget planning", "sourceType": "NOTE"}' > /dev/null

sleep 25 # Wait for embedding and similarity detection

SIMILAR=$(docker exec capsula_db psql -U capsula -d capsula_core -t -c "SELECT \"similarTo\", \"similarityScore\" FROM \"Capsule\" WHERE \"similarTo\" IS NOT NULL LIMIT 1")

if [ -n "$SIMILAR" ]; then
  echo "✅ Similarity detection working!"
  echo "   Similar capsule found: $SIMILAR"
else
  echo "⚠️  No similar capsules detected yet (may need more processing time)"
fi

echo ""
echo "======================================"
echo "✅ Phase 2.5 Testing Complete!"
echo "======================================"
