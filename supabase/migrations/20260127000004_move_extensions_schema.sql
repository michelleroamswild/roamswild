-- Move pg_trgm extension from public schema to extensions schema
-- Extensions should not be in the public schema for security reasons

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move pg_trgm to extensions schema (PostgreSQL 9.1+)
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
