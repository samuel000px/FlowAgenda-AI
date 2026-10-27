import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), manager: text("manager").notNull(), client: text("client").notNull(),
  state: text("state").notNull(), version: integer("version").notNull().default(0),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
});
export const limits = sqliteTable("limits", { id: text("id").primaryKey(), used: integer("used").notNull().default(0) });

export const calendarConnections = sqliteTable('calendar_connections', {
  room: text('room').primaryKey(),
  tokens: text('tokens').notNull(),
  calendar: text('calendar').notNull(),
  day: text('day').notNull(),
  entries: text('entries').notNull().default('{}'),
  synced: integer('synced').notNull().default(0),
  error: text('error').notNull().default(''),
  retry: integer('retry').notNull().default(0),
  lock: text('lock').notNull().default(''),
  lease: integer('lease').notNull().default(0),
});
export const calendarOAuth = sqliteTable('calendar_oauth', {
  state: text('state').primaryKey(),
  room: text('room').notNull(),
  verifier: text('verifier').notNull(),
  day: text('day').notNull(),
  expires: integer('expires').notNull(),
});
