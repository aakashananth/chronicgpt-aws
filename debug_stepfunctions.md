# Debugging Step Functions - No Processed Data

## Quick Checks

### 1. Check Step Functions Execution Status

```bash
# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn "arn:aws:states:us-east-1:219673122640:stateMachine:HealthStateMachine" \
  --max-results 10

# Get details of a specific execution
aws stepfunctions describe-execution \
  --execution-arn "EXECUTION_ARN_HERE"
```

### 2. Check Lambda Logs

```bash
# Check process_metrics Lambda logs
aws logs tail /aws/lambda/process_metrics --follow

# Or check recent logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/process_metrics \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

### 3. Test Lambda Directly

```bash
# Test process_metrics directly
aws lambda invoke \
  --function-name process_metrics \
  --payload '{"patient_id": "bscpc8wgc5@privaterelay.appleid.com", "date": "2024-11-30"}' \
  response.json

cat response.json
```

## Common Issues

### Issue 1: Step Functions Not Passing Event Correctly
The Step Functions state machine might not be passing the event correctly between states.

**Check**: Look at the execution history in Step Functions console to see what event was passed to `process_metrics`.

### Issue 2: Lambda Returning Error Status
If `process_metrics` returns a 404 or error, Step Functions might be stopping.

**Check**: Look at CloudWatch logs for `process_metrics` Lambda.

### Issue 3: Missing Required Columns Error
The `detect_anomalies` function requires certain columns. If history is empty and current metrics are missing fields, it might fail.

**Check**: Look for errors about "Missing required columns" in logs.

### Issue 4: History Loading Issue
If `load_recent_history` is trying to load processed data that doesn't exist yet, it should still work (it skips missing days). But if there's an error, it might fail.

## Quick Fix: Test One Date Manually

```bash
# Test the full pipeline for one date
aws lambda invoke \
  --function-name fetch_raw_data \
  --payload '{"patient_id": "bscpc8wgc5@privaterelay.appleid.com", "date": "2024-11-30"}' \
  fetch_response.json

aws lambda invoke \
  --function-name process_metrics \
  --payload '{"patient_id": "bscpc8wgc5@privaterelay.appleid.com", "date": "2024-11-30"}' \
  process_response.json

cat process_response.json
```

