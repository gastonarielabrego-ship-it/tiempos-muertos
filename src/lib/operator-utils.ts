/**
 * Operator classification utilities.
 *
 * Rule: numeric part of codUti > 13040 → eventual (temporary)
 *       numeric part of codUti ≤ 13040 → efectivo (permanent)
 *       (e.g. P13040 → efectivo, P13041 → eventual, P9999 → efectivo)
 *
 * Descanso (break time):
 *   - TN turno: 0 min (no break)
 *   - TM turno + eventual: 60 min
 *   - TM turno + efectivo: 35 min
 *   - TT turno: 35 min (both types)
 */

type Turno = 'TM' | 'TT' | 'TN';

const EVENTUAL_THRESHOLD = 13040;

/** Extracts the numeric part from a codUti like "P13040". Returns 0 if parsing fails. */
function codUtiToNumber(codUti: string): number {
  const num = parseInt(codUti.replace(/^P/i, ''), 10);
  return isNaN(num) ? 0 : num;
}

/** Returns true if the operator is "eventual" (temporary) based on codUti.
 *  P13040 and below → efectivo (false)
 *  Above P13040     → eventual (true)
 */
export function isEventual(codUti: string): boolean {
  return codUtiToNumber(codUti) > EVENTUAL_THRESHOLD;
}

/** Returns the operator type label. */
export function getTipoOperador(codUti: string): 'efectivo' | 'eventual' {
  return isEventual(codUti) ? 'eventual' : 'efectivo';
}

/** Returns descanso in minutes for the given operator and turno. */
export function getDescansoMin(codUti: string, turno: Turno): number {
  if (turno === 'TN') return 0;
  if (turno === 'TM') return isEventual(codUti) ? 60 : 35;
  return 35; // TT: 35 min for both types
}

/** Returns descanso in seconds for the given operator and turno. */
export function getDescansoSec(codUti: string, turno: Turno): number {
  return getDescansoMin(codUti, turno) * 60;
}
