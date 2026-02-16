#!/usr/bin/env node

/**
 * Zoho API Endpoints Test Script
 * 
 * Tests all Zoho API endpoints to ensure they're working correctly
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:4001';
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "1000.HQWXFO4JXG13GDK2XZA50DY9Y9AW5S";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "88fc1018373f67863718319a61d9c446a63d918e04";

class ZohoAPITester {
  constructor() {
    this.baseURL = BASE_URL;
    this.authToken = null;
    this.results = [];
  }

  async runTests() {
    console.log('🧪 Testing Zoho API Endpoints...\n');
    
    try {
      // Get admin token first
      await this.getAdminToken();
      
      // Test all endpoints
      await this.testTokenStatus();
      await this.testAuthorizationURL();
      await this.testTokenRefresh();
      await this.testAPICall();
      await this.testDeskTickets();
      await this.testTokensList();
      
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }
  }

  async getAdminToken() {
    try {
      console.log('🔑 Getting admin authentication token...');
      
      // You'll need to replace this with actual admin credentials
      const response = await axios.post(`${this.baseURL}/api/auth/login`, {
        email: 'admin@example.com', // Update with actual admin email
        password: 'admin_password'   // Update with actual admin password
      });
      
      if (response.data.success && response.data.token) {
        this.authToken = response.data.token;
        console.log('✅ Admin token obtained\n');
      } else {
        throw new Error('Failed to get admin token');
      }
      
    } catch (error) {
      console.log('⚠️  Could not get admin token, using test mode');
      console.log('   💡 Some tests may fail without proper authentication\n');
      this.authToken = 'test-token'; // For testing purposes
    }
  }

  async makeRequest(method, endpoint, data = null, requiresAuth = true) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (requiresAuth && this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      }

      const response = await axios(config);
      return {
        success: true,
        status: response.status,
        data: response.data
      };

    } catch (error) {
      return {
        success: false,
        status: error.response?.status || 0,
        error: error.response?.data || error.message
      };
    }
  }

  async testTokenStatus() {
    console.log('📊 Testing token status endpoint...');
    
    const result = await this.makeRequest('GET', `/api/zoho/token/status/${ZOHO_CLIENT_ID}`);
    
    this.results.push({
      endpoint: 'GET /api/zoho/token/status/:clientId',
      success: result.success,
      status: result.status,
      message: result.success ? 'Token status retrieved' : result.error?.error || 'Failed',
      details: result.data || result.error
    });
    
    console.log(`   ${result.success ? '✅' : '❌'} Status: ${result.status} - ${result.success ? 'Success' : 'Failed'}`);
  }

  async testAuthorizationURL() {
    console.log('🔗 Testing authorization URL endpoint...');
    
    const params = new URLSearchParams({
      client_id: ZOHO_CLIENT_ID,
      redirect_uri: 'https://your-app.com/zoho/callback',
      scope: 'Desk.tickets.READ Desk.basic.READ'
    });
    
    const result = await this.makeRequest('GET', `/api/zoho/authorization-url?${params}`);
    
    this.results.push({
      endpoint: 'GET /api/zoho/authorization-url',
      success: result.success,
      status: result.status,
      message: result.success ? 'Authorization URL generated' : result.error?.error || 'Failed',
      details: result.data || result.error
    });
    
    console.log(`   ${result.success ? '✅' : '❌'} Status: ${result.status} - ${result.success ? 'Success' : 'Failed'}`);
    
    if (result.success && result.data?.data?.authorization_url) {
      console.log(`   🔗 Auth URL: ${result.data.data.authorization_url.substring(0, 80)}...`);
    }
  }

  async testTokenRefresh() {
    console.log('🔄 Testing token refresh endpoint...');
    
    const result = await this.makeRequest('POST', '/api/zoho/token/refresh', {
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET
    });
    
    this.results.push({
      endpoint: 'POST /api/zoho/token/refresh',
      success: result.success,
      status: result.status,
      message: result.success ? 'Token refresh successful' : result.error?.error || 'Failed',
      details: result.data || result.error
    });
    
    console.log(`   ${result.success ? '✅' : '❌'} Status: ${result.status} - ${result.success ? 'Success' : 'Failed'}`);
  }

  async testAPICall() {
    console.log('🌐 Testing generic API call endpoint...');
    
    const result = await this.makeRequest('POST', '/api/zoho/api/call', {
      endpoint: '/v1/tickets?limit=1',
      method: 'GET',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET
    });
    
    this.results.push({
      endpoint: 'POST /api/zoho/api/call',
      success: result.success,
      status: result.status,
      message: result.success ? 'API call successful' : result.error?.error || 'Failed',
      details: result.data || result.error
    });
    
    console.log(`   ${result.success ? '✅' : '❌'} Status: ${result.status} - ${result.success ? 'Success' : 'Failed'}`);
  }

  async testDeskTickets() {
    console.log('🎫 Testing Desk tickets endpoints...');
    
    // Test GET tickets
    const params = new URLSearchParams({
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      limit: '5'
    });
    
    const getResult = await this.makeRequest('GET', `/api/zoho/desk/tickets?${params}`);
    
    this.results.push({
      endpoint: 'GET /api/zoho/desk/tickets',
      success: getResult.success,
      status: getResult.status,
      message: getResult.success ? 'Tickets retrieved' : getResult.error?.error || 'Failed',
      details: getResult.data || getResult.error
    });
    
    console.log(`   ${getResult.success ? '✅' : '❌'} GET tickets - Status: ${getResult.status}`);
    
    // Test POST ticket (create)
    const createResult = await this.makeRequest('POST', '/api/zoho/desk/tickets', {
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      subject: 'Test Ticket from API Test',
      description: 'This is a test ticket created by the API test script',
      priority: 'Medium',
      status: 'Open'
    });
    
    this.results.push({
      endpoint: 'POST /api/zoho/desk/tickets',
      success: createResult.success,
      status: createResult.status,
      message: createResult.success ? 'Ticket created' : createResult.error?.error || 'Failed',
      details: createResult.data || createResult.error
    });
    
    console.log(`   ${createResult.success ? '✅' : '❌'} POST ticket - Status: ${createResult.status}`);
    
    // Test GET specific ticket (if we have tickets)
    if (getResult.success && getResult.data?.data?.data?.length > 0) {
      const ticketId = getResult.data.data.data[0].id;
      const specificParams = new URLSearchParams({
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET
      });
      
      const specificResult = await this.makeRequest('GET', `/api/zoho/desk/tickets/${ticketId}?${specificParams}`);
      
      this.results.push({
        endpoint: 'GET /api/zoho/desk/tickets/:id',
        success: specificResult.success,
        status: specificResult.status,
        message: specificResult.success ? 'Specific ticket retrieved' : specificResult.error?.error || 'Failed',
        details: specificResult.data || specificResult.error
      });
      
      console.log(`   ${specificResult.success ? '✅' : '❌'} GET specific ticket - Status: ${specificResult.status}`);
    }
  }

  async testTokensList() {
    console.log('📋 Testing tokens list endpoint...');
    
    const result = await this.makeRequest('GET', '/api/zoho/tokens?limit=5');
    
    this.results.push({
      endpoint: 'GET /api/zoho/tokens',
      success: result.success,
      status: result.status,
      message: result.success ? 'Tokens list retrieved' : result.error?.error || 'Failed',
      details: result.data || result.error
    });
    
    console.log(`   ${result.success ? '✅' : '❌'} Status: ${result.status} - ${result.success ? 'Success' : 'Failed'}`);
  }

  displayResults() {
    console.log('\n📊 ZOHO API ENDPOINTS TEST REPORT');
    console.log('=' .repeat(60));
    
    const successCount = this.results.filter(r => r.success).length;
    const totalCount = this.results.length;
    const successRate = (successCount / totalCount) * 100;
    
    console.log(`\n📈 SUMMARY: ${successCount}/${totalCount} endpoints working (${successRate.toFixed(1)}%)`);
    
    let overallStatus = '✅ HEALTHY';
    if (successRate < 50) overallStatus = '❌ CRITICAL';
    else if (successRate < 80) overallStatus = '⚠️  ISSUES';
    
    console.log(`🏥 OVERALL STATUS: ${overallStatus}\n`);
    
    console.log('DETAILED RESULTS:');
    console.log('-'.repeat(40));
    
    this.results.forEach((result, index) => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.endpoint}`);
      console.log(`   Status: ${result.status} | ${result.message}`);
      
      if (!result.success && result.details) {
        console.log(`   Error: ${JSON.stringify(result.details, null, 2).substring(0, 100)}...`);
      }
      
      if (index < this.results.length - 1) console.log('');
    });
    
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('-'.repeat(20));
    
    const failedEndpoints = this.results.filter(r => !r.success);
    
    if (failedEndpoints.length === 0) {
      console.log('• All endpoints are working correctly!');
      console.log('• Consider setting up automated monitoring');
    } else {
      console.log('• Check authentication and permissions');
      console.log('• Verify Zoho token is valid and not expired');
      console.log('• Ensure network connectivity to Zoho servers');
      
      const authErrors = failedEndpoints.filter(r => r.status === 401 || r.status === 403);
      if (authErrors.length > 0) {
        console.log('• Authentication issues detected - check admin credentials');
      }
      
      const tokenErrors = failedEndpoints.filter(r => 
        r.details && typeof r.details === 'object' && 
        (r.details.error?.includes('token') || r.details.message?.includes('token'))
      );
      if (tokenErrors.length > 0) {
        console.log('• Token-related issues detected - regenerate Zoho token');
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// Main execution
async function main() {
  const tester = new ZohoAPITester();
  await tester.runTests();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ZohoAPITester;