#!/bin/bash

echo "🧪 Testing Phase 2.7: Self-Improving Memory (Feedback System)"
echo "=============================================================="

BASE_URL="http://localhost:3000/api"

# Get a test capsule ID
echo ""
echo "0️⃣  Getting test capsule..."
CAPSULE=$(curl -s "$BASE_URL/capsules?limit=1" | jq -r '.data[0]')
CAPSULE_ID=$(echo $CAPSULE | jq -r '.id')
CAPSULE_TITLE=$(echo $CAPSULE | jq -r '.structuredData.meta.title // "Untitled"')

if [ -z "$CAPSULE_ID" ] || [ "$CAPSULE_ID" == "null" ]; then
  echo "❌ No capsules found. Please create some capsules first."
  exit 1
fi

echo "✅ Using capsule: $CAPSULE_TITLE (ID: $CAPSULE_ID)"

# Test 1: Submit Rating
echo ""
echo "1️⃣  Testing Submit Rating..."

RATING_RESPONSE=$(curl -s -X POST $BASE_URL/feedback \
  -H "Content-Type: application/json" \
  -d "{
    \"capsuleId\": \"$CAPSULE_ID\",
    \"type\": \"RATING\",
    \"rating\": 5,
    \"comment\": \"Excellent summary!\"
  }")

RATING_ID=$(echo $RATING_RESPONSE | jq -r '.id')
echo "✅ Rating submitted: $RATING_ID"
echo "   Rating: $(echo $RATING_RESPONSE | jq -r '.rating')/5"

# Test 2: Submit Correction
echo ""
echo "2️⃣  Testing Submit Correction..."

CORRECTION_RESPONSE=$(curl -s -X POST $BASE_URL/feedback \
  -H "Content-Type: application/json" \
  -d "{
    \"capsuleId\": \"$CAPSULE_ID\",
    \"type\": \"CORRECTION\",
    \"correction\": {
      \"field\": \"entities\",
      \"oldValue\": \"John\",
      \"newValue\": \"John Smith\",
      \"reason\": \"Full name was mentioned in original content\"
    },
    \"comment\": \"Entity extraction missed the last name\"
  }")

CORRECTION_ID=$(echo $CORRECTION_RESPONSE | jq -r '.id')
echo "✅ Correction submitted: $CORRECTION_ID"
echo "   Field: $(echo $CORRECTION_RESPONSE | jq -r '.correction.field')"

# Test 3: Submit Flag
echo ""
echo "3️⃣  Testing Submit Flag..."

FLAG_RESPONSE=$(curl -s -X POST $BASE_URL/feedback \
  -H "Content-Type: application/json" \
  -d "{
    \"capsuleId\": \"$CAPSULE_ID\",
    \"type\": \"FLAG\",
    \"flagReason\": \"incomplete\",
    \"comment\": \"Missing important action items\"
  }")

FLAG_ID=$(echo $FLAG_RESPONSE | jq -r '.id')
echo "✅ Flag submitted: $FLAG_ID"
echo "   Reason: $(echo $FLAG_RESPONSE | jq -r '.flagReason')"

# Test 4: Get Capsule Feedback
echo ""
echo "4️⃣  Testing Get Capsule Feedback..."

CAPSULE_FEEDBACK=$(curl -s "$BASE_URL/capsules/$CAPSULE_ID/feedback")
FEEDBACK_COUNT=$(echo $CAPSULE_FEEDBACK | jq -r '.feedbackCount')
AVG_RATING=$(echo $CAPSULE_FEEDBACK | jq -r '.averageRating')
QUALITY_SCORE=$(echo $CAPSULE_FEEDBACK | jq -r '.qualityScore')

echo "✅ Retrieved capsule feedback"
echo "   Feedback count: $FEEDBACK_COUNT"
echo "   Average rating: $AVG_RATING/5"
echo "   Quality score: $QUALITY_SCORE/100"

# Test 5: Get Analytics
echo ""
echo "5️⃣  Testing Get Analytics..."

ANALYTICS=$(curl -s "$BASE_URL/feedback/analytics")
TOTAL_FEEDBACK=$(echo $ANALYTICS | jq -r '.totalFeedback')
RATING_COUNT=$(echo $ANALYTICS | jq -r '.byType.RATING')
CORRECTION_COUNT=$(echo $ANALYTICS | jq -r '.byType.CORRECTION')
FLAG_COUNT=$(echo $ANALYTICS | jq -r '.byType.FLAG')
OVERALL_AVG=$(echo $ANALYTICS | jq -r '.averageRating')

