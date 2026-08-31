import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
const pool = new pg.Pool({ connectionString: url });
try { await pool.query(sql); console.log("Database schema applied"); } finally { await pool.end(); }
