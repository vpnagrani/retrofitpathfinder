import { z } from 'zod';
import {BER_RATINGS} from './ber-potential.js';
const status=z.enum(['yes','no','unknown']);
export const berBaselineSchema=z.object({
  source:z.enum(['certificate','primary-energy']),rating:z.enum(BER_RATINGS),
  issuedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d,'Enter a real calendar date.'),
  primaryEnergy:z.number().min(0).max(2000).nullable(),confirmed:z.boolean(),unchanged:z.boolean(),
  fingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional()
});
export const profileSchema=z.object({
  name:z.string().trim().min(1).max(80), county:z.string().trim().min(1).max(40), type:z.enum(['semi','detached','terrace','apartment']),
  year:z.number().int().min(1700).max(new Date().getFullYear()), occupiedYear:z.number().int().min(1700).max(new Date().getFullYear()), area:z.number().min(25).max(600),
  ber:z.enum(BER_RATINGS),berBaseline:berBaselineSchema.nullable().default(null),
  heating:z.enum(['gas','oil','solid','storage','heatpump','other']), walls:z.enum(['cavity','solid','unknown']), attic:z.enum(['none','partial','good','unknown']),
  damp:status, ventilation:z.enum(['assessed','unknown']), budget:z.number().min(0).max(500000), goal:z.enum(['comfort','balanced','complete']),
  applicantType:z.enum(['unknown','private','ahb','tenant']).default('unknown'),ahbRegistered:status.default('unknown'),
  priorGrants:z.enum(['none','yes','unknown']), ownership:z.enum(['owner','other']), mprn:status, traditional:status,
  ownerOccupier:status.default('unknown'), qualifyingPayment:z.enum(['unknown','none','fuel','jobseeker','working-family','one-parent','domiciliary','carer','disability']).default('unknown'), paymentConditions:status.default('unknown'), managementConsent:status.default('unknown'), roofAccess:status.default('unknown'), roofHeatLoss:status.default('unknown'), berRecordId:z.enum(['','DEMO-SEMI','DEMO-COTTAGE','DEMO-APARTMENT']).default(''),
  consent:z.boolean().default(false), evidence:z.array(z.enum(['ber','heat-loss','ventilation','roof','wall-survey'])).max(5).default([]), synthetic:z.boolean().default(false)
}).refine(p=>p.occupiedYear>=p.year,{message:'First occupation cannot be before the construction year.'});
export const scenarioSchema=z.enum(['comfort','balanced','complete']);
export const roleSchema=z.enum(['homeowner','adviser','admin']);
