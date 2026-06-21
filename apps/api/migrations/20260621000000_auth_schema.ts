import { type Kysely, sql } from 'kysely';

// Auth tables (better-auth core + admin + organization plugins), kept separate from the game schema. These
// statements reproduce the better-auth CLI `generate` output for the pinned better-auth version verbatim,
// so the schema applies through the existing boot migrator while staying deterministic and offline. The
// quoted camelCase identifiers and `text` id columns are better-auth's own conventions — do not snake_case
// them, or its adapter queries will miss the columns.
export const up = async (db: Kysely<any>): Promise<void> => {
  await sql`create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "role" text, "banned" boolean, "banReason" text, "banExpires" timestamptz)`.execute(
    db,
  );

  await sql`create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "impersonatedBy" text, "activeOrganizationId" text)`.execute(
    db,
  );

  await sql`create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null)`.execute(
    db,
  );

  await sql`create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null)`.execute(
    db,
  );

  await sql`create table "organization" ("id" text not null primary key, "name" text not null, "slug" text not null unique, "logo" text, "createdAt" timestamptz not null, "metadata" text)`.execute(
    db,
  );

  await sql`create table "member" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "userId" text not null references "user" ("id") on delete cascade, "role" text not null, "createdAt" timestamptz not null)`.execute(
    db,
  );

  await sql`create table "invitation" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "email" text not null, "role" text, "status" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "inviterId" text not null references "user" ("id") on delete cascade)`.execute(
    db,
  );

  await sql`create index "session_userId_idx" on "session" ("userId")`.execute(db);
  await sql`create index "account_userId_idx" on "account" ("userId")`.execute(db);
  await sql`create index "verification_identifier_idx" on "verification" ("identifier")`.execute(db);
  await sql`create unique index "organization_slug_uidx" on "organization" ("slug")`.execute(db);
  await sql`create index "member_organizationId_idx" on "member" ("organizationId")`.execute(db);
  await sql`create index "member_userId_idx" on "member" ("userId")`.execute(db);
  await sql`create index "invitation_organizationId_idx" on "invitation" ("organizationId")`.execute(db);
  await sql`create index "invitation_email_idx" on "invitation" ("email")`.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
  for (const table of ['invitation', 'member', 'organization', 'verification', 'account', 'session', 'user']) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
};
