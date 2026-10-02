# Buna Index daily update: runbook

This branch (`tooling`) holds the tool and rules for the daily update of https://bunaindex.com.
GitHub Pages serves only `main`, so nothing here appears on the site. The repository is public:
never commit private material here (emails, Ethi CO opportunity notes, Drive links, the `out/` folder).

How this fits with the rest: the site also has a list sync (`tools/sync.py` on `main`, run by a separate
scheduled task each morning) that mirrors the master workbook in Drive. This daily update cannot edit that
workbook, so its records go straight into `data/data.js` with an added date (`ad`), and the list sync leaves
dated records alone until the workbook holds them. Never remove the `ad` field from a record.

Each day the update adds, to the site and to the spreadsheet:

| Target | What counts |
|---|---|
| 50 roasted coffees | A bag of roasted coffee from an independent specialty roaster, listed for sale on the roaster's own product page when checked, with price, size and at least two of: region, producer, washing station, process, variety, tasting notes. |
| 50 cafés | An independent specialty café with a street address, verified on its own site or official page. One record per business (the flagship), not one per location. |
| 20 importers | A green coffee importer or trader with a US office, warehouse or registered address that sells to US roasters. |

Hard rules, in order of importance:

1. **Nothing invented.** Every field comes from a page that was opened in this run. If a field was not found, leave it out. A record that cannot be verified is dropped, even if that leaves the day short.
2. **Never pad to hit a number.** If fewer than the target can be verified, add what is real and report the shortfall. Importers are a finite list and will run short; that is expected.
3. **No chains or franchises**, no businesses owned by a multinational, no marketplaces, no supermarket brands. Independent means locally or founder owned; as a guide, fewer than about ten locations.
4. **No duplicates.** The tool checks name, website and place against everything on the index. Do not rename a business to get past the check.
5. **Private stays private.** Email addresses and "Ethi CO opportunity" notes go to the spreadsheet only. The tool keeps them out of the site; do not put them in any other field.
6. **Order on the site cannot be bought** and Ethi CO's own products get no placement. Do not add Ethi CO products.

## Steps

```
git clone --depth 1 https://github.com/uim1433/bunaindex ~/bunaindex            # the site (main)
git clone --depth 1 --branch tooling https://github.com/uim1433/bunaindex ~/buna-tooling
cd ~/buna-tooling
python3 buna_daily.py verify --site ~/bunaindex                      # must say OK before anything else
python3 buna_daily.py plan   --site ~/bunaindex --date YYYY-MM-DD    # where to look today
```

Use the date in America/Denver. If today's date already has a run in `ledger.json` with all targets met, stop and say so.
If a run exists but fell short, top it up: `apply` adds to the same day.

### 1. Research

`plan` prints the metro areas to cover for cafés, roasters already on the index that have no priced coffee yet, and the importers already on record. Work through those first. Research with web search and by opening the business's own pages. The workspace shell cannot reach outside sites; only the web search and web fetch tools can.

**Search budget.** A session gets about 200 web searches in total, shared with every helper it starts, and the
first run burned all of them on 34 records. Spend them like this: coffees need none (open the roaster's shop
directly); cafés about 10 per metro (find guide pages that list many cafés, then open the cafés' own sites
directly); importers about 25 in total (find directories, then open importer sites directly). Opening a page
directly costs no search. If a page cannot be opened, try once more with or without `www.`, then move on.

Helpers are optional. If the session can start research agents, use at most four at a time (for example three
for cafés, one for importers), tell each one its search budget in numbers, and give each this file's "Record
format" and "Research notes" sections, its assignment and a file path. Do the coffees in the main session.
Each writes one JSON file into `~/batch/YYYY-MM-DD/`.

Research notes:

