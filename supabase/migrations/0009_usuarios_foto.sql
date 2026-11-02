-- 9: foto de perfil do usuário (data URL redimensionada ~128px, guardada inline).
alter table public.usuarios add column if not exists foto_url text;
