-- Track per-image metadata (chip-style flags, etc.) on spot_images.
--
-- Specific motivation: the NAIP backfill pipeline used to bake a centered
-- pin into the JPEG before uploading to R2. We're moving the pin to a
-- client-side CSS overlay so the design can change without regenerating
-- imagery, but the existing chips have the old pin pixel-baked in.
-- Flagging them as `pin_baked=true` lets the next backfill pass identify
-- which to regenerate.
--
-- Future use cases: chip pipeline version, render style, post-processing
-- variant, etc. — all naturally fit in this jsonb bag.

ALTER TABLE public.spot_images
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Mark every existing NAIP chip as having the pin baked in.
UPDATE public.spot_images
   SET metadata = jsonb_set(metadata, '{pin_baked}', 'true'::jsonb)
 WHERE source = 'naip'
   AND (metadata->>'pin_baked') IS NULL;

COMMENT ON COLUMN public.spot_images.metadata IS
    'Per-image metadata (chip-style flags, pipeline version, etc.). Used by NAIP regeneration to identify chips with legacy baked-in pins.';
