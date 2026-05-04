# Spots Schema — Canonical Vocabulary

The `spots` table is the single source-of-truth for everything a traveler
might want to find. This doc is the canonical vocabulary for `kind`,
`sub_kind`, `source`, and `amenities`. Importers, UI, and migrations
should reference these values exactly.

## Design rules

1. **One facility = one row.** A truck stop with showers + laundromat +
   dump station is three rows at the same coordinates, each with its own
   `kind`, description, and marker.
2. **`kind` answers "what is this destination?"** A place that's
   filterable on its own gets a row.
3. **`sub_kind` answers "what character of X is this?"** Single job:
   character. Provenance lives in `source`, never in `sub_kind`.
4. **`amenities` describes features.** A campground row carries
   `amenities.showers: "hot"` AND a separate `kind=shower` row can exist
   at the same coords if those showers are walk-up accessible. The two
   are independent.
5. **`source` is provenance.** Where the row came from. Never duplicates
   into `kind` or `sub_kind`.

## `kind` — top-level destination type

| Family | `kind` | Notes |
|---|---|---|
| Stay | `dispersed_camping` | Free, on public land. "Wild camping". |
| Stay | `established_campground` | Fees / reservations / maintained. |
| Stay | `informal_camping` | Urban / opportunistic — parking lots, rest areas, churches. |
| Utility | `water` | Standalone water source. |
| Utility | `shower` | Standalone shower. |
| Utility | `laundromat` | Standalone laundry. |
| Utility | `dump_station` | RV waste dump. |
| Utility | `fuel` | Gas / diesel / EV charging. |
| Utility | `propane` | Refill or exchange. |

`campground_site` (numbered site within a campground) stays in the schema
CHECK constraint but is unused; reach for `parent_spot_id` if we ever need
it.

## `sub_kind` — character within a kind

NULL is allowed and common. Only set when there's a meaningful
distinction worth filtering on.

| Parent `kind` | Vocabulary |
|---|---|
| `dispersed_camping` | `wild`, `road_accessible`, `boondocking_lot`, `pullout` |
| `established_campground` | usually NULL (use amenities for character); `rv_park`, `cabin_resort` if non-NPS |
| `informal_camping` | `parking_lot`, `roadside`, `street`, `rest_area`, `business_lot`, `church_lot`, `truck_stop`, `walmart`, `unspecified` |
| `water` | `spigot`, `well`, `kiosk`, `creek`, `lake`, `hand_pump`, `fill_station` |
| `shower` | `pay_per_use`, `truck_stop`, `gym`, `campground_open`, `marina`, `beach`, `public` |
| `laundromat` | NULL |
| `dump_station` | `free`, `paid`, `included_w_camping` |
| `fuel` | `gas`, `diesel`, `ev_charging` |
| `propane` | `refill`, `exchange` |

**Disallowed** in `sub_kind` (these are provenance, lift to `source`):
`community`, `derived`, `known`.

## `source` — provenance

| Value | Meaning |
|---|---|
| `community` | iOverlander / community-contributed CSV |
| `derived` | Algorithmically derived (dead-end roads, etc.) |
| `osm` | OpenStreetMap import |
| `ridb` | Recreation.gov / RIDB import |
| `usfs` | USFS direct (MVUM, etc.) |
| `blm` | BLM direct |
| `nps` | NPS direct |
| `fws` | USFWS direct |
| `mvum` | Forest Service MVUM (subset of USFS) |
| `padus` | PAD-US polygon-derived |
| `user_added` | Submitted in-app by an authenticated user |

## `amenities` — features at this place

Flat JSONB bag. Same shape regardless of `kind`. Three groups: booleans,
enums, numbers.

### Booleans (set `true` when known true; omit otherwise)

| Key | Notes |
|---|---|
| `pet_friendly` | |
| `big_rig_friendly` | |
| `tent_friendly` | |
| `reservation_required` | |
| `wheelchair_accessible` | |
| `walk_up_accessible` | "Can a non-guest use this?" — relevant for `kind=shower` co-located with a campground |
| `fire_pit` | |
| `picnic_table` | |
| `trash` | Service / dumpsters provided |
| `bear_box` | Food-storage box (bear country) |
| `host_on_site` | Campground host present |
| `winter_access` | Open year-round (no seasonal closure) |
| `swimming` | Lake / creek / beach access |
| `hot_springs` | |

### Enums (use these exact lowercase values)

