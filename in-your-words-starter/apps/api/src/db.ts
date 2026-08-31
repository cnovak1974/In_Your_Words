import crypto from "node:crypto";
import pg from "pg";
import { config, providers } from "./config.js";

type Row = Record<string, any>;
const storytellers = new Map<string, Row>();
const sessions = new Map<string, Row>();
const turns = new Map<string, Row>();

async function mockQuery(sql: string, values: any[] = []) {
  const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
  let rows: Row[] = [];
  if (q === "begin" || q === "commit" || q === "rollback") return { rows, rowCount: 0 };
  if (q.startsWith("select 1")) rows = [{ ok: 1 }];
  else if (q.startsWith("insert into storytellers")) { const row={id:crypto.randomUUID(),display_name:values[0]}; storytellers.set(row.id,row); rows=[row]; }
  else if (q.startsWith("insert into sessions")) { const row={id:crypto.randomUUID(),storyteller_id:values[0],current_question:values[1],status:"active"}; sessions.set(row.id,row); rows=[row]; }
  else if (q.startsWith("insert into turns")) { const row={id:values[0],session_id:values[1],question_text:values[2],raw_audio_key:values[3],audio_content_type:values[4],status:"uploading",created_at:new Date()}; turns.set(row.id,row); }
  else if (q.includes("from turns t join sessions")) { const turn=turns.get(values[0]); if(turn){ const session=sessions.get(turn.session_id)!; rows=[{...turn,current_question:session.current_question,storyteller_id:session.storyteller_id}]; } }
  else if (q.includes("from turns") && q.includes("intent='story_answer'")) rows=[...turns.values()].filter(t=>t.session_id===values[0]&&t.id!==values[1]&&t.intent==="story_answer"&&t.transcript).sort((a,b)=>b.created_at-a.created_at).slice(0,50);
  else if (q.includes("from sessions where id = $1")) { const row=sessions.get(values[0]); if(row && (!q.includes("status = 'active'") || row.status==="active")) rows=[row]; }
  else if (q.startsWith("update turns set status='processing'")) { const row=turns.get(values[0]); if(row) row.status="processing"; }
  else if (q.startsWith("update turns set audio_byte_length=")) { const row=turns.get(values[0]); if(row) Object.assign(row,{audio_byte_length:values[1],audio_stored_content_type:values[2],audio_stored_at:new Date(),status:"processing"}); }
  else if (q.startsWith("update turns set transcript=")) { const row=turns.get(values[0]); if(row) Object.assign(row,{transcript:values[1],intent:values[2],ai_payload:JSON.parse(values[3]),extracted_data:JSON.parse(values[3]).entities,status:"complete",processed_at:new Date()}); }
  else if (q.startsWith("update turns set status='failed'")) { const row=turns.get(values[0]); if(row) Object.assign(row,{status:"failed",error_message:values[1]}); }
  else if (q.startsWith("update sessions set current_question")) { const row=sessions.get(values[0]); if(row) row.current_question=values[1]; }
  return { rows, rowCount: rows.length };
}

const realPool = providers.database === "mock" ? null : new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
export const db: any = realPool ?? { query: mockQuery, connect: async () => ({ query: mockQuery, release() {} }) };
export async function healthCheckDb() { const result=await db.query("select 1 as ok"); return result.rows[0]?.ok===1; }

