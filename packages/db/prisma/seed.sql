INSERT INTO "users" (
  "id",
  "email",
  "username",
  "display_name",
  "role",
  "is_public"
)
VALUES (
  :'ADMIN_ID',
  :'ADMIN_EMAIL',
  :'ADMIN_USERNAME',
  :'ADMIN_DISPLAY_NAME',
  'admin',
  false
)
ON CONFLICT ("email") DO UPDATE
SET
  "username" = EXCLUDED."username",
  "display_name" = EXCLUDED."display_name",
  "role" = 'admin',
  "is_public" = false;
