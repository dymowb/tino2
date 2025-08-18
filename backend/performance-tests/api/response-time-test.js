#!/usr/bin/env node

/**
 * API Response Time Performance Testing
 * Tests NFR-001, NFR-002, NFR-003 requirements
 * 
 * NFR-001: API endpoints must respond within 200ms for 95% of requests
 * NFR-002: Search functionality must return results within 500ms
 * NFR-003: Real-time messaging must have <100ms latency
 */

const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const API_VERSION = 'v1';
const RESULTS_DIR = path.join(__dirname, '../reports');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Test configuration
const TEST_CONFIG = {
  duration: 30, // 30 seconds
  connections: 100, // Concurrent connections
  pipelining: 1, // Requests per connection
  timeout: 10000, // 10 second timeout
};

// Test endpoints with expected performance targets
const ENDPOINTS = [
  {
    name: 'Health Check',
    path: '/health',
    method: 'GET',
    target: 50, // ms
    description: 'Basic health endpoint'
  },
  {
    name: 'User Registration',
    path: `/api/${API_VERSION}/auth/register`,
    method: 'POST',
    target: 200, // ms
    body: {
      email: 'test@example.com',
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'User'
    },
    description: 'User registration endpoint'
  },
  {
    name: 'User Login',
    path: `/api/${API_VERSION}/auth/login`,
    method: 'POST',
    target: 200, // ms
    body: {
      email: 'test@example.com',
      password: 'SecurePass123!'
    },
    description: 'User authentication endpoint'
  }
];

// Performance metrics collector
class PerformanceMetrics {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  addResult(testName, result) {
    const analysis = this.analyzeResult(result);
    this.results.push({
      testName,
      timestamp: new Date().toISOString(),
      ...analysis
    });
  }

  analyzeResult(result) {
    const latencies = result.latencies || {};
    const requests = result.requests || {};
    
    return {
      totalRequests: result.requests?.total || 0,
      requestsPerSecond: result.requests?.average || 0,
      responseTime: {
        average: latencies.average || 0,
        p50: latencies.p50 || 0,
        p90: latencies.p90 || 0,
        p95: latencies.p95 || 0,
        p99: latencies.p99 || 0,
        max: latencies.max || 0
      },
      throughput: result.throughput || {},
      errors: result.errors || 0,
      timeouts: result.timeouts || 0,
      duration: result.duration || 0
    };
  }

