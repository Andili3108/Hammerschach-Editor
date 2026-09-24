const COURSES = {"grundkurs": ["wE71uYXYLvE", "HxzkZOkhs_E", "2fO1UxPT2f8", "xGizNrzuKgI", "oTJ5okzKnko", "1lOiszeUT88", "yfMuZqqsY5M", "a3-tNT9iBD8", "pNV6QOGf50E", "27wdfkClmkE"], "einsteiger": ["dvO_M1PUdoM", "JBa5ECV0iY0", "ZA_RDSlawyc", "ikPMgepDtIM", "M3jbCwV8-XI", "InIVLCwCAaQ", "kgXXP2RQIjY", "Vkqo-0RH6-c", "uZ-00Wf-XIY", "57KsaFdm6sw", "JMDoHvr7x4Y", "3FWrKEv6Cz4", "u6_J0ZYGf_A", "oJZHYV7wsSk", "uI_fFumydlQ", "_CNQh0eo0g4", "QKEDpBCcxU0", "4RP7AeKK2Zk", "fB1A67EJm5s", "6k3zujrOK4Q", "ZSgsyFl1_xM"], "fortgeschrittene": ["cymud_gPKIA", "frCJ8eg5ZAw", "cnNi4vNjRhw", "dBuN5gavugo", "kh7KSCkDop4", "4JEbekR-O1Q", "PQzbTI5y4lg", "DmKwUR9YbpE", "3p4F-8hAOSU", "Am3clskOc-k", "Jlo8JC7rJ7A", "bAlNPEDE8mE", "psrvjsTXGB8", "J_4duPV7DVs", "ZNuzeU4lPhQ", "iwKSH3nrkJw", "orGohdBzX8I", "DI9Kv182UXc"], "eroeffnungen": ["4qPgG_OTSo0", "8hzuMb5jgOQ", "xMg3CzpbIwY", "SI8iWxzzgRA", "trVvvokT4hg", "DmTa7MikV00", "YPt8BLgKr0o", "dEpknUxnb_8", "G-u2h-lZ3Wk", "wtN90Y9h8i4", "SCwh4-sORu8", "PMrqDK-H6G4", "fMtlkUppwgY", "JC9-6fQAv_0", "NfeHgC5liBg", "PyoW7Axntg4", "ev44-_xwKtQ", "Jh3tAQcC57E", "mLoI6lxHwhI", "QVX9V9GarJs", "uXioB9_YK6w", "csrcK8G8rFc", "1MrPar7TmQc", "jqbHL_Cp1RM", "WxyNRt3Is8k", "MQHkSyR_5rs", "qllQadkrR5Y", "Iiknu8oB8hA", "adP_5UGb5gQ", "mqPfMrf5N9I", "csnYX8CTgj4", "Cp7inDMn9LU", "ie9xbSbl-c8"], "mittelspiel": ["uokObdo2x1I", "zjmjH3-Mdiw", "YVhr4lcJPSo", "OhH776gy5RI", "JUVUcDtOFf8", "gfr6GbIeRi0", "fjUM2grUuqU"], "endspiel": ["_85ZE9QAdf0", "YoIDBWA4aKQ", "eG2GCd8jDSA", "50aAg1gynH0", "eC538D1vaHE", "FvRDTCV9jUI", "1ddhiFFk-Zw"]};
const IDS = new Set(Object.values(COURSES).flat());
export function cleanProgress(raw){
  const state={version:2,completed:[],current:{},lastCourse:'grundkurs'};
  if(!raw||typeof raw!=='object')return state;
  state.completed=Array.isArray(raw.completed)?[...new Set(raw.completed.filter(id=>IDS.has(id)))]:[];
  for(const [course,ids] of Object.entries(COURSES)){
    if(raw.current&&ids.includes(raw.current[course]))state.current[course]=raw.current[course];
  }
  if(Object.prototype.hasOwnProperty.call(COURSES,raw.lastCourse))state.lastCourse=raw.lastCourse;
  return state;
}
async function ensureTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS videocourse_progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
}
export async function getProgress(env,userId){
  await ensureTable(env);
  const row=await env.DB.prepare('SELECT revision, state_json FROM videocourse_progress WHERE user_id = ?').bind(userId).first();
  return {revision:row?Number(row.revision):0,state:cleanProgress(row?JSON.parse(row.state_json):null)};
}
export async function saveProgress(env,userId,body){
  if(!body||!Number.isSafeInteger(body.revision)||body.revision<0||!body.state||typeof body.state!=='object')throw new Error('INVALID_PROGRESS');
  await ensureTable(env);
  await env.DB.prepare('INSERT OR IGNORE INTO videocourse_progress (user_id,revision,state_json,updated_at) VALUES (?,0,?,?)')
    .bind(userId,JSON.stringify(cleanProgress(null)),new Date().toISOString()).run();
  // Optimistic locking: concurrent devices must merge against the current revision.
  const result=await env.DB.prepare('UPDATE videocourse_progress SET state_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?')
    .bind(JSON.stringify(cleanProgress(body.state)),new Date().toISOString(),userId,body.revision).run();
  return {...await getProgress(env,userId),conflict:Number(result.meta&&result.meta.changes)!==1};
}
export async function deleteProgress(env,userId){
  await ensureTable(env);
  await env.DB.prepare('DELETE FROM videocourse_progress WHERE user_id = ?').bind(userId).run();
}
