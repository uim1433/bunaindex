#!/usr/bin/env python3
"""Buna Index: bring the public site in line with the master list.

    python3 tools/sync.py --list /path/to/master.xlsx            # update data/data.js in place
    python3 tools/sync.py --list /path/to/master.xlsx --dry-run  # report only, write nothing
    python3 tools/sync.py --bootstrap --list master.xlsx         # (one time) record the list as already reconciled

The site keeps what it already knows about a record. A run only
  * removes records that have left the list,
  * adds records that are new to the list (after the cleanup rules below),
  * refreshes status, date and price on records whose list row changed.

Cleanup rules applied to every new row (the list itself is not edited here):
  blank rows are skipped; chain and marketplace rows stay off the site; only coffee is listed
  (cacao, equipment, packaging, service add-ons, gift cards, mixed pallets and sampler packs are skipped);
  a $0 or $1 placeholder page is not a listing; the same contract repeated on several importer pages is
  recorded once; a catalog reference is skipped when the same seller already has that coffee as a listing.
  A listing with no known quantity or price stays: readers can ask the seller.

Records added by the daily update (tools branch `tooling`, buna_daily.py) carry an added date ("ad") and are
not on the list yet. They are left alone: never removed for being absent from the list, and a list row that
repeats one of them (same seller and coffee name, or same product page) is not added a second time.

Only the public columns named in this file are read. Email addresses are never written to the public data.
State lives in tools/state.json (what has been seen and why a row is off the site) and
tools/cities.json (city reference points for the map).
"""
import argparse, datetime, hashlib, html, json, os, re, sys, unicodedata
from collections import Counter, defaultdict

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data', 'data.js')
STATE = os.path.join(HERE, 'state.json')
CITIES = os.path.join(HERE, 'cities.json')
PREFIX = 'window.BUNA_DATA='

# ----------------------------------------------------------------------------- small helpers
def blank(v):
    return v is None or (isinstance(v, str) and v.strip() == '')

def clean(v):
    if blank(v):
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v
    if isinstance(v, float) and v == int(v):
        v = int(v)
    s = html.unescape(str(v)).replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip() or None

def fold(s):
    s = unicodedata.normalize('NFKD', str(s or ''))
    return ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()

def nk(s):
    """Name key: accent-free, lower-case, letters and digits only."""
    return re.sub(r'[^a-z0-9]+', '', fold(s).replace('&', 'and'))

def words(s):
    return re.sub(r'[^a-z0-9]+', ' ', fold(s)).strip()

def date_str(v):
    if blank(v):
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, (int, float)) or re.fullmatch(r'\d{5}(\.\d+)?', str(v).strip()):
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(v)))).strftime('%Y-%m-%d')
    m = re.match(r'(\d{4}-\d{2}-\d{2})', str(v))
    return m.group(1) if m else None

def num(v):
    if blank(v):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r'-?\d[\d,]*\.?\d*', str(v))
    return float(m.group(0).replace(',', '')) if m else None

def first_url(v):
    v = clean(v)
    if not v:
        return None
    u = re.split(r'\s*;\s*|\s+', str(v))[0]
    if not re.match(r'^https?://', u):
        if not re.match(r'^[\w.-]+\.[a-z]{2,}(/|$)', u):
            return None
        u = 'https://' + u
    return u

def site_root(u):
    """A product or collection link stands in for the business: keep only the site address."""
    u = first_url(u)
    if u and re.search(r'/(products?|collections?|shop|store|coffee|coffees)/', u + '/'):
        m = re.match(r'^(https?://[^/]+)', u)
        return m.group(1) if m else u
    return u

def sha(*parts):
    return hashlib.sha1('|'.join('' if blank(p) else str(clean(p)) for p in parts).encode('utf8')).hexdigest()[:8]

def key10(s):
    return hashlib.sha1(str(s).encode('utf8')).hexdigest()[:10]

def table(wb, name):
    if name not in wb.sheetnames:
        return []
    rows = list(wb[name].iter_rows(values_only=True))
    hdr = [str(h) if h is not None else '' for h in rows[0]]
    out = []
    for r in rows[1:]:
        if all(blank(v) for v in r):
            continue                    # blank rows are not records
        out.append(dict(zip(hdr, r)))
    return out

# ----------------------------------------------------------------------------- vocabularies
ORIGIN_NAMES = {  # extra spellings; the site's own origin names are added at run time
    'hawaii': 'USA', 'kona': 'USA', 'democratic republic of congo': 'COD', 'democratic republic of the congo': 'COD',
    'congo': 'COD', 'drc': 'COD', 'dr congo': 'COD', 'east timor': 'TLS', 'timor': 'TLS', 'sumatra': 'IDN', 'java': 'IDN',
    'sulawesi': 'IDN', 'bali': 'IDN', 'flores': 'IDN', 'png': 'PNG', 'yunnan': 'CHN', 'burma': 'MMR',
}
BLEND_WORDS = re.compile(r'\bblend\b|international|latin america|\bamericas\b|multiple|various|several', re.I)