- **Coffees.** Many roasters run Shopify: fetching `https://<shop>/products.json?limit=250` lists every product with price, size and stock in one call, and the description in the feed usually carries region, producer, process, variety and tasting notes, so ten feeds can fill the day. A 404 means the shop is not on Shopify: open its coffee collection page instead. When the feed has no detail, open the product page. If several feeds are fetched at once, the answers come back in the order asked; before recording, open one product page per roaster and confirm the shop name and price, so no coffee is filed under the wrong roaster. Take the price and size of the standard retail bag (usually 12 oz, 10 oz, 250 g or 340 g). Skip sold-out items, subscriptions, samplers, pods, instant, cold brew, flavored coffee and merchandise. At most 5 coffees per roaster per day, so the day covers at least ten roasters. A new roaster may be added as the seller if it is an independent specialty roaster with its own shop; give its city, state and website.
- **Cafés.** Local guides (Sprudge city guides, local magazines, tourism boards) are good for finding names; the café's own site is what verifies the record. Specialty evidence means something specific and published: the roasters it serves, that it roasts in house, a manual brew or espresso program built on named coffees. "Great lattes" is not evidence. Confirm it is open (current hours, recent posts, not marked closed).
- **Importers.** Look for a public offer list, an origin-specific import business, or a trading house with a US office. Exporters with no US presence, roasters that also sell a little green coffee, and home-roaster retail shops that only resell do not count unless importing is their stated business. Before researching one, check it is not already on record.
- Check a name before spending time on it: `python3 buna_daily.py check --site ~/bunaindex "Name" --web https://site --st CO`

### 2. Apply

```
python3 buna_daily.py apply --site ~/bunaindex --date YYYY-MM-DD ~/batch/YYYY-MM-DD/*.json
```

The tool validates every entry, drops duplicates, chains and thin records with the reason for each, stops at the targets, writes `data/data.js`, refreshes the data version in `index.html`, the README counts and the sitemap date, and prints what is still short. If something is short, research more and run `apply` again with the new files; it adds to the same day. Stop after three rounds or when the sources are exhausted.

```
python3 buna_daily.py verify --site ~/bunaindex --date YYYY-MM-DD    # must say OK
```

### 3. Spreadsheet

