#!/bin/bash
# Temporary script to invoke Step Functions for past 50 dates using AWS CLI
# Delete this file after use

PATIENT_ID="bscpc8wgc5@privaterelay.appleid.com"
STEP_FUNCTION_ARN="arn:aws:states:us-east-1:219673122640:stateMachine:HealthStateMachine"
DAYS_BACK=50

echo "Processing $DAYS_BACK dates..."
echo "Step Function: $STEP_FUNCTION_ARN"
echo ""

SUCCESS=0
FAILED=0

for i in $(seq 0 $((DAYS_BACK - 1))); do
  # Calculate date (days back from today)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    TARGET_DATE=$(date -v-${i}d +%Y-%m-%d)
  else
    # Linux
    TARGET_DATE=$(date -d "$i days ago" +%Y-%m-%d)
  fi
  
  # Create execution name (must be unique, max 80 chars)
  EXEC_NAME="health-${TARGET_DATE//-/}-${PATIENT_ID:0:8}"
  EXEC_NAME="${EXEC_NAME//@/}"
  
  # Invoke Step Functions
  if aws stepfunctions start-execution \
    --state-machine-arn "$STEP_FUNCTION_ARN" \
    --name "$EXEC_NAME" \
    --input "{\"patient_id\":\"$PATIENT_ID\",\"date\":\"$TARGET_DATE\"}" \
    --region us-east-1 > /dev/null 2>&1; then
    echo "✓ Started $TARGET_DATE"
    ((SUCCESS++))
  else
    echo "✗ Failed $TARGET_DATE"
    ((FAILED++))
  fi
done

echo ""
echo "============================================================"
echo "Summary:"
echo "  Successful: $SUCCESS"
echo "  Failed: $FAILED"
echo "============================================================"

