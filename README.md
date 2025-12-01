# ChronicGPT AWS Backend

Production-ready serverless pipeline for Ultrahuman health data ingestion, processing, and LLM-powered explanation generation.

## Architecture

The pipeline consists of three Lambda functions that process health metrics data:

1. **Lambda #1: `lambda_fetch_raw`**
   - Fetches raw health data from Ultrahuman API
   - Saves raw JSON to S3 bucket: `ultrahuman-raw-data`
   - Key format: `patient_id/YYYY-MM-DD.json`

2. **Lambda #2: `lambda_process_metrics`**
   - Reads raw data from S3
   - Computes metrics and detects anomalies using statistical analysis
   - Saves processed data to S3 bucket: `health-metrics-processed`
   - Key format: `patient_id/YYYY-MM-DD.json`

3. **Lambda #3: `lambda_generate_explanation`**
   - Reads processed metrics from S3
   - Calls Azure OpenAI (gpt-4o-mini) to generate explanations
   - Saves explanation JSON to S3 bucket: `health-llm-explanations`
   - Key format: `patient_id/YYYY-MM-DD.json`

## Project Structure

```
chronicgpt-aws/
├── common/                      # Shared package used by all Lambdas
│   ├── __init__.py
│   ├── config.py               # Environment variable configuration
│   ├── ultrahuman_client.py    # Ultrahuman API client
│   ├── s3_utils.py             # S3 upload/download utilities
│   ├── models.py               # Pydantic data models
│   └── logging_utils.py         # Logging configuration
│
├── lambda_fetch_raw/           # Lambda #1: Fetch raw data
│   ├── __init__.py
│   └── handler.py
│
├── lambda_process_metrics/      # Lambda #2: Process metrics
│   ├── __init__.py
│   └── handler.py
│
├── lambda_generate_explanation/ # Lambda #3: Generate explanations
│   ├── __init__.py
│   └── handler.py
│
├── dist/                       # Build output (ZIP files)
├── Dockerfile                  # Docker image for building packages
├── build.sh                    # Build script (Docker-based)
├── build_lambdas.py            # Python build helper script
├── requirements.txt            # Python dependencies
└── README.md                   # This file
```

## Prerequisites

- **Docker**: Required for building Lambda packages with correct architecture
- **AWS CLI**: Configured with appropriate credentials
- **Python 3.11**: For local development (optional)
- **AWS Account**: With permissions to create Lambda functions, S3 buckets, and IAM roles

## Environment Variables

Each Lambda function requires the following environment variables:

### Common Variables (all Lambdas)
- `ULTRAHUMAN_API_BASE_URL`: Base URL for Ultrahuman API
- `ULTRAHUMAN_API_KEY`: API key/token for Ultrahuman API
- `ULTRAHUMAN_EMAIL`: Email associated with Ultrahuman account
- `ULTRAHUMAN_PATIENT_ID`: Patient identifier (optional, defaults to email)
- `RAW_DATA_BUCKET_NAME`: S3 bucket for raw data (default: `ultrahuman-raw-data`)
- `PROCESSED_DATA_BUCKET_NAME`: S3 bucket for processed data (default: `health-metrics-processed`)
- `EXPLANATIONS_BUCKET_NAME`: S3 bucket for explanations (default: `health-llm-explanations`)
- `LOG_LEVEL`: Logging level (default: `INFO`)

### Lambda #3 Only (generate_explanation)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name (default: `gpt-4o-mini`)
- `AZURE_OPENAI_API_VERSION`: API version (default: `2024-02-15-preview`)

## Building Lambda Packages

The build system uses Docker to ensure dependencies are compiled for the correct architecture (arm64).

### Quick Build

```bash
./build.sh
```

This will:
1. Use Docker to install dependencies in a Lambda-compatible environment
2. Package each Lambda function with its dependencies
3. Create ZIP files in the `dist/` directory

### Build Process Details

1. **Docker Image**: Uses `public.ecr.aws/lambda/python:3.11-arm64` base image
2. **Dependencies**: Installs packages from `requirements.txt` into a `packages/` directory
3. **Packaging**: `build_lambdas.py` copies Lambda handlers, common package, and dependencies into ZIP files
4. **Output**: Three ZIP files in `dist/`:
   - `lambda_fetch_raw.zip`
   - `lambda_process_metrics.zip`
   - `lambda_generate_explanation.zip`

### Manual Build (if Docker is not available)

If you need to build without Docker (not recommended for production):

```bash
# Install dependencies locally
pip install -r requirements.txt -t packages

# Build packages
python3 build_lambdas.py packages
```

**Note**: This may produce packages incompatible with Lambda runtime if your local architecture differs.

## Deployment

### 1. Create S3 Buckets

Create three S3 buckets for storing data:

```bash
aws s3 mb s3://ultrahuman-raw-data
aws s3 mb s3://health-metrics-processed
aws s3 mb s3://health-llm-explanations
```

### 2. Create IAM Role

Create an IAM role for Lambda functions with the following policies:

**Trust Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Permissions Policy** (attach to role):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::ultrahuman-raw-data",
        "arn:aws:s3:::ultrahuman-raw-data/*",
        "arn:aws:s3:::health-metrics-processed",
        "arn:aws:s3:::health-metrics-processed/*",
        "arn:aws:s3:::health-llm-explanations",
        "arn:aws:s3:::health-llm-explanations/*"
      ]
    }
  ]
}
```

### 3. Deploy Lambda Functions

#### Deploy Lambda #1: fetch_raw_data

```bash
aws lambda create-function \
  --function-name fetch_raw_data \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --handler handler.handler \
  --zip-file fileb://dist/lambda_fetch_raw.zip \
  --architectures arm64 \
  --timeout 60 \
  --memory-size 256 \
  --environment Variables="{
    ULTRAHUMAN_API_BASE_URL=https://api.ultrahuman.com,
    ULTRAHUMAN_API_KEY=your_api_key,
    ULTRAHUMAN_EMAIL=your_email@example.com,
    RAW_DATA_BUCKET_NAME=ultrahuman-raw-data,
    LOG_LEVEL=INFO
  }"
