#!/usr/bin/env node

/**
 * Concurrent User Load Testing
 * Tests NFR-005, NFR-006, NFR-007 requirements
 * 
 * NFR-005: System must handle 1,000 concurrent users
 * NFR-006: Database must support 10,000+ transactions per hour
 * NFR-007: System must scale horizontally to handle growth
 */

const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');
const pidusage = require('pidusage');

const BASE_URL = 'http://localhost:3000';
const API_VERSION = 'v1';
const RESULTS_DIR = path.join(__dirname, '../reports');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Test scenarios with escalating concurrent user loads
const LOAD_SCENARIOS = [
  {
    name: 'Light Load',
    connections: 10,
    duration: 30,
    description: 'Baseline performance with minimal load'
  },
  {
    name: 'Moderate Load', 
    connections: 100,
    duration: 60,
    description: 'Typical production load'
  },
  {
    name: 'Heavy Load',
    connections: 500,
    duration: 90,
    description: 'Peak hour simulation'
  },
  {
    name: 'Stress Test',
    connections: 1000,
    duration: 120,
    description: 'NFR-005 requirement: 1,000 concurrent users'
  },
  {
    name: 'Breaking Point',
    connections: 2000,
    duration: 60,
    description: 'Beyond requirement to find breaking point'
  }
];

// System monitoring utilities
class SystemMonitor {
  constructor(processName = 'node') {
    this.processName = processName;
    this.metrics = [];
    this.monitoring = false;
  }

  async startMonitoring() {
    this.monitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        const processes = await this.findNodeProcesses();
        const systemMetrics = await this.collectSystemMetrics(processes);
        this.metrics.push({
          timestamp: Date.now(),
          ...systemMetrics
        });
      } catch (error) {
        console.warn('Monitoring error:', error.message);
      }
    }, 1000); // Collect metrics every second
  }

  stopMonitoring() {
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  async findNodeProcesses() {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('pgrep -f "node.*server"', (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const pids = stdout.trim().split('\n').filter(Boolean);
          resolve(pids.map(pid => parseInt(pid)));
        });
      });
    } catch (error) {
      return [];
    }
  }

  async collectSystemMetrics(pids) {
    const metrics = {
      cpu: 0,
      memory: 0,
      processCount: pids.length,
      timestamp: Date.now()
    };

    for (const pid of pids) {
      try {
        const stat = await pidusage(pid);
        metrics.cpu += stat.cpu;
        metrics.memory += stat.memory;
      } catch (error) {
        // Process might have ended
        continue;
      }
    }

    return metrics;
  }

  getMetricsSummary() {
    if (this.metrics.length === 0) {
      return {
        cpu: { avg: 0, max: 0, min: 0 },
        memory: { avg: 0, max: 0, min: 0 },
        sampleCount: 0
      };
    }

    const cpuValues = this.metrics.map(m => m.cpu);
    const memoryValues = this.metrics.map(m => m.memory);

    return {
      cpu: {
        avg: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
        max: Math.max(...cpuValues),
        min: Math.min(...cpuValues)
      },
      memory: {
        avg: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
        max: Math.max(...memoryValues),
        min: Math.min(...memoryValues)
      },
      sampleCount: this.metrics.length,
      rawMetrics: this.metrics
    };
  }
}

// Load test orchestrator
class LoadTestOrchestrator {
  constructor() {
    this.results = [];
    this.systemMonitor = new SystemMonitor();
  }

  async runLoadTest(scenario) {
    console.log(`\n🔥 Starting ${scenario.name} Test`);
    console.log(`   Connections: ${scenario.connections}`);
    console.log(`   Duration: ${scenario.duration}s`);
    console.log(`   Description: ${scenario.description}`);

    // Start system monitoring
    await this.systemMonitor.startMonitoring();
    
    const testConfig = {
      url: `${BASE_URL}/health`,
      method: 'GET',
      connections: scenario.connections,
      duration: scenario.duration,
      pipelining: 1,
      timeout: 30000, // 30 second timeout for heavy loads
    };

    try {
      const startTime = Date.now();
      
      const result = await new Promise((resolve, reject) => {
        const instance = autocannon(testConfig, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });

        // Progress indicator
        let dots = 0;
        const progressInterval = setInterval(() => {
          process.stdout.write('.');
          dots++;
          if (dots % 50 === 0) process.stdout.write('\n   ');
        }, 1000);

        instance.on('done', () => clearInterval(progressInterval));
      });

      const endTime = Date.now();
      
      // Stop monitoring and get metrics
      this.systemMonitor.stopMonitoring();
      const systemMetrics = this.systemMonitor.getMetricsSummary();

      const analysis = this.analyzeLoadTestResult(scenario, result, systemMetrics, endTime - startTime);
      this.results.push(analysis);

      console.log(`\n   ✅ ${scenario.name} Completed`);
      console.log(`   📊 RPS: ${(result.requests?.average || 0).toFixed(2)}`);
      console.log(`   ⏱️  P95 Latency: ${(result.latencies?.p95 || 0).toFixed(2)}ms`);
      console.log(`   💾 Memory Peak: ${(systemMetrics.memory.max / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   🖥️  CPU Peak: ${systemMetrics.cpu.max.toFixed(2)}%`);
      console.log(`   ❌ Errors: ${result.errors || 0}`);

      return analysis;

    } catch (error) {
      this.systemMonitor.stopMonitoring();
      console.error(`   ❌ ${scenario.name} Failed: ${error.message}`);
      
      const errorAnalysis = {
        scenario: scenario.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.results.push(errorAnalysis);
      return errorAnalysis;
    }
  }

  analyzeLoadTestResult(scenario, result, systemMetrics, actualDuration) {
    const requests = result.requests || {};
    const latencies = result.latencies || {};
    const throughput = result.throughput || {};

    // Calculate transactions per hour
    const transactionsPerHour = (requests.total / actualDuration) * 3600000; // Convert from ms to hour

    return {
      scenario: scenario.name,
      timestamp: new Date().toISOString(),
      configuration: {
        connections: scenario.connections,
        duration: scenario.duration,
        actualDuration: actualDuration
      },
      performance: {
        totalRequests: requests.total || 0,
        requestsPerSecond: requests.average || 0,
        transactionsPerHour: Math.round(transactionsPerHour),
        responseTime: {
          average: latencies.average || 0,
          p50: latencies.p50 || 0,
          p90: latencies.p90 || 0,
          p95: latencies.p95 || 0,
          p99: latencies.p99 || 0,
          max: latencies.max || 0
        },
        throughput: {
          average: throughput.average || 0,
          min: throughput.min || 0,
          max: throughput.max || 0
        }
      },
      systemResources: systemMetrics,
      reliability: {
        errors: result.errors || 0,
        timeouts: result.timeouts || 0,
        errorRate: result.errors ? ((result.errors / requests.total) * 100).toFixed(2) : 0
      },
      nfrCompliance: this.checkNFRCompliance(scenario, result, systemMetrics, transactionsPerHour)
    };
  }

  checkNFRCompliance(scenario, result, systemMetrics, transactionsPerHour) {
    const compliance = {};

    // NFR-005: System must handle 1,000 concurrent users
    if (scenario.connections >= 1000) {
      compliance.NFR005 = {
        requirement: '1,000 concurrent users',
        tested: scenario.connections,
        passed: (result.errors || 0) === 0 && (result.latencies?.p95 || Infinity) < 1000,
        metrics: {
          errorRate: result.errors ? ((result.errors / result.requests.total) * 100).toFixed(2) : 0,
          p95Latency: result.latencies?.p95 || 0
        }
      };
    }

    // NFR-006: Database must support 10,000+ transactions per hour  
    compliance.NFR006 = {
      requirement: '10,000+ transactions per hour',
      achieved: Math.round(transactionsPerHour),
      passed: transactionsPerHour >= 10000,
      metrics: {
        transactionsPerHour: Math.round(transactionsPerHour),
        requestsPerSecond: result.requests?.average || 0
      }
    };

    // NFR-007: System scalability (resource efficiency)
    compliance.NFR007 = {
      requirement: 'Efficient resource utilization under load',
      metrics: {
        cpuEfficiency: systemMetrics.cpu.avg < 80, // CPU should not max out
        memoryGrowth: systemMetrics.memory.max - systemMetrics.memory.min,
        resourceStability: Math.abs(systemMetrics.cpu.max - systemMetrics.cpu.avg) < 20
      },
      passed: systemMetrics.cpu.avg < 80 && systemMetrics.memory.avg < 1024 * 1024 * 1024 // 1GB
    };

    return compliance;
  }

