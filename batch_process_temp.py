#!/usr/bin/env python3
"""Temporary script to invoke Step Functions for past 50 dates.
Delete this file after use.
"""

import boto3
import json
from datetime import date, timedelta

# Configuration - UPDATE THESE VALUES
PATIENT_ID = "bscpc8wgc5@privaterelay.appleid.com"
STEP_FUNCTION_ARN = "arn:aws:states:us-east-1:219673122640:stateMachine:HealthStateMachine"
DAYS_BACK = 50

# Initialize Step Functions client
sfn = boto3.client('stepfunctions', region_name='us-east-1')

# Generate dates (oldest first)
dates = []
for i in range(DAYS_BACK):
    target_date = date.today() - timedelta(days=i)
    dates.append(target_date.strftime("%Y-%m-%d"))

# Reverse to process oldest first
dates = list(reversed(dates))

print(f"Processing {len(dates)} dates: {dates[0]} to {dates[-1]}")
print(f"Step Function: {STEP_FUNCTION_ARN}")
print()

# Invoke Step Functions for each date
execution_arns = []
failed_dates = []

for target_date in dates:
    try:
        # Create execution name (must be unique)
        execution_name = f"health-metrics-{target_date.replace('-', '')}-{PATIENT_ID[:8].replace('@', '')}"
        
        # Start execution
        response = sfn.start_execution(
            stateMachineArn=STEP_FUNCTION_ARN,
            name=execution_name,
            input=json.dumps({
                "patient_id": PATIENT_ID,
                "date": target_date
            })
        )
        
        execution_arn = response['executionArn']
        execution_arns.append(execution_arn)
        print(f"✓ Started {target_date}: {execution_arn.split(':')[-1]}")
        
    except Exception as e:
        print(f"✗ Failed {target_date}: {e}")
        failed_dates.append(target_date)

print()
print("=" * 60)
print(f"Summary:")
print(f"  Total dates: {len(dates)}")
print(f"  Successful: {len(execution_arns)}")
print(f"  Failed: {len(failed_dates)}")
if failed_dates:
    print(f"  Failed dates: {failed_dates}")
print("=" * 60)