| Key | Values |
|---|---|
| `toilets` | `flush`, `vault`, `pit`, `composting`, `none` |
| `water` | `potable`, `non_potable`, `natural`, `none` |
| `water_potability` | `potable`, `non_potable` *(only on `kind=water` rows; redundant elsewhere)* |
| `showers` | `hot`, `warm`, `cold`, `none` |
| `electricity` | `30A`, `50A`, `shared`, `none` |
| `wifi` | `fast`, `average`, `slow`, `none` |
| `cell_service` | nested object `{ verizon: "strong"|"weak"|"dead", att: ..., tmobile: ... }` |
| `road_surface` | `paved`, `gravel`, `dirt`, `rough_4wd` |
| `vehicle_required` | `passenger`, `awd`, `4wd`, `high_clearance`, `hike_in` |
| `dump_station` | `yes`, `no` *(amenity flag — separate from `kind=dump_station` row)* |
| `firewood` | `free`, `sale`, `none` |
| `payment_method` | `cash`, `card`, `quarters`, `exact_change`, `app` |
| `shade` | `none`, `partial`, `full` |
| `quiet_level` | `quiet`, `mixed`, `busy` |
| `fee` | `free`, `paid`, `donation` |
| `surroundings` | `wilderness`, `rural`, `suburban`, `urban` *(arguably belongs on the spot itself, not amenities — keep here for now)* |

### Numbers

| Key | Units / range |
|---|---|
| `fee_usd` | Nightly fee in USD |
| `max_stay_days` | 14 (BLM), 16 (FS), etc. |
| `max_vehicle_length_ft` | Important for RVs |
| `elevation_ft` | Optional, derive from coords |

### Strings (free-form, used sparingly)

| Key | Notes |
|---|---|
| `hours_open` | "24h", "6am-10pm", "Mon-Fri 8-5" |
| `gate_hours` | When gate locks ("dawn-dusk") |
| `fee_description` | Long form when `fee_usd` insufficient |

### Removed / deprecated

| Key | Replacement |
|---|---|
| `showers_amenity` | renamed → `showers` |
| `spot_type` | lift to `sub_kind` (it was sub_kind data leaking into amenities) |
| `drinking_water` | use `water` enum |
| `reservation` | use `reservation_required` boolean |

## Canonical spot tags

Separate axis from `amenities`. **Tags** are short, high-signal flags
that any camping spot can carry — community contributors and the
saved-spot owner pick from a fixed canonical vocab when annotating.
Single source of truth: `src/lib/spot-tags.ts`.

| Tag | Meaning |
|---|---|
| `4wd Only` | Final approach requires 4WD. |
| `Bumpy Road` | Rough access; passable in HC vehicles but uncomfortable. |
| `Great Starlink` | Confirmed unobstructed sky for Starlink. |
| `High Clearance` | Final approach needs ground clearance, not 4WD. |
| `Multiple Rigs` | Site can fit several vehicles / trailers. |
| `Multiple spots in area` | One coordinate, multiple usable spots nearby. |
| `Private` | Secluded — no neighbors visible / heard. |
| `Some Starlink` | Partial sky — Starlink may work intermittently. |
| `Unknown status` | Verification pending; data not confirmed. |
| `Water access` | Stream / lake / spigot reachable on foot. |

Tags are **not** the same as amenities:

- `amenities.vehicle_required: '4wd'` is the structured field that
  filter logic and the renderer key off; the `4wd Only` tag is the
  human-friendly chip the contributor selects.
- `amenities.water: 'potable'` answers "what kind of water is here";
  the `Water access` tag answers "is there water nearby that you can
  walk to."

Where they overlap (vehicle / water), keep both — tags are the social
flag, amenities are the structured fact.

## Examples

### Walk-up shower facility at a truck stop
```jsonc
{
  "kind": "shower",
  "sub_kind": "truck_stop",
  "source": "community",
  "amenities": {
    "fee_usd": 14,
    "payment_method": "card",
    "hours_open": "24h",
    "walk_up_accessible": true,
    "showers": "hot"
  }
}
```

### Established campground (with on-site showers but they're guest-only)
```jsonc
{
  "kind": "established_campground",
  "sub_kind": null,
  "source": "ridb",
  "amenities": {
    "toilets": "flush",
    "showers": "hot",
    "water": "potable",
    "electricity": "30A",
    "fire_pit": true,
    "picnic_table": true,
    "dump_station": "yes",
    "trash": true,
    "wifi": "free",
    "pet_friendly": true,
    "big_rig_friendly": true,
    "max_vehicle_length_ft": 40,
    "fee_usd": 25,
    "reservation_required": true,
    "max_stay_days": 14
  }
}
```

### Wild dispersed spot down a USFS road
```jsonc
{
  "kind": "dispersed_camping",
  "sub_kind": "wild",
  "source": "community",
  "amenities": {
    "toilets": "none",
    "water": "none",
    "fire_pit": true,
    "vehicle_required": "high_clearance",
    "road_surface": "rough_4wd",
    "shade": "partial",
    "quiet_level": "quiet",
    "max_stay_days": 16,
    "fee": "free"
  }
}
```

### Co-located: campground + walk-up dump station
Two rows at the same `(lat, lng)`:

```jsonc
// Row 1
{ "kind": "established_campground", "amenities": { "dump_station": "yes", ... } }
// Row 2
{ "kind": "dump_station", "sub_kind": "paid", "amenities": { "fee_usd": 10, "walk_up_accessible": true } }
```
