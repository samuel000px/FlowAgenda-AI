// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), manager: text("manager").notNull(), client: text("client").notNull(),
  state: text("state").notNull(), version: integer("version").notNull().default(0),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
});
export const limits = sqliteTable("limits", { id: text("id").primaryKey(), used: integer("used").notNull().default(0) });
