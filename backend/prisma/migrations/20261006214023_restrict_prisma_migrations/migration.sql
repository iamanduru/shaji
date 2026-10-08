-- Prevent the runtime application role from accessing
-- Prisma migration history when the metadata table exists.

DO $$
BEGIN
    IF pg_catalog.to_regclass('app._prisma_migrations') IS NOT NULL THEN
        EXECUTE
            'REVOKE ALL PRIVILEGES
             ON TABLE app._prisma_migrations
             FROM shaji_app';
    END IF;
END
$$;