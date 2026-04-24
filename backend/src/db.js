import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "product_rating",
  user: process.env.DB_USER || "app_user",
  password: process.env.DB_PASSWORD || "app_password",
});
