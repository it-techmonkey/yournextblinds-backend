# Category Analysis for Blinds Website

## Navigation Structure Analysis

After analyzing the navigation, I've identified that the current navlinks mix:
- **Core product types** (what the product fundamentally IS)
- **Features/attributes** (what the product HAS or DOES)
- **Use cases** (where/when the product is used)
- **Colors/patterns** (visual attributes)

## Proposed Category Structure

### Primary Categories (Core Product Types)
These represent the fundamental blind design/mechanism. A product typically has ONE primary category:

1. **Vertical Blinds** (`vertical-blinds`)
   - Core mechanism: Vertical slats that rotate and slide
   - Examples: Light filtering vertical, Blackout vertical

2. **Roller Blinds** (`roller-blinds`)
   - Core mechanism: Fabric rolls up/down
   - Examples: Light filtering roller, Blackout roller, Waterproof roller

3. **Roman Blinds** (`roman-blinds`)
   - Core mechanism: Fabric folds up in horizontal pleats

4. **Venetian Blinds** (`venetian-blinds`)
   - Core mechanism: Horizontal slats that tilt and raise/lower

5. **Day and Night Blinds** (`day-and-night-blinds`)
   - Core mechanism: Dual-layer fabric system (also called Dual/Zebra shades)
   - Examples: Dual zebra shades, Motorised dual zebra shades

6. **Pleated Blinds** (`pleated-blinds`)
   - Core mechanism: Pleated fabric that folds accordion-style
   - Examples: Perfect Fit Pleated

7. **Wooden Blinds** (`wooden-blinds`)
   - Core mechanism: Wooden slats (can be vertical or horizontal)
   - Note: Could be a subset of Vertical or Venetian, but distinct enough

8. **Skylight Blinds** (`skylight-blinds`)
   - Core mechanism: Specialized for roof/skylight windows
   - Note: Could be any type but specialized for skylights

### Secondary Categories (Installation/Configuration Types)
These can overlap with primary categories:

9. **No Drill Blinds** (`no-drill-blinds`)
   - Installation method: Perfect Fit systems
   - Sub-types: Perfect Fit Shutter, Perfect Fit Pleated, Perfect Fit Wooden, Perfect Fit Metal, No Drill Rollers

10. **Motorized Blinds** (`motorized-blinds`)
    - Control mechanism: Motorized operation
    - Note: Can be applied to any blind type (Vertical, Roller, etc.)

### Specialized Categories

11. **EclipseCore Shades** (`eclipsecore-shades`)
    - Specialized blackout honeycomb design
    - Note: Could be a subset of Pleated or Blackout, but distinct product line

## What Should NOT Be Categories (Should Be Tags Instead)

### Colors (Tags)
- White, Black, Blue, Yellow, Gold, Green, Grey/Silver, Purple, Orange, Red, Pink
- Light Wood, Medium Wood

### Patterns (Tags)
- Animal, Floral, Geometric, Striped

### Features/Solutions (Tags)
- Blackout (feature, not a type - can be Vertical, Roller, etc.)
- Thermal (feature)
- Waterproof (feature)
- Cordless (feature)
- Easy Wipe (feature)
- Better Sleep (feature/marketing)

### Window Types (Tags)
- Bay Window, Conservatory Window, Roof Skylight, Tilt and Turn, Bi Fold, French Door, Sliding Door
- Note: These are installation contexts, not product types

### Rooms (Tags)
- Conservatory, Bedroom, Kitchen, Office, Bathroom, Living Room, Dining Room, Children's Room
- Note: These are use cases, not product types

## Category Relationships

A product can have MULTIPLE categories:
- Example: A "Motorized Blackout Vertical Blind" could have:
  - Primary: `vertical-blinds`
  - Secondary: `motorized-blinds`
  - Tags: `blackout`, `white`, `bedroom`

- Example: A "Perfect Fit Pleated Blind" could have:
  - Primary: `pleated-blinds`
  - Secondary: `no-drill-blinds`
  - Tags: `white`, `kitchen`

## Recommended Category List

### Core Product Types (Primary Categories)
1. `vertical-blinds` - Vertical Blinds
2. `roller-blinds` - Roller Blinds
3. `roman-blinds` - Roman Blinds
4. `venetian-blinds` - Venetian Blinds
5. `day-and-night-blinds` - Day and Night Blinds (Dual/Zebra)
6. `pleated-blinds` - Pleated Blinds
7. `wooden-blinds` - Wooden Blinds
8. `skylight-blinds` - Skylight Blinds

### Installation/Control Types (Secondary Categories)
9. `no-drill-blinds` - No Drill Blinds (Perfect Fit)
10. `motorized-blinds` - Motorized Blinds

### Specialized Products
11. `eclipsecore-shades` - EclipseCore Shades

**Total: 11 categories**

## Rationale

1. **Categories represent WHAT the product IS** (its fundamental design/mechanism)
2. **Tags represent WHAT the product HAS** (features, colors, patterns, use cases)
3. **A product can have multiple categories** (e.g., Motorized + Vertical)
4. **Categories are mutually exclusive in terms of core design** (a product can't be both Vertical AND Roller, but CAN be Vertical AND Motorized)

## Implementation Notes

- Navigation slugs like `blackout-blinds`, `thermal-blinds`, etc. should map to the appropriate primary category + relevant tags
- For example: `blackout-roller-shades` → Category: `roller-blinds` + Tag: `blackout`
- The frontend can still use all the navigation slugs, but they'll map to combinations of categories and tags
