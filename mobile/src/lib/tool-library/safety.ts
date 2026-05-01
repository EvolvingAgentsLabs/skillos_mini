/**
 * Generic hazard classification and severity scoring.
 *
 * Used by every cartridge that surfaces safety verdicts (electricista, plomero,
 * any future trade dealing with regulated hazards). The cartridge calls
 * safety.classify with the hazard kind and evidence; the tool returns severity,
 * whether immediate action is required, and an escalation hint.
 *
 * The cartridge then surfaces this in user-visible prose — the navigator's
 * use-mode rule §8.8 ("always surface a verdict: fail in user-visible prose")
 * extends to safety classifications.
 */

import type { ToolContext, RegulatoryToolResult } from './types';

export type HazardKind =
  | 'fire'
  | 'shock'
  | 'flooding'
  | 'gas_leak'
  | 'asbestos'
  | 'fall'
  | 'chemical_burn'
  | 'collapse'
  | 'other';

interface HazardProfile {
  default_severity: 'low' | 'medium' | 'high';
  client_warning_required: boolean;
  professional_only: boolean;       // some hazards mean: "stop, call a specialist"
  escalation: string;               // human prose for the navigator
}

const PROFILES: Record<HazardKind, HazardProfile> = {
  fire: {
    default_severity: 'high',
    client_warning_required: true,
    professional_only: false,
    escalation: 'Detener uso del circuito hasta intervención. Documentar foto antes y después.',
  },
  shock: {
    default_severity: 'high',
    client_warning_required: true,
    professional_only: false,
    escalation: 'Cortar energía del circuito. No retomar hasta cumplir norma.',
  },
  flooding: {
    default_severity: 'medium',
    client_warning_required: true,
    professional_only: false,
    escalation: 'Aislar suministro y documentar el daño antes de proceder.',
  },
  gas_leak: {
    default_severity: 'high',
    client_warning_required: true,
    professional_only: true,
    escalation: 'Evacuar el ambiente, ventilar, cerrar suministro general, llamar a especialista de gas. NO encender luces ni interruptores.',
  },
  asbestos: {
    default_severity: 'high',
    client_warning_required: true,
    professional_only: true,
    escalation: 'No manipular sin equipo apropiado y empresa habilitada. Documentar y notificar al cliente por escrito.',
  },
  fall: {
    default_severity: 'medium',
    client_warning_required: false,
    professional_only: false,
    escalation: 'Asegurar punto de anclaje y EPP antes de continuar.',
  },
  chemical_burn: {
    default_severity: 'medium',
    client_warning_required: false,
    professional_only: false,
    escalation: 'Usar EPP químico apropiado. Mantener al cliente alejado del área.',
  },
  collapse: {
    default_severity: 'high',
    client_warning_required: true,
    professional_only: true,
    escalation: 'Suspender intervención. Requiere evaluación estructural antes de continuar.',
  },
  other: {
    default_severity: 'low',
    client_warning_required: false,
    professional_only: false,
    escalation: 'Documentar y proceder con criterio profesional.',
  },
};

const PROXIMITY_MULTIPLIER: Record<string, number> = {
  none: 0,
  low: 0.5,
  medium: 1,
  high: 1.5,
};

export interface ClassifyArgs {
  hazard: HazardKind;
  evidence: string;                                        // what was observed
  proximity_to_combustible?: 'none' | 'low' | 'medium' | 'high';
  client_present?: boolean;
  context?: string;                                        // free-text from navigator
}

export function classify(
  args: ClassifyArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const profile = PROFILES[args.hazard] ?? PROFILES.other;
  const proximity = args.proximity_to_combustible ?? 'none';
  const proximityMultiplier = PROXIMITY_MULTIPLIER[proximity];

  // Escalate one tier if proximity is high and base severity is medium.
  let severity = profile.default_severity;
  if (severity === 'medium' && proximityMultiplier >= 1.5) {
    severity = 'high';
  }

  const requiresImmediate = severity === 'high' || profile.professional_only;

  return {
    verdict: severity === 'high' ? 'fail' : severity === 'medium' ? 'warn' : 'info',
    reason: `${args.hazard.replace('_', ' ')} (${args.evidence}); proximidad combustible: ${proximity}.`,
    ref: 'safety.classify (skillos_mini cartridge-v2)',
    severity,
    required: {
      escalation: profile.escalation,
      professional_only: profile.professional_only,
      client_warning_required: profile.client_warning_required,
      requires_immediate_action: requiresImmediate,
    },
    evidence: args.evidence,
  };
}

export interface CombineHazardsArgs {
  hazards: Array<{
    kind: HazardKind;
    severity: 'low' | 'medium' | 'high';
    evidence: string;
  }>;
}

export function combineHazards(
  args: CombineHazardsArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  if (args.hazards.length === 0) {
    return {
      verdict: 'info',
      reason: 'Sin peligros documentados.',
      ref: 'safety.combineHazards',
    };
  }

  const sevRank = { low: 1, medium: 2, high: 3 };
  const sorted = [...args.hazards].sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
  const top = sorted[0];

  const aggregateSeverity =
    sorted.filter(h => h.severity === 'high').length >= 2 ? 'high' :
    top.severity;

  const summary = sorted
    .map(h => `${h.kind}(${h.severity}): ${h.evidence}`)
    .join('; ');

  return {
    verdict: aggregateSeverity === 'high' ? 'fail' : aggregateSeverity === 'medium' ? 'warn' : 'info',
    reason: summary,
    ref: 'safety.combineHazards',
    severity: aggregateSeverity,
  };
}
