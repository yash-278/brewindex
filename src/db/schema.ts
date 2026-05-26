import { SQL, sql } from 'drizzle-orm';
import {
  customType, index, pgTable, text, integer, boolean, timestamp, serial,
} from 'drizzle-orm/pg-core';

// Custom tsvector type — declared before casks table (customType must be hoisted)
const tsVector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

export const casks = pgTable(
  'casks',
  {
    id:               serial('id').primaryKey(),
    token:            text('token').notNull().unique(),
    name:             text('name').notNull(),
    description:      text('description'),
    version:          text('version'),
    homepage:         text('homepage'),
    icon_url:         text('icon_url'),
    icon_is_fallback: boolean('icon_is_fallback').notNull().default(false),
    install_30d:      integer('install_30d'),
    install_90d:      integer('install_90d'),
    install_365d:     integer('install_365d'),
    category:         text('category'),
    github_stars:     integer('github_stars'),
    github_forks:     integer('github_forks'),
    github_issues:    integer('github_issues'),
    github_enriched:  boolean('github_enriched').notNull().default(false),
    is_active:        boolean('is_active').notNull().default(true),
    last_synced_at:   timestamp('last_synced_at').notNull().defaultNow(),
    search_vector:    tsVector('search_vector').generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${casks.name}, '') || ' ' || coalesce(${casks.description}, ''))`
    ),
  },
  (t) => [
    index('idx_casks_search_vector').using('gin', t.search_vector),
  ]
);

export type CaskInsertRow = typeof casks.$inferInsert;
export type CaskSelectRow = typeof casks.$inferSelect;
