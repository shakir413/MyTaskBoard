#!/bin/bash
# Run on YOUR computer. Builds React and uploads to S3.
# Usage: bash deploy/frontend-deploy.sh my-bucket-name CLOUDFRONT_DISTRIBUTION_ID
set -e
BUCKET=$1
DIST_ID=$2

cd frontend
npm install
npm run build
aws s3 sync dist/ s3://$BUCKET --delete

# Clear CloudFront's cache so users see the new version
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
echo "Frontend deployed."
