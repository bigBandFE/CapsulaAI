#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api"

# 2026-02-12 Run 2: Added timestamp to bypass deduplication during testing
TIMESTAMP=$(date +%s)
CAPSULE_CONTENT="Satya Nadella is the CEO of Microsoft since 2014. Microsoft was founded by Bill Gates and Paul Allen. The company is headquartered in Redmond, Washington. Microsoft recently invested $10 billion in OpenAI, which created ChatGPT. (Test Run 2 $TIMESTAMP)"

echo "🔍 Verifying Phase 3.1: Entity Relationships"
echo "==========================================="

# 1. Submit a capsule with rich relationships
echo "\n1. Submitting test capsule..."
CAPSULE_ID=$(curl -s -X POST "$API_URL/capsules" \
  -H "Content-Type: application/json" \
  -d "{
    \"originalContent\": \"$CAPSULE_CONTENT\",
    \"sourceType\": \"NOTE\"
  }" | jq -r '.id')

echo "Capsule ID: $CAPSULE_ID"

# Wait for processing
echo "Waiting for processing..."
sleep 20 # Give enough time for AI processing

# 2. Verify Processing Status
STATUS=$(curl -s "$API_URL/capsules/$CAPSULE_ID" | jq -r '.status')
echo "Status: $STATUS"

if [ "$STATUS" != "COMPLETED" ]; then
    echo "❌ Processing failed or timed out"
    exit 1
fi

# 3. Get Entity IDs
echo "\n3. Finding Entity IDs..."
# We need to find the IDs of the entities extracted
# Since we don't have a direct "get ID by name" API that returns just ID easily without search, 
# we'll list entities from the capsule or use the search API (if we had one for entities specifically)
# For now, let's use the entity timeline endpoint logic to find them by name

get_entity_id() {
  local name=$1
  local type=$2
  curl -s -G "$API_URL/entities/$name" --data-urlencode "type=$type" | jq -r '.id'
}

MICROSOFT_ID=$(get_entity_id "Microsoft" "ORGANIZATION")
SATYA_ID=$(get_entity_id "Satya Nadella" "PERSON")
OPENAI_ID=$(get_entity_id "OpenAI" "ORGANIZATION")

echo "Microsoft ID: $MICROSOFT_ID"
echo "Satya Nadella ID: $SATYA_ID"
echo "OpenAI ID: $OPENAI_ID"

if [ "$MICROSOFT_ID" == "null" ] || [ "$SATYA_ID" == "null" ]; then
    echo "❌ Failed to find expected entities"
    exit 1
fi

# 4. Verify Relationships (Direct)
echo "\n4. Verifying Direct Relationships..."
RELATIONSHIPS=$(curl -s "$API_URL/entities/$MICROSOFT_ID/relationships")
COUNT=$(echo $RELATIONSHIPS | jq '. | length')

echo "Found $COUNT relationships for Microsoft"
echo $RELATIONSHIPS | jq '.'

# Check for WORKS_FOR (Satya -> Microsoft)
HAS_SATYA=$(echo $RELATIONSHIPS | jq '[.[] | select(.relatedEntity.name == "Satya Nadella" and .type == "WORKS_FOR")] | length')
if [ "$HAS_SATYA" -gt 0 ]; then
    echo "✅ Relationship verified: Satya Nadella WORKS_FOR Microsoft"
else
    echo "❌ Missing relationship: Satya Nadella WORKS_FOR Microsoft"
fi

# Check for INVESTED_IN or PARTNERED_WITH (Microsoft -> OpenAI)
HAS_OPENAI=$(echo $RELATIONSHIPS | jq '[.[] | select(.relatedEntity.name == "OpenAI")] | length')
if [ "$HAS_OPENAI" -gt 0 ]; then
    echo "✅ Relationship verified: Microsoft -> OpenAI"
else
    echo "❌ Missing relationship: Microsoft -> OpenAI"
fi

# 5. Verify Path Finding
echo "\n5. Verifying Path Finding (Satya -> OpenAI)..."
PATH_RES=$(curl -s "$API_URL/graph/path?from=$SATYA_ID&to=$OPENAI_ID")
PATH_FOUND=$(echo $PATH_RES | jq '.found')

if [ "$PATH_FOUND" == "true" ]; then
    echo "✅ Path found: Satya Nadella -> ... -> OpenAI"
    echo $PATH_RES | jq '.path'
else
    echo "❌ No path found between Satya Nadella and OpenAI"
    echo $PATH_RES
fi

# 6. Verify Graph Stats
echo "\n6. Verifying Graph Stats..."
STATS=$(curl -s "$API_URL/graph/stats")
TOTAL=$(echo $STATS | jq '.totalRelationships')

echo "Total Relationships: $TOTAL"
if [ "$TOTAL" -gt 0 ]; then
    echo "✅ Graph stats verified"
else
    echo "❌ Graph stats empty"
fi

# 7. Verify Visualization Data
echo "\n7. Verifying Visualization Data..."
VIS=$(curl -s "$API_URL/graph/visualization?entityId=$MICROSOFT_ID&depth=1")
NODES=$(echo $VIS | jq '.nodes | length')
EDGES=$(echo $VIS | jq '.edges | length')

echo "Nodes: $NODES, Edges: $EDGES"
if [ "$NODES" -gt 0 ] && [ "$EDGES" -gt 0 ]; then
    echo "✅ Visualization data verified"
else
    echo "❌ Visualization data missing"
fi

echo "\nResult: Phase 3.1 Verification Complete ✅"
