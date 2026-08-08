-- Fase 9 (reportes): costo unitario como SNAPSHOT en la línea de venta.
-- Correr en prod ANTES de desplegar el backend nuevo. Aditiva e idempotente.
--
-- Por qué: la utilidad se calculaba (donde se calculaba) contra
-- `products.cost_price`, que es el costo de HOY. Con eso, subir el costo de un
-- producto reescribe la utilidad de todas sus ventas pasadas. El costo va con
-- la línea, igual que ya van el nombre, la talla y el precio.
--
-- El valor neutro es 0, que los reportes leen como "sin costo registrado" y
-- cuentan aparte: si lo tomaran como costo cero, mostrarían 100% de margen.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0;

-- Relleno histórico: la mejor estimación disponible es el costo actual del
-- producto. Es una aproximación (no había snapshot), pero deja los reportes
-- utilizables desde el primer día; dejarlo en 0 haría ver toda la historia
-- con margen del 100%, que es un número peor que uno aproximado.
--
-- Solo toca filas en 0, así que correrlo dos veces no pisa lo que ya escribió
-- el POS nuevo.
UPDATE sale_items si
SET    unit_cost = p.cost_price
FROM   product_variants v
JOIN   products p ON p.id = v.product_id
WHERE  si.variant_id = v.id
  AND  si.unit_cost = 0
  AND  p.cost_price > 0
  -- Cinturón de seguridad multi-tenant: la variante debe ser del mismo tenant
  -- que la línea. No debería haber cruces, pero una migración no es el lugar
  -- para confiar en eso.
  AND  (si.tenant_id IS NULL OR v.tenant_id = si.tenant_id);

-- Verificación (no modifica nada): cuántas líneas quedan sin costo y qué peso
-- tienen. Si el número es alto, los reportes de utilidad lo van a decir.
--   SELECT count(*) FILTER (WHERE unit_cost = 0) AS sin_costo,
--          count(*)                              AS total
--   FROM sale_items;
