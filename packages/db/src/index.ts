export const dbPackageName = '@codeorbit/db';

export const prismaSchemaPath = new URL('../prisma/schema.prisma', import.meta.url);
export const prismaMigrationPath = new URL(
  '../prisma/migrations/20261007152600_init/migration.sql',
  import.meta.url,
);
export const prismaSeedScriptPath = new URL('../prisma/seed.mjs', import.meta.url);
