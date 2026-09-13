import {routeBreakdown} from './route-costs.js';
// Manually transcribed from SEAI's 2025 completed-project datasets; checked 2026-09-10.
// Historical grant columns are deliberately NOT used as current grant rules.
export const COST_DATE='2026-09-10';
export const individualCostSource='https://www.seai.ie/sites/default/files/publications/Median-costs-of-individual-energy-upgrades.pdf';
export const ossCostSource='https://www.seai.ie/sites/default/files/grants/home-energy-grants/one-stop-shop/SEAI-OSS-Median-Costs-and-Grants.pdf';
const types=['detached','semi','terrace','apartment'];
const row=values=>Object.fromEntries(types.map((t,i)=>[t,values[i]]));
export const medians={attic:row([2519,2000,2000,1894]),cavity:row([2250,1550,1100,950]),external:row([24980,23247,14244,17450]),internal:row([9000,10420,6303,3640]),heat:row([16500,16832,15000,10067]),solar:row([10730,9400,8750,7100]),controls:row([3500,3500,3054,4646]),ber:row([280,276,276,250])};
export const ossMedians=Object.fromEntries(types.map((t,i)=>[t,{works:[69795,60805,55250,30345][i],grant:[24500,21700,18813,11300][i],homeowner:[45067,38932,37266,20235][i]}]));
export function applyMedianCosts(p,steps){
  for(const s of steps){
    const key=s.id==='walls'?(p.walls==='cavity'?'cavity':p.walls==='solid'&&p.traditional==='no'?'external':null):s.id;
    const value=key&&!(key==='heat'&&p.heating==='heatpump')?medians[key]?.[p.type]:null;
    if(value){s.median=value;s.cost=[value,value];s.costSource=individualCostSource;s.costBasis='SEAI 2025 individual-measure median; historical benchmark, not a quotation';
      if(key==='solar')s.costBasis+='; dataset includes varying system sizes, while the grant example assumes 4 kWp';
      if(key==='external'&&p.type==='apartment')s.costBasis+='; only six apartment applications';
    }else {s.cost=[null,null];s.support=0;s.costBasis='Quote required — no matching SEAI median is available. Not included in the priced subtotal.';}
    // The historical heat-pump median does not separately price a central-heating upgrade.
    if(s.id==='heat'&&s.support)s.support=p.type==='apartment'?4500:6500;
    s.homeownerIfApproved=s.cost.map(n=>n===null?null:Math.max(0,n-s.support));
  }
}
export function fundingRoutes(p,plan){
  const payment=p.qualifyingPayment||'unknown';
  const needsChild=['jobseeker','disability'].includes(payment);
  const paymentEligible=['fuel','working-family','one-parent','domiciliary'].includes(payment)||(needsChild&&p.paymentConditions==='yes')||(payment==='carer'&&p.paymentConditions==='yes');
  const excluded=['ahb','tenant'].includes(p.applicantType)||p.ownership!=='owner'||p.ownerOccupier==='no'||p.year>=2006||p.occupiedYear>=2006||payment==='none'||((needsChild||payment==='carer')&&p.paymentConditions==='no');
  const eligible=!excluded&&p.ownerOccupier==='yes'&&paymentEligible&&p.priorGrants==='none'&&(p.type!=='apartment'||p.managementConsent==='yes');
  return {
    breakdowns:{beh:routeBreakdown(p,plan.steps,'beh',plan.grantSourcesFresh),oss:routeBreakdown(p,plan.steps,'oss',plan.grantSourcesFresh)},
    assessment:{label:'Home Energy Assessment through a registered One Stop Shop',cost:null,support:plan.grantSourcesFresh?350:null,source:'https://www.seai.ie/grants/home-energy-grants/one-stop-shop/home-energy-assessments',checkedAt:'2026-09-11',conditions:'Conditional grant, claimable once per property. The registered OSS must confirm eligibility and previous HEA support. The OSS deducts the approved grant upfront; you pay the quoted assessment fee less the approved grant. You can receive the assessment grant even if you do not proceed with upgrades. Do not add this grant to the upgrade subtotal or deduct it twice from an OSS package.',example:'SEAI example only, not a median: €600 assessment less €350 grant = €250 homeowner payment.'},
    individual:{label:'Individual Energy Upgrades',upfront:plan.total,afterGrant:plan.total.map((n,i)=>plan.steps.reduce((sum,s)=>sum+Math.max(0,s.cost[i]-s.support),plan.contingency[i])),timing:'Apply and receive approval before works. Normally pay the contractor, then claim after completion, required paperwork and BER. SEAI advises allowing 4–6 weeks to process an attic grant claim; inspections or rework can delay payment. An OSS managing an individual grant can deduct it upfront — confirm your contract arrangement.'},
    oss:{label:'One Stop Shop',benchmark:ossMedians[p.type],source:ossCostSource,status:p.year>=2011||p.occupiedYear>=2011||p.ownership!=='owner'?'Outside modelled eligibility':'Assessment required',timing:'The OSS applies for grants and deducts approved grants upfront. You pay the agreed balance in the contract payment stages.',conditions:'Built and occupied before 2011; minimum post-works BER B, plus an installed heat pump or primary-energy improvement of 100 kWh/m²/year. OSS must confirm prior grants, energy credits, permissions and scope. These are whole-project historical medians, not a price for your selected measures.'},
    funded:{label:'Fully Funded Energy Upgrades',status:excluded?'Outside modelled eligibility':eligible?'Potentially eligible — SEAI approval required':'More eligibility evidence needed',timing:'If accepted, SEAI pays for the works its survey selects. Homeowner contribution for that approved scope: €0. This is not a cash grant or a promise to fund this proposed pathway.',conditions:'Own and occupy the home; built and occupied before 2006; qualifying payment and any additional conditions; suitable survey-selected works. SEAI verifies payment eligibility. Previous upgrades and apartment permissions need review. Private extras and excluded works are not covered.',source:'https://www.seai.ie/grants/home-energy-grants/fully-funded-upgrades-for-certain-homeowners'},
  };
}