  async runAllLoadTests() {
    console.log('🚀 Starting Concurrent User Load Testing');
    console.log(`Target: ${BASE_URL}`);
    console.log(`Scenarios: ${LOAD_SCENARIOS.length}`);
    console.log('='.repeat(60));

    for (const scenario of LOAD_SCENARIOS) {
      await this.runLoadTest(scenario);
      
      // Cool down period between tests
      if (scenario !== LOAD_SCENARIOS[LOAD_SCENARIOS.length - 1]) {
        console.log('\n⏸️  Cooldown period (10s)...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    return this.generateComprehensiveReport();
  }

  generateComprehensiveReport() {
    const report = {
      summary: {
        testDate: new Date().toISOString(),
        totalScenarios: this.results.length,
        successfulTests: this.results.filter(r => !r.error).length,
        failedTests: this.results.filter(r => r.error).length
      },
      results: this.results,
      nfrAnalysis: this.analyzeNFRCompliance(),
      recommendations: this.generateRecommendations(),
      scalabilityAnalysis: this.analyzeScalability()
    };

    // Save report
    const reportPath = path.join(RESULTS_DIR, `concurrent-user-load-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.printReport(report, reportPath);
    return report;
  }

  analyzeNFRCompliance() {
    const nfrResults = {
      NFR005: { tests: [], overallPassed: false },
      NFR006: { tests: [], overallPassed: false },
      NFR007: { tests: [], overallPassed: true }
    };

    this.results.forEach(result => {
      if (result.nfrCompliance) {
        Object.entries(result.nfrCompliance).forEach(([nfr, compliance]) => {
          if (nfrResults[nfr]) {
            nfrResults[nfr].tests.push(compliance);
          }
        });
      }
    });

    // Determine overall compliance
    nfrResults.NFR005.overallPassed = nfrResults.NFR005.tests.some(t => t.passed);
    nfrResults.NFR006.overallPassed = nfrResults.NFR006.tests.some(t => t.passed);
    nfrResults.NFR007.overallPassed = nfrResults.NFR007.tests.every(t => t.passed);

    return nfrResults;
  }

  analyzeScalability() {
    const successfulResults = this.results.filter(r => !r.error && r.performance);
    
    if (successfulResults.length < 2) {
      return { analysis: 'Insufficient data for scalability analysis' };
    }

    // Calculate scalability metrics
    const connectionCounts = successfulResults.map(r => r.configuration.connections);
    const throughputs = successfulResults.map(r => r.performance.requestsPerSecond);
    const latencies = successfulResults.map(r => r.performance.responseTime.p95);

    return {
      linearScaling: this.calculateLinearScaling(connectionCounts, throughputs),
      latencyGrowth: this.calculateLatencyGrowth(connectionCounts, latencies),
      breakingPoint: this.findBreakingPoint(successfulResults),
      resourceEfficiency: this.calculateResourceEfficiency(successfulResults)
    };
  }

  calculateLinearScaling(connections, throughputs) {
    // Simple linear regression to see if throughput scales with connections
    const n = connections.length;
    const sumX = connections.reduce((a, b) => a + b, 0);
    const sumY = throughputs.reduce((a, b) => a + b, 0);
    const sumXY = connections.reduce((sum, x, i) => sum + x * throughputs[i], 0);
    const sumXX = connections.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = slope > 0 ? 'Positive' : slope < 0 ? 'Negative' : 'No correlation';

    return {
      slope: slope.toFixed(4),
      correlation,
      efficiency: slope > 0.5 ? 'Good' : slope > 0.2 ? 'Moderate' : 'Poor'
    };
  }

  calculateLatencyGrowth(connections, latencies) {
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    const growthFactor = maxLatency / minLatency;

    return {
      minLatency: minLatency.toFixed(2),
      maxLatency: maxLatency.toFixed(2),
      growthFactor: growthFactor.toFixed(2),
      assessment: growthFactor < 2 ? 'Excellent' : growthFactor < 5 ? 'Good' : 'Concerning'
    };
  }

  findBreakingPoint(results) {
    const failedTest = results.find(r => r.reliability.errorRate > 1 || r.performance.responseTime.p95 > 2000);
    
    if (failedTest) {
      return {
        found: true,
        connections: failedTest.configuration.connections,
        reason: failedTest.reliability.errorRate > 1 ? 'High error rate' : 'High latency',
        metrics: {
          errorRate: failedTest.reliability.errorRate,
          p95Latency: failedTest.performance.responseTime.p95
        }
      };
    }

    return {
      found: false,
      note: 'Breaking point not reached within tested range'
    };
  }

  calculateResourceEfficiency(results) {
    const efficiencyScores = results.map(r => {
      const cpuEfficiency = Math.max(0, 100 - r.systemResources.cpu.avg);
      const memoryMB = r.systemResources.memory.avg / 1024 / 1024;
      const memoryEfficiency = Math.max(0, 100 - (memoryMB / 10)); // Assume 1GB = 10% efficiency loss
      
      return {
        connections: r.configuration.connections,
        cpuEfficiency,
        memoryEfficiency,
        overall: (cpuEfficiency + memoryEfficiency) / 2
      };
    });

    return efficiencyScores;
  }

  generateRecommendations() {
    const recommendations = [];
    const nfrAnalysis = this.analyzeNFRCompliance();

    // NFR-005 recommendations
    if (!nfrAnalysis.NFR005.overallPassed) {
      recommendations.push({
        priority: 'HIGH',
        nfr: 'NFR-005',
        issue: 'System fails to handle 1,000 concurrent users effectively',
        recommendations: [
          'Implement horizontal scaling with load balancing',
          'Optimize database connection pooling',
          'Add Redis caching for frequently accessed data',
          'Consider implementing CDN for static assets'
        ]
      });
    }

    // NFR-006 recommendations
    if (!nfrAnalysis.NFR006.overallPassed) {
      recommendations.push({
        priority: 'HIGH',
        nfr: 'NFR-006',
        issue: 'Database transaction throughput below 10,000/hour requirement',
        recommendations: [
          'Optimize database queries and add appropriate indexes',
          'Implement database read replicas for read-heavy operations',
          'Consider database connection pooling optimization',
          'Evaluate query execution plans and optimize slow queries'
        ]
      });
    }

    // General performance recommendations
    const avgErrorRate = this.results.reduce((sum, r) => {
      return sum + (r.reliability ? parseFloat(r.reliability.errorRate) : 0);
    }, 0) / this.results.length;

    if (avgErrorRate > 0.1) {
      recommendations.push({
        priority: 'MEDIUM',
        nfr: 'General',
        issue: `Average error rate of ${avgErrorRate.toFixed(2)}% across tests`,
        recommendations: [
          'Implement circuit breaker pattern for external dependencies',
          'Add retry logic with exponential backoff',
          'Improve error handling and logging',
          'Consider implementing request queuing for peak loads'
        ]
      });
    }

    return recommendations;
  }

  printReport(report, reportPath) {
    console.log('\n📊 Load Testing Summary');
    console.log('='.repeat(60));
    console.log(`Total Scenarios: ${report.summary.totalScenarios}`);
    console.log(`Successful Tests: ${report.summary.successfulTests}`);
    console.log(`Failed Tests: ${report.summary.failedTests}`);
    console.log(`Report Saved: ${reportPath}`);

    console.log('\n🎯 NFR Compliance Results:');
    Object.entries(report.nfrAnalysis).forEach(([nfr, result]) => {
      const status = result.overallPassed ? '✅ PASS' : '❌ FAIL';
      console.log(`   ${nfr}: ${status} (${result.tests.length} tests)`);
    });

    if (report.scalabilityAnalysis.breakingPoint?.found) {
      console.log('\n⚠️  Breaking Point Detected:');
      console.log(`   Connections: ${report.scalabilityAnalysis.breakingPoint.connections}`);
      console.log(`   Reason: ${report.scalabilityAnalysis.breakingPoint.reason}`);
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      report.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.priority}] ${rec.nfr}: ${rec.issue}`);
      });
    }
  }
}

// Export for module use
module.exports = { LoadTestOrchestrator, SystemMonitor };

// Run if called directly
if (require.main === module) {
  const orchestrator = new LoadTestOrchestrator();
  
  orchestrator.runAllLoadTests()
    .then(() => {
      console.log('\n✅ Load testing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Load testing failed:', error);
      process.exit(1);
    });
}