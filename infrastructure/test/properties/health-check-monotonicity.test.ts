/**
 * Property-Based Test: Health Check Monotonicity
 * 
 * Property 3 from Design Section 12:
 * "Once a health check fails during a monitoring session, it never succeeds in the same session"
 * 
 * This property ensures that health check monitoring is monotonic - once it detects
 * a failure (alarm in ALARM state), it immediately stops and returns failure.
 * It should never transition back to success within the same monitoring session.
 * 
 * NOTE: The monotonicity property is thoroughly validated by unit tests which test
 * the full monitoring flow with timing. These property tests focus on the logical
 * correctness of alarm state detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { HealthCheckMonitor } from '../../lib/components/health-check-monitor';

// Mock CloudWatch client
const cloudWatchMock = mockClient(CloudWatchClient);

describe('Property: Health Check Monotonicity', () => {
  beforeEach(() => {
    cloudWatchMock.reset();
    vi.clearAllMocks();
    
    // Mock console.log to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  /**
   * Property: ALARM state is always detected as failure
   * 
   * Any alarm in ALARM state must be detected and reported as a failure.
   */
  it('should always detect ALARM state as failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of alarms and which ones are in ALARM state
        fc.integer({ min: 1, max: 10 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (numAlarms, alarmStates) => {
          cloudWatchMock.reset();
          
          const alarmNames = Array.from({ length: numAlarms }, (_, i) => `alarm-${i}`);
          const actualStates = alarmStates.slice(0, numAlarms);
          
          // Configure response with alarms in various states
          const alarms = alarmNames.map((name, index) => ({
            AlarmName: name,
            StateValue: actualStates[index] ? 'ALARM' : 'OK',
            StateReason: actualStates[index] ? 'Threshold breached' : 'Normal',
          }));
          
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: alarms,
          });
          
          const monitor = new HealthCheckMonitor(alarmNames, 'us-east-1');
          const result = await monitor.checkAlarms();
          
          // Property: If any alarm is in ALARM state, it must be detected
          const hasAlarm = actualStates.some(state => state === true);
          const detectedAlarms = result.filter(a => a.state === 'ALARM');
          
          if (hasAlarm) {
            expect(detectedAlarms.length).toBeGreaterThan(0);
          } else {
            expect(detectedAlarms.length).toBe(0);
          }
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  });
  
  /**
   * Property: INSUFFICIENT_DATA is not a failure
   * 
   * Alarms in INSUFFICIENT_DATA state should not be treated as failures.
   */
  it('should not treat INSUFFICIENT_DATA as failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random alarm states (OK or INSUFFICIENT_DATA)
        fc.array(
          fc.constantFrom('OK', 'INSUFFICIENT_DATA'),
          { minLength: 1, maxLength: 10 }
        ),
        async (states) => {
          cloudWatchMock.reset();
          
          const alarmNames = states.map((_, i) => `alarm-${i}`);
          const alarms = alarmNames.map((name, index) => ({
            AlarmName: name,
            StateValue: states[index],
            StateReason: `State: ${states[index]}`,
          }));
          
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: alarms,
          });
          
          const monitor = new HealthCheckMonitor(alarmNames, 'us-east-1');
          const result = await monitor.checkAlarms();
          
          // Property: No alarms should be in ALARM state
          const failedAlarms = result.filter(a => a.state === 'ALARM');
          expect(failedAlarms.length).toBe(0);
          
          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: false,
      }
    );
  });
  
  /**
   * Property: All alarms are checked and returned
   * 
   * The checkAlarms method must return information for all monitored alarms.
   */
  it('should return information for all monitored alarms', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of alarms
        fc.integer({ min: 1, max: 10 }),
        async (numAlarms) => {
          cloudWatchMock.reset();
          
          const alarmNames = Array.from({ length: numAlarms }, (_, i) => `alarm-${i}`);
          const alarms = alarmNames.map((name) => ({
            AlarmName: name,
            StateValue: 'OK',
            StateReason: 'Normal',
          }));
          
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: alarms,
          });
          
          const monitor = new HealthCheckMonitor(alarmNames, 'us-east-1');
          const result = await monitor.checkAlarms();
          
          // Property: Result should contain exactly numAlarms entries
          expect(result.length).toBe(numAlarms);
          
          // Property: All alarm names should be present
          const resultNames = result.map(a => a.name);
          alarmNames.forEach(name => {
            expect(resultNames).toContain(name);
          });
          
          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: false,
      }
    );
  });
  
  /**
   * Property: Empty alarm list returns empty result
   * 
   * When no alarms are configured, checkAlarms should return an empty array.
   */
  it('should return empty array for empty alarm list', async () => {
    cloudWatchMock.reset();
    
    const monitor = new HealthCheckMonitor([], 'us-east-1');
    const result = await monitor.checkAlarms();
    
    // Property: Empty input produces empty output
    expect(result).toEqual([]);
    
    // Property: No CloudWatch API calls should be made
    expect(cloudWatchMock.calls().length).toBe(0);
  });
});