```

#### Deploy Lambda #2: process_metrics

```bash
aws lambda create-function \
  --function-name process_metrics \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --handler handler.handler \
  --zip-file fileb://dist/lambda_process_metrics.zip \
  --architectures arm64 \
  --timeout 120 \
  --memory-size 512 \
  --environment Variables="{
    ULTRAHUMAN_PATIENT_ID=your_patient_id,
    RAW_DATA_BUCKET_NAME=ultrahuman-raw-data,
    PROCESSED_DATA_BUCKET_NAME=health-metrics-processed,
    LOG_LEVEL=INFO
  }"
```

#### Deploy Lambda #3: generate_explanation

```bash
aws lambda create-function \
  --function-name generate_explanation \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --handler handler.handler \
  --zip-file fileb://dist/lambda_generate_explanation.zip \
  --architectures arm64 \
  --timeout 60 \
  --memory-size 256 \
  --environment Variables="{
    ULTRAHUMAN_PATIENT_ID=your_patient_id,
    PROCESSED_DATA_BUCKET_NAME=health-metrics-processed,
    EXPLANATIONS_BUCKET_NAME=health-llm-explanations,
    AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com,
    AZURE_OPENAI_API_KEY=your_azure_key,
    AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini,
    AZURE_OPENAI_API_VERSION=2024-02-15-preview,
    LOG_LEVEL=INFO
  }"
```

### 4. Update Existing Lambda Functions

To update a Lambda function after code changes:

```bash
# Rebuild packages
./build.sh

# Update function code
aws lambda update-function-code \
  --function-name fetch_raw_data \
  --zip-file fileb://dist/lambda_fetch_raw.zip
```

## Invoking Lambda Functions

### Lambda #1: fetch_raw_data

```bash
aws lambda invoke \
  --function-name fetch_raw_data \
  --payload '{"patient_id": "patient123", "date": "2024-01-15"}' \
  response.json
```

### Lambda #2: process_metrics

```bash
aws lambda invoke \
  --function-name process_metrics \
  --payload '{"patient_id": "patient123", "date": "2024-01-15"}' \
  response.json
```

### Lambda #3: generate_explanation

```bash
aws lambda invoke \
  --function-name generate_explanation \
  --payload '{"patient_id": "patient123", "date": "2024-01-15"}' \
  response.json
```

## Pipeline Orchestration

You can orchestrate the pipeline using:

1. **AWS Step Functions**: Create a state machine that invokes each Lambda in sequence
2. **EventBridge Scheduler**: Schedule daily runs
3. **S3 Event Notifications**: Trigger downstream Lambdas when files are uploaded
4. **Manual Invocation**: Call each Lambda individually via AWS CLI or SDK

### Example Step Functions State Machine

```json
{
  "Comment": "Ultrahuman Health Metrics Pipeline",
  "StartAt": "FetchRawData",
  "States": {
    "FetchRawData": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:fetch_raw_data",
      "Next": "ProcessMetrics"
    },
    "ProcessMetrics": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:process_metrics",
      "Next": "GenerateExplanation"
    },
    "GenerateExplanation": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:generate_explanation",
      "End": true
    }
  }
}
```

## Testing

### Local Testing

You can test Lambda handlers locally by importing them:

```python
from lambda_fetch_raw.handler import handler

event = {
    "patient_id": "test_patient",
    "date": "2024-01-15"
}

result = handler(event, None)
print(result)
```

### Unit Tests

Create test files in each Lambda directory:

```python
# lambda_fetch_raw/test_handler.py
import unittest
from unittest.mock import patch, MagicMock
from handler import handler

class TestHandler(unittest.TestCase):
    @patch('handler.UltrahumanClient')
    def test_handler_success(self, mock_client):
        # Test implementation
        pass
```

## Monitoring and Logging

- **CloudWatch Logs**: Each Lambda automatically creates log groups
- **CloudWatch Metrics**: Monitor invocation count, duration, errors
- **X-Ray**: Enable for distributed tracing (optional)

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all dependencies are included in the ZIP package
2. **Architecture Mismatch**: Use Docker build to ensure arm64 compatibility
3. **Timeout Errors**: Increase Lambda timeout or optimize code
4. **Memory Errors**: Increase Lambda memory allocation
5. **S3 Permission Errors**: Verify IAM role has S3 read/write permissions

### Debugging

Check CloudWatch Logs for detailed error messages:

```bash
aws logs tail /aws/lambda/fetch_raw_data --follow
```

## Cost Optimization

- **Lambda**: Use arm64 architecture for better price/performance
- **S3**: Use lifecycle policies to move old data to cheaper storage tiers
- **CloudWatch**: Set log retention policies to avoid excessive log storage costs

## Security Best Practices

1. **Secrets Management**: Use AWS Secrets Manager or Parameter Store for API keys
2. **VPC**: Deploy Lambdas in VPC if accessing private resources
3. **IAM**: Follow principle of least privilege
4. **Encryption**: Enable S3 bucket encryption at rest
5. **Network**: Use VPC endpoints for S3 access (optional)

## License

[Add your license here]

## Support

For issues or questions, please [create an issue](link-to-issues) or contact the development team.

