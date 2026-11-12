import { describe, expect, it } from 'vitest';
import { RIDE_STATUSES } from '@rideswithme/shared-types';
import { canTransition, TRANSITIONS } from './ride-events';

describe('ride state machine', () => {
  it('follows the documented lifecycle', () => {
    const happy = [
      'requested',
      'searching',
      'driver_assigned',
      'driver_arrived',
      'in_progress',
      'completed',
    ] as const;
    for (let i = 0; i < happy.length - 1; i++)
      expect(canTransition(happy[i]!, happy[i + 1]!)).toBe(true);
  });

  it('has no way out of a finished ride', () => {
    for (const s of [
      'completed',
      'cancelled_by_passenger',
      'cancelled_by_driver',
      'no_driver_found',
    ] as const) {
      expect(TRANSITIONS[s]).toEqual([]);
    }
  });

  it('never skips steps or goes backwards', () => {
    expect(canTransition('searching', 'in_progress')).toBe(false);
    expect(canTransition('driver_assigned', 'completed')).toBe(false);
    expect(canTransition('in_progress', 'cancelled_by_passenger')).toBe(false);
    expect(canTransition('driver_arrived', 'driver_assigned')).toBe(false);
  });

  it('covers every status', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...RIDE_STATUSES].sort());
  });
});
