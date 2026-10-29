import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), manager: text("manager").notNull(), client: text("client").notNull(),
  state: text("state").notNull(), version: integer("version").notNull().default(0),
  created: integer("created").notNull(), updated: integer("updated").notNull(),
});
export const limits = sqliteTable("limits", { id: text("id").primaryKey(), used: integer("used").notNull().default(0) });
// Fotos de perfil da equipe: fora do cadastro (que já é grande) e servidas com cache longo pelo id.
export const fotos = sqliteTable('fotos', {
  id: text('id').primaryKey(), room: text('room').notNull(), staffId: text('staff_id').notNull(),
  tipo: text('tipo').notNull(), data: text('data').notNull(), created: integer('created').notNull(),
});
export const whatsappConnections = sqliteTable('whatsapp_connections', {
  room:text('room').primaryKey(),phoneId:text('phone_id').notNull().unique(),secrets:text('secrets').notNull(),settings:text('settings').notNull(),
  verified:integer('verified').notNull().default(0),webhookVerified:integer('webhook_verified').notNull().default(0),received:integer('received').notNull().default(0),created:integer('created').notNull(),
});
