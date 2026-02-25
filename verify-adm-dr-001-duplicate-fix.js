/**
 * Verification Script: ADM-DR-001 Duplicate Function Fix
 * 
 * This script verifies that the duplicate calculateMidWeekJoinMetadata
 * function has been removed from routes/daily-rewards-v2.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying ADM-DR-001 Duplicate Function Fix...\n');

// Read the V2 endpoint file
const v2FilePath = path.join(__dirname, 'routes', 'daily-rewards-v2.js');
const v2Content = fs.readFileSync(v2FilePath, 'utf8');

// Count occurrences of function definition
const functionRegex = /function calculateMidWeekJoinMetadata\s*\(/g;
const matches = v2Content.match(functionRegex);
const count = matches ? matches.length : 0;

console.log(`📊 Results:`);
console.log(`   File: routes/daily-rewards-v2.js`);
console.log(`   Function definitions found: ${count}`);

if (count === 1) {
  console.log(`   ✅ PASS: Only one definition exists (correct)`);
  
  // Check if it's the correct one (calls calculateMidWeekJoinMetadataFixed)
  const correctPattern = /function calculateMidWeekJoinMetadata[\s\S]{0,200}calculateMidWeekJoinMetadataFixed/;
  if (correctPattern.test(v2Content)) {
    console.log(`   ✅ PASS: Function delegates to calculateMidWeekJoinMetadataFixed`);
  } else {
    console.log(`   ❌ FAIL: Function does not delegate to fixed version`);
  }
} else if (count > 1) {
  console.log(`   ❌ FAIL: Multiple definitions found (duplicate not removed)`);
} else {
  console.log(`   ❌ FAIL: No definition found (function missing)`);
}

console.log(`\n✅ Verification complete!`);
