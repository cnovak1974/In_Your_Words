import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const db = new Pool({ connectionString: config.databaseUrl, max: 10 });

export async function healthCheckDb() {
  const result = await db.query("select 1 as ok");
  return result.rows[0]?.ok === 1;
}
