-- Username + password auth (email may be synthetic @pw.internal for these users)
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL AND length(trim(username)) > 0;

-- Share rating via one-time style token (owner generates, viewer imports)
CREATE TABLE share_access_tokens (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_share_access_tokens_owner ON share_access_tokens(owner_user_id);

-- Label the viewer typed when importing ("who shared with me")
ALTER TABLE share_access ADD COLUMN import_label TEXT;
