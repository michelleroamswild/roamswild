#!/usr/bin/env python3
"""
Fetch a NAIP aerial imagery chip for a single spot and store it in R2.

Single-spot smoke test for the NAIP backfill pipeline. Reads NAIP COGs from
Microsoft Planetary Computer (free, no requester-pays), crops a ~500m square
chip with rio-tiler, draws a small white dot at the spot's lat/lng, encodes
JPEG, and uploads to a Cloudflare R2 bucket.

Setup (once):
  pip install pystac-client rio-tiler planetary-computer boto3 pillow

.env keys required:
  SUPABASE_SERVICE_ROLE_KEY
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
  R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
  R2_BUCKET=naip-chips
  R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev

Usage:
  python3 fetch_chip.py <spot_id>             # fetch + upload, no DB write
  python3 fetch_chip.py <spot_id> --insert    # also write spot_images row
  python3 fetch_chip.py <spot_id> --force     # regenerate even if one exists
"""
import argparse
import io
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

import boto3
import planetary_computer
from PIL import Image, ImageDraw, ImageFilter
from pystac_client import Client
from rio_tiler.io import Reader

PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_PATH = PROJECT_ROOT / '.env'

# Microsoft Planetary Computer hosts NAIP for free (no requester-pays, no egress
# fees). We sign asset URLs with planetary_computer.sign() to get a short-lived
# SAS token that lets rio-tiler/rasterio read the COG over HTTPS.
STAC_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1'
NAIP_COLLECTION = 'naip'
SUPABASE_URL = 'https://ioseedbzvogywztbtgjd.supabase.co'

CHIP_RADIUS_M = 250          # ~500m square chip
CHIP_PX = 1024
JPEG_QUALITY = 85


def load_env():
    if not ENV_PATH.exists():
        sys.exit(f'No .env at {ENV_PATH}')
    pat = re.compile(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*?)"?\s*$')
    with open(ENV_PATH) as f:
        for line in f:
            m = pat.match(line.rstrip())
            if m:
                os.environ.setdefault(m.group(1), m.group(2))


