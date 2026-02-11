-- Enable RLS on private_road_points to resolve Supabase security warning
-- This table is backend-only (service_role access), so we allow all for service_role

ALTER TABLE private_road_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on private_road_points"
    ON private_road_points
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