def origin_of(country, name, O):
    """-> (origin id or None, inferred flag)."""
    names = dict(ORIGIN_NAMES)
    for oid, o in O.items():
        names[fold(o['n'])] = oid
        names[fold(o['n']).replace(' (usa)', '')] = oid
    c = fold(clean(country) or '')
    if c and c not in ('not specified', 'not supplied', 'unknown'):
        if BLEND_WORDS.search(c):
            return 'BLEND', 0
        hits = sorted({oid for nm, oid in names.items() if re.search(r'\b' + re.escape(nm) + r'\b', c)})
        if len(hits) == 1:
            return hits[0], 0
        if len(hits) > 1:
            return 'BLEND', 0
    n = fold(name or '')
    hits = sorted({oid for nm, oid in names.items() if len(nm) > 3 and nm not in ('java', 'bali', 'timor', 'congo') and re.search(r'\b' + re.escape(nm) + r'\b', n)})
    hits += [oid for stem, oid in (('ethiopia', 'ETH'), ('colombia', 'COL'), ('guatemala', 'GTM'), ('kenya', 'KEN')) if stem in n and oid not in hits]
    hits = sorted(set(hits))
    if re.search(r'\bblend\b', n) or len(hits) > 1:
        return 'BLEND', 1
    if len(hits) == 1:
        return hits[0], 1
    return None, 0

def status_of(v):
    a = fold(clean(v) or '')
    if 'reference' in a:
        return 'ref'
    if 'sold' in a or 'unavailable' in a or 'out of stock' in a:
        return 'sold'
    if 'historical' in a:
        return 'seen'
    if 'uncertain' in a or 'not established' in a or 'unknown' in a or 'afloat' in a or 'forward' in a:
        return 'unc'
    if 'available' in a or 'listed for sale' in a or 'in stock' in a or 'spot' in a:
        return 'avail'
    return 'unc'

def process_of(v):
    p = fold(clean(v) or '')
    if not p or p in ('not specified', 'unknown'):
        return None
    if re.search(r'anaerobic|carbonic|ferment(?!ed$)|thermal shock|malolactic|inoculated|co-?ferment', p) and 'centrally fermented' not in p:
        return 'Anaerobic & experimental'
    if 'monsoon' in p:
        return 'Monsooned'
    if re.search(r'wet.?hulled|semi.?washed|giling', p):
        return 'Wet-hulled'
    if 'honey' in p or 'pulped natural' in p:
        return 'Honey'
    if 'washed' in p and ('natural' in p or 'sun dried' in p):
        return 'Washed & natural'
    if 'washed' in p:
        return 'Washed'
    if 'natural' in p or 'dry process' in p or 'sun dried' in p:
        return 'Natural'
    return 'Other'

def process_from_name(name):
    n = fold(name or '')
    for label, rx in (('Anaerobic & experimental', r'anaerobic|carbonic'), ('Monsooned', r'monsoon'), ('Honey', r'\bhoney\b'),
                      ('Wet-hulled', r'wet.?hulled|semi.?washed'), ('Washed', r'\bwashed\b'), ('Natural', r'\bnatural\b')):
        if re.search(rx, n):
            return label
    return None

def roast_of(v):
    r = fold(clean(v) or '')
    if not r:
        return None
    if re.search(r'ultra ?light|moderate light|^light( \(selected\))?$', r):
        return 'Light'
    if re.search(r'light.?medium|medium.?light|light/medium', r):
        return 'Light-medium'
    if re.search(r'medium.?dark|full city|vienna', r):
        return 'Medium-dark'
    if re.search(r'dark|french|italian', r):
        return 'Dark'
    if r.startswith('medium'):
        return 'Medium'
    return None

LB = {'lb': 1.0, 'lbs': 1.0, 'pound': 1.0, 'pounds': 1.0, 'oz': 1 / 16, 'ounce': 1 / 16, 'ounces': 1 / 16,
      'kg': 2.20462, 'kgs': 2.20462, 'kilo': 2.20462, 'g': 0.00220462, 'gram': 0.00220462, 'grams': 0.00220462}

def pounds(text, exact=False):
    """'12 oz / Whole Bean' -> 0.75, '250 grams' -> 0.551, '100 lb' -> 100. None when no weight is stated."""
    m = re.search(r'(\d+(?:\.\d+)?)\s*-?\s*(lbs?|pounds?|oz|ounces?|kgs?|kilo|grams?|g)\b', fold(text or ''))
    if not m:
        return None
    v = float(m.group(1)) * LB[m.group(2)]
    return v if exact else round(v, 3)

