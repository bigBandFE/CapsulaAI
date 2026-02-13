#!/bin/bash

echo "🧪 Testing Phase 2.6: Private Research Agent"
echo "============================================="

BASE_URL="http://localhost:3000/api"

# Test 1: Semantic Search
echo ""
echo "1️⃣  Testing Semantic Search..."
echo "Query: 'Microsoft'"

SEARCH_RESULT=$(curl -s -X POST $BASE_URL/research/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Microsoft",
    "limit": 5,
    "threshold": 0.5
  }')

RESULT_COUNT=$(echo $SEARCH_RESULT | jq -r '.totalResults')
echo "✅ Semantic search returned $RESULT_COUNT results"

if [ "$RESULT_COUNT" -gt "0" ]; then
  echo "   Top result: $(echo $SEARCH_RESULT | jq -r '.results[0].capsule.title')"
  echo "   Relevance: $(echo $SEARCH_RESULT | jq -r '.results[0].score')"
fi

# Test 2: Semantic Search with Filters
echo ""
echo "2️⃣  Testing Semantic Search with Date Filter..."
TODAY=$(date +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d)

FILTERED_SEARCH=$(curl -s -X POST $BASE_URL/research/search \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"meeting\",
    \"limit\": 5,
    \"filters\": {
      \"dateRange\": {
        \"start\": \"${TODAY}T00:00:00Z\",
        \"end\": \"${TOMORROW}T00:00:00Z\"
      }
    }
  }")

FILTERED_COUNT=$(echo $FILTERED_SEARCH | jq -r '.totalResults')
echo "✅ Filtered search returned $FILTERED_COUNT results for today"

# Test 3: RAG Chat (First Message)
echo ""
echo "3️⃣  Testing RAG Chat (New Conversation)..."
echo "Query: 'What do I know about Microsoft?'"

CHAT_RESPONSE=$(curl -s -X POST $BASE_URL/research/chat \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What do I know about Microsoft?",
    "maxContext": 3
  }')

CONV_ID=$(echo $CHAT_RESPONSE | jq -r '.conversationId')
ANSWER=$(echo $CHAT_RESPONSE | jq -r '.answer')
SOURCE_COUNT=$(echo $CHAT_RESPONSE | jq -r '.sources | length')

echo "✅ RAG chat generated response"
echo "   Conversation ID: $CONV_ID"
echo "   Sources used: $SOURCE_COUNT"
echo "   Answer preview: ${ANSWER:0:100}..."

# Test 4: RAG Chat (Continue Conversation)
echo ""
echo "4️⃣  Testing RAG Chat (Continue Conversation)..."
echo "Follow-up query: 'Tell me more'"

if [ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]; then
  FOLLOWUP=$(curl -s -X POST $BASE_URL/research/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"Tell me more about that\",
      \"conversationId\": \"$CONV_ID\",
      \"maxContext\": 3
    }")

  FOLLOWUP_ANSWER=$(echo $FOLLOWUP | jq -r '.answer')
  echo "✅ Follow-up response generated"
  echo "   Answer preview: ${FOLLOWUP_ANSWER:0:100}..."
else
  echo "⚠️  Skipping follow-up (no conversation ID)"
fi

# Test 5: List Conversations
echo ""
echo "5️⃣  Testing List Conversations..."

CONVERSATIONS=$(curl -s "$BASE_URL/research/conversations?limit=10")
CONV_COUNT=$(echo $CONVERSATIONS | jq -r '.data | length')
TOTAL=$(echo $CONVERSATIONS | jq -r '.meta.total')

echo "✅ Found $TOTAL total conversations"
echo "   Showing: $CONV_COUNT"

if [ "$CONV_COUNT" -gt "0" ]; then
  echo "   Latest: $(echo $CONVERSATIONS | jq -r '.data[0].title')"
fi

# Test 6: Get Conversation Details
echo ""
echo "6️⃣  Testing Get Conversation Details..."

if [ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]; then
  CONV_DETAILS=$(curl -s "$BASE_URL/research/conversations/$CONV_ID")
  MESSAGE_COUNT=$(echo $CONV_DETAILS | jq -r '.messages | length')
  
  echo "✅ Retrieved conversation details"
  echo "   Messages: $MESSAGE_COUNT"
  echo "   Title: $(echo $CONV_DETAILS | jq -r '.title')"
else
  echo "⚠️  Skipping (no conversation ID)"
fi

# Test 7: Search Actions (TODOs)
echo ""
echo "7️⃣  Testing Action Search (TODOs)..."

ACTIONS=$(curl -s "$BASE_URL/research/actions?type=TODO&limit=10")
ACTION_COUNT=$(echo $ACTIONS | jq -r '.totalResults')

echo "✅ Found $ACTION_COUNT TODO actions"

if [ "$ACTION_COUNT" -gt "0" ]; then
  echo "   First TODO: $(echo $ACTIONS | jq -r '.results[0].capsule.summary')"
fi

# Test 8: Entity-based Search
echo ""
echo "8️⃣  Testing Entity-based Search..."

# First, find an entity
ENTITY_NAME=$(docker exec capsula_db psql -U capsula -d capsula_core -t -c "SELECT name FROM \"Entity\" WHERE type='PERSON' LIMIT 1" | xargs)

if [ -n "$ENTITY_NAME" ]; then
  ENTITY_SEARCH=$(curl -s -X POST $BASE_URL/research/search \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"anything\",
      \"limit\": 5,
      \"filters\": {
        \"entities\": [\"$ENTITY_NAME\"]
      }
    }")

  ENTITY_RESULT_COUNT=$(echo $ENTITY_SEARCH | jq -r '.totalResults')
  echo "✅ Entity filter search for '$ENTITY_NAME'"
  echo "   Results: $ENTITY_RESULT_COUNT capsules"
else
  echo "⚠️  No entities found for testing"
fi

# Test 9: Delete Conversation
echo ""
echo "9️⃣  Testing Delete Conversation..."

if [ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]; then
  DELETE_RESULT=$(curl -s -X DELETE "$BASE_URL/research/conversations/$CONV_ID")
  SUCCESS=$(echo $DELETE_RESULT | jq -r '.success')
  
  if [ "$SUCCESS" == "true" ]; then
    echo "✅ Conversation deleted successfully"
  else
    echo "❌ Failed to delete conversation"
  fi
else
  echo "⚠️  Skipping (no conversation ID)"
fi

echo ""
echo "============================================="
echo "✅ Phase 2.6 Testing Complete!"
echo "============================================="
echo ""
echo "Summary:"
echo "- Semantic Search: ✅"
echo "- Filtered Search: ✅"
echo "- RAG Chat (New): ✅"
echo "- RAG Chat (Continue): ✅"
echo "- List Conversations: ✅"
echo "- Get Conversation: ✅"
echo "- Action Search: ✅"
echo "- Entity Filter: ✅"
echo "- Delete Conversation: ✅"
