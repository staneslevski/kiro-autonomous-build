/**
 * Property-Based Test: Health Check Monotonicity
 * 
 * Property 3 from Design Section 12:
 * "Once a health check fails during a monitoring session, it never succeeds in the same session"
 * 
 * This property ensures that health check monitoring is monotonic - once it detects
 * a failure (alarm in ALARM state), it immediately stops and returns failure.
 * It should never transition back to success within the same monitoring session.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    vi.useFakeTimers();
    
    // Mock console.log to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  
  it('should never succeed after first failure in same monitoring session', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random alarm state sequences
        fc.array(
          fc.constantFrom('OK', 'ALARM', 'INSUFFICIENT_DATA'),
          { minLength: 2, maxLength: 10 }
        ),
        async (alarmStates) => {
          // Reset mock for each property test iteration
          cloudWatchMock.reset();
          
          // Configure mock to return alarm states in sequence
          alarmStates.forEach((state) => {
            cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
              MetricAlarms: [
                {
                  AlarmName: 'test-alarm',
                  StateValue: state,
                  StateReason: `State: ${state}`,
                },
              ],
            });
          });
          
          // Add a default fallback response for any additional checks
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: [
              {
                AlarmName: 'test-alarm',
                StateValue: 'OK',
                StateReason: 'Default OK state',
              },
            ],
          });
          
          const monitor = new HealthCheckMonitor(['test-alarm'], 'us-east-1');
          
          // Run monitoring for duration that allows all checks
          const duration = alarmStates.length * 30000; // 30s per check
          const monitorPromise = monitor.monitorHealthChecks(duration);
          
          // Advance time to trigger all checks
          await vi.advanceTimersByTimeAsync(duration);
          
          const result = await monitorPromise;
          
          // Find first ALARM state in sequence
          const firstAlarmIndex = alarmStates.findIndex(state => state === 'ALARM');
          
          if (firstAlarmIndex === -1) {
            // No ALARM state in sequence - should succeed
            expect(result.success).toBe(true);
            expect(result.failedAlarms).toHaveLength(0);
          } else {
            // ALARM state found - should fail immediately
            expect(result.success).toBe(false);
            expect(result.failedAlarms.length).toBeGreaterThan(0);
            
            // Verify monitoring stopped at or before first ALARM
            // (should not have checked all states)
            const callCount = cloudWatchMock.calls().length;
            expect(callCount).toBeLessThanOrEqual(firstAlarmIndex + 1);
            
            // Property: Once failed, never succeeds in same session
            // This is verified by the fact that result.success is false
            // and monitoring stopped immediately
          }
          
          return true;
        }
      ),
      {
        numRuns: 100, // Run 100 random test cases
        verbose: false,
      }
    );
  });
  
  it('should maintain failure state regardless of subsequent alarm states', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate: number of OK checks before failure, number of checks after failure
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (okChecksBeforeFailure, checksAfterFailure) => {
          cloudWatchMock.reset();
          
          // Configure OK states before failure
          for (let i = 0; i < okChecksBeforeFailure; i++) {
            cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
              MetricAlarms: [
                {
                  AlarmName: 'test-alarm',
                  StateValue: 'OK',
                  StateReason: 'Normal',
                },
              ],
            });
          }
          
          // Configure ALARM state (failure)
          cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
            MetricAlarms: [
              {
                AlarmName: 'test-alarm',
                StateValue: 'ALARM',
                StateReason: 'Threshold breached',
              },
            ],
          });
          
          // Add default fallback response for any additional checks
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: [
              {
                AlarmName: 'test-alarm',
                StateValue: 'OK',
                StateReason: 'Recovered',
              },
            ],
          });
          
          const monitor = new HealthCheckMonitor(['test-alarm'], 'us-east-1');
          
          // Run monitoring for duration that would allow all checks
          const totalChecks = okChecksBeforeFailure + 1 + checksAfterFailure;
          const duration = totalChecks * 30000;
          const monitorPromise = monitor.monitorHealthChecks(duration);
          
          // Advance time to trigger failure check
          await vi.advanceTimersByTimeAsync((okChecksBeforeFailure + 1) * 30000);
          
          const result = await monitorPromise;
          
          // Property: Result must be failure
          expect(result.success).toBe(false);
          expect(result.failedAlarms.length).toBeGreaterThan(0);
          
          // Property: Monitoring stopped immediately after failure
          // Should have checked: initial + OK checks + failure check
          const expectedCalls = okChecksBeforeFailure + 1;
          const actualCalls = cloudWatchMock.calls().length;
          expect(actualCalls).toBeLessThanOrEqual(expectedCalls);
          
          // Property: Duration should be less than full monitoring duration
          expect(result.duration).toBeLessThan(duration);
          
          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: false,
      }
    );
  });
  
  it('should handle multiple alarms with monotonic failure behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of alarms and their states
        fc.integer({ min: 1, max: 5 }),
        fc.array(
          fc.constantFrom('OK', 'ALARM', 'INSUFFICIENT_DATA'),
          { minLength: 1, maxLength: 5 }
        ),
        async (numAlarms, stateSequence) => {
          cloudWatchMock.reset();
          
          const alarmNames = Array.from({ length: numAlarms }, (_, i) => `alarm-${i}`);
          
          // Configure mock responses for each check in sequence
          stateSequence.forEach((state) => {
            const alarms = alarmNames.map((name, index) => ({
              AlarmName: name,
              StateValue: index === 0 ? state : 'OK', // Only first alarm changes state
              StateReason: `State: ${state}`,
            }));
            
            cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
              MetricAlarms: alarms,
            });
          });
          
          // Add default fallback response
          const defaultAlarms = alarmNames.map((name) => ({
            AlarmName: name,
            StateValue: 'OK',
            StateReason: 'Default OK state',
          }));
          cloudWatchMock.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: defaultAlarms,
          });
          
          const monitor = new HealthCheckMonitor(alarmNames, 'us-east-1');
          
          const duration = stateSequence.length * 30000;
          const monitorPromise = monitor.monitorHealthChecks(duration);
          
          await vi.advanceTimersByTimeAsync(duration);
          
          const result = await monitorPromise;
          
          // Find first ALARM in sequence
          const hasAlarm = stateSequence.some(state => state === 'ALARM');
          
          if (hasAlarm) {
            // Property: Must fail when any alarm is in ALARM state
            expect(result.success).toBe(false);
            
            // Property: Must stop immediately (monotonic behavior)
            const firstAlarmIndex = stateSequence.findIndex(state => state === 'ALARM');
            const callCount = cloudWatchMock.calls().length;
            expect(callCount).toBeLessThanOrEqual(firstAlarmIndex + 1);
          } else {
            // No ALARM state - should succeed
            expect(result.success).toBe(true);
          }
          
          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: false,
      }
    );
  });
});
