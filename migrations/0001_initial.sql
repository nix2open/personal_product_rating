-- Users (email primary identity; google_sub optional)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users(email);

-- Magic link one-time tokens
CREATE TABLE magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_magic_expires ON magic_link_tokens(expires_at);

-- Global product catalog (Open Food Facts + manual)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  barcode TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  image_url TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode != '';
CREATE INDEX idx_products_name ON products(name);

-- Per-user rating for a catalog product
CREATE TABLE user_ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  overall INTEGER NOT NULL,
  price INTEGER,
  quality INTEGER,
  comment TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CHECK (overall >= 0 AND overall <= 10),
  CHECK (price IS NULL OR (price >= 0 AND price <= 10)),
  CHECK (quality IS NULL OR (quality >= 0 AND quality <= 10))
);

CREATE INDEX idx_user_ratings_user ON user_ratings(user_id);
CREATE INDEX idx_user_ratings_product ON user_ratings(product_id);

CREATE TABLE user_rating_photos (
  id TEXT PRIMARY KEY,
  rating_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (rating_id) REFERENCES user_ratings(id) ON DELETE CASCADE,
  CHECK (sort_order >= 0 AND sort_order <= 2)
);

CREATE INDEX idx_rating_photos_rating ON user_rating_photos(rating_id);

-- Share: owner invites viewer by email; accepted -> share_access
CREATE TABLE share_invites (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  invitee_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked'))
);

CREATE INDEX idx_share_invites_email ON share_invites(invitee_email);

CREATE TABLE share_access (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  viewer_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_user_id, viewer_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Family group: shared visibility of ratings among members
CREATE TABLE family_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE family_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT,
  invitee_email TEXT COLLATE NOCASE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (role IN ('owner', 'member')),
  CHECK (status IN ('pending', 'active')),
  CHECK (user_id IS NOT NULL OR invitee_email IS NOT NULL)
);

CREATE INDEX idx_family_members_group ON family_members(group_id);
CREATE INDEX idx_family_members_email ON family_members(invitee_email);
