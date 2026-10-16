-- Autoriza a los socios de Zyberna. Ejecutar en el SQL Editor de Supabase
-- (o mediante MCP / CLI con privilegios de administración). NO es una migración:
-- contiene emails reales y se ejecuta una vez.
--
-- 1. Sustituye los emails y nombres.
-- 2. Ejecuta este script.
-- 3. Crea los usuarios en Authentication → Users → "Add user" (o "Invite user").
--    El perfil se crea automáticamente al existir el email en esta lista.
--    Si el usuario ya existía en Auth, el perfil se crea al ejecutar este script.

insert into public.authorized_emails (email, role, full_name) values
  ('socio1@ejemplo.com', 'admin', 'Socio 1'),
  ('socio2@ejemplo.com', 'admin', 'Socio 2')
on conflict (email) do update set role = excluded.role, full_name = excluded.full_name;

-- Revocar el acceso a alguien (sin borrar datos):
-- update public.profiles set is_active = false where email = 'persona@ejemplo.com';
