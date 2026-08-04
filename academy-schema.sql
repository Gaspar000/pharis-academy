-- Pharis Academy — tablas nuevas para pharis-api / PostgreSQL (Railway)
-- Ejecutar una sola vez contra la base de datos de Railway. También se
-- aplica automáticamente si corres `npm run migrate` en pharis-api, ya que
-- estas mismas sentencias están agregadas a src/db/migrate.js (migraciones
-- 038 y 039). Es seguro correr esto más de una vez — todo usa IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS academy_users (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante','profesor')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_users_email ON academy_users(email);

CREATE TABLE IF NOT EXISTS academy_submissions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES academy_users(id) ON DELETE CASCADE,
  curso            TEXT NOT NULL,
  archivo_url      TEXT NOT NULL,
  archivo_nombre   TEXT,
  calificacion     TEXT CHECK (calificacion IN ('Completado','Necesita mejoras','Incompleto')),
  feedback_claude  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_submissions_user  ON academy_submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_submissions_curso ON academy_submissions(curso);

-- Códigos de invitación — el registro es privado, no hay auto-registro
-- libre. El rol real del usuario lo fija el código (no el body del
-- cliente), y cada código es de un solo uso.
CREATE TABLE IF NOT EXISTS academy_invite_codes (
  id                SERIAL PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  destinatario      TEXT NOT NULL,
  rol               TEXT NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante','profesor')),
  used_at           TIMESTAMPTZ,
  used_by_user_id   INTEGER REFERENCES academy_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_invite_codes_code ON academy_invite_codes(code);
