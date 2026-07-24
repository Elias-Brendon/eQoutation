// The master lists the AI extraction prompt is built from. Kept separate
// (breaker vs. other) because the prompt describes a fixed description
// format for breakers that doesn't apply to the rest.
export const BREAKER_TYPES = [
  'MCCB',
  'MCB',
  'ISO/ISOLATOR',
  'ACB',
  'MPCB',
  'RCCB',
  'ELCB',
  'RCBO'
] as const

export const OTHER_COMPONENT_TYPES = [
  'Contactor',
  'Meter',
  'CT',
  'Pilot lamp',
  'Timer',
  'SPD',
  'Busbar',
  'Distribution board'
] as const

export const DEFAULT_COMPONENT_TYPES: string[] = [...BREAKER_TYPES, ...OTHER_COMPONENT_TYPES]
