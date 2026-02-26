#!/bin/bash

# Start All Services Script
# This script starts backend, admin panel, and mobile app in separate terminals

echo "🚀 Starting Jackson Rewards App - All Services"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Linux/Mac
if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
    TERMINAL_CMD="gnome-terminal"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        TERMINAL_CMD="osascript"
    fi
else
    echo "⚠️  This script is designed for Linux/Mac"
    echo "For Windows, please run services manually (see COMPLETE-TESTING-GUIDE.md)"
    exit 1
fi

# Function to start service in new terminal (Linux)
start_service_linux() {
    local name=$1
    local dir=$2
    local cmd=$3
    
    echo -e "${BLUE}Starting $name...${NC}"
    gnome-terminal --tab --title="$name" -- bash -c "cd $dir && $cmd; exec bash"
}

# Function to start service in new terminal (Mac)
start_service_mac() {
    local name=$1
    local dir=$2
    local cmd=$3
    
    echo -e "${BLUE}Starting $name...${NC}"
    osascript -e "tell application \"Terminal\" to do script \"cd $(pwd)/$dir && $cmd\""
}

# Check if node_modules exist
check_dependencies() {
    local dir=$1
    local name=$2
    
    if [ ! -d "$dir/node_modules" ]; then
        echo -e "${YELLOW}⚠️  Dependencies not installed for $name${NC}"
        echo "Installing dependencies..."
        cd "$dir" && npm install
        cd - > /dev/null
    fi
}

echo "📦 Checking dependencies..."
check_dependencies "." "Backend"
check_dependencies "admin-frontend" "Admin Panel"
check_dependencies "JacksonRewardsApp" "Mobile App"

echo ""
echo "🎯 Starting services..."
echo ""

# Start services based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    start_service_mac "Backend" "." "npm run dev"
    sleep 2
    start_service_mac "Admin Panel" "admin-frontend" "npm run dev"
    sleep 2
    start_service_mac "Mobile App" "JacksonRewardsApp" "npm run dev"
else
    # Linux
    start_service_linux "Backend" "." "npm run dev"
    sleep 2
    start_service_linux "Admin Panel" "admin-frontend" "npm run dev"
    sleep 2
    start_service_linux "Mobile App" "JacksonRewardsApp" "npm run dev"
fi

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📍 Service URLs:"
echo "   Backend:      http://localhost:5000 (or check .env for PORT)"
echo "   Admin Panel:  http://localhost:3000"
echo "   Mobile App:   http://localhost:3001"
echo ""
echo "📖 Testing Guide: See COMPLETE-TESTING-GUIDE.md"
echo ""
echo "⚠️  Note: Services are running in separate terminal windows"
echo "   Close those windows to stop the services"
echo ""
