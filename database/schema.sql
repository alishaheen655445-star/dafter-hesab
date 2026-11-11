-- ===========================================================================
--  daftar-hesab-app — MySQL schema
--  Personal ledger: parties, transactions, checks, loans, reminders, backups.
--
--  Conventions:
--    * utf8mb4 everywhere (Arabic + Persian + emoji safe).
--    * Money stored as BIGINT minor units (integer cents). NEVER float.
--    * Soft delete via `deleted_at` on user-facing tables.
--    * All FKs use InnoDB with proper ON DELETE behaviour.
--    * Timestamps in UTC; the frontend formats per user locale + calendar.
-- ===========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
--  users — one row per phone number. The account owner.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  phone           VARCHAR(20)      NOT NULL,
  password_hash   VARCHAR(255)     NOT NULL,
  name            VARCHAR(100)     NOT NULL,
  currency        VARCHAR(16)      NOT NULL DEFAULT 'toman',   -- toman|rial|dinar|dollar|dirham|euro|afghani
  lang            VARCHAR(5)       NOT NULL DEFAULT 'fa',      -- fa|ar
  footer_text     VARCHAR(500)     DEFAULT NULL,               -- appended to reports/messages
  pin_hash        VARCHAR(255)     DEFAULT NULL,               -- bcrypt of the optional app-lock PIN; NULL = no lock
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP        NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  parties — طرف حساب. The people/businesses the user tracks debts with.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS parties;
CREATE TABLE parties (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED     NOT NULL,
  name            VARCHAR(100)     NOT NULL,
  phone           VARCHAR(20)      DEFAULT NULL,
  avatar_url      VARCHAR(255)     DEFAULT NULL,
  note            TEXT             DEFAULT NULL,               -- short description / first note
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP        NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_parties_user (user_id, deleted_at),
  KEY idx_parties_name (name),
  CONSTRAINT fk_parties_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  party_bank_info — one row per party (card number, IBAN, etc.)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS party_bank_info;
CREATE TABLE party_bank_info (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  party_id        INT UNSIGNED     NOT NULL,
  bank_name       VARCHAR(100)     DEFAULT NULL,
  card_number     VARCHAR(25)      DEFAULT NULL,
  account_number  VARCHAR(35)      DEFAULT NULL,
  iban            VARCHAR(34)      DEFAULT NULL,
  branch          VARCHAR(50)      DEFAULT NULL,
  account_holder  VARCHAR(100)     DEFAULT NULL,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_party (party_id),
  CONSTRAINT fk_bank_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  party_notes — multiple notes per party (the reference app supports this).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS party_notes;
CREATE TABLE party_notes (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  party_id        INT UNSIGNED     NOT NULL,
  note            TEXT             NOT NULL,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_party (party_id),
  CONSTRAINT fk_notes_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  transactions — credit (they owe me / طلب) or debit (I owe them / بدهی).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  party_id        INT UNSIGNED     NOT NULL,
  user_id         INT UNSIGNED     NOT NULL,
  type            ENUM('credit','debit') NOT NULL,
  amount_minor    BIGINT           NOT NULL,                   -- integer cents
  description     VARCHAR(500)     DEFAULT NULL,
  image_url       VARCHAR(255)     DEFAULT NULL,               -- /uploads/...
  txn_date        DATE             NOT NULL,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP        NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_txn_party_date (party_id, txn_date, deleted_at),
  KEY idx_txn_user (user_id, deleted_at),
  CONSTRAINT fk_txn_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  CONSTRAINT fk_txn_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  checks — صك / چك. issued = I wrote it, received = someone gave it to me.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS checks;
CREATE TABLE checks (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED     NOT NULL,
  party_id        INT UNSIGNED     DEFAULT NULL,
  type            ENUM('issued','received') NOT NULL,
  check_number    VARCHAR(50)      DEFAULT NULL,
  bank_name       VARCHAR(100)     DEFAULT NULL,
  branch_name     VARCHAR(100)     DEFAULT NULL,
  amount_minor    BIGINT           NOT NULL,
  due_date        DATE             NOT NULL,
  status          ENUM('pending','cashed','bounced','cancelled') NOT NULL DEFAULT 'pending',
  image_url       VARCHAR(255)     DEFAULT NULL,
  note            TEXT             DEFAULT NULL,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP        NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_checks_user (user_id, deleted_at),
  KEY idx_checks_due (due_date, status),
  CONSTRAINT fk_checks_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_checks_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  loans — قرض / وام with monthly installments.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS loans;
CREATE TABLE loans (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED  NOT NULL,
  party_id              INT UNSIGNED  DEFAULT NULL,
  type                  ENUM('received','given') NOT NULL,
  principal_minor       BIGINT        NOT NULL,
  monthly_payment_minor BIGINT        DEFAULT NULL,
  total_installments    INT           DEFAULT NULL,
  paid_installments     INT           NOT NULL DEFAULT 0,
  start_date            DATE          NOT NULL,
  status                ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  note                  TEXT          DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            TIMESTAMP     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_loans_user (user_id, deleted_at),
  CONSTRAINT fk_loans_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_loans_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  loan_installments — one row per scheduled payment.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS loan_installments;
CREATE TABLE loan_installments (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  loan_id             INT UNSIGNED  NOT NULL,
  installment_number  INT           NOT NULL,
  due_date            DATE          NOT NULL,
  amount_minor        BIGINT        NOT NULL,
  paid                TINYINT(1)    NOT NULL DEFAULT 0,
  paid_date           DATE          DEFAULT NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_installment (loan_id, installment_number),
  KEY idx_installments_due (due_date, paid),
  CONSTRAINT fk_installments_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  reminders — date/time notifications tied to a party (or general).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS reminders;
CREATE TABLE reminders (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED     NOT NULL,
  party_id        INT UNSIGNED     DEFAULT NULL,
  title           VARCHAR(200)     NOT NULL,
  message         TEXT             DEFAULT NULL,
  remind_at       DATETIME         NOT NULL,
  sent            TINYINT(1)       NOT NULL DEFAULT 0,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reminders_user (user_id, sent, remind_at),
  CONSTRAINT fk_reminders_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_reminders_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  backups — online backup files stored on the server, keyed by phone.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS backups;
CREATE TABLE backups (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED     NOT NULL,
  file_path       VARCHAR(500)     NOT NULL,
  size_bytes      INT UNSIGNED     NOT NULL,
  kind            ENUM('auto','manual') NOT NULL DEFAULT 'manual', -- who asked for this copy
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backups_user (user_id, created_at),
  CONSTRAINT fk_backups_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
