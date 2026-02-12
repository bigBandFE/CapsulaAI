#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api"
CAPSULE_ID="dbfe3882-d411-4a3e-8ea5-5872356a5375"

echo "🔍 Verifying Phase 3.1 Results for Capsule $CAPSULE_ID"
echo "==================================================="

# 1. Get Entity IDs
echo "\n1. Finding Entity IDs..."
get_entity_id() {
  local name=$1
  local type=$2
  # URL encode name manually if needed or rely on curl --data-urlencode
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

# 2. Verify Relationships (Direct)
echo "\n2. Verifying Direct Relationships..."
RELATIONSHIPS=$(curl -s "$API_URL/entities/$MICROSOFT_ID/relationships")
COUNT=$(echo $RELATIONSHIPS | jq '. | length')

echo "Found $COUNT relationships for Microsoft"
echo $RELATIONSHIPS | jq '.'

# Check for specific relationships
# Note: Type might be OTHER if fallback was used, or specific type if AI extracted correctly
HAS_SATYA=$(echo $RELATIONSHIPS | jq '[.[] | select(.relatedEntity.name == "Satya Nadella")] | length')
if [ "$HAS_SATYA" -gt 0 ]; then
    echo "✅ Relationship verified: Satya Nadella <-> Microsoft"
else
    echo "❌ Missing relationship: Satya Nadella <-> Microsoft"
fi

HAS_OPENAI=$(echo $RELATIONSHIPS | jq '[.[] | select(.relatedEntity.name == "OpenAI")] | length')
if [ "$HAS_OPENAI" -gt 0 ]; then
    echo "✅ Relationship verified: Microsoft <-> OpenAI"
else
    echo "❌ Missing relationship: Microsoft <-> OpenAI"
fi

# 3. Verify Path Finding
echo "\n3. Verifying Path Finding (Satya -> OpenAI)..."
# Path: Satya -> Microsoft -> OpenAI
PATH_RES=$(curl -s "$API_URL/graph/path?from=$SATYA_ID&to=$OPENAI_ID")
PATH_FOUND=$(echo $PATH_RES | jq '.found')

if [ "$PATH_FOUND" == "true" ]; then
    echo "✅ Path found: Satya Nadella -> ... -> OpenAI"
    echo $PATH_RES | jq '.path'
else
    echo "❌ No path found between Satya Nadella and OpenAI"
    echo $PATH_RES
fi

# 4. Verify Graph Stats
echo "\n4. Verifying Graph Stats..."
STATS=$(curl -s "$API_URL/graph/stats")
TOTAL=$(echo $STATS | jq '.totalRelationships')

echo "Total Relationships: $TOTAL"
if [ "$TOTAL" -gt 0 ]; then
    echo "✅ Graph stats verified"
    echo $STATS | jq '.'
else
    echo "❌ Graph stats empty"
fi

# 5. Verify Visualization Data
echo "\n5. Verifying Visualization Data..."
VIS=$(curl -s "$API_URL/graph/visualization?entityId=$MICROSOFT_ID&depth=1")
NODES=$(echo $VIS | jq '.nodes | length')
EDGES=$(echo $VIS | jq '.edges | length')

echo "Nodes: $NODES, Edges: $EDGES"
if [ "$NODES" -gt 0 ] && [ "$EDGES" -gt 0 ]; then
    echo "✅ Visualization data verified"
else
    echo "❌ Visualization data missing"
fi

echo "\nResult: Phase 3.1 Check Complete ✅"
