#!/usr/bin/env node

/**
 * Test Ticket Creation with Different Field Formats
 * 
 * This script tests different field name formats to find the correct one
 */

const mongoose = require('mongoose');
const zohoService = require('./utils/zoho');
require('dotenv').config();

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "1000.HQWXFO4JXG13GDK2XZA50DY9Y9AW5S";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "88fc1018373f67863718319a61d9c446a63d918e04";

async function testTicketCreation() {
  console.log('🧪 Testing Ticket Creation with Different Field Formats...\n');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected\n');
    
    // Test 1: Minimal required fields only
    console.log('📝 Test 1: Minimal fields...');
    const minimalData = {
      subject: "Test Ticket - Minimal",
      description: "Testing minimal required fields"
    };
    
    const result1 = await zohoService.createTicket(minimalData, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET);
    console.log(`Result 1: ${result1.success ? '✅ Success' : '❌ Failed'}`);
    if (!result1.success) {
      console.log(`Error: ${result1.error}`);
      console.log(`Details:`, JSON.stringify(result1.details, null, 2));
    }
    
    console.log('\n' + '-'.repeat(50) + '\n');
    
    // Test 2: With departmentId (camelCase)
    console.log('📝 Test 2: With departmentId (camelCase)...');
    const camelCaseData = {
      subject: "Test Ticket - CamelCase",
      description: "Testing with departmentId in camelCase",
      departmentId: "1198895000000006907"
    };
    
    const result2 = await zohoService.createTicket(camelCaseData, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET);
    console.log(`Result 2: ${result2.success ? '✅ Success' : '❌ Failed'}`);
    if (!result2.success) {
      console.log(`Error: ${result2.error}`);
      console.log(`Details:`, JSON.stringify(result2.details, null, 2));
    }
    
    console.log('\n' + '-'.repeat(50) + '\n');
    
    // Test 3: With contact information
    console.log('📝 Test 3: With contact information...');
    const contactData = {
      subject: "Test Ticket - With Contact",
      description: "Testing with contact information",
      departmentId: "1198895000000006907",
      email: "test@example.com",
      contact: {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com"
      }
    };
    
    const result3 = await zohoService.createTicket(contactData, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET);
    console.log(`Result 3: ${result3.success ? '✅ Success' : '❌ Failed'}`);
    if (!result3.success) {
      console.log(`Error: ${result3.error}`);
      console.log(`Details:`, JSON.stringify(result3.details, null, 2));
    } else {
      console.log(`✅ Ticket created with ID: ${result3.data.id}`);
    }
    
    console.log('\n' + '-'.repeat(50) + '\n');
    
    // Test 4: Check what fields are actually sent by looking at a successful creation
    if (result3.success) {
      console.log('📋 Successful ticket data structure:');
      console.log(JSON.stringify(result3.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Also test the direct API call format
async function testDirectAPICall() {
  console.log('\n🌐 Testing Direct API Call Format...\n');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Test the exact format that should work
    const directData = {
      subject: "Direct API Test",
      description: "Testing direct API call format",
      departmentId: "1198895000000006907",
      priority: "Medium",
      status: "Open",
      email: "test@example.com"
    };
    
    const result = await zohoService.makeAPICall(
      '/v1/tickets',
      'POST',
      directData,
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET
    );
    
    console.log(`Direct API Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
      console.log(`Details:`, JSON.stringify(result.details, null, 2));
    } else {
      console.log(`✅ Ticket created with ID: ${result.data.id}`);
      console.log('Response data:', JSON.stringify(result.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Direct API test failed:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

async function main() {
  await testTicketCreation();
  await testDirectAPICall();
}

if (require.main === module) {
  main().catch(console.error);
}