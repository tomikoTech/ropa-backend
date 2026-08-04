-- Feature "marcar como pagado": ventas no-crédito pueden quedar pendientes.
-- Correr en prod ANTES de desplegar el backend nuevo.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;
