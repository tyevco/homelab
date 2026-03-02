import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("api_token", (table) => {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable()
            .references("id").inTable("user").onDelete("CASCADE");
        table.string("name", 255).notNullable();
        table.string("token_hash", 255).notNullable();
        table.string("token_prefix", 16).notNullable();
        table.boolean("active").notNullable().defaultTo(true);
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("api_token");
}