def http_get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def http_post(url, headers, body):
    req = urllib.request.Request(
        url,
        method='POST',
        data=json.dumps(body).encode('utf-8'),
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status


def http_delete(url, headers):
    req = urllib.request.Request(url, method='DELETE', headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status


def fetch_spot(spot_id, key):
    rows = http_get(
        f'{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}&select=id,name,latitude,longitude',
        {'apikey': key, 'Authorization': f'Bearer {key}'},
    )
    if not rows:
        sys.exit(f'spot {spot_id} not found')
    return rows[0]


def existing_naip_image(spot_id, key):
    rows = http_get(
        f'{SUPABASE_URL}/rest/v1/spot_images?spot_id=eq.{spot_id}&source=eq.naip&select=id,storage_url',
        {'apikey': key, 'Authorization': f'Bearer {key}'},
    )
    return rows[0] if rows else None


def find_naip_item(lat, lng, max_attempts=4):
    """Return the most recent NAIP STAC item covering (lat, lng), or None.
    Retries on transient errors (Planetary Computer occasionally times out
    under concurrent load) with exponential backoff."""
    import time as _time
    last_err = None
    for attempt in range(max_attempts):
        try:
            client = Client.open(STAC_URL)
            search = client.search(
                collections=[NAIP_COLLECTION],
                intersects={'type': 'Point', 'coordinates': [lng, lat]},
                max_items=20,
            )
            items = list(search.items())
            if not items:
                return None
            items.sort(
                key=lambda i: i.datetime
                or (i.properties.get('start_datetime') or '')
                or '',
                reverse=True,
            )
            return items[0]
        except Exception as exc:
            last_err = exc
            if attempt == max_attempts - 1:
                raise
            _time.sleep(2 ** attempt)
    raise last_err


def draw_pin(pil_img, color=(255, 255, 255)):
    """Draw a small white dot with a soft drop shadow at the image center.
    Replaces the old Phosphor MapPin overlay — simpler reads better against
    varied terrain, and there's nothing to misalign."""
    SS = 4
    base = pil_img.convert('RGBA')
    W, H = base.size

    # Dot diameter scales with the chip — small enough to feel like a precision
    # marker, large enough to be visible at thumbnail size.
    dot_d = max(14, min(W, H) // 48)
    radius_ss = (dot_d * SS) / 2
    sw, sh = W * SS, H * SS
    cx, cy = sw / 2, sh / 2

    # Drop shadow — slightly larger, blurred, offset down a hair.
    shadow_layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    shadow_mask = Image.new('L', (sw, sh), 0)
    sd = ImageDraw.Draw(shadow_mask)
    shadow_pad = SS * 2
    sd.ellipse(
        (cx - radius_ss - shadow_pad, cy - radius_ss - shadow_pad,
         cx + radius_ss + shadow_pad, cy + radius_ss + shadow_pad),
        fill=140,
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=SS * 2.5))
    shadow_layer.putalpha(shadow_mask)
    shadow_off = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    shadow_off.paste(shadow_layer, (0, int(SS * 1.2)), shadow_layer)

    # White dot.
    dot_layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot_layer)
    dd.ellipse(
        (cx - radius_ss, cy - radius_ss, cx + radius_ss, cy + radius_ss),
        fill=color + (255,),
    )

    composed_ss = Image.alpha_composite(shadow_off, dot_layer)
    composed = composed_ss.resize((W, H), Image.LANCZOS)
    return Image.alpha_composite(base, composed).convert('RGB')


def fetch_chip(item, lat, lng, with_pin=True):
    """Read a windowed chip from the NAIP COG and return (jpeg_bytes, (w, h)).
    Signs the Planetary Computer asset URL for short-lived blob access."""
    item = planetary_computer.sign(item)
    asset = item.assets.get('image') or item.assets.get('visual')
    if not asset:
        raise RuntimeError(f'no image asset on STAC item {item.id}')

    lat_off = CHIP_RADIUS_M / 111_111
    lng_off = CHIP_RADIUS_M / (111_111 * max(0.1, math.cos(math.radians(lat))))
    bbox = (lng - lng_off, lat - lat_off, lng + lng_off, lat + lat_off)

    with Reader(asset.href) as cog:
        img = cog.part(bbox, dst_crs='epsg:4326', max_size=CHIP_PX)

    arr = img.data.transpose(1, 2, 0)
    if arr.shape[-1] == 4:
        arr = arr[..., :3]
    if arr.dtype != 'uint8':
        arr = arr.astype('uint8')

    pil = Image.fromarray(arr)
    if with_pin:
        pil = draw_pin(pil)
    buf = io.BytesIO()
    pil.save(buf, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), pil.size


def upload_to_r2(jpeg_bytes, storage_key):
    s3 = boto3.client(
        's3',
        endpoint_url=os.environ['R2_ENDPOINT_URL'],
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
    )
    s3.put_object(
        Bucket=os.environ['R2_BUCKET'],
        Key=storage_key,
        Body=jpeg_bytes,
        ContentType='image/jpeg',
        CacheControl='public, max-age=31536000, immutable',
    )
    base = os.environ['R2_PUBLIC_BASE_URL'].rstrip('/')
    return f'{base}/{storage_key}'


def insert_spot_image(spot_id, storage_url, storage_key, item, size, supa_key, pin_baked=False):
    """Insert a spot_images row for a freshly-uploaded NAIP chip.

    `pin_baked` records whether the centered location pin is rendered into
    the JPEG pixels. Default False — new chips are raw imagery and the pin
    is overlaid client-side. Set True only for legacy/regenerate flows
    that still bake the pin in.
    """
    taken = item.datetime
    if taken is None:
        taken = item.properties.get('start_datetime')
    body = {
        'spot_id': spot_id,
        'image_type': 'satellite',
        'source': 'naip',
        'storage_url': storage_url,
        'storage_bucket': os.environ['R2_BUCKET'],
        'storage_path': storage_key,
        'taken_at': taken.isoformat() if hasattr(taken, 'isoformat') else taken,
        'width': size[0],
        'height': size[1],
        'is_primary': True,
        'satellite_size': f'{size[0]}x{size[1]}',
        'metadata': {'pin_baked': bool(pin_baked)},
    }
    return http_post(
        f'{SUPABASE_URL}/rest/v1/spot_images',
        {
            'apikey': supa_key,
            'Authorization': f'Bearer {supa_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
        body,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('spot_id')
    parser.add_argument('--insert', action='store_true', help='write spot_images row')
    parser.add_argument('--force', action='store_true', help='regenerate even if one exists')
    # Default behavior: skip the baked-in pin. The frontend overlays one
    # client-side via CSS so the design can change without regenerating
    # imagery. Pass --pin to revert to the legacy baked-in pin.
    parser.add_argument('--pin', action='store_true', help='bake the centered location pin into the JPEG (legacy)')
    parser.add_argument('--no-pin', action='store_true', help='[deprecated] kept for backwards compat — same as the default now')
    args = parser.parse_args()

    load_env()

    # NAIP via Planetary Computer is read over HTTPS — no AWS creds needed.
    # GDAL config to skip directory listings on remote COGs.
    os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')

    supa_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not supa_key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY missing from .env')

    spot = fetch_spot(args.spot_id, supa_key)
    print(f'spot: {spot["name"]}  ({spot["latitude"]}, {spot["longitude"]})')

    prev = existing_naip_image(args.spot_id, supa_key)
    if prev and not args.force:
        print(f'  already has NAIP image: {prev["storage_url"]}  (use --force to regen)')
        return
    if prev and args.force:
        http_delete(
            f'{SUPABASE_URL}/rest/v1/spot_images?id=eq.{prev["id"]}',
            {'apikey': supa_key, 'Authorization': f'Bearer {supa_key}'},
        )
        print(f'  --force: deleted prior spot_images row {prev["id"]}')

    item = find_naip_item(float(spot['latitude']), float(spot['longitude']))
    if not item:
        sys.exit('  no NAIP scene found at this point (outside US coverage?)')
    print(f'  scene: {item.id}  date: {(item.datetime or item.properties.get("start_datetime"))}')

    with_pin = bool(args.pin)
    jpeg, size = fetch_chip(item, float(spot['latitude']), float(spot['longitude']), with_pin=with_pin)
    print(f'  chip: {size[0]}x{size[1]}  {len(jpeg) / 1024:.0f} KB  (pin_baked={with_pin})')

    storage_key = f'naip/{args.spot_id}.jpg'
    url = upload_to_r2(jpeg, storage_key)
    print(f'  uploaded: {url}')

    if args.insert:
        status = insert_spot_image(args.spot_id, url, storage_key, item, size, supa_key, pin_baked=with_pin)
        print(f'  spot_images row: HTTP {status}')


if __name__ == '__main__':
    main()
