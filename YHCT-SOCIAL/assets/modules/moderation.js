const claimPatterns=[
  {re:/chữa\s*khỏi|điều\s*trị\s*dứt\s*điểm|100\s*%/i,reason:'absolute_medical_claim'},
  {re:/bỏ\s*(thuốc|điều trị)|ngừng\s*(thuốc|điều trị)/i,reason:'treatment_discontinuation'},
  {re:/ung\s*thư|đột\s*quỵ|nhồi\s*máu|suy\s*thận/i,reason:'high_stakes_condition'}
];
export function assessContentRisk(text=''){
  const reasons=claimPatterns.filter(x=>x.re.test(text)).map(x=>x.reason);
  const level=reasons.includes('treatment_discontinuation')||reasons.length>=2?'high':reasons.length?'medium':'low';
  return {level,reasons,action:level==='high'?'review':level==='medium'?'label':'allow'};
}
