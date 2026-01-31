-- Function to insert a campground from RIDB import
CREATE OR REPLACE FUNCTION insert_campground(
    p_ridb_facility_id TEXT,
    p_name TEXT,
    p_description TEXT,
    p_facility_type TEXT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_agency_name TEXT,
    p_forest_name TEXT,
    p_is_reservable BOOLEAN,
    p_recreation_gov_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
    v_location GEOMETRY;
BEGIN
    -- Create point geometry
    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    -- Insert the campground
    INSERT INTO established_campgrounds (
        ridb_facility_id,
        location,
        name,
        description,
        facility_type,
        agency_name,
        forest_name,
        is_reservable,
        recreation_gov_url,
        source_type,
        last_synced_at
    ) VALUES (
        p_ridb_facility_id,
        v_location,
        p_name,
        p_description,
        p_facility_type,
        p_agency_name,
        p_forest_name,
        p_is_reservable,
        p_recreation_gov_url,
        'pad_us',  -- Using pad_us as generic federal source
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION insert_campground TO service_role;
