#!/bin/bash

# Automated Rollover Test Runner
# This script runs the rollover integration tests automatically

set -e  # Exit on any error

echo "🚀 Starting Fluid Calendar Rollover Integration Tests"
echo "=================================================="

# Check if we're in Docker or local environment
if [ -f /.dockerenv ]; then
    echo "📦 Running in Docker environment"
    DB_HOST="db"
else
    echo "💻 Running in local environment"
    DB_HOST="localhost"
fi

# Set environment variables
export DATABASE_URL="postgresql://fluid:fluid@${DB_HOST}:5432/fluid_calendar"
export NEXTAUTH_SECRET="test-secret-key"
export NEXTAUTH_URL="http://localhost:3000"

echo "🔧 Environment configured"
echo "   Database: ${DATABASE_URL}"

# Wait for database to be ready (if not in Docker)
if [ "$DB_HOST" = "localhost" ]; then
    echo "⏳ Waiting for database to be ready..."
    until pg_isready -h localhost -p 5432 -U fluid > /dev/null 2>&1; do
        sleep 1
    done
    echo "✅ Database is ready"
fi

# Run automated test
echo ""
echo "🤖 Running Automated Rollover Test..."
echo "------------------------------------"
npx tsx automated-rollover-test.ts

# Run visual demonstration
echo ""
echo "🎭 Running Visual Rollover Demonstration..."
echo "-----------------------------------------"
npx tsx visual-rollover-test.ts

echo ""
echo "✅ All rollover tests completed successfully!"
echo "=================================================="
