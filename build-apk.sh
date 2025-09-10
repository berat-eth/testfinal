#!/bin/bash

# APK Build Script for Huglu Outdoor Mobile App
# This script builds the APK for the React Native Expo project

set -e  # Exit on any error

echo "🚀 Starting APK build process for Huglu Outdoor..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found! Please run this script from the project root directory."
    exit 1
fi

if [ ! -f "App.tsx" ]; then
    print_error "App.tsx not found! This doesn't appear to be the correct project directory."
    exit 1
fi

print_status "Project directory verified ✓"

# Check Node.js version
NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH"
    exit 1
fi

# Check if Java is available (required for Android builds)
if ! command -v java &> /dev/null; then
    print_error "Java is not installed or not in PATH. Please install Java JDK 17 or later."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1)
print_status "Java version: $JAVA_VERSION"

# Check if Android SDK is available
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    print_error "ANDROID_HOME or ANDROID_SDK_ROOT environment variable is not set."
    print_error "Please install Android SDK and set the environment variable."
    exit 1
fi

ANDROID_SDK_PATH=${ANDROID_HOME:-$ANDROID_SDK_ROOT}
print_status "Android SDK path: $ANDROID_SDK_PATH"

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf node_modules/.cache
rm -rf android/app/build
rm -rf android/build
rm -rf .expo

# Install dependencies
print_status "Installing npm dependencies..."
npm install

# expo-sqlite kullanmıyoruz; AsyncStorage tabanlı yerel depolama kullanılıyor
print_status "Skipping expo-sqlite installation (not used)"

# Install Expo CLI globally if not already installed
if ! command -v expo &> /dev/null; then
    print_status "Installing Expo CLI globally..."
    npm install -g @expo/cli
fi

print_success "Dependencies installed ✓"

# Generate Android project files
print_status "Generating Android project files..."
npx expo install --fix

# Pre-build for Android
print_status "Running Expo prebuild for Android..."
npx expo prebuild --platform android --clean

print_success "Prebuild completed ✓"

# Navigate to android directory
cd android

# Make gradlew executable
chmod +x gradlew

# Clean the project
print_status "Cleaning Android project..."
./gradlew clean

# Build the APK
print_status "Building APK... This may take several minutes..."
print_warning "Please be patient, this process can take 5-15 minutes depending on your system."

# Set production environment for APK build
export NODE_ENV=production
export EXPO_PUBLIC_ENV=production

# Build release APK with production optimizations
print_status "Building production APK with network optimizations..."
./gradlew assembleRelease -Pandroid.enableR8.fullMode=true

# Check if APK was created successfully
APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
    print_success "APK built successfully! ✓"
    
    # Get APK info
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    print_status "APK size: $APK_SIZE"
    
    # Copy APK to project root with a meaningful name
    cd ..
    APK_NAME="huglu-outdoor-v1.0.0-$(date +%Y%m%d-%H%M%S).apk"
    cp "android/$APK_PATH" "$APK_NAME"
    
    print_success "APK copied to project root as: $APK_NAME"
    print_success "Build completed successfully! 🎉"
    
    echo ""
    echo "📱 Your APK is ready!"
    echo "📍 Location: $(pwd)/$APK_NAME"
    echo "📦 Size: $APK_SIZE"
    echo ""
    echo "You can now install this APK on Android devices by:"
    echo "1. Transferring the APK file to your Android device"
    echo "2. Enabling 'Install from unknown sources' in Android settings"
    echo "3. Opening the APK file on your device to install"
    echo ""
    
else
    print_error "APK build failed! APK file not found at expected location."
    print_error "Please check the build logs above for errors."
    exit 1
fi

# Optional: Build debug APK as well
read -p "Would you like to build a debug APK as well? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Building debug APK..."
    cd android
    ./gradlew assembleDebug
    
    DEBUG_APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$DEBUG_APK_PATH" ]; then
        cd ..
        DEBUG_APK_NAME="huglu-outdoor-debug-v1.0.0-$(date +%Y%m%d-%H%M%S).apk"
        cp "android/$DEBUG_APK_PATH" "$DEBUG_APK_NAME"
        print_success "Debug APK also created: $DEBUG_APK_NAME"
    fi
fi

print_success "All done! 🚀"
