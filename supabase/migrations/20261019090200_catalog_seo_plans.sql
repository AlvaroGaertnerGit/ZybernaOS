-- =============================================================================
-- Catálogo: tarifas, reglas y prestaciones de la propuesta comercial SEO/GEO
-- (15/10/2026, precios sin IVA). Solo completa servicios sin tarifa configurada;
-- nunca sobrescribe una tarifa fijada por los socios.
-- =============================================================================

-- «SEO local y Google Business Profile» (plantilla inicial sin precio) pasa a ser el plan «SEO Local».
update public.service_catalog
set name = 'SEO Local',
    description = 'Recomendado para iniciar una estrategia local. Incluye SEO Esencial con límites ampliados. Una web, un idioma y una ficha de Google. Sin permanencia.',
    default_price_cents = 24900
where key = 'seo_local' and default_price_cents is null;

insert into public.service_catalog (key, category_id, name, description, default_price_cents, suggested_billing_type, suggested_periodicity)
select v.key, c.id, v.name, v.description, v.price, v.billing::public.billing_type, v.periodicity::public.periodicity
from (values
  ('seo_esencial', 'SEO Esencial',
   'Presencia local y mantenimiento básico. No incluye creación de contenido nuevo. Una web, un idioma y una ficha de Google. Sin permanencia.',
   12900, 'recurring', 'monthly'),
  ('seo_local', 'SEO Local',
   'Recomendado para iniciar una estrategia local. Incluye SEO Esencial con límites ampliados. Una web, un idioma y una ficha de Google. Sin permanencia.',
   24900, 'recurring', 'monthly'),
  ('seo_local_plus', 'SEO Local Plus',
   'Más contenido para servicios y zonas prioritarias. Incluye SEO Local con límites ampliados. Una web, un idioma y una ficha de Google. Sin permanencia.',
   34900, 'recurring', 'monthly'),
  ('seo_geo', 'SEO + GEO',
   'Visibilidad en Google y en respuestas de IA. Incluye SEO Local Plus y trabajo específico de GEO. No garantiza menciones, recomendaciones ni posiciones.',
   49900, 'recurring', 'monthly'),
  ('seo_puesta_en_marcha', 'Puesta en marcha SEO',
   'Pago único, con cualquiera de los planes SEO. No constituye una auditoría técnica exhaustiva.',
   14900, 'one_time', null)
) as v(key, name, description, price, billing, periodicity)
cross join (select id from public.service_categories where slug = 'seo') c
where not exists (select 1 from public.service_catalog s where s.key = v.key)
on conflict do nothing;

-- Planes SEO: alternativas entre sí (también el SEO mensual a medida). Solo si no tienen grupo.
update public.service_catalog set exclusive_group = 'seo_plan'
where key in ('seo_esencial', 'seo_local', 'seo_local_plus', 'seo_geo', 'seo_mensual') and exclusive_group is null;

-- La puesta en marcha se contrata «con cualquiera de los planes».
update public.service_catalog set requires_any = array['group:seo_plan']
where key = 'seo_puesta_en_marcha' and cardinality(requires_any) = 0;

-- SEO + GEO ya incluye el trabajo GEO mensual: no se contratan ambos para el mismo proyecto.
update public.service_catalog set excludes = array['geo_mensual']
where key = 'seo_geo' and cardinality(excludes) = 0;

-- Prestaciones de la propuesta (solo para servicios que aún no tienen ninguna).
insert into public.service_catalog_deliverables (service_id, position, title)
select s.id, d.pos, d.title
from public.service_catalog s
join (values
  ('seo_esencial', 1, 'Revisión de una ficha de Google Business Profile: datos, categorías, horarios y servicios; cambios cuando sean necesarios'),
  ('seo_esencial', 2, 'Optimización básica de 1 página existente al mes: título, metadescripción, encabezados y enlaces internos'),
  ('seo_esencial', 3, 'Seguimiento de 5 búsquedas locales y comprobación de incidencias de indexación en Search Console'),
  ('seo_esencial', 4, 'Informe mensual breve: trabajo realizado, evolución y siguiente prioridad'),

  ('seo_local', 1, 'Revisión de la ficha de Google Business Profile: datos, categorías, horarios y servicios'),
  ('seo_local', 2, 'Optimización básica de hasta 2 páginas existentes al mes'),
  ('seo_local', 3, 'Creación de 1 contenido mensual (página de servicio o artículo local) con las plantillas de la web'),
  ('seo_local', 4, 'Hasta 2 actualizaciones de la ficha de Google al mes y respuesta a hasta 5 reseñas'),
  ('seo_local', 5, 'Seguimiento de 10 búsquedas locales, revisión de enlazado interno e indexación en Search Console'),
  ('seo_local', 6, 'Hasta 30 minutos de ajustes técnicos menores al mes en el CMS'),
  ('seo_local', 7, 'Informe mensual y reunión de seguimiento de hasta 20 minutos'),

  ('seo_local_plus', 1, 'Revisión de la ficha de Google Business Profile, hasta 2 actualizaciones al mes y respuesta a hasta 5 reseñas'),
  ('seo_local_plus', 2, 'Hasta 3 páginas existentes optimizadas al mes'),
  ('seo_local_plus', 3, '2 contenidos nuevos al mes con las plantillas de la web'),
  ('seo_local_plus', 4, 'Seguimiento de 20 búsquedas locales y revisión de enlazado interno'),
  ('seo_local_plus', 5, 'Revisión mensual de indexación y sitemap'),
  ('seo_local_plus', 6, 'Hasta 60 minutos de ajustes técnicos menores al mes'),
  ('seo_local_plus', 7, 'Comparativa inicial de 2 competidores locales y revisión trimestral de sus principales páginas y presencia local'),
  ('seo_local_plus', 8, 'Recomendaciones trimestrales para facilitar contactos desde las páginas clave'),
  ('seo_local_plus', 9, 'Informe y reunión mensual de hasta 30 minutos'),

  ('seo_geo', 1, 'Todas las prestaciones de SEO Local Plus'),
  ('seo_geo', 2, 'Medición inicial y mensual de 10 preguntas acordadas en 2 plataformas de IA con búsqueda web (inicialmente ChatGPT y Gemini)'),
  ('seo_geo', 3, 'Registro de menciones a la marca, exactitud de los datos y fuentes citadas; comparación con los 2 competidores del plan'),
  ('seo_geo', 4, 'Revisión de la información de empresa, servicios y zonas en la web y la ficha; una prioridad GEO mensual'),
  ('seo_geo', 5, 'Anexo mensual de visibilidad en IA: preguntas revisadas, fecha, resultados observados y siguiente acción'),

  ('seo_puesta_en_marcha', 1, 'Reunión inicial de hasta 45 minutos'),
  ('seo_puesta_en_marcha', 2, 'Definición de una zona principal y servicios prioritarios'),
  ('seo_puesta_en_marcha', 3, 'Revisión de hasta 15 URL representativas y de la ficha de Google'),
  ('seo_puesta_en_marcha', 4, 'Selección inicial de búsquedas y plan de prioridades'),
  ('seo_puesta_en_marcha', 5, 'Verificación de accesos a Search Console y GA4, si ya existen')
) as d(key, pos, title) on d.key = s.key
where not exists (select 1 from public.service_catalog_deliverables x where x.service_id = s.id);
