#!/usr/bin/env python3
"""
Fetch a NAIP aerial imagery chip for a single spot and store it in R2.

Single-spot smoke test for the NAIP backfill pipeline. Reads NAIP COGs from
Microsoft Planetary Computer (free, no requester-pays), crops a ~500m square
chip with rio-tiler, draws a Phosphor MapPin at the spot's lat/lng, encodes
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


def _arc_to_points(x1, y1, rx, ry, rot_deg, large_arc, sweep, x2, y2, n=28):
    """Convert SVG endpoint-parameterized arc to polyline points (excludes start, includes end).
    Implements the W3C SVG 1.1 F.6.5/F.6.6 algorithm."""
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]
    phi = math.radians(rot_deg)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p =  cp * dx + sp * dy
    y1p = -sp * dx + cp * dy
    rx, ry = abs(rx), abs(ry)
    rxs, rys = rx * rx, ry * ry
    x1ps, y1ps = x1p * x1p, y1p * y1p
    radii_check = x1ps / rxs + y1ps / rys
    if radii_check > 1:
        s = math.sqrt(radii_check)
        rx *= s
        ry *= s
        rxs, rys = rx * rx, ry * ry
    sign = -1 if large_arc == sweep else 1
    sq = max(0.0, (rxs * rys - rxs * y1ps - rys * x1ps) / (rxs * y1ps + rys * x1ps))
    coef = sign * math.sqrt(sq)
    cxp =  coef * (rx * y1p) / ry
    cyp = -coef * (ry * x1p) / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        nrm = math.sqrt(ux * ux + uy * uy) * math.sqrt(vx * vx + vy * vy)
        d = ux * vx + uy * vy
        a = math.acos(max(-1.0, min(1.0, d / nrm)))
        return -a if (ux * vy - uy * vx) < 0 else a

    theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry,
                 (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep and dtheta < 0:
        dtheta += 2 * math.pi

    pts = []
    for i in range(1, n + 1):
        t = theta1 + dtheta * (i / n)
        x = cp * rx * math.cos(t) - sp * ry * math.sin(t) + cx
        y = sp * rx * math.cos(t) + cp * ry * math.sin(t) + cy
        pts.append((x, y))
    return pts


def _bezier_to_points(x0, y0, x1, y1, x2, y2, x3, y3, n=22):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3
        y = u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3
        pts.append((x, y))
    return pts


def _phosphor_mappin_fill_polygons():
    """Trace the Phosphor MapPin (weight='fill') SVG path. Returns
    (outer_polygon, inner_hole_polygon) in the source 256x256 viewBox.

    Path source: @phosphor-icons/react/dist/defs/MapPin.es.js, 'fill' weight."""
    pen = (128.0, 16.0)
    outer = [pen]

    # a 88.1 88.1 0 0 0 -88 88   (relative)
    end = (pen[0] - 88, pen[1] + 88)
    outer.extend(_arc_to_points(pen[0], pen[1], 88.1, 88.1, 0, 0, 0, end[0], end[1]))
    pen = end
    # c 0 75.3, 80 132.17, 83.41 134.55   (relative)
    end = (pen[0] + 83.41, pen[1] + 134.55)
    outer.extend(_bezier_to_points(
        pen[0], pen[1],
        pen[0] + 0,    pen[1] + 75.3,
        pen[0] + 80,   pen[1] + 132.17,
        end[0],        end[1]))
    pen = end
    # a 8 8 0 0 0 9.18 0   (relative)
    end = (pen[0] + 9.18, pen[1])
    outer.extend(_arc_to_points(pen[0], pen[1], 8, 8, 0, 0, 0, end[0], end[1]))
    pen = end
    # C 136 236.17, 216 179.3, 216 104   (absolute)
    end = (216.0, 104.0)
    outer.extend(_bezier_to_points(pen[0], pen[1], 136, 236.17, 216, 179.3, end[0], end[1]))
    pen = end
    # A 88.1 88.1 0 0 0 128 16   (absolute)
    end = (128.0, 16.0)
    outer.extend(_arc_to_points(pen[0], pen[1], 88.1, 88.1, 0, 0, 0, end[0], end[1]))

    # m 0 56  (relative move from current 128,16 → 128,72)
    pen = (128.0, 72.0)
    inner = [pen]
    # a 32 32 0 1 1 -32 32  (relative, large_arc=1, sweep=1)
    end = (pen[0] - 32, pen[1] + 32)
    inner.extend(_arc_to_points(pen[0], pen[1], 32, 32, 0, 1, 1, end[0], end[1]))
    pen = end
    # A 32 32 0 0 1 128 72  (absolute)
    end = (128.0, 72.0)
    inner.extend(_arc_to_points(pen[0], pen[1], 32, 32, 0, 0, 1, end[0], end[1]))

    return outer, inner


# Cached polygons in 256x256 viewbox space — pin tip at (128, 238.55)
_MAPPIN_OUTER, _MAPPIN_INNER = _phosphor_mappin_fill_polygons()
_MAPPIN_TIP = (128.0, 238.55)


def draw_pin(pil_img, color=(234, 67, 53), border=(255, 255, 255)):
    """Render the Phosphor MapPin (fill weight) centered with its tip at the
    image center. Defaults to classic Google-Maps red with a white border.
    Supersampled for clean anti-aliased edges."""
    SS = 4
    base = pil_img.convert('RGBA')
    W, H = base.size

    # Pin scale: choose total icon height in display px, scale 256x256 → that
    icon_h = max(36, min(W, H) // 22)
    scale = (icon_h / 256.0) * SS
    sw, sh = W * SS, H * SS

    # Translate so the pin tip lands on the image center
    tx = sw / 2 - _MAPPIN_TIP[0] * scale
    ty = sh / 2 - _MAPPIN_TIP[1] * scale
    outer = [(x * scale + tx, y * scale + ty) for x, y in _MAPPIN_OUTER]
    inner = [(x * scale + tx, y * scale + ty) for x, y in _MAPPIN_INNER]

    # White border: dilate the outer silhouette by ~3 display px so the visible
    # ring outside the red fill reads cleanly on any terrain
    border_disp_px = 2
    kernel = border_disp_px * SS * 2 + 1
    base_mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(base_mask).polygon(outer, fill=255)
    border_mask = base_mask.filter(ImageFilter.MaxFilter(kernel))
    border_layer = Image.new('RGBA', (sw, sh), border + (0,))
    border_layer.putalpha(border_mask)

    # Pin layer: red fill with inner head hole punched (same Phosphor look)
    pin_mask = Image.new('L', (sw, sh), 0)
    md = ImageDraw.Draw(pin_mask)
    md.polygon(outer, fill=255)
    md.polygon(inner, fill=0)
    pin_layer = Image.new('RGBA', (sw, sh), color + (0,))
    pin_layer.putalpha(pin_mask)

    # Drop shadow: blurred dilated silhouette
    shadow_mask = border_mask.point(lambda v: int(v * 0.55))
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=SS * 2))
    shadow_layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    shadow_layer.putalpha(shadow_mask)
    shadow_off = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    shadow_off.paste(shadow_layer, (0, int(SS * 1.5)), shadow_layer)

    # Compose: shadow → white border → red pin
    composed_ss = Image.alpha_composite(shadow_off, border_layer)
    composed_ss = Image.alpha_composite(composed_ss, pin_layer)
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


def insert_spot_image(spot_id, storage_url, storage_key, item, size, supa_key):
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
    parser.add_argument('--no-pin', action='store_true', help='skip the centered location pin')
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

    jpeg, size = fetch_chip(item, float(spot['latitude']), float(spot['longitude']), with_pin=not args.no_pin)
    print(f'  chip: {size[0]}x{size[1]}  {len(jpeg) / 1024:.0f} KB')

    storage_key = f'naip/{args.spot_id}.jpg'
    url = upload_to_r2(jpeg, storage_key)
    print(f'  uploaded: {url}')

    if args.insert:
        status = insert_spot_image(args.spot_id, url, storage_key, item, size, supa_key)
        print(f'  spot_images row: HTTP {status}')


if __name__ == '__main__':
    main()