def tidy(lb):
    lb = round(lb, 1) if lb > 10 else round(lb, 3)
    return int(lb) if lb == int(lb) else lb

def tiers(detail):
    """'1 LB: $12.31 (available); 5 LB: $58.47 (available)' -> [[1, 12.31], [5, 58.47]]."""
    out = []
    for part in re.split(r'\s*;\s*', str(detail or '')):
        m = re.match(r'(.+?):\s*\$([\d,]+(?:\.\d+)?)\s*\((available|unavailable)\)', part.strip())
        if not m:
            continue
        lb = pounds(m.group(1), exact=True)
        price = float(m.group(2).replace(',', ''))
        if lb and price > 1:
            out.append([tidy(lb), price])
    seen, uniq = set(), []
    for lb, price in sorted(out):
        if lb not in seen:
            seen.add(lb)
            uniq.append([lb, price])
    return uniq

def type_of(v):
    """Business type text -> (site type, 'type not verified' flag)."""
    t = fold(clean(v) or '')
    if 'classification unverified' in t:
        return 'roaster', 1
    if re.search(r'importer|green coffee supplier|green importer', t):
        return 'importer', 0
    if 'exporter' in t:
        return 'exporter', 0
    shop = re.search(r'caf[e]|coffee ?shop|coffeehouse|tasting room|espresso bar', t)
    if 'roast' in t and shop:
        return 'roaster_cafe', 0
    if shop:
        return 'cafe', 0
    return 'roaster', 0 if 'roast' in t else 1

# ----------------------------------------------------------------------------- cleanup rules for new rows
NOT_COFFEE = re.compile(
    r'\bcacao\b|\bcocoa beans?\b|\bjute\b|burlap|pick ?up in ?store|store pickup|pickup instore|fresh roast sr ?\d|'
    r'roast level (&|and) grind|gift ?card|e-?gift|\bsubscription\b|\bmug\b|\btumbler\b|t-?shirt|\bhoodie\b|\btote\b|'
    r'\bgrinder for\b|\bkettle\b|\bdripper\b|paper filters?|sampler pack|sample pack|^multi[- ]origin$|^steve\'s favorites', re.I)
SHELL = re.compile(r'^Default Title: \$[01]\.00 \((un)?available\)$')

def page_key(url):
    """Importer sites repeat one contract on pages that differ only by a trailing -2, -3 ..."""
    u = (first_url(url) or '').rstrip('/')
    return re.sub(r'(-\d+)-\d+$', r'\1', u) if re.search(r'-\d+-\d+$', u) else u

# ----------------------------------------------------------------------------- list rows
G_PUBLIC = ['Record ID', 'Company', 'Origin country', 'Origin region', 'Coffee / lot', 'Availability', 'Checked date', 'US city',
            'US state', 'Business type', 'Process', 'Variety', 'Roast', 'Package size', 'Price (USD)', 'Published price detail',
            'Listing URL', 'Location source']
L_PUBLIC = ['ID', 'Type', 'Company', 'Coffee Name', 'Region / Zone', 'Washing Station / Site', 'Producer / Cooperative', 'Process',
            'Variety', 'Grade', 'Roast Level', 'Tasting Notes', 'Size', 'Size (lb)', 'Price (USD)', 'Listing URL', 'Audit Date']
B_PUBLIC = ['Company', 'US city', 'US state', 'Business type', 'Website', 'Public email', 'Public phone', 'Contact source',
            'Location source', 'Checked date', 'Public visit evidence', 'Visit address']

def list_rows(wb):
    """All listing rows keyed by id, reduced to public columns plus the two fields the rules need."""
    rows = {}
    for r in table(wb, 'Global Listings'):
        rid = clean(r.get('Record ID'))
        if not rid:
            continue
        row = {k: r.get(k) for k in G_PUBLIC}
        row['_chain'] = 'exclusion retained' in str(r.get('Notes') or '')
        row['_stock'] = ' '.join(re.findall(r'(?:stock|bags|status|Contract)[^.;]*', str(r.get('Notes') or '')))  # structured facts only
        row['_src'] = 'G'
        rows[str(rid)] = row
    for r in table(wb, 'Listings'):
        if blank(r.get('ID')):
            continue
        row = {k: r.get(k) for k in L_PUBLIC}
        row['_src'] = 'L'
        row['_chain'] = False
        rows['L' + str(clean(r['ID']))] = row
    return rows

