# Buna Index

The public site at https://bunaindex.com: specialty coffee traced from growing region to the US roasters, cafés and importers that sell it.

This folder is generated. Do not edit it by hand: the pages, scripts and data are built from the master inventory and overwritten on every update.

- `index.html` is the whole site; `assets/` holds its scripts, `data/` the index and map data, `fonts/` and `vendor/` what it needs to run without any outside service.
- Index date: 2026-10-02. Coffees: 3,701. Businesses: 933.
- `tools/sync.py` brings `data/data.js` in line with the master list after each audit: it removes records that left the list, adds new ones and leaves the rest as they are. Records added by the daily update carry an added date and stay until the list catches up; the tool and rules for that update are on the `tooling` branch. `tools/state.json` records what has been reconciled and `tools/cities.json` holds the city reference points used on the map. The list itself is not kept here.
- Map outlines are from Natural Earth (public domain). Maps are drawn with D3 (ISC licence). Fonts are Besley, Hanken Grotesk, Big Shoulders Stencil and Noto Serif Ethiopic (SIL Open Font Licence).

Operated by Ethi CO, Denver, Colorado.
