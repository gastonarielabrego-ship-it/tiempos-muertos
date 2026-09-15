/**
 * Operator classification utilities.
 *
 * Rule: codUti >= 'P13040' → eventual (temporary)
 *       codUti <  'P13040' → efectivo (permanent)
 *
 * Descanso (break time):
 *   - TN turno: 0 min (no break)
 *   - TM turno + eventual: 60 min
 *   - TM turno + efectivo: 35 min
 *   - TT turno: 35 min (both types)
 */

type Turno = 'TM' | 'TT' | 'TN';

/** Returns true if the operator is "eventual" (temporary) based on codUti. */
export function isEventual(codUti: string): boolean {
  return codUti >= 'P13040';
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