def row_hash(row):
    if row['_src'] == 'G':
        return sha(*[row.get(k) for k in G_PUBLIC[1:]])
    return sha(*[row.get(k) for k in L_PUBLIC[1:]])

def company_of(row):
    return clean(row.get('Company'))

def lot_name(row):
    return clean(row.get('Coffee / lot') if row['_src'] == 'G' else row.get('Coffee Name'))

# ----------------------------------------------------------------------------- record builders
def build_coffee(rid, row, cidx, ctype, O):
    name = lot_name(row)
    c = {'id': rid, 'n': str(name), 'c': cidx}
    if row['_src'] == 'G':
        bt = fold(row.get('Business type') or '')
        if bt in ('roasted', 'roasted coffee'):
            k = 'r'
        elif bt in ('green', 'green coffee'):
            k = 'g'
        else:
            k = 'g' if ctype in ('importer', 'exporter') else 'r'
        if re.match(r'roasted\b', fold(name)):
            k = 'r'
        c['k'] = k
        c['s'] = status_of(row.get('Availability'))
        o, oi = origin_of(row.get('Origin country'), name, O)
        region = clean(row.get('Origin region'))
        proc, roast, variety = row.get('Process'), row.get('Roast'), row.get('Variety')
        size, price, detail = clean(row.get('Package size')), num(row.get('Price (USD)')), row.get('Published price detail')
        ch = date_str(row.get('Checked date'))
        url = first_url(row.get('Listing URL'))
    else:
        c['k'] = 'g' if fold(row.get('Type') or '') == 'green' else 'r'
        c['s'] = 'seen'
        o, oi = 'ETH', 0                # the first audit covered Ethiopian coffee only
        region = clean(row.get('Region / Zone'))
        proc, roast, variety = row.get('Process'), row.get('Roast Level'), row.get('Variety')
        size, price, detail = clean(row.get('Size')), num(row.get('Price (USD)')), None
        ch = date_str(row.get('Audit Date'))
        url = first_url(row.get('Listing URL'))
        for src, dst in (('Washing Station / Site', 'ws'), ('Producer / Cooperative', 'pd'), ('Tasting Notes', 'tn')):
            if clean(row.get(src)):
                c[dst] = str(clean(row.get(src)))
    if o:
        c['o'] = o
        if oi:
            c['oi'] = 1
    if region and fold(region) in ('not specified', 'region not specified', 'not supplied', 'various'):
        region = None
    if region:
        c['rr'] = str(region)
    if o in O:
        def named(text):
            w = ' ' + words(text) + ' '
            return [r['n'] for r in O[o]['rg'] if any(len(words(part)) >= 4 and ' ' + words(part) + ' ' in w for part in re.split(r'[/,&]| and ', r['n']))]
        hit = named(region) if region else []
        if hit:
            c['rg'] = hit[:4]
        else:
            hit = named(name)
            if hit:
                c['rg'], c['ri'] = hit[:4], 1
    p = process_of(proc)
    if p:
        c['p'] = p
    else:
        p = process_from_name(name)
        if p:
            c['p'], c['pi'] = p, 1
    r = roast_of(roast)
    if r and c['k'] == 'r':
        c['ro'] = r
    if clean(variety):
        c['v'] = str(clean(variety))
    if re.search(r'\bdecaf|swiss water|\bswp\b|\bmwp\b|mountain water|sugarcane ea\b', fold(name)):
        c['d'] = 'Decaf'
    if ch:
        c['ch'] = ch
    if url:
        c['u'] = url
    price_fields(c, size, price, detail)
    return c

def price_fields(c, size, price, detail):
    for k in ('pr', 'sz', 'lb', 'ppl', 'tr', 'pps', 'mlb', 'up', 'bagkg'):
        c.pop(k, None)
    lb = pounds(size, exact=True)
    if c['k'] == 'r':
        if size:
            c['sz'] = str(size)
        if lb:
            c['lb'] = round(lb, 3)
        if price and price > 1:
            c['pr'] = round(price, 2)
            if lb:
                c['ppl'] = round(price / lb, 2)
        return
    tr = tiers(detail)
    if not tr and price and price > 1 and lb:
        tr = [[tidy(lb), round(price, 2)]]
    if tr:                               # published prices by pack size
        c['tr'] = tr
        c['mlb'] = tr[0][0]
        c['pps'] = round(tr[0][1] / tr[0][0], 2)
        c['ppl'] = round(min(p / l for l, p in tr), 2)
    elif price and price > 1:            # a unit price with no stated weight
        c['up'] = round(price, 2)
        if size:
            c['sz'] = str(size)
    elif lb:                             # no published price: the seller quotes on request
        m = re.search(r'(\d+(?:\.\d+)?)\s*kg', fold(size))
        if m:
            c['bagkg'] = tidy(float(m.group(1)))
        c['mlb'] = tidy(lb)
    elif size:
        c['sz'] = str(size)

