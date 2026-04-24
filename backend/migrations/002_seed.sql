insert into users (email, nickname, password_hash, is_admin)
values
  ('demo@local.dev', 'demo', crypt('DemoPass123!', gen_salt('bf')), true),
  ('friend@local.dev', 'friend', crypt('FriendPass123!', gen_salt('bf')), false)
on conflict (email) do nothing;

insert into products (owner_id, barcode, name, brand, category, rating, taste_rating, quality_rating, price_rating, pros, cons, note_text)
select u.id, '4601111111111', 'Greek Yogurt', 'BioFarm', 'dairy', 9, 9, 8, 7, 'high protein', 'a bit expensive', 'great for breakfast'
from users u
where u.email = 'demo@local.dev'
on conflict (owner_id, barcode) do nothing;

insert into shares (owner_id, grantee_id, role)
select o.id, g.id, 'viewer'
from users o
join users g on g.email = 'friend@local.dev'
where o.email = 'demo@local.dev'
on conflict (owner_id, grantee_id) do nothing;

insert into reward_rules (key, title, description, activity_key, period_days, target_count, points)
values
  ('first_5_rated', 'Starter Critic', 'Rate 5 products total', 'product_rated', 0, 5, 50),
  ('weekly_3_added', 'Weekly Hunter', 'Add 3 products this week', 'product_created', 7, 3, 40)
on conflict (key) do nothing;
