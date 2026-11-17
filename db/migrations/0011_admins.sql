-- Wat: inloggen in het beheerpaneel (D-07, eigenaar 2026-10-19): beheerders
-- met een vaste rol, wachtwoord (scrypt) en tweede factor (TOTP, het geheim
-- versleuteld met ADMIN_TOTP_KEY), herstelcodes (alleen als hash), sessies in
-- de database (alleen de hash van de sleutel in de cookie) en uitnodigingen
-- met een verlopende, eenmalige sleutel (alleen als hash). De eerste
-- beheerder komt uit de opzetpagina; die sluit zichzelf doordat admin_setup
-- maar één rij kan hebben (.claude/rules/beveiliging.md § Authenticatie).
-- rollback: DROP TABLE admin_invites, admin_recovery_codes, admin_sessions,
-- admin_setup, admins; (leeg bij uitrol: er is nog geen beheerder)

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- In kleine letters, zoals ingetypt bij de uitnodiging (docs/PRIVACY.md).
  email VARCHAR(254) NOT NULL,
  name VARCHAR(80) NOT NULL,
  -- 'eigenaar', 'boekhouder' of 'marketing' (src/lib/admin/permissions.ts).
  role VARCHAR(20) NOT NULL,
  -- Leeg tot de uitnodiging is aangenomen.
  password_hash VARCHAR(200) NULL,
  totp_secret_enc VARCHAR(200) NULL,
  -- Het laatst gebruikte tijdvak van 30 s: een code werkt één keer (geen replay).
  totp_last_step BIGINT NULL,
  activated_at DATETIME(3) NULL,
  disabled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  created_by VARCHAR(60) NOT NULL,
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eén rij, nooit meer: zodra de eerste beheerder er is, kan de opzetpagina niets meer.
CREATE TABLE IF NOT EXISTS admin_setup (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  done_at DATETIME(3) NOT NULL,
  CONSTRAINT ck_admin_setup_one CHECK (id = 1),
  CONSTRAINT fk_admin_setup_admin FOREIGN KEY (admin_id) REFERENCES admins (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inactief na 30 minuten, altijd voorbij na 12 uur (D-07); opgeruimd door de geplande taak.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id_hash CHAR(64) NOT NULL PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY ix_admin (admin_id),
  KEY ix_expires (expires_at),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  admin_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME(3) NULL,
  PRIMARY KEY (admin_id, code_hash),
  CONSTRAINT fk_admin_recovery_admin FOREIGN KEY (admin_id) REFERENCES admins (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- De sleutel in de uitnodigingsmail; gemaakt bij het versturen, nooit als tekst bewaard.
CREATE TABLE IF NOT EXISTS admin_invites (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  KEY ix_admin (admin_id),
  CONSTRAINT fk_admin_invites_admin FOREIGN KEY (admin_id) REFERENCES admins (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