def build_company(name, b, extra, cities, emails):
    """b: Business Development row (may be None); extra: dict with Companies / Importer Coverage facts."""
    b = b or {}
    t, tu = type_of(b.get('Business type') or extra.get('type'))
    co = {'n': str(name), 't': t}
    if tu:
        co['tu'] = 1
    city, st = clean(b.get('US city') or extra.get('city')), clean(b.get('US state') or extra.get('st'))
    if city and st and re.fullmatch(r'[A-Z]{2}', str(st)):
        co['city'], co['st'] = str(city).split(',')[0].strip(), str(st)
    web = site_root(b.get('Website') or extra.get('web'))
    if web:
        co['web'] = web
    cu = first_url(b.get('Contact source'))
    if cu:
        co['cu'] = cu
    lu = first_url(b.get('Location source') or extra.get('lu'))
    if lu:
        co['lu'] = lu
    if clean(b.get('Public phone')):
        co['ph'] = str(clean(b.get('Public phone')))
    if clean(b.get('Public email')):
        if emails:
            co['em'] = str(clean(b.get('Public email')))
        else:
            co['he'] = 1                # an address is on file; it is not published
    if clean(b.get('Visit address')):
        co['addr'] = str(clean(b.get('Visit address')))
    if fold(b.get('Public visit evidence') or '') in ('public access supported', 'cafe location documented'):
        co['visit'] = 1
    chk = date_str(b.get('Checked date') or extra.get('chk'))
    if chk:
        co['chk'] = chk
    for k in ('ws', 'pl', 'sm', 'cat', 'cap', 'capnote', 'imp70'):
        if extra.get(k) not in (None, ''):
            co[k] = extra[k]
    place(co, cities)
    return co

def place(co, cities):
    if co.get('pt') or not co.get('city') or not co.get('st'):
        return
    pt = cities.get(co['city'] + ', ' + co['st'])
    if pt:
        co['pt'], co['pb'] = pt, 'city'  # a city reference point, never a guessed street address

# ----------------------------------------------------------------------------- io
def load_site(path):
    raw = open(path, encoding='utf8').read()
    assert raw.startswith(PREFIX), 'unexpected data file'
    body = raw[len(PREFIX):].rstrip()
    tail = ';' if body.endswith(';') else ''
    return json.loads(body.rstrip(';')), tail

def save_site(path, D, tail):
    open(path, 'w', encoding='utf8').write(PREFIX + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + tail)

def roster(wb):
    """Businesses on the list: name key -> (name, Business Development row or None, extra facts)."""
    out = {}
    for b in table(wb, 'Business Development'):
        name = clean(b.get('Company'))
        if name:
            out[nk(name)] = [str(name), {k: b.get(k) for k in B_PUBLIC}, {}]
    for c in table(wb, 'Companies'):
        name = clean(c.get('Company'))
        if not name:
            continue
        e = {}
        for col, k in (('Wholesale program', 'ws'), ('Private label / white label', 'pl'), ('Free samples', 'sm')):
            if fold(c.get(col) or '').startswith('yes'):
                e[k] = 1
        if nk(name) in out:
            out[nk(name)][2].update(e)
        else:
            e.update({'type': c.get('Type'), 'city': c.get('City'), 'st': c.get('State'), 'web': c.get('Website')})
            out[nk(name)] = [str(name), None, e]
    for i in table(wb, 'Importer Coverage'):
        name = clean(i.get('Importer'))
        if not name:
            continue
        cap = int(num(i.get('Captured coffee records')) or 0)
        e = {'imp70': 1, 'cap': cap, 'cat': first_url(i.get('Catalog source')),
             'capnote': 'Catalog captured from public pages; completeness not certified' if cap else
                        'Catalog link only; listings sit behind an account, a quote or a page that could not be read'}
        if nk(name) in out:
            out[nk(name)][2].update(e)
        else:
            e.update({'type': 'Coffee importer', 'city': i.get('US city'), 'st': i.get('State'), 'web': i.get('Website'),
                      'lu': i.get('Location source'), 'chk': i.get('Checked date')})
            out[nk(name)] = [str(name), None, e]
    return out

def bhash(entry):
    name, b, extra = entry
    return sha(name, *[(b or {}).get(k) for k in B_PUBLIC[1:]], json.dumps({k: extra[k] for k in sorted(extra) if k in ('ws', 'pl', 'sm', 'cat')}, sort_keys=True))

# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', required=True, help='the master list workbook (.xlsx)')
    ap.add_argument('--data', default=DATA)
    ap.add_argument('--state', default=STATE)
    ap.add_argument('--cities', default=CITIES)
    ap.add_argument('--date', default=datetime.date.today().isoformat(), help='the date this build is made')
    ap.add_argument('--asof', help='the date of the list (defaults to the newest check date in it)')
    ap.add_argument('--emails', action='store_true', help='private preview build only: keep published email addresses')
    ap.add_argument('--bootstrap', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--skip', action='append', default=[], help='record id of a list row to keep off the site (repeatable)')
    ap.add_argument('--skip-business', action='append', default=[], help='business name, as written in the list, to keep off the site (repeatable)')
    ap.add_argument('--force', action='store_true', help='accept a run that removes more than 15 percent of the listings')
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.list, read_only=True, data_only=True)
    rows = list_rows(wb)
    ros = roster(wb)
    D, tail = load_site(a.data)
    co, cf, O = D['companies'], D['coffees'], {o['id']: o for o in D['origins']}
    cities = json.load(open(a.cities, encoding='utf8')) if os.path.exists(a.cities) else {}
    for c in co:                         # every city already on the map is a known reference point
        if c.get('pt') and c.get('pb') == 'city' and c.get('city') and c.get('st'):
            cities.setdefault(c['city'] + ', ' + c['st'], c['pt'])

    if a.bootstrap:
        on = {c['id'] for c in cf}
        alias = {}
        by_id = {c['id']: c for c in cf}
        for rid, row in rows.items():
            if rid in on and company_of(row) and nk(company_of(row)) != nk(co[by_id[rid]['c']]['n']):
                alias[nk(company_of(row))] = co[by_id[rid]['c']]['n']
        names = {nk(c['n']) for c in co} | set(alias)
        st = {'note': 'Written by tools/sync.py. rows: list rows on the site and the fingerprint they had when last read. '
                      'off: list rows kept off the site and why. Keys are short hashes of the record id or business name.',
              'rows': {key10(r): row_hash(rows[r]) for r in rows if r in on},
              'off': {key10(r): ('chain' if rows[r]['_chain'] else 'before') for r in rows if r not in on},
              'biz': {key10(k): bhash(v) for k, v in ros.items() if k in names},
              'bizoff': {key10(k): 'before' for k in ros if k not in names},
              'alias': alias}
        json.dump(st, open(a.state, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        json.dump(dict(sorted(cities.items())), open(a.cities, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
        print(json.dumps({'bootstrap': True, 'rows_on_site': len(st['rows']), 'rows_off': len(st['off']), 'businesses': len(st['biz']),
                          'businesses_off': len(st['bizoff']), 'aliases': len(alias), 'cities': len(cities)}))
        return

    st = json.load(open(a.state, encoding='utf8'))
    alias = st.get('alias', {})
    rep = {'removed': [], 'added': [], 'updated': [], 'skipped': Counter(), 'businesses_added': [], 'businesses_removed': [],
           'businesses_updated': [], 'unmapped_cities': [], 'notes': []}
    if len(rows) < 0.8 * (len(st['rows']) + len(st['off'])):
        sys.exit('The list has far fewer rows than last time (%d against %d). Nothing was changed; check the workbook.'
                 % (len(rows), len(st['rows']) + len(st['off'])))
    if len(ros) < 0.8 * (len(st['biz']) + len(st['bizoff'])):
        sys.exit('The list has far fewer businesses than last time (%d against %d). Nothing was changed; check the workbook.'
                 % (len(ros), len(st['biz']) + len(st['bizoff'])))

    def site_key(name):
        return nk(alias.get(nk(name), name))
    for rid in a.skip:
        st['off'][key10(rid)] = 'manual'
        st['rows'].pop(key10(rid), None)
    for name in a.skip_business:
        st['bizoff'][key10(nk(name))] = 'manual'
        st['biz'].pop(key10(nk(name)), None)

    # ---- businesses: index, add the new ones
    idx = {nk(c['n']): i for i, c in enumerate(co)}
    off_idx = set()
    for k, entry in sorted(ros.items()):
        h = bhash(entry)
        if key10(k) in st['bizoff']:
            if site_key(entry[0]) in idx:
                off_idx.add(idx[site_key(entry[0])])
            continue
        if site_key(entry[0]) in idx:
            i = idx[site_key(entry[0])]
            old = st['biz'].get(key10(k))
            if old and old != h and entry[1]:
                fresh = build_company(co[i]['n'], entry[1], entry[2], cities, a.emails)
                for f in ('city', 'st', 'web', 'cu', 'lu', 'ph', 'em', 'he', 'addr', 'visit', 'chk', 'ws', 'pl', 'sm', 'cat', 'cap', 'capnote'):
                    if f in fresh:
                        co[i][f] = fresh[f]
                if co[i].get('pb') == 'city' or not co[i].get('pt'):
                    co[i].pop('pt', None); co[i].pop('pb', None)
                    place(co[i], cities)
                rep['businesses_updated'].append(co[i]['n'])
            st['biz'][key10(k)] = h
            continue
        new = build_company(entry[0], entry[1], entry[2], cities, a.emails)
        co.append(new)
        idx[nk(new['n'])] = len(co) - 1
        st['biz'][key10(k)] = h
        rep['businesses_added'].append(new['n'])

    # ---- listings: remove what left the list, refresh what changed
    by_id = {c['id']: c for c in cf}
    keep = []
    for c in cf:
        row = rows.get(c['id'])
        if row is None and c.get('ad') and c['c'] not in off_idx:
            keep.append(c)               # added by the daily update; not on the list yet
            continue
        if row is None or row['_chain'] or key10(c['id']) in st['off'] or c['c'] in off_idx:
            rep['removed'].append([c['id'], c['n'], co[c['c']]['n']])
            st['rows'].pop(key10(c['id']), None)
            if row is not None:
                st['off'].setdefault(key10(c['id']), 'chain')
            continue
        h = row_hash(row)
        if st['rows'].get(key10(c['id'])) not in (None, h):
            fresh = build_coffee(c['id'], row, c['c'], co[c['c']]['t'], O)
            for f in ('s', 'ch', 'u'):
                if f in fresh:
                    c[f] = fresh[f]
            had_price = any(k in c for k in ('pr', 'ppl', 'tr', 'up'))
            if any(k in fresh for k in ('pr', 'ppl', 'tr', 'up')) or not had_price:
                for k in ('pr', 'sz', 'lb', 'ppl', 'tr', 'pps', 'mlb', 'up'):
                    c.pop(k, None)
                    if k in fresh:
                        c[k] = fresh[k]
            rep['updated'].append([c['id'], c['n']])
        st['rows'][key10(c['id'])] = h
        keep.append(c)
    if len(rep['removed']) > 0.15 * len(cf) and not a.force:
        sys.exit('%d of %d listings would leave the site in one run. Nothing was changed; check the workbook, or pass --force if the list really shrank.'
                 % (len(rep['removed']), len(cf)))
    cf = keep

    # ---- listings: add what is new, after the cleanup rules
    listed_names = defaultdict(set)      # business -> names of verified listings
    dup_keys = set()
    daily = set()                        # (seller, coffee name) and product pages already added by the daily update
    for c in cf:
        row = rows.get(c['id'])
        if c['s'] != 'ref':
            listed_names[c['c']].add(words(c['n']))
        if row is None:
            daily.add((c['c'], words(c['n'])))
            if c.get('u'):
                daily.add(c['u'].split('?')[0].rstrip('/').lower().replace('://www.', '://'))
            continue
        if row['_src'] == 'G':
            dup_keys.add((nk(company_of(row)), words(lot_name(row)), page_key(row.get('Listing URL')), row['_stock'], str(clean(row.get('Package size')))))
    for rid, row in rows.items():
        if rid in by_id or key10(rid) in st['off']:
            continue
        name, company = lot_name(row), company_of(row)
        why = None
        if not name or not company:
            why = 'empty'
        elif row['_chain']:
            why = 'chain'
        elif NOT_COFFEE.search(str(name)):
            why = 'notcoffee'
        elif row['_src'] == 'G' and SHELL.match(str(clean(row.get('Published price detail')) or '')):
            why = 'shell'
        dk = (nk(company), words(name), page_key(row.get('Listing URL')), row.get('_stock'), str(clean(row.get('Package size')))) if row['_src'] == 'G' else None
        if not why and dk in dup_keys and re.search(r'-\d+/?$', (first_url(row.get('Listing URL')) or '')):
            why = 'duppage'
        if not why and key10(nk(company)) in st['bizoff']:
            why = 'chain'
        ci = idx.get(site_key(company)) if company else None
        if not why and ci is not None and row['_src'] == 'G' and status_of(row.get('Availability')) == 'ref' and words(name) in listed_names[ci]:
            why = 'refdup'
        if not why and daily:
            u = (first_url(row.get('Listing URL')) or '').split('?')[0].rstrip('/').lower().replace('://www.', '://')
            if (ci is not None and (ci, words(name)) in daily) or (u and u in daily and re.search(r'/products?/', u)):
                why = 'daily'
        if why:
            st['off'][key10(rid)] = why
            rep['skipped'][why] += 1
            continue
        if ci is None:                   # a seller that is not on the business list yet: record what the listing row says
            new = build_company(company, None, {'type': row.get('Business type') if fold(row.get('Business type') or '') not in ('roasted', 'green') else 'roaster',
                                                'city': row.get('US city'), 'st': row.get('US state'), 'web': row.get('Location source') or row.get('Listing URL'),
                                                'chk': row.get('Checked date')}, cities, a.emails)
            co.append(new)
            ci = idx[nk(new['n'])] = len(co) - 1
            rep['businesses_added'].append(new['n'])
        c = build_coffee(rid, row, ci, co[ci]['t'], O)
        cf.append(c)
        by_id[rid] = c
        st['rows'][key10(rid)] = row_hash(row)
        if c['s'] != 'ref':
            listed_names[ci].add(words(c['n']))
        if dk:
            dup_keys.add(dk)
        rep['added'].append([rid, c['n'], co[ci]['n']])

    # ---- businesses that left the list (and sell nothing on the site) go too
    used = Counter(c['c'] for c in cf)
    on_list = {site_key(v[0]) for v in ros.values()}
    gone = [i for i, c in enumerate(co) if not used[i] and (nk(c['n']) not in on_list or i in off_idx) and not (c.get('ad') and i not in off_idx)]
    for i in gone:
        rep['businesses_removed'].append(co[i]['n'])
    if gone:
        shift, new_co = {}, []
        for i, c in enumerate(co):
            if i in gone:
                continue
            shift[i] = len(new_co)
            new_co.append(c)
        for c in cf:
            c['c'] = shift[c['c']]
        co = new_co
    for c in co:                         # a city added to tools/cities.json puts its businesses on the map
        place(c, cities)
    rep['unmapped_cities'] = sorted({c['city'] + ', ' + c['st'] for c in co if c.get('city') and c.get('st') and not c.get('pt')} - set(st.get('nomap', [])))

    # ---- totals
    asof = a.asof or max([c['ch'] for c in cf if c.get('ch')] + [c['chk'] for c in co if c.get('chk')])
    changed = bool(rep['removed'] or rep['added'] or rep['updated'] or rep['businesses_added'] or rep['businesses_removed'] or rep['businesses_updated'])
    cnt = D['meta']['counts']
    cnt.update({'coffees': len(cf), 'listed': sum(c['s'] != 'ref' for c in cf), 'refs': sum(c['s'] == 'ref' for c in cf),
                'companies': len(co), 'importers': sum(c['t'] == 'importer' for c in co),
                'roasters': sum(c['t'] in ('roaster', 'roaster_cafe') for c in co), 'cafes': sum(c['t'] in ('cafe', 'roaster_cafe') for c in co),
                'states': len({c['st'] for c in co if c.get('st')}), 'cities': len({(c['city'], c.get('st')) for c in co if c.get('city') and c.get('pt')})})
    D['companies'], D['coffees'] = co, cf
    assert all(0 <= c['c'] < len(co) for c in cf) and len({c['id'] for c in cf}) == len(cf)
    rep['skipped'] = dict(rep['skipped'])
    rep['totals'] = dict(cnt, asof=asof, changed=changed)
    if changed and not a.dry_run:
        D['meta']['built'], D['meta']['asof'] = a.date, asof
        save_site(a.data, D, tail)
        ver = hashlib.sha1(open(a.data, 'rb').read()).hexdigest()[:8]
        page = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(a.data))), 'index.html')
        if os.path.exists(page):
            s = open(page, encoding='utf8').read()
            s2 = re.sub(r'data/data\.js\?v=[0-9a-f]+', 'data/data.js?v=' + ver, s)
            if s2 != s:
                open(page, 'w', encoding='utf8').write(s2)
        readme = os.path.join(os.path.dirname(page), 'README.md')
        if os.path.exists(readme):
            s = open(readme, encoding='utf8').read()
            s = re.sub(r'- Index date: .*', '- Index date: %s. Coffees: %s. Businesses: %s.' % (asof, format(len(cf), ','), format(len(co), ',')), s)
            open(readme, 'w', encoding='utf8').write(s)
        sm = os.path.join(os.path.dirname(page), 'sitemap.xml')
        if os.path.exists(sm):
            s = open(sm, encoding='utf8').read()
            open(sm, 'w', encoding='utf8').write(re.sub(r'<lastmod>[^<]*</lastmod>', '<lastmod>%s</lastmod>' % a.date, s))
    if not a.dry_run:
        json.dump(st, open(a.state, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        json.dump(dict(sorted(cities.items())), open(a.cities, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    short = {k: (v if not isinstance(v, list) or len(v) <= 40 else v[:40] + ['... %d more' % (len(v) - 40)]) for k, v in rep.items()}
    short['counts'] = {k: len(v) for k, v in rep.items() if isinstance(v, list)}
    print(json.dumps(short, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
