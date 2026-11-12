import { describe, expect, it } from 'vitest';
import type { DocumentRequirement, DriverOnboardingView } from '@rideswithme/shared-types';
import { buildChecklist, documentState } from './onboarding';

const req = (over: Partial<DocumentRequirement>): DocumentRequirement => ({
  key: 'drivers_licence',
  name: "Driver's licence",
  scope: 'driver',
  media: 'document',
  requiresExpiry: true,
  requiresNumber: true,
  status: 'missing',
  latest: null,
  hasValidApproval: false,
  ...over,
});

const view = (over: Partial<DriverOnboardingView>): DriverOnboardingView => ({
  userId: 'u',
  status: 'onboarding',
  rejectionReason: null,
  submittedAt: null,
  approvedAt: null,
  profile: { fullName: null, ninLast4: null },
  payoutAccount: null,
  vehicle: null,
  requirements: [],
  editable: true,
  submission: { ready: false, gaps: [] },
  eligibility: { canGoOnline: false, blockers: [] },
  ...over,
});

describe('checklist', () => {
  it('marks details steps from the submission gaps', () => {
    const steps = buildChecklist(
      view({ submission: { ready: false, gaps: [{ code: 'NIN' }, { code: 'PAYOUT_ACCOUNT' }] } }),
    );
    expect(steps.map((s) => [s.id, s.state])).toEqual([
      ['profile', 'todo'],
      ['vehicle', 'done'],
      ['payout', 'todo'],
    ]);
  });

  it('adds one step per required document, linking to its screen', () => {
    const steps = buildChecklist(
      view({ requirements: [req({ key: 'profile_photo', status: 'pending' })] }),
    );
    expect(steps[3]).toMatchObject({
      id: 'document:profile_photo',
      state: 'waiting',
      href: '/document/profile_photo',
    });
  });

  it('flags rejected and expired documents unless an older approval still covers them', () => {
    expect(documentState(req({ status: 'rejected' }))).toBe('attention');
    expect(documentState(req({ status: 'expired' }))).toBe('attention');
    expect(documentState(req({ status: 'rejected', hasValidApproval: true }))).toBe('done');
    expect(documentState(req({ status: 'approved', hasValidApproval: true }))).toBe('done');
    expect(documentState(req({ status: 'missing' }))).toBe('todo');
  });
});
