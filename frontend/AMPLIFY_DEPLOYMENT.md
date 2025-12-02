# AWS Amplify Deployment Guide

## Required Environment Variables

Configure these environment variables in the AWS Amplify Console under **App settings > Environment variables**:

### AWS Credentials (Required)
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

### Athena Configuration (Required)
```
ATHENA_DATABASE_NAME=health_metrics_db
ATHENA_VIEW_NAME=v_metrics_latest_daily
ATHENA_OUTPUT_LOCATION=s3://health-results-athena/
```
**Optional:**
```
ATHENA_WORKGROUP=your-workgroup-name
```

### S3 Bucket Configuration (Required)
```
EXPLANATIONS_BUCKET_NAME=health-llm-explanations
```
**Fallback (if EXPLANATIONS_BUCKET_NAME is not set):**
```
HEALTH_RESULTS_PROCESSED_BUCKET=health-results-processed
```

### Patient ID Configuration (Required)
```
ULTRAHUMAN_PATIENT_ID=your-patient-id
```
**Fallback (if ULTRAHUMAN_PATIENT_ID is not set):**
```
ULTRAHUMAN_EMAIL=your-email@example.com
```

### Next.js Configuration (Optional)
```
NEXT_PUBLIC_BASE_URL=https://your-amplify-domain.amplifyapp.com
```

## Deployment Steps

1. **Connect Repository**
   - Go to AWS Amplify Console (https://console.aws.amazon.com/amplify)
   - Click "New app" > "Host web app"
   - Connect your GitHub repository
   - Select the `chronicgpt-aws` repository
   - **Important**: Set the root directory to `frontend` in the build settings

2. **Configure Build Settings**
   - Amplify will auto-detect Next.js
   - The `amplify.yml` file in the `frontend` directory will be used automatically
   - Build command: `npm run build` (auto-detected)
   - Output directory: `.next` (auto-detected)

3. **Set Environment Variables**
   - Go to **App settings > Environment variables**
   - Add all required variables listed above
   - Make sure to set values for your specific AWS resources

4. **Configure IAM Permissions**
   - Ensure the AWS credentials have permissions for:
     - Athena: Query execution, read results
     - S3: Read access to buckets (explanations and Athena output)
   - Consider using IAM roles instead of access keys for better security

5. **Deploy**
   - Save settings and trigger a new deployment
   - Monitor the build logs for any issues

## Security Best Practices

1. **Use IAM Roles**: Instead of access keys, use IAM roles attached to Amplify
2. **Restrict Permissions**: Grant only necessary permissions (read-only for S3, query-only for Athena)
3. **Rotate Credentials**: Regularly rotate access keys if using them
4. **Environment-Specific**: Use different buckets/credentials for dev/staging/prod

## Troubleshooting

- **Build Failures**: Check build logs in Amplify console
- **Missing Environment Variables**: Verify all required variables are set
- **Permission Errors**: Check IAM permissions for Athena and S3
- **API Errors**: Verify bucket names and database names match your AWS resources

