# Dockerfile for building Lambda deployment packages
# Uses AWS Lambda Python 3.11 arm64 base image for compatibility
# This Dockerfile is used as a reference; the actual build happens in build.sh

FROM public.ecr.aws/lambda/python:3.11-arm64

# Install build tools (may be needed for some packages)
RUN yum install -y gcc gcc-c++ python3-devel zip 2>/dev/null || \
    (apt-get update && apt-get install -y gcc g++ python3-dev zip 2>/dev/null || true)

WORKDIR /app

# Copy requirements and build script
COPY requirements.txt build_lambdas.py ./

# Default command
CMD ["/bin/bash"]

