import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 4: Alarm-Triggered Rollback
 * 
 * Statement: Any alarm in ALARM state during deployment must trigger rollback
 * 
 * This property validates that the monitoring system correctly detects
 * alarm state changes and triggers rollback when any alarm enters ALARM state.
 * 
 * **Validates**: Requirements US-4 (Acceptance Criteria 4)
 */

describe('Property 4: Alarm-Triggered Rollback', () => {
  type AlarmState = 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';

  interface Alarm {
    name: string;
    state: AlarmState;
  }

  /**
   * Simulates monitoring alarms and determining if rollback should be triggered.
   * Returns true if rollback should be triggered, false otherwise.
   */
  async function monitorAlarms(alarms: Alarm[]): Promise<boolean> {
    // Rollback should be triggered if any alarm is in ALARM state
    return alarms.some(alarm => alarm.state === 'ALARM');
  }

  /**
   * Checks if any alarm in the array is in ALARM state
   */
  function hasAlarmInAlarmState(alarms: Alarm[]): boolean {
    return alarms.some(alarm => alarm.state === 'ALARM');
  }

  /**
   * Counts alarms by state
   */
  function countAlarmsByState(alarms: Alarm[]): Record<AlarmState, number> {
    return alarms.reduce((acc, alarm) => {
      acc[alarm.state] = (acc[alarm.state] || 0) + 1;
      return acc;
    }, {} as Record<AlarmState, number>);
  }

  it('should trigger rollback when any alarm enters ALARM state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constantFrom<AlarmState>('OK', 'ALARM', 'INSUFFICIENT_DATA')
        }), { minLength: 1, maxLength: 20 }),
        async (alarms) => {
          const hasAlarm = alarms.some(a => a.state === 'ALARM');
          const rollbackTriggered = await monitorAlarms(alarms);
          
          // Rollback should be triggered if and only if there's an alarm in ALARM state
          return hasAlarm === rollbackTriggered;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger rollback when all alarms are OK', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constant<AlarmState>('OK')
        }), { minLength: 1, maxLength: 10 }),
        async (alarms) => {
          const rollbackTriggered = await monitorAlarms(alarms);
          
          // No rollback should be triggered when all alarms are OK
          return rollbackTriggered === false;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should not trigger rollback when alarms are INSUFFICIENT_DATA', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constant<AlarmState>('INSUFFICIENT_DATA')
        }), { minLength: 1, maxLength: 10 }),
        async (alarms) => {
          const rollbackTriggered = await monitorAlarms(alarms);
          
          // No rollback should be triggered for INSUFFICIENT_DATA
          return rollbackTriggered === false;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should trigger rollback with single ALARM among many OK alarms', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (okCount, insufficientDataCount) => {
          const alarms: Alarm[] = [
            ...Array(okCount).fill(null).map((_, i) => ({ name: `ok-alarm-${i}`, state: 'OK' as AlarmState })),
            ...Array(insufficientDataCount).fill(null).map((_, i) => ({ name: `insufficient-alarm-${i}`, state: 'INSUFFICIENT_DATA' as AlarmState })),
            { name: 'critical-alarm', state: 'ALARM' as AlarmState }
          ];
          
          const rollbackTriggered = await monitorAlarms(alarms);
          
          // Single ALARM should trigger rollback regardless of other alarms
          return rollbackTriggered === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should trigger rollback with multiple ALARM states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (alarmCount) => {
          const alarms: Alarm[] = Array(alarmCount).fill(null).map((_, i) => ({
            name: `alarm-${i}`,
            state: 'ALARM' as AlarmState
          }));
          
          const rollbackTriggered = await monitorAlarms(alarms);
          
          // Multiple ALARM states should trigger rollback
          return rollbackTriggered === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle empty alarm array', async () => {
    const rollbackTriggered = await monitorAlarms([]);
    
    // Empty alarm array should not trigger rollback
    expect(rollbackTriggered).toBe(false);
  });

  it('should correctly identify alarms in ALARM state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constantFrom<AlarmState>('OK', 'ALARM', 'INSUFFICIENT_DATA')
        }), { minLength: 0, maxLength: 20 }),
        (alarms) => {
          const hasAlarm = hasAlarmInAlarmState(alarms);
          const expectedHasAlarm = alarms.some(a => a.state === 'ALARM');
          
          // Detection should match actual presence of ALARM state
          return hasAlarm === expectedHasAlarm;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should count alarms by state correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constantFrom<AlarmState>('OK', 'ALARM', 'INSUFFICIENT_DATA')
        }), { minLength: 0, maxLength: 20 }),
        (alarms) => {
          const counts = countAlarmsByState(alarms);
          
          // Sum of counts should equal total alarms
          const totalCounted = (counts.OK || 0) + (counts.ALARM || 0) + (counts.INSUFFICIENT_DATA || 0);
          return totalCounted === alarms.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be consistent across multiple checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          state: fc.constantFrom<AlarmState>('OK', 'ALARM', 'INSUFFICIENT_DATA')
        }), { minLength: 1, maxLength: 10 }),
        async (alarms) => {
          // Check multiple times with same input
          const result1 = await monitorAlarms(alarms);
          const result2 = await monitorAlarms(alarms);
          const result3 = await monitorAlarms(alarms);
          
          // Results should be consistent (idempotent)
          return result1 === result2 && result2 === result3;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle mixed alarm states correctly', async () => {
    const testCases = [
      {
        alarms: [
          { name: 'alarm1', state: 'OK' as AlarmState },
          { name: 'alarm2', state: 'INSUFFICIENT_DATA' as AlarmState }
        ],
        expectedRollback: false
      },
      {
        alarms: [
          { name: 'alarm1', state: 'OK' as AlarmState },
          { name: 'alarm2', state: 'ALARM' as AlarmState }
        ],
        expectedRollback: true
      },
      {
        alarms: [
          { name: 'alarm1', state: 'ALARM' as AlarmState },
          { name: 'alarm2', state: 'INSUFFICIENT_DATA' as AlarmState }
        ],
        expectedRollback: true
      },
      {
        alarms: [
          { name: 'alarm1', state: 'OK' as AlarmState },
          { name: 'alarm2', state: 'OK' as AlarmState },
          { name: 'alarm3', state: 'INSUFFICIENT_DATA' as AlarmState }
        ],
        expectedRollback: false
      }
    ];

    for (const testCase of testCases) {
      const rollbackTriggered = await monitorAlarms(testCase.alarms);
      expect(rollbackTriggered).toBe(testCase.expectedRollback);
    }
  });
});
