import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), manager: text("manager").notNull(), client: text("client").notNull(),
  state: text("state").notNull(), version: integer("version").notNull().default(0),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
});
export const limits = sqliteTable("limits", { id: text("id").primaryKey(), used: integer("used").notNull().default(0) });
export const whatsappConnections = sqliteTable('whatsapp_connections', {
  room:text('room').primaryKey(),phoneId:text('phone_id').notNull().unique(),secrets:text('secrets').notNull(),settings:text('settings').notNull(),
  verified:integer('verified').notNull().default(0),webhookVerified:integer('webhook_verified').notNull().default(0),received:integer('received').notNull().default(0),created:integer('created').notNull(),
});
