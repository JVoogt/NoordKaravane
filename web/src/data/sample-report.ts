// The example inspection report shown on the Home page (the hero tag and the sample report) and on the Caravan
// service page. It is an example format, labelled as such wherever it appears; no customer data.
export interface SampleFinding {
  /** What was found. */
  k: string;
  /** What we recommend. */
  v: string;
  /** What is attached to the finding, or its result. */
  evidence: string;
  /** Home sample report: the state shown beside the finding. */
  state: string;
  /** True for a finding that passed. */
  low: boolean;
}

export const SAMPLE_FINDINGS: readonly SampleFinding[] = Object.freeze([
  { k: 'Wheel bearing play detected', v: 'Recommend a bearing service before long-distance towing.', evidence: '4 photos', state: 'Needs your decision', low: false },
  { k: 'Roof latch and gas strut check', v: 'Parts listed separately, so you can approve the repair or leave it.', evidence: '2 notes', state: '2 notes', low: false },
  { k: 'Solar controller and battery health', v: 'Reading logged and explained.', evidence: 'Passed', state: 'Passed', low: true },
]);
