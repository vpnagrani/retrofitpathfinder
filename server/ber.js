// Synthetic provider adapter. Never accepts or retrieves a real MPRN.
export const berRecords={
  '00000000001':{id:'DEMO-SEMI',rating:'D2',assessmentDate:'2025-06-12',type:'semi',area:115,year:1985,primaryEnergy:278,co2:58,heating:'gas',walls:'cavity',attic:'partial',recommendations:['Inspect cavity suitability','Improve attic insulation with ventilation design','Assess heat loss before heat-pump sizing']},
  '00000000002':{id:'DEMO-COTTAGE',rating:'G',assessmentDate:'2025-04-08',type:'detached',area:85,year:1920,primaryEnergy:480,co2:115,heating:'oil',walls:'solid',attic:'none',recommendations:['Investigate moisture first','Obtain specialist traditional-wall advice','Design ventilation and roof insulation']},
  '00000000003':{id:'DEMO-APARTMENT',rating:'D1',assessmentDate:'2025-08-20',type:'apartment',area:65,year:2002,primaryEnergy:245,co2:52,heating:'storage',walls:'unknown',attic:'unknown',recommendations:['Confirm management-company permissions','Survey shared fabric and heating options','Confirm exposed surfaces before recommending insulation']}
};
export function berEvidence(id){const r=Object.values(berRecords).find(r=>r.id===id);return r?{...r,synthetic:true,provider:'Prototype fixture — not SEAI',notice:'No certificate or advisory report was downloaded. No OCR or live SEAI connection. These synthetic figures do not verify technical suitability.'}:null;}
export function reconcileBerProfile(profile){
  const record=berEvidence(profile.berRecordId);
  if(!record)return profile;
  const facts={type:record.type,area:record.area,year:record.year,ber:record.rating,heating:record.heating,walls:record.walls,attic:record.attic};
  return {...profile,synthetic:true,berRecordId:Object.entries(facts).every(([key,value])=>profile[key]===value)?record.id:''};
}
