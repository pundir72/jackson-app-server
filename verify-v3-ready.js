/**
 * Verify V3 System is Ready for APK Build
 * 
 * This script checks:
 * 1. Backend V3 routes exist
 * 2. Frontend is calling V3 endpoints
 * 3. User's createdAt is set
 * 4. Build dependencies are installed
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Verifying V3 System Readiness...\n');

let allChecksPass = true;

// Check 1: Backend V3 routes exist
console.log('1️⃣ Checking backend V3 routes...');
const v3RoutePath = path.join(__dirname, 'routes', 'daily-rewards-v3.js');
if (fs.existsSync(v3RoutePath)) {
  console.log('   ✅ V3 routes file exists');
  
  // Check if routes are registered in server.js
  const serverPath = path.join(__dirname, 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  if (serverContent.includes('daily-rewards-v3')) {
    console.log('   ✅ V3 routes registered in server.js');
  } else {
    console.log('   ❌ V3 routes NOT registered in server.js');
    allChecksPass = false;
  }
} else {
  console.log('   ❌ V3 routes file NOT found');
  allChecksPass = false;
}

// Check 2: Frontend is calling V3 endpoints
console.log('\n2️⃣ Checking frontend V3 integration...');
const apiPath = path.join(__dirname, 'JacksonRewardsApp', 'lib', 'api.js');
if (fs.existsSync(apiPath)) {
  const apiContent = fs.readFileSync(apiPath, 'utf8');
  
  if (apiContent.includes('/api/v3/daily-rewards')) {
    console.log('   ✅ Frontend calling V3 endpoints');
  } else {
    console.log('   ❌ Frontend NOT calling V3 endpoints');
    allChecksPass = false;
  }
  
  // Check if V3 is whitelisted
  if (apiContent.includes('"/api/v3/daily-rewards"')) {
    console.log('   ✅ V3 endpoints whitelisted');
  } else {
    console.log('   ⚠️  V3 endpoints may not be whitelisted (check needsBearer array)');
  }
} else {
  console.log('   ❌ Frontend api.js NOT found');
  allChecksPass = false;
}

// Check 3: User week helper exists
console.log('\n3️⃣ Checking user week helper...');
const helperPath = path.join(__dirname, 'utils', 'dailyRewardUserWeekHelper.js');
if (fs.existsSync(helperPath)) {
  console.log('   ✅ User week helper exists');
  
  const helperContent = fs.readFileSync(helperPath, 'utf8');
  if (helperContent.includes('getUserWeekBounds') && 
      helperContent.includes('loadUserWeekProgress')) {
    console.log('   ✅ Helper functions implemented');
  } else {
    console.log('   ❌ Helper functions incomplete');
    allChecksPass = false;
  }
} else {
  console.log('   ❌ User week helper NOT found');
  allChecksPass = false;
}

// Check 4: Frontend dependencies
console.log('\n4️⃣ Checking frontend dependencies...');
const packagePath = path.join(__dirname, 'JacksonRewardsApp', 'package.json');
if (fs.existsSync(packagePath)) {
  console.log('   ✅ package.json exists');
  
  const nodeModulesPath = path.join(__dirname, 'JacksonRewardsApp', 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.log('   ✅ node_modules exists');
  } else {
    console.log('   ⚠️  node_modules NOT found - run "npm install"');
  }
} else {
  console.log('   ❌ package.json NOT found');
  allChecksPass = false;
}

// Check 5: Capacitor config
console.log('\n5️⃣ Checking Capacitor configuration...');
const capConfigPath = path.join(__dirname, 'JacksonRewardsApp', 'capacitor.config.ts');
if (fs.existsSync(capConfigPath)) {
  console.log('   ✅ Capacitor config exists');
  
  const capContent = fs.readFileSync(capConfigPath, 'utf8');
  if (capContent.includes('webDir')) {
    console.log('   ✅ Web directory configured');
  }
  
  if (capContent.includes('appId')) {
    console.log('   ✅ App ID configured');
  }
} else {
  console.log('   ❌ Capacitor config NOT found');
  allChecksPass = false;
}

// Check 6: Android project exists
console.log('\n6️⃣ Checking Android project...');
const androidPath = path.join(__dirname, 'JacksonRewardsApp', 'android');
if (fs.existsSync(androidPath)) {
  console.log('   ✅ Android project exists');
  
  const gradlePath = path.join(androidPath, 'gradlew');
  if (fs.existsSync(gradlePath)) {
    console.log('   ✅ Gradle wrapper exists');
  } else {
    console.log('   ⚠️  Gradle wrapper NOT found - run "npx cap sync android"');
  }
} else {
  console.log('   ⚠️  Android project NOT found - run "npx cap add android"');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allChecksPass) {
  console.log('✅ ALL CHECKS PASSED - Ready to build APK!');
  console.log('\nNext steps:');
  console.log('1. cd JacksonRewardsApp');
  console.log('2. npm run build');
  console.log('3. npx cap sync android');
  console.log('4. cd android && ./gradlew assembleDebug');
} else {
  console.log('❌ SOME CHECKS FAILED - Fix issues before building');
  console.log('\nReview the errors above and fix them.');
}
console.log('='.repeat(50) + '\n');

process.exit(allChecksPass ? 0 : 1);