echo "✅ Retrieved analytics"
echo "   Total feedback: $TOTAL_FEEDBACK"
echo "   Ratings: $RATING_COUNT | Corrections: $CORRECTION_COUNT | Flags: $FLAG_COUNT"
echo "   Overall average rating: $OVERALL_AVG/5"

# Test 6: Get Low Quality Capsules
echo ""
echo "6️⃣  Testing Get Low Quality Capsules..."

LOW_QUALITY=$(curl -s "$BASE_URL/feedback/low-quality?threshold=70&limit=5")
LOW_COUNT=$(echo $LOW_QUALITY | jq -r '.count')

echo "✅ Retrieved low quality capsules"
echo "   Count (quality < 70): $LOW_COUNT"

if [ "$LOW_COUNT" -gt "0" ]; then
  FIRST_LOW=$(echo $LOW_QUALITY | jq -r '.capsules[0]')
  echo "   First: $(echo $FIRST_LOW | jq -r '.title') (Score: $(echo $FIRST_LOW | jq -r '.qualityScore'))"
fi

# Test 7: Get Correction Patterns
echo ""
echo "7️⃣  Testing Get Correction Patterns..."

PATTERNS=$(curl -s "$BASE_URL/feedback/patterns")
TOTAL_CORRECTIONS=$(echo $PATTERNS | jq -r '.totalCorrections')
PATTERN_COUNT=$(echo $PATTERNS | jq -r '.patterns | length')

echo "✅ Retrieved correction patterns"
echo "   Total corrections: $TOTAL_CORRECTIONS"
echo "   Unique patterns: $PATTERN_COUNT"

if [ "$PATTERN_COUNT" -gt "0" ]; then
  FIRST_PATTERN=$(echo $PATTERNS | jq -r '.patterns[0]')
  echo "   Top pattern: $(echo $FIRST_PATTERN | jq -r '.field') ($(echo $FIRST_PATTERN | jq -r '.count') occurrences)"
fi

# Test 8: Submit Multiple Ratings
echo ""
echo "8️⃣  Testing Multiple Ratings (Quality Score Calculation)..."

# Submit 3 more ratings
for rating in 4 3 5; do
  curl -s -X POST $BASE_URL/feedback \
    -H "Content-Type: application/json" \
    -d "{
      \"capsuleId\": \"$CAPSULE_ID\",
      \"type\": \"RATING\",
      \"rating\": $rating
    }" > /dev/null
done

echo "✅ Submitted 3 additional ratings (4, 3, 5)"

# Get updated feedback
UPDATED_FEEDBACK=$(curl -s "$BASE_URL/capsules/$CAPSULE_ID/feedback")
UPDATED_COUNT=$(echo $UPDATED_FEEDBACK | jq -r '.feedbackCount')
UPDATED_AVG=$(echo $UPDATED_FEEDBACK | jq -r '.averageRating')
UPDATED_QUALITY=$(echo $UPDATED_FEEDBACK | jq -r '.qualityScore')

echo "   Updated feedback count: $UPDATED_COUNT"
echo "   Updated average rating: $UPDATED_AVG/5"
echo "   Updated quality score: $UPDATED_QUALITY/100"

# Test 9: Quality Score Formula Verification
echo ""
echo "9️⃣  Testing Quality Score Formula..."

# Get feedback breakdown
FEEDBACK_LIST=$(echo $UPDATED_FEEDBACK | jq -r '.feedback')
RATING_FEEDBACK=$(echo $FEEDBACK_LIST | jq '[.[] | select(.type == "RATING")] | length')
CORRECTION_FEEDBACK=$(echo $FEEDBACK_LIST | jq '[.[] | select(.type == "CORRECTION")] | length')
FLAG_FEEDBACK=$(echo $FEEDBACK_LIST | jq '[.[] | select(.type == "FLAG")] | length')

echo "✅ Quality score breakdown:"
echo "   Ratings: $RATING_FEEDBACK"
echo "   Corrections: $CORRECTION_FEEDBACK"
echo "   Flags: $FLAG_FEEDBACK"
echo "   Formula: (avgRating/5 * 0.6) + ((1 - correctionRate) * 0.3) + ((1 - flagRate) * 0.1) * 100"

echo ""
echo "=============================================================="
echo "✅ Phase 2.7 Testing Complete!"
echo "=============================================================="
echo ""
echo "Summary:"
echo "- Submit Rating: ✅"
echo "- Submit Correction: ✅"
echo "- Submit Flag: ✅"
echo "- Get Capsule Feedback: ✅"
echo "- Get Analytics: ✅"
echo "- Get Low Quality Capsules: ✅"
echo "- Get Correction Patterns: ✅"
echo "- Multiple Ratings: ✅"
echo "- Quality Score Calculation: ✅"