`apply` writes `out/YYYY-MM-DD/additions.csv` (one row per record, including the private columns) and `out/YYYY-MM-DD/master_rows.json` (the same records laid out for the master workbook's Global Listings, Business Development and Importer Coverage tabs).

- **If Google Sheets editing tools are connected** and Drive holds a native Google Sheet whose title contains "Buna Index Master": append the rows from `master_rows.json` to the matching tabs, below the last filled row, in chunks of about 25 rows, then read the tab back and confirm the row count grew by the right amount. Add one line to the Audit Notes tab: date, counts added, shortfalls.
- **Otherwise**: in Google Drive, find the folder "Buna Index daily additions" (create it if missing) and create a Google Sheet in it named `Buna Index additions YYYY-MM-DD` by uploading the text of `additions.csv` as `text/csv` (read the file and pass its exact text). Then download the new sheet as `text/csv` and compare it cell by cell with `additions.csv` in Python; it must match. If a sheet with that name already exists from an earlier attempt today, create `... (2)` rather than deleting anything.
- Never trash or overwrite a Drive file. Never put a Drive link in this repository.

### 4. Publish

```
cd ~/bunaindex && git add -A && git commit -m "Daily update YYYY-MM-DD: +N coffees, +N cafés, +N importers" && git fetch origin main && git rebase origin/main && git push origin HEAD:main
cd ~/buna-tooling && python3 buna_daily.py log --date YYYY-MM-DD --metros "Boise, ID; Tulsa, OK" --roasters "Name; Name" --importer-sources "source; source" --sheet created
git add ledger.json && git commit -m "Ledger YYYY-MM-DD" && git push origin tooling
```

Only `data/data.js`, `index.html`, `README.md` and `sitemap.xml` should change on `main`. If anything else shows in `git status`, stop and report. If the rebase reports a conflict (the list sync pushed at the same moment), run `git rebase --abort`, `git reset --hard origin/main`, run `apply` again on the same batch files and push again.

Before pushing, serve the folder (`python3 -m http.server 8765`) and load `index.html#finder` and `index.html#directory` with Playwright (Chromium is preinstalled): there must be no page errors and the directory must show the new business count. If that fails, do not push; `git checkout .` and report. Log every metro that was researched and every roaster whose shop was visited, including ones that yielded nothing, so tomorrow moves on.

After pushing, wait two minutes and fetch `https://bunaindex.com/README.md?v=<short commit hash>` (the query string avoids a cached copy): it should show the new counts. If it does not after ten minutes, report that the push succeeded but the site had not refreshed.

### 5. Report

Finish with a short report: how many of each were added against the target, the new index totals, what was short and why, how many candidates were rejected and the main reasons, where the spreadsheet rows went, and anything that needs the owner's decision.

## Record format

One JSON object per file, with any of the three lists. Leave out fields that were not found; do not write "unknown" or "N/A".

```json
{
  "cafes": [{
    "name": "Slow by Slow Coffee",
    "type": "cafe",
    "city": "Boise", "st": "ID",
    "addr": "405 S 8th St Suite 155, Boise, ID 83702",
    "web": "https://www.slowbyslow.com/",
    "phone": "208-555-0100",
    "contact_url": "https://www.slowbyslow.com/contact",
    "location_source": "https://www.slowbyslow.com/",
    "specialty_evidence": "Multi-roaster bar serving a rotating list of named roasters; menu page lists current coffees",
    "independence_evidence": "Single location, owner-operated per its About page",
    "email": "public address shown on its own site, if any",
    "opportunity": "One short sentence for the spreadsheet only, an inference about how Ethi CO might work with them"
  }],
  "importers": [{
    "name": "Example Coffee Imports",
    "city": "Oakland", "st": "CA",
    "addr": "street address if published",
    "web": "https://example.com",
    "phone": "", "contact_url": "", "location_source": "page that shows the US address",
    "catalog_url": "public offer list or origins page",
    "origins": "Ethiopia; Kenya",
    "evidence": "What shows it imports or sells green coffee to US roasters, and where that is published",
    "wholesale": true, "samples": true,
    "email": "", "opportunity": ""
  }],
  "coffees": [{
    "roaster": "Name exactly as on the index",
    "name": "Ethiopia Danche",
    "url": "https://roaster.com/products/ethiopia-danche",
    "origin": "Ethiopia",
    "region": "Gedeb, Yirgacheffe", "station": "Danche", "producer": "Smallholders via Snap Coffee",
    "process": "Washed", "variety": "74110, 74112", "elevation": "2100",
    "roast": "Light",
    "tasting_notes": "jasmine, peach, lemon",
    "price": 26.0, "size": "12 oz",
    "score": 88.5, "decaf": "", "certs": ["Organic"],
    "availability": "avail",
    "quality_evidence": "Single washing-station lot with producer and variety named on the product page"
  }]
}
```

- `type` for a café is `cafe`, or `roaster_cafe` if it roasts its own coffee.
- For a seller not yet on the index, `roaster` is an object: `{"name": "...", "city": "...", "st": "..", "web": "https://...", "type": "roaster"}`.
- `origin` is a country name, or `Blend`. `roast` is one of Light, Light-medium, Medium, Medium-dark, Dark; leave it out if the roaster does not say.
- `decaf` is one of Swiss Water, Sugarcane (EA), Mountain Water, Methylene chloride, CO2, or Decaf. `certs` may contain Organic, Fair Trade, Women-produced, Bird Friendly, Rainforest Alliance.
- `price` is the listed price in US dollars for the `size` given.
- Map points are city reference points assigned by the tool. Do not supply coordinates.

## What the tool will not do

It does not judge quality beyond the checks above, and it cannot tell whether a page was really opened. The researcher is responsible for that. When in doubt, leave the record out.