  generateReport() {
    const report = {
      summary: {
        testDuration: Date.now() - this.startTime,
        totalTests: this.results.length,
        timestamp: new Date().toISOString()
      },
      nfrCompliance: this.checkNFRCompliance(),
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  checkNFRCompliance() {
    const compliance = {
      'NFR-001': { passed: 0, failed: 0, target: '200ms for 95% of requests' },
      'NFR-002': { passed: 0, failed: 0, target: '500ms for search functionality' },
      'NFR-003': { passed: 0, failed: 0, target: '100ms for real-time messaging' }
    };

    this.results.forEach(result => {
      // NFR-001: General API endpoints < 200ms for 95%
      if (result.testName.includes('Health') || result.testName.includes('Login') || result.testName.includes('Registration')) {
        if (result.responseTime.p95 <= 200) {
          compliance['NFR-001'].passed++;
        } else {
          compliance['NFR-001'].failed++;
        }
      }

      // NFR-002: Search functionality < 500ms
      if (result.testName.includes('Search')) {
        if (result.responseTime.p95 <= 500) {
          compliance['NFR-002'].passed++;
        } else {
          compliance['NFR-002'].failed++;
        }
      }

      // NFR-003: Real-time messaging < 100ms
      if (result.testName.includes('Message')) {
        if (result.responseTime.p95 <= 100) {
          compliance['NFR-003'].passed++;
        } else {
          compliance['NFR-003'].failed++;
        }
      }
    });

    return compliance;
  }

  generateRecommendations() {
    const recommendations = [];
    
    this.results.forEach(result => {
      if (result.responseTime.p95 > 200) {
        recommendations.push({
          priority: 'HIGH',
          endpoint: result.testName,
          issue: `P95 response time (${result.responseTime.p95}ms) exceeds 200ms target`,
          suggestion: 'Consider database query optimization, caching, or connection pooling'
        });
      }

      if (result.errors > 0) {
        recommendations.push({
          priority: 'CRITICAL',
          endpoint: result.testName,
          issue: `${result.errors} errors encountered during testing`,
          suggestion: 'Investigate error causes and implement proper error handling'
        });
      }

      if (result.requestsPerSecond < 50) {
        recommendations.push({
          priority: 'MEDIUM',
          endpoint: result.testName,
          issue: `Low throughput: ${result.requestsPerSecond} req/s`,
          suggestion: 'Consider implementing load balancing or horizontal scaling'
        });
      }
    });

    return recommendations;
  }
}

// Main test runner
async function runPerformanceTests() {
  console.log('🚀 Starting API Response Time Performance Tests');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Test Duration: ${TEST_CONFIG.duration}s per endpoint`);
  console.log(`Concurrent Connections: ${TEST_CONFIG.connections}\n`);

  const metrics = new PerformanceMetrics();

  for (const endpoint of ENDPOINTS) {
    console.log(`\n📊 Testing: ${endpoint.name}`);
    console.log(`   Path: ${endpoint.path}`);
    console.log(`   Target: ${endpoint.target}ms`);
    
    const testConfig = {
      url: `${BASE_URL}${endpoint.path}`,
      method: endpoint.method,
      duration: TEST_CONFIG.duration,
      connections: TEST_CONFIG.connections,
      pipelining: TEST_CONFIG.pipelining,
      timeout: TEST_CONFIG.timeout,
    };

    if (endpoint.body) {
      testConfig.body = JSON.stringify(endpoint.body);
      testConfig.headers = {
        'Content-Type': 'application/json'
      };
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const instance = autocannon(testConfig, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });

        // Log progress
        instance.on('response', () => {
          process.stdout.write('.');
        });
      });

      metrics.addResult(endpoint.name, result);
      
      console.log(`\n   ✅ Completed`);
      console.log(`   📈 RPS: ${result.requests?.average?.toFixed(2) || 'N/A'}`);
      console.log(`   ⏱️  P95: ${result.latencies?.p95?.toFixed(2) || 'N/A'}ms`);
      console.log(`   🎯 Target: ${result.latencies?.p95 <= endpoint.target ? '✅ PASS' : '❌ FAIL'}`);

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      metrics.addResult(endpoint.name, { error: error.message });
    }
  }

  // Generate and save report
  const report = metrics.generateReport();
  const reportPath = path.join(RESULTS_DIR, `api-response-time-${Date.now()}.json`);
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n📋 Performance Test Summary');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`Test Duration: ${(report.summary.testDuration / 1000).toFixed(2)}s`);
  console.log(`Report Saved: ${reportPath}`);
  
  // Display NFR compliance
  console.log('\n🎯 NFR Compliance Results:');
  Object.entries(report.nfrCompliance).forEach(([nfr, result]) => {
    const total = result.passed + result.failed;
    const percentage = total > 0 ? ((result.passed / total) * 100).toFixed(1) : '0';
    console.log(`   ${nfr}: ${result.passed}/${total} passed (${percentage}%)`);
    console.log(`           Target: ${result.target}`);
  });

  // Display recommendations
  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. [${rec.priority}] ${rec.endpoint}`);
      console.log(`      Issue: ${rec.issue}`);
      console.log(`      Suggestion: ${rec.suggestion}`);
    });
  }

  return report;
}

// Export for use in other modules
module.exports = { runPerformanceTests, PerformanceMetrics };

// Run if called directly
if (require.main === module) {
  runPerformanceTests()
    .then(() => {
      console.log('\n✅ Performance testing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance testing failed:', error);
      process.exit(1);
    });
}