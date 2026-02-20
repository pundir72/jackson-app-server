#!/usr/bin/env node

/**
 * Zoho Integration Health Check Script
 * 
 * This script tests various aspects of the Zoho integration:
 * 1. Token validation and status
 * 2. API connectivity
 * 3. Basic CRUD operations
 * 4. Error handling
 */

const mongoose = require('mongoose');
const zohoService = require('./utils/zoho');
const ZohoToken = require('./models/ZohoToken');
require('dotenv').config();

// Configuration
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "1000.HQWXFO4JXG13GDK2XZA50DY9Y9AW5S";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "88fc1018373f67863718319a61d9c446a63d918e04";

class ZohoHealthChecker {
  constructor() {
    this.results = {
      database: { status: 'pending', message: '', details: null },
      token: { status: 'pending', message: '', details: null },
      connectivity: { status: 'pending', message: '', details: null },
      apiCalls: { status: 'pending', message: '', details: null },
      overall: { status: 'pending', message: '', score: 0 }
    };
  }

  async runAllTests() {
    console.log('🔍 Starting Zoho Integration Health Check...\n');
    
    try {
      await this.connectDatabase();
      await this.checkTokenStatus();
      await this.testConnectivity();
      await this.testAPIOperations();
      
      this.calculateOverallHealth();
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.results.overall = {
        status: 'failed',
        message: `Health check failed: ${error.message}`,
        score: 0
      };
    } finally {
      await this.cleanup();
    }
  }

  async connectDatabase() {
    try {
      console.log('📊 Connecting to database...');
      
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI);
      }
      
      this.results.database = {
        status: 'success',
        message: 'Database connection successful',
        details: { 
          state: mongoose.connection.readyState,
          host: mongoose.connection.host,
          name: mongoose.connection.name
        }
      };
      
      console.log('✅ Database connected successfully\n');
      
    } catch (error) {
      this.results.database = {
        status: 'failed',
        message: `Database connection failed: ${error.message}`,
        details: error
      };
      
      console.log('❌ Database connection failed\n');
      throw error;
    }
  }

  async checkTokenStatus() {
    try {
      console.log('🔑 Checking Zoho token status...');
      
      // Check if token exists
      const token = await ZohoToken.findActiveToken(ZOHO_CLIENT_ID);
      
      if (!token) {
        this.results.token = {
          status: 'warning',
          message: 'No active Zoho token found',
          details: {
            client_id: ZOHO_CLIENT_ID,
            recommendation: 'Generate a new token using the admin panel'
          }
        };
        
        console.log('⚠️  No active token found');
        console.log('   💡 Generate a token at: /api/zoho/authorization-url\n');
        return;
      }

      // Check token validity
      const isExpired = token.isExpired();
      const isExpiringSoon = token.isExpiringSoon(30); // 30 minutes
      
      let status = 'success';
      let message = 'Token is valid and active';
      
      if (isExpired) {
        status = 'failed';
        message = 'Token has expired';
      } else if (isExpiringSoon) {
        status = 'warning';
        message = 'Token expires soon';
      }

      this.results.token = {
        status,
        message,
        details: {
          id: token._id,
          expires_at: token.expires_at,
          is_expired: isExpired,
          is_expiring_soon: isExpiringSoon,
          scope: token.scope,
          api_domain: token.api_domain,
          last_refreshed: token.last_refreshed,
          time_until_expiry_minutes: Math.round((token.expires_at - new Date()) / (1000 * 60))
        }
      };
      
      console.log(`${status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌'} ${message}`);
      console.log(`   Expires: ${token.expires_at}`);
      console.log(`   Scope: ${token.scope}\n`);
      
    } catch (error) {
      this.results.token = {
        status: 'failed',
        message: `Token check failed: ${error.message}`,
        details: error
      };
      
      console.log('❌ Token check failed\n');
    }
  }

  async testConnectivity() {
    try {
      console.log('🌐 Testing Zoho API connectivity...');
      
      // Test token validation endpoint
      const tokenStatus = await zohoService.getTokenStatus(ZOHO_CLIENT_ID);
      
      if (!tokenStatus.success) {
        this.results.connectivity = {
          status: 'failed',
          message: 'Cannot validate token with Zoho',
          details: tokenStatus
        };
        
        console.log('❌ Token validation failed\n');
        return;
      }

      // Test basic API call
      const apiTest = await zohoService.makeAPICall(
        '/v1/tickets?limit=1',
        'GET',
        null,
        ZOHO_CLIENT_ID,
        ZOHO_CLIENT_SECRET
      );

      if (apiTest.success) {
        this.results.connectivity = {
          status: 'success',
          message: 'API connectivity successful',
          details: {
            response_status: apiTest.status,
            api_domain: tokenStatus.data?.api_domain
          }
        };
        
        console.log('✅ API connectivity successful\n');
        
      } else {
        this.results.connectivity = {
          status: 'failed',
          message: 'API call failed',
          details: apiTest
        };
        
        console.log('❌ API call failed\n');
      }
      
    } catch (error) {
      this.results.connectivity = {
        status: 'failed',
        message: `Connectivity test failed: ${error.message}`,
        details: error
      };
      
      console.log('❌ Connectivity test failed\n');
    }
  }

  async testAPIOperations() {
    try {
      console.log('🔧 Testing Zoho API operations...');
      
      const operations = [];
      
      // Test 1: Get tickets
      console.log('   📋 Testing ticket retrieval...');
      const getTickets = await zohoService.getTickets(ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, { limit: 5 });
      operations.push({
        operation: 'get_tickets',
        success: getTickets.success,
        details: getTickets.success ? `Retrieved ${getTickets.data?.data?.length || 0} tickets` : getTickets.error
      });
      
      if (getTickets.success) {
        console.log(`   ✅ Retrieved ${getTickets.data?.data?.length || 0} tickets`);
        
        // Test 2: Get specific ticket (if any exist)
        if (getTickets.data?.data?.length > 0) {
          const firstTicket = getTickets.data.data[0];
          console.log('   🎫 Testing specific ticket retrieval...');
          
          const getTicket = await zohoService.getTicket(firstTicket.id, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET);
          operations.push({
            operation: 'get_specific_ticket',
            success: getTicket.success,
            details: getTicket.success ? `Retrieved ticket ${firstTicket.id}` : getTicket.error
          });
          
          if (getTicket.success) {
            console.log(`   ✅ Retrieved specific ticket: ${firstTicket.id}`);
          } else {
            console.log(`   ❌ Failed to retrieve ticket: ${getTicket.error}`);
          }
        }
      } else {
        console.log(`   ❌ Failed to retrieve tickets: ${getTickets.error}`);
      }

      // Test 3: Test token refresh capability
      console.log('   🔄 Testing token refresh...');
      const refreshTest = await zohoService.refreshToken(ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET);
      operations.push({
        operation: 'token_refresh',
        success: refreshTest.success,
        details: refreshTest.success ? 'Token refresh successful' : refreshTest.error
      });
      
      if (refreshTest.success) {
        console.log('   ✅ Token refresh capability verified');
      } else {
        console.log(`   ⚠️  Token refresh test: ${refreshTest.error}`);
      }

      // Calculate success rate
      const successCount = operations.filter(op => op.success).length;
      const successRate = (successCount / operations.length) * 100;
      
      let status = 'success';
      if (successRate < 50) status = 'failed';
      else if (successRate < 80) status = 'warning';

      this.results.apiCalls = {
        status,
        message: `${successCount}/${operations.length} operations successful (${successRate.toFixed(1)}%)`,
        details: {
          operations,
          success_rate: successRate,
          total_operations: operations.length,
          successful_operations: successCount
        }
      };
      
      console.log(`${status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌'} API operations: ${successRate.toFixed(1)}% success rate\n`);
      
    } catch (error) {
      this.results.apiCalls = {
        status: 'failed',
        message: `API operations test failed: ${error.message}`,
        details: error
      };
      
      console.log('❌ API operations test failed\n');
    }
  }

  calculateOverallHealth() {
    const weights = {
      database: 0.2,
      token: 0.3,
      connectivity: 0.3,
      apiCalls: 0.2
    };

    let totalScore = 0;
    let totalWeight = 0;

    Object.keys(weights).forEach(key => {
      const result = this.results[key];
      let score = 0;
      
      if (result.status === 'success') score = 100;
      else if (result.status === 'warning') score = 60;
      else if (result.status === 'failed') score = 0;
      
      totalScore += score * weights[key];
      totalWeight += weights[key];
    });

    const overallScore = Math.round(totalScore / totalWeight);
    let overallStatus = 'success';
    let overallMessage = 'Zoho integration is healthy';

    if (overallScore < 50) {
      overallStatus = 'failed';
      overallMessage = 'Zoho integration has critical issues';
    } else if (overallScore < 80) {
      overallStatus = 'warning';
      overallMessage = 'Zoho integration has some issues';
    }

    this.results.overall = {
      status: overallStatus,
      message: overallMessage,
      score: overallScore
    };
  }

  displayResults() {
    console.log('📊 ZOHO INTEGRATION HEALTH REPORT');
    console.log('=' .repeat(50));
    
    // Overall status
    const overall = this.results.overall;
    const statusIcon = overall.status === 'success' ? '✅' : overall.status === 'warning' ? '⚠️' : '❌';
    console.log(`\n${statusIcon} OVERALL HEALTH: ${overall.message}`);
    console.log(`   Score: ${overall.score}/100\n`);
    
    // Detailed results
    console.log('DETAILED RESULTS:');
    console.log('-'.repeat(30));
    
    Object.keys(this.results).forEach(key => {
      if (key === 'overall') return;
      
      const result = this.results[key];
      const icon = result.status === 'success' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
      console.log(`${icon} ${key.toUpperCase()}: ${result.message}`);
    });

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('-'.repeat(20));
    
    if (this.results.token.status !== 'success') {
      console.log('• Generate or refresh Zoho token');
      console.log('• Check token permissions and scope');
    }
    
    if (this.results.connectivity.status !== 'success') {
      console.log('• Verify network connectivity to Zoho servers');
      console.log('• Check firewall and proxy settings');
    }
    
    if (this.results.apiCalls.status !== 'success') {
      console.log('• Review API permissions in Zoho');
      console.log('• Check rate limiting and quotas');
    }

    if (overall.status === 'success') {
      console.log('• Integration is working well!');
      console.log('• Consider setting up monitoring for token expiration');
    }

    console.log('\n' + '='.repeat(50));
  }

  async cleanup() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
      }
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }
}

// Helper function to get authorization URL
function getAuthorizationURL() {
  const scope = 'Desk.tickets.READ Desk.tickets.CREATE Desk.tickets.UPDATE Desk.basic.READ';
  const redirectUri = 'https://your-app.com/zoho/callback'; // Update this
  
  const authURL = `https://accounts.zoho.com/oauth/v2/auth?` +
    `scope=${encodeURIComponent(scope)}&` +
    `client_id=${ZOHO_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `access_type=offline`;
    
  return authURL;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--auth-url')) {
    console.log('🔗 Zoho Authorization URL:');
    console.log(getAuthorizationURL());
    console.log('\n💡 Use this URL to generate a new token if needed');
    return;
  }
  
  if (args.includes('--help')) {
    console.log('Zoho Integration Health Check');
    console.log('Usage: node test-zoho-integration.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --auth-url    Display authorization URL for token generation');
    console.log('  --help        Show this help message');
    console.log('');
    return;
  }
  
  const checker = new ZohoHealthChecker();
  await checker.runAllTests();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ZohoHealthChecker;