import type {
  DocumentRequirement,
  DriverOnboardingView,
  SubmissionGap,
} from '@rideswithme/shared-types';

export type StepState = 'done' | 'todo' | 'waiting' | 'attention';

export interface ChecklistStep {
  id: 'profile' | 'vehicle' | 'payout' | `document:${string}`;
  /** Translation key for the step title (documents use their type key). */
  titleKey: string;
  state: StepState;
  /** Route to open for this step. */
  href: string;
  requirement?: DocumentRequirement;
}

const has = (gaps: SubmissionGap[], code: SubmissionGap['code']) =>
  gaps.some((g) => g.code === code);

/**
 * Turns the API's onboarding view into the checklist the driver works through.
 * Kept free of React Native so it can be unit-tested.
 */
export function buildChecklist(view: DriverOnboardingView): ChecklistStep[] {
  const gaps = view.submission.gaps;
  const steps: ChecklistStep[] = [
    {
      id: 'profile',
      titleKey: 'steps.profile',
      state: has(gaps, 'FULL_NAME') || has(gaps, 'NIN') ? 'todo' : 'done',
      href: '/profile',
    },
    {
      id: 'vehicle',
      titleKey: 'steps.vehicle',
      state: has(gaps, 'VEHICLE') ? 'todo' : 'done',
      href: '/vehicle',
    },
    {
      id: 'payout',
      titleKey: 'steps.payout',
      state: has(gaps, 'PAYOUT_ACCOUNT') ? 'todo' : 'done',
      href: '/payout',
    },
  ];
  for (const r of view.requirements) {
    steps.push({
      id: `document:${r.key}`,
      titleKey: `docType.${r.key}`,
      state: documentState(r),
      href: `/document/${r.key}`,
      requirement: r,
    });
  }
  return steps;
}

export function documentState(r: DocumentRequirement): StepState {
  if (r.status === 'rejected' || r.status === 'expired')
    return r.hasValidApproval ? 'done' : 'attention';
  if (r.status === 'pending') return 'waiting';
  if (r.status === 'approved') return 'done';
  return 'todo';
}

/** Number of things the driver still has to do before they can submit. */
export function remainingCount(view: DriverOnboardingView): number {
  return view.submission.gaps.length;
}
