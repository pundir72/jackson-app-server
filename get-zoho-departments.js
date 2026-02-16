#!/usr/bin/env node

/**
 * Get Zoho Desk Departments
 * 
 * This script retrieves all available departments from your Zoho Desk
 * to help you identify the correct departmentId for ticket creation
 */

const mongoose = require('mongoose');
const zohoService = require('./utils/zoho');
require('dotenv').config();

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "1000.HQWXFO4JXG13GDK2XZA50DY9Y9AW5S";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "88fc1018373f67863718319a61d9c446a63d918e04";

async function getDepartments() {
  console.log('🏢 Fetching Zoho Desk Departments...\n');
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get departments
    console.log('📋 Fetching departments from Zoho Desk...');
    const result = await zohoService.makeAPICall(
      '/v1/departments',
      'GET',
      null,
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET
    );
    
    if (result.success) {
      console.log('✅ Departments retrieved successfully\n');
      
      const departments = result.data.data || [];
      
      if (departments.length === 0) {
        console.log('⚠️  No departments found');
        return;
      }
      
      console.log('📊 AVAILABLE DEPARTMENTS:');
      console.log('=' .repeat(50));
      
      departments.forEach((dept, index) => {
        console.log(`${index + 1}. ${dept.name}`);
        console.log(`   ID: ${dept.id}`);
        console.log(`   Description: ${dept.description || 'N/A'}`);
        console.log(`   Status: ${dept.isEnabled ? 'Active' : 'Inactive'}`);
        console.log('');
      });
      
      // Show the default department being used
      const defaultDeptId = "1198895000000006907";
      const defaultDept = departments.find(d => d.id === defaultDeptId);
      
      console.log('🎯 CURRENT DEFAULT DEPARTMENT:');
      console.log('-'.repeat(30));
      if (defaultDept) {
        console.log(`✅ Found: ${defaultDept.name} (ID: ${defaultDeptId})`);
      } else {
        console.log(`❌ Default department ID ${defaultDeptId} not found!`);
        console.log('💡 You may need to update the departmentId in your code');
      }
      
      // Suggest the first active department if default not found
      if (!defaultDept && departments.length > 0) {
        const firstActive = departments.find(d => d.isEnabled);
        if (firstActive) {
          console.log(`\n💡 SUGGESTED DEPARTMENT: ${firstActive.name} (ID: ${firstActive.id})`);
        }
      }
      
    } else {
      console.log('❌ Failed to retrieve departments');
      console.log('Error:', result.error);
      console.log('Details:', result.details);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

async function getContacts() {
  console.log('\n👥 Fetching Zoho Desk Contacts (for reference)...\n');
  
  try {
    const result = await zohoService.makeAPICall(
      '/v1/contacts?limit=5',
      'GET',
      null,
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET
    );
    
    if (result.success) {
      const contacts = result.data.data || [];
      console.log('📊 SAMPLE CONTACTS:');
      console.log('=' .repeat(30));
      
      contacts.forEach((contact, index) => {
        console.log(`${index + 1}. ${contact.firstName} ${contact.lastName}`);
        console.log(`   ID: ${contact.id}`);
        console.log(`   Email: ${contact.email}`);
        console.log('');
      });
    } else {
      console.log('⚠️  Could not retrieve contacts:', result.error);
    }
    
  } catch (error) {
    console.log('⚠️  Error getting contacts:', error.message);
  }
}

async function getTicketFields() {
  console.log('\n🎫 Fetching Ticket Fields (for reference)...\n');
  
  try {
    const result = await zohoService.makeAPICall(
      '/v1/ticketFields',
      'GET',
      null,
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET
    );
    
    if (result.success) {
      const fields = result.data.data || [];
      console.log('📊 REQUIRED TICKET FIELDS:');
      console.log('=' .repeat(40));
      
      const requiredFields = fields.filter(f => f.isMandatory);
      
      requiredFields.forEach((field, index) => {
        console.log(`${index + 1}. ${field.displayLabel}`);
        console.log(`   API Name: ${field.apiName}`);
        console.log(`   Type: ${field.type}`);
        console.log(`   Required: ${field.isMandatory ? 'Yes' : 'No'}`);
        console.log('');
      });
      
      if (requiredFields.length === 0) {
        console.log('ℹ️  No mandatory fields found or field info not available');
      }
      
    } else {
      console.log('⚠️  Could not retrieve ticket fields:', result.error);
    }
    
  } catch (error) {
    console.log('⚠️  Error getting ticket fields:', error.message);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Get Zoho Desk Departments and Configuration');
    console.log('Usage: node get-zoho-departments.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --contacts    Also fetch sample contacts');
    console.log('  --fields      Also fetch ticket field requirements');
    console.log('  --all         Fetch departments, contacts, and fields');
    console.log('  --help        Show this help message');
    console.log('');
    return;
  }
  
  await getDepartments();
  
  if (args.includes('--contacts') || args.includes('--all')) {
    await getContacts();
  }
  
  if (args.includes('--fields') || args.includes('--all')) {
    await getTicketFields();
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Use the correct departmentId in your ticket creation requests');
  console.log('2. Ensure you have the required fields for ticket creation');
  console.log('3. Test ticket creation with the updated data');
}

if (require.main === module) {
  main().catch(console.error);
}