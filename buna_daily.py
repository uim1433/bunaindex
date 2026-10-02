#!/usr/bin/env python3
"""Buna Index daily update tool.

Adds verified records (roasted coffees, independent specialty cafes, importers)
to the built site in the `main` branch of uim1433/bunaindex and writes the rows
for the spreadsheet. See README.md in this branch for the full runbook.

  python3 buna_daily.py plan   --site ../bunaindex --date 2026-10-02
  python3 buna_daily.py check  --site ../bunaindex "Business name" [--web URL]
  python3 buna_daily.py apply  --site ../bunaindex --date 2026-10-02 batch/*.json
  python3 buna_daily.py verify --site ../bunaindex
  python3 buna_daily.py log    --date 2026-10-02 --metros "Boise, ID; Tulsa, OK" --roasters "A; B"

Nothing in here talks to the network. Research is done by the session; this
tool only validates, removes duplicates, writes the site data and reports.
"""
import argparse, csv, datetime, glob, hashlib, json, os, re, sys, unicodedata
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = {'coffees': 50, 'cafes': 50, 'importers': 20}
PER_ROASTER_CAP = 5          # coffees from one roaster in one day
PREFIX = 'window.BUNA_DATA='

# ----------------------------------------------------------------------------
# text helpers
# ----------------------------------------------------------------------------
def fold(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').lower()

def light_key(name):
    """Name with case, accents, punctuation and legal suffixes removed."""
    s = fold(name).replace('&', ' and ')
    s = re.sub(r"[’'`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    words = [w for w in s.split() if w not in ('the', 'llc', 'inc', 'co', 'company', 'ltd', 'corp', 'corporation')]
    return ' '.join(words)

GENERIC = {'coffee', 'coffees', 'cafe', 'roasters', 'roaster', 'roasting', 'roastery', 'roasterie', 'espresso', 'bar',
           'and', 'tea', 'house', 'shop', 'coffeehouse', 'works', 'lab', 'imports', 'importers', 'import', 'importing',
           'trading', 'traders', 'green', 'collective', 'kitchen', 'bakery', 'specialty', 'craft'}

def heavy_key(name):
    """Name with generic trade words removed too ('Onyx Coffee Lab' -> 'onyx')."""
    words = [w for w in light_key(name).split() if w not in GENERIC]
    return ' '.join(words)

SHARED_HOSTS = ('instagram.com', 'facebook.com', 'linktr.ee', 'square.site', 'squareup.com', 'toasttab.com', 'yelp.com',
                'google.com', 'linkedin.com', 'wixsite.com', 'godaddysites.com', 'myshopify.com', 'weebly.com',
                'business.site', 'carrd.co', 'substack.com', 'etsy.com', 'faire.com', 'clover.com', 'order.online')

def domain(url):
    if not url:
        return ''
    u = url if re.match(r'^https?://', url, re.I) else 'https://' + url
    try:
        h = urlparse(u).hostname or ''
    except ValueError:
        return ''
    h = h.lower()
    return h[4:] if h.startswith('www.') else h

def dedupe_domain(url):
    """Domain usable as an identity. Shared hosts (Instagram, Square...) are not."""
    d = domain(url)
    if not d:
        return ''
    for h in SHARED_HOSTS:
        if d == h or d.endswith('.' + h):
            return ''
    return d

def norm_url(u):
    u = (u or '').strip()
    u = re.sub(r'[?#].*$', '', u)
    u = re.sub(r'^http://', 'https://', u, flags=re.I)
    u = re.sub(r'^https://www\.', 'https://', u, flags=re.I)
    return u.rstrip('/').lower()

def is_http(u):
    return isinstance(u, str) and re.match(r'^https?://[^\s/]+\.[^\s/]+', u) is not None

def slug(s, n=40):
    return re.sub(r'[^a-z0-9]+', '-', fold(s)).strip('-')[:n].strip('-')

def clean(s):
    return re.sub(r'\s+', ' ', str(s)).strip() if s is not None else ''

# ----------------------------------------------------------------------------
# site data
# ----------------------------------------------------------------------------
def data_path(site):
    return os.path.join(site, 'data', 'data.js')

def load_data(site):
    s = open(data_path(site), encoding='utf-8').read()
    if not s.startswith(PREFIX):
        sys.exit('data/data.js does not start with ' + PREFIX)
    return json.loads(s[len(PREFIX):].rstrip().rstrip(';'))

def dump_data(d):
    return PREFIX + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';'

def recount(d):
    C, K = d['companies'], d['coffees']
    listed = sum(1 for c in K if c['s'] != 'ref')
    return {
        'coffees': len(K), 'listed': listed, 'refs': len(K) - listed, 'companies': len(C),
        'origins': len(d['origins']), 'regions': sum(len(o['rg']) for o in d['origins']),
        'importers': sum(1 for c in C if c['t'] == 'importer'),
        'roasters': sum(1 for c in C if c['t'] in ('roaster', 'roaster_cafe')),
        'cafes': sum(1 for c in C if c['t'] in ('cafe', 'roaster_cafe')),
        'states': len({c['st'] for c in C if c.get('st')}),
        'cities': len({(c['city'], c.get('st')) for c in C if c.get('city') and c.get('pt')}),   # same rule as tools/sync.py
    }

def integrity(d):
    """Return a list of problems in the site data. Empty means sound."""
    bad = []
    C, K = d['companies'], d['coffees']
    oid = {o['id'] for o in d['origins']}
    reg = {o['id']: {r['n'] for r in o['rg']} for o in d['origins']}
    fam = {f[0] for f in d['meta']['families']}
    seen = set()
    for i, c in enumerate(C):
        if not c.get('n') or c.get('t') not in ('importer', 'roaster', 'roaster_cafe', 'cafe', 'exporter'):
            bad.append(f'company {i}: missing name or bad type')
        if 'pt' in c and not (isinstance(c['pt'], list) and len(c['pt']) == 2 and -180 <= c['pt'][0] <= -60 and 15 <= c['pt'][1] <= 72):
            bad.append(f'company {i} {c.get("n")}: map point outside the US')
    for i, k in enumerate(K):
        if k['id'] in seen:
            bad.append(f'coffee {i}: duplicate id {k["id"]}')
        seen.add(k['id'])
        if not isinstance(k.get('c'), int) or not 0 <= k['c'] < len(C):
            bad.append(f'coffee {k["id"]}: seller index out of range')
        if k.get('k') not in ('r', 'g') or k.get('s') not in ('avail', 'unc', 'sold', 'seen', 'ref'):
            bad.append(f'coffee {k["id"]}: bad kind or status')
        if k.get('o') and k['o'] != 'BLEND' and k['o'] not in oid:
            bad.append(f'coffee {k["id"]}: unknown origin {k["o"]}')
        for r in k.get('rg', []):
            if k.get('o') in reg and r not in reg[k['o']]:
                bad.append(f'coffee {k["id"]}: region {r} not on the atlas for {k["o"]}')
        for f in k.get('f', []):
            if f not in fam:
                bad.append(f'coffee {k["id"]}: unknown flavor family {f}')
    if d['meta']['counts'] != recount(d):
        bad.append('meta.counts does not match the records')
    return bad

# ----------------------------------------------------------------------------
# reference tables
# ----------------------------------------------------------------------------
STATES = {'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
          'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
          'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'}

# Large chains, franchises and multinational-owned brands. Never added.
CHAINS = ['starbucks', 'dunkin', 'dutch bros', 'caribou', 'peets', 'peet s', 'coffee bean and tea leaf', 'tim hortons',
          'scooters', 'scooter s', 'biggby', 'ziggis', 'ziggi s', 'dazbog', 'pjs coffee', 'pj s coffee', 'black rifle',
          '7 brew', 'seven brew', 'human bean', 'philz', 'blue bottle', 'la colombe', 'stumptown', 'intelligentsia',
          'gregorys', 'gregory s', 'joe and the juice', 'pret a manger', 'panera', 'mcdonald', 'mccafe', 'krispy kreme',
          'einstein bro', 'bruegger', 'coffee beanery', 'gloria jean', 'its a grind', 'it s a grind', 'aroma joe',
          'black rock coffee', 'foxtail', 'better buzz', 'bluestone lane', 'capital one cafe', 'nespresso', 'lavazza',
          'illy', 'costa coffee', 'second cup', 'ellianos', 'elliano s',
          'summer moon', 'bad ass coffee', 'cafe nero', 'caffe nero', 'luckin', 'cotti',
          'sweetwaters', 'dunn brothers', 'dunn bros', 'port city java', 'coffee time',
          'tous les jours', 'paris baguette', '85c', 'au bon pain', 'wawa', 'sheetz', 'folgers', 'maxwell house',
          'green mountain', 'keurig', 'community coffee', 'eight o clock', 'new england coffee', 'seattle s best',
          'seattles best', 'cafe bustelo', 'death wish', 'amazon', 'walmart', 'costco', 'kirkland', 'trader joe',
          'whole foods', 'target']

def chain_hit(name):
    k = ' ' + light_key(name) + ' '
    for c in CHAINS:
        if ' ' + c + ' ' in k or k.strip().startswith(c + ' ') or k.strip() == c:
            return c
    return None

PROCESS = [
    ('Anaerobic & experimental', r'anaerob|carbonic|co-?ferment|coferment|thermal shock|lactic|yeast|infus|experimental|nitro wash|double ferment|extended ferment|koji|mosto'),
    ('Wet-hulled', r'wet[- ]?hull|giling basah'),
    ('Monsooned', r'monsoon'),
    ('Honey', r'honey|pulped natural|semi[- ]?washed'),
    ('Washed & natural', r'washed (and|&|\+|/) natural|natural (and|&|\+|/) washed'),
    ('Natural', r'natural|dry process|sun[- ]?dried'),
    ('Washed', r'washed|wet process|fully washed|lavado'),
]
ROASTS = {'light': 'Light', 'light-medium': 'Light-medium', 'light medium': 'Light-medium', 'medium-light': 'Light-medium',
          'medium light': 'Light-medium', 'medium': 'Medium', 'medium-dark': 'Medium-dark', 'medium dark': 'Medium-dark',
          'dark': 'Dark', 'french': 'Dark', 'italian': 'Dark', 'omni': 'Light-medium', 'filter': 'Light', 'espresso': 'Medium'}

def norm_process(text):
    t = fold(text)
    if not t:
        return ''
    # "honey" as a tasting note would be wrong, so this is only ever given process text or a product name
    for label, pat in PROCESS:
        if re.search(pat, t):
            return label
    return 'Other' if text and len(text) < 40 else ''

ORIGIN_ALIAS = {
    'ethiopia': 'ETH', 'ethiopian': 'ETH', 'kenya': 'KEN', 'kenyan': 'KEN', 'colombia': 'COL', 'colombian': 'COL',
    'brazil': 'BRA', 'brasil': 'BRA', 'guatemala': 'GTM', 'mexico': 'MEX', 'honduras': 'HND', 'costa rica': 'CRI',
    'el salvador': 'SLV', 'nicaragua': 'NIC', 'panama': 'PAN', 'peru': 'PER', 'ecuador': 'ECU', 'bolivia': 'BOL',
    'rwanda': 'RWA', 'burundi': 'BDI', 'tanzania': 'TZA', 'uganda': 'UGA', 'dr congo': 'COD', 'drc': 'COD',
    'congo': 'COD', 'democratic republic of the congo': 'COD', 'malawi': 'MWI', 'zambia': 'ZMB', 'togo': 'TGO',
    'yemen': 'YEM', 'india': 'IND', 'indonesia': 'IDN', 'sumatra': 'IDN', 'java': 'IDN', 'sulawesi': 'IDN',
    'flores': 'IDN', 'bali': 'IDN', 'papua new guinea': 'PNG', 'png': 'PNG', 'vietnam': 'VNM', 'thailand': 'THA',
    'myanmar': 'MMR', 'burma': 'MMR', 'china': 'CHN', 'yunnan': 'CHN', 'nepal': 'NPL', 'timor-leste': 'TLS',
    'timor leste': 'TLS', 'east timor': 'TLS', 'hawaii': 'USA', 'kona': 'USA', 'puerto rico': 'PRI', 'guam': 'GUM',
    'jamaica': 'JAM', 'haiti': 'HTI', 'dominican republic': 'DOM', 'venezuela': 'VEN',
}
REGION_ALIAS = {   # extra words that point at an atlas region, per origin
    'ETH': {'gedeo': 'Yirgacheffe', 'gedeb': 'Yirgacheffe', 'kochere': 'Yirgacheffe', 'chelbesa': 'Yirgacheffe',
            'worka': 'Yirgacheffe', 'idido': 'Yirgacheffe', 'aricha': 'Yirgacheffe', 'konga': 'Yirgacheffe',
            'sidamo': 'Sidama', 'hambela': 'Guji', 'shakiso': 'Guji', 'uraga': 'Guji', 'kercha': 'Guji',
            'bensa': 'Bensa / Bombe Mountains', 'bombe': 'Bensa / Bombe Mountains', 'arbegona': 'Bensa / Bombe Mountains',
            'harrar': 'Harar', 'nensebo': 'West Arsi', 'gesha village': 'Kaffa & Bench Maji', 'bench maji': 'Kaffa & Bench Maji',
            'gera': 'Limu, Jimma & Agaro'},
}

FLAVOR = {
    'floral': 'jasmine bergamot rose honeysuckle lavender floral flower hibiscus lilac violet orange blossom chamomile elderflower magnolia perfume',
    'citrus': 'lemon orange grapefruit lime citrus mandarin tangerine clementine yuzu lemonade meyer kumquat pomelo citric',
    'berry': 'blueberry strawberry raspberry blackcurrant blackberry cranberry berry berries currant boysenberry mulberry jam',
    'stone': 'peach apricot plum apple nectarine cherry pear grape melon stone fruit orchard',
    'tropical': 'mango pineapple passionfruit passion fruit lychee papaya guava tropical banana coconut kiwi jackfruit starfruit watermelon',
    'dried': 'raisin fig date wine prune dried fruit winey port sangria',
    'sweet': 'caramel brown sugar honey panela molasses toffee maple syrup sugar butterscotch candy vanilla marshmallow nougat dulce de leche cane',
    'cocoa': 'chocolate cocoa cacao almond hazelnut walnut pecan nut nutty peanut praline brownie fudge marzipan',
    'spice': 'cinnamon cardamom black tea lemongrass clove nutmeg ginger tea earl grey spice pepper herbal anise mint',
    'earth': 'cedar tobacco toast forest floor earthy smoke smoky leather wood graham roasty malt',
}
_FLAV = []
for fam_id, words in FLAVOR.items():
    for w in words.split(' '):
        _FLAV.append((w, fam_id))
# multi-word phrases first so 'black tea' beats 'tea', 'brown sugar' beats 'sugar'
_PHRASES = [('black tea', 'spice'), ('earl grey', 'spice'), ('brown sugar', 'sweet'), ('maple syrup', 'sweet'),
            ('dulce de leche', 'sweet'), ('orange blossom', 'floral'), ('passion fruit', 'tropical'),
            ('stone fruit', 'stone'), ('dried fruit', 'dried'), ('forest floor', 'earth'), ('red wine', 'dried'),
            ('cane sugar', 'sweet'), ('tropical fruit', 'tropical'), ('lemon candy', 'citrus')]

def flavor_families(notes):
    out = []
    for part in re.split(r'[,;/]| and | & ', fold(notes)):
        part = part.strip()
        if not part:
            continue
        hit = None
        for ph, f in _PHRASES:
            if ph in part:
                hit = f
                break
        if not hit:
            for w, f in _FLAV:
                if re.search(r'\b' + re.escape(w), part):
                    hit = f
                    break
        if hit and hit not in out:
            out.append(hit)
    return out[:4]

def parse_size(sz):
    """Package text -> pounds. Returns None when it cannot be read."""
    t = fold(sz).replace(',', '.')
    m = re.search(r'(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|kg|kilo|g|gram|grams)\b', t)
    if not m:
        return None
    v, u = float(m.group(1)), m.group(2)
    mult = re.search(r'(\d+)\s*[x×]\s*\d', t)
    n = int(mult.group(1)) if mult else 1
    if u.startswith('oz') or u.startswith('ounce'):
        lb = v / 16
    elif u in ('lb', 'lbs', 'pound', 'pounds'):
        lb = v
    elif u in ('kg', 'kilo'):
        lb = v * 2.20462
    else:
        lb = v / 453.592
    return round(lb * n, 2)

def load_cities():
    table = {}
    p = os.path.join(HERE, 'us_cities.tsv')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            st, city, la, lo = line.rstrip('\n').split('\t')
            table[(st, city_key(city))] = [float(lo), float(la)]
    return table

def city_key(city):
    c = fold(city)
    c = re.sub(r'\bst\.?\s', 'saint ', c)
    c = re.sub(r'\bft\.?\s', 'fort ', c)
    c = re.sub(r'\bmt\.?\s', 'mount ', c)
    return re.sub(r'[^a-z ]+', '', c).strip()

# ----------------------------------------------------------------------------
# index of what is already on record
# ----------------------------------------------------------------------------
class Index:
    def __init__(self, d, site=None):
        self.d = d
        self.site_cities = {}
        self.bizoff = {}
        sp = os.path.join(site, 'tools', 'state.json') if site else ''
        if sp and os.path.exists(sp):          # businesses the list sync keeps off the site (chains and the like)
            self.bizoff = json.load(open(sp, encoding='utf-8')).get('bizoff', {})
        cp = os.path.join(site, 'tools', 'cities.json') if site else ''
        if cp and os.path.exists(cp):
            self.site_cities = json.load(open(cp, encoding='utf-8'))
        self.light, self.heavy, self.dom = {}, {}, {}
        for i, c in enumerate(d['companies']):
            self.add_company(i, c)
        self.urls, self.names = {}, {}
        for k in d['coffees']:
            self.add_coffee(k)
        self.city_pt = {}
        for c in d['companies']:
            if c.get('pt') and c.get('pb') == 'city' and c.get('city') and c.get('st'):
                self.city_pt.setdefault((c['st'], city_key(c['city'])), c['pt'])
        self.cities = load_cities()

    def add_company(self, i, c):
        self.light.setdefault(light_key(c['n']), []).append(i)
        hk = heavy_key(c['n'])
        if hk:
            self.heavy.setdefault(hk, []).append(i)
        for u in (c.get('web'), ):
            dd = dedupe_domain(u)
            if dd:
                self.dom.setdefault(dd, []).append(i)

    def add_coffee(self, k):
        if k.get('u'):
            self.urls.setdefault(norm_url(k['u']), []).append(k['id'])
        self.names[(k['c'], light_key(k['n']))] = k['id']

    def find_company(self, name, web=None, st=None, city=None):
        """Return (index, reason) of an existing business that this one duplicates, or (None, '')."""
        C = self.d['companies']
        nk = re.sub(r'[^a-z0-9]+', '', fold(name).replace('&', 'and'))
        if hashlib.sha1(nk.encode('utf8')).hexdigest()[:10] in self.bizoff:
            return -1, 'kept off the site by the list rules (chain, marketplace or not a coffee business)'
        lk = light_key(name)
        if lk in self.light:           # the list sync identifies a business by its name alone, so a name can exist once
            i = self.light[lk][0]
            return i, f'same name as "{C[i]["n"]}"' + (f' ({C[i].get("city", "")}, {C[i].get("st", "")})' if C[i].get('st') else '')
        dd = dedupe_domain(web)
        if dd and dd in self.dom:
            i = self.dom[dd][0]
            return i, f'same website as "{C[i]["n"]}" ({dd})'
        hk = heavy_key(name)
        if hk and len(hk) >= 4 and hk in self.heavy:
            for i in self.heavy[hk]:
                e = C[i]
                if st and e.get('st') == st and (not city or not e.get('city') or city_key(e['city']) == city_key(city)):
                    return i, f'same core name and place as "{e["n"]}"'
        return None, ''

    def point(self, city, st):
        k = (st, city_key(city))
        if k in self.city_pt:
            return self.city_pt[k]
        if f'{city}, {st}' in self.site_cities:      # the reference points the list sync uses
            return self.site_cities[f'{city}, {st}']
        if k in self.cities:
            return [round(self.cities[k][0], 4), round(self.cities[k][1], 4)]
        return None

# ----------------------------------------------------------------------------
# validation and record building
# ----------------------------------------------------------------------------
def need(e, fields):
    return [f for f in fields if not clean(e.get(f))]

def stable_id(name, city, st):
    return 'buna-' + hashlib.sha1(f'{light_key(name)}|{city_key(city or "")}|{st or ""}'.encode()).hexdigest()[:20]

def base_company(e, t, date, ix):
    name = clean(e['name'])
    rec = {'n': name}
    city, st = clean(e.get('city')), clean(e.get('st')).upper()
    if city and st:
        rec['city'], rec['st'] = city, st
    rec['t'] = t
    web = clean(e.get('web'))
    if web:
        rec['web'] = web
    if clean(e.get('phone')):
        rec['ph'] = clean(e['phone'])
    cu = clean(e.get('contact_url')) or web
    if cu:
        rec['cu'] = cu
    lu = clean(e.get('location_source')) or web
    if lu:
        rec['lu'] = lu
    if clean(e.get('addr')):
        rec['addr'] = clean(e['addr'])
    rec['chk'] = date
    if city and st:
        pt = ix.point(city, st)
        if pt:
            rec['pt'], rec['pb'] = pt, 'city'
    if clean(e.get('email')):
        rec['he'] = 1          # the address itself never goes on the site
    rec['ad'] = date
    return rec

def check_place(e, errs):
    st = clean(e.get('st')).upper()
    if st and st not in STATES:
        errs.append(f'state "{st}" is not a US state code')
    for f in ('web', 'contact_url', 'location_source', 'catalog_url', 'url'):
        if clean(e.get(f)) and not is_http(clean(e[f])):
            errs.append(f'{f} is not a full http(s) address')

def build_cafe(e, date, ix):
    errs = [f'missing {f}' for f in need(e, ['name', 'city', 'st', 'addr', 'web', 'location_source', 'specialty_evidence', 'independence_evidence'])]
    check_place(e, errs)
    if clean(e.get('addr')) and not re.search(r'\d', e['addr']):
        errs.append('addr has no street number')
    if len(clean(e.get('specialty_evidence'))) < 25:
        errs.append('specialty_evidence too thin: say which roasters it serves or that it roasts, and where that is published')
    ch = chain_hit(e.get('name', ''))
    if ch:
        errs.append(f'chain or franchise ({ch})')
    if errs:
        return None, errs
    t = clean(e.get('type')) or 'cafe'
    if t not in ('cafe', 'roaster_cafe'):
        return None, ['type must be cafe or roaster_cafe']
    i, why = ix.find_company(e['name'], e.get('web'), clean(e['st']).upper(), e.get('city'))
    if i is not None:
        return None, [why if i < 0 else 'already on the index: ' + why]
    rec = base_company(e, t, date, ix)
    rec['visit'] = 1
    return rec, []

def build_importer(e, date, ix):
    errs = [f'missing {f}' for f in need(e, ['name', 'web', 'evidence'])]
    check_place(e, errs)
    if not (clean(e.get('city')) and clean(e.get('st'))):
        errs.append('missing US city and state (an importer needs a US office, warehouse or registered address)')
    if len(clean(e.get('evidence'))) < 25:
        errs.append('evidence too thin: say what shows it imports or sells green coffee to US roasters, and where')
    if errs:
        return None, errs
    i, why = ix.find_company(e['name'], e.get('web'), clean(e['st']).upper(), e.get('city'))
    if i is not None:
        return None, [why if i < 0 else 'already on the index: ' + why]
    rec = base_company(e, 'importer', date, ix)
    cat = clean(e.get('catalog_url')) or clean(e.get('web'))
    rec['cat'] = cat
    rec['cap'] = 0
    rec['capnote'] = 'Profile and catalog link only; individual lots have not been captured yet.'
    if e.get('wholesale'):
        rec['ws'] = 1
    if e.get('samples'):
        rec['sm'] = 1
    return rec, []

def resolve_origin(e, d):
    oid = {o['id']: o for o in d['origins']}
    names = {fold(o['n']): o['id'] for o in d['origins']}
    names.update(ORIGIN_ALIAS)
    raw = clean(e.get('origin'))
    if fold(raw) in ('blend', 'blends', 'multiple', 'various'):
        return 'BLEND', False, raw
    if raw.upper() in oid:
        return raw.upper(), False, raw
    if fold(raw) in names:
        return names[fold(raw)], False, raw
    if raw:
        return None, False, raw          # a country that is not on the atlas yet
    t = ' ' + fold(e.get('name')) + ' '
    for nm in sorted(names, key=len, reverse=True):
        if re.search(r'\b' + re.escape(nm) + r'\b', t):
            return names[nm], True, ''
    return None, False, ''

def resolve_regions(o, e, d):
    """Match the seller's region wording to atlas region names."""
    org = next((x for x in d['origins'] if x['id'] == o), None)
    if not org:
        return [], False
    cands = {}
    for r in org['rg']:
        for tok in re.split(r'[,;/&]| and ', r['n']):
            tok = fold(tok).strip()
            if len(tok) >= 4:
                cands[tok] = r['n']
    for a, r in REGION_ALIAS.get(o, {}).items():
        cands[a] = r
    def scan(text):
        t = ' ' + fold(text) + ' '
        out = []
        for tok in sorted(cands, key=len, reverse=True):
            if re.search(r'\b' + re.escape(tok) + r'\b', t) and cands[tok] not in out:
                out.append(cands[tok])
        return out[:2]
    fields = ' '.join(clean(e.get(k)) for k in ('region', 'station', 'producer'))
    hit = scan(fields)
    if hit:
        return hit, False
    hit = scan(e.get('name'))
    return hit, bool(hit)

FORMAT_BLOCK = r'\b(k-?cups?|pods?|capsules?|instant|cold brew|concentrate|ready to drink|rtd|canned|steeped bags?|gift card|subscription|sampler|sample pack|variety pack|flavou?red|pumpkin|hazelnut creme|french vanilla|syrup|mug|t-shirt)\b'

def build_coffee(e, date, ix, new_companies, per_roaster):
    d = ix.d
    errs = [f'missing {f}' for f in need(e, ['name', 'url', 'roaster'])]
    url = clean(e.get('url'))
    if url and not is_http(url):
        errs.append('url is not a full http(s) address')
    elif url and len(urlparse(url).path.strip('/')) < 3:
        errs.append('url is a home page, not the product page')
    if re.search(FORMAT_BLOCK, fold(e.get('name'))):
        errs.append('not a bag of whole-bean or ground roasted coffee (pods, instant, cold brew, flavored, samplers and merchandise are left out)')
    status = clean(e.get('availability')) or 'avail'
    if status != 'avail':
        errs.append('availability must be "avail": only coffees the seller listed for sale when checked are added')
    try:
        price = float(str(e.get('price')).replace('$', '')) if e.get('price') not in (None, '') else None
    except ValueError:
        price = None
    lb = parse_size(e.get('size'))
    if price is None or not 3 <= price <= 400:
        errs.append('missing or implausible price')
    if not lb:
        errs.append('missing or unreadable size (use e.g. "12 oz", "340 g", "250 g", "1 lb")')
    detail = [k for k in ('region', 'producer', 'station', 'process', 'variety', 'tasting_notes') if clean(e.get(k))]
    if len(detail) < 2:
        errs.append('too little detail for a quality listing: give at least two of region, producer, station, process, variety, tasting_notes')
    if errs:
        return None, None, errs

    # seller
    r = e['roaster'] if isinstance(e['roaster'], dict) else {'name': e['roaster']}
    rname = clean(r.get('name'))
    if chain_hit(rname):
        return None, None, [f'seller is a chain or mass-market brand ({chain_hit(rname)})']
    ci, why = ix.find_company(rname, r.get('web') or url, clean(r.get('st')).upper() or None, r.get('city'))
    if ci is not None and ci < 0:
        return None, None, ['seller is ' + why]
    newco = None
    if ci is None:
        missing = need(r, ['name', 'city', 'st', 'web'])
        if missing:
            return None, None, ['seller is not on the index yet, so roaster needs ' + ', '.join(missing)]
        errs = []
        check_place(r, errs)
        if errs:
            return None, None, errs
        t = clean(r.get('type')) or 'roaster'
        if t not in ('roaster', 'roaster_cafe'):
            return None, None, ['roaster.type must be roaster or roaster_cafe']
        newco = base_company(r, t, date, ix)
        ci = len(d['companies'])
    else:
        if d['companies'][ci]['t'] not in ('roaster', 'roaster_cafe', 'cafe'):
            return None, None, [f'seller "{d["companies"][ci]["n"]}" is on the index as {d["companies"][ci]["t"]}, not a roaster']
    if per_roaster.get(ci, 0) >= PER_ROASTER_CAP:
        return None, None, [f'more than {PER_ROASTER_CAP} coffees from one roaster today; kept the first {PER_ROASTER_CAP}']

    name = clean(e['name'])
    nu = norm_url(url)
    if nu in ix.urls:
        return None, None, ['already on the index: same product page as ' + ix.urls[nu][0]]
    if (ci, light_key(name)) in ix.names:
        return None, None, ['already on the index: same coffee name for this seller']

    seller = newco['n'] if newco else d['companies'][ci]['n']
    rec = {'id': 'd' + date.replace('-', '') + '-' + slug(seller, 28) + '-' + hashlib.sha1((nu + '|' + light_key(name)).encode()).hexdigest()[:12],
           'n': name, 'c': ci, 'k': 'r', 's': 'avail', 'ch': date}
    o, oi, oraw = resolve_origin(e, d)
    if o:
        rec['o'] = o
        if oi:
            rec['oi'] = 1
    rec['u'] = url
    if o and o != 'BLEND':
        rg, ri = resolve_regions(o, e, d)
        if rg:
            rec['rg'] = rg
            if ri:
                rec['ri'] = 1
    if clean(e.get('region')):
        rec['rr'] = clean(e['region'])
    elif oraw and not o:
        rec['rr'] = oraw
    if clean(e.get('station')):
        rec['ws'] = clean(e['station'])
    if clean(e.get('producer')):
        rec['pd'] = clean(e['producer'])
    if clean(e.get('variety')):
        rec['v'] = clean(e['variety'])
    if clean(e.get('elevation')):
        rec['el'] = re.sub(r'\s*(m|masl|meters|metres)\.?$', '', clean(e['elevation']), flags=re.I)
    p = norm_process(e.get('process'))
    if p:
        rec['p'] = p
    else:
        p = norm_process(name) if re.search(r'washed|natural|honey|anaerob|wet[- ]?hull|monsoon', fold(name)) else ''
        if p and p != 'Other':
            rec['p'], rec['pi'] = p, 1
    if e.get('grade'):
        rec['g'] = [clean(g) for g in (e['grade'] if isinstance(e['grade'], list) else [e['grade']]) if clean(g)]
    ro = ROASTS.get(fold(e.get('roast')).strip())
    if ro:
        rec['ro'] = ro
    if clean(e.get('tasting_notes')):
        rec['tn'] = clean(e['tasting_notes'])
        f = flavor_families(rec['tn'])
        if f:
            rec['f'] = f
    try:
        if e.get('score') not in (None, ''):
            sc = float(e['score'])
            if 70 <= sc <= 100:
                rec['sc'] = sc
    except (TypeError, ValueError):
        pass
    rec['pr'] = round(price, 2)
    rec['sz'] = clean(e['size'])
    rec['lb'] = lb
    rec['ppl'] = round(price / lb, 2)
    if clean(e.get('decaf')):
        dv = clean(e['decaf'])
        rec['d'] = dv if dv in ('Swiss Water', 'Sugarcane (EA)', 'Methylene chloride', 'Mountain Water', 'CO2') else 'Decaf'
    certs = [c for c in (e.get('certs') or []) if c in ('Organic', 'Fair Trade', 'Women-produced', 'Bird Friendly', 'Rainforest Alliance')]
    if certs:
        rec['ce'] = certs
    rec['ad'] = date
    return rec, newco, []

# ----------------------------------------------------------------------------
# spreadsheet rows
# ----------------------------------------------------------------------------
SHEET_HEAD = ['Record type', 'Stable ID', 'Business', 'Coffee / lot', 'Business type', 'US city', 'US state', 'Address',
              'Website', 'Listing or catalog URL', 'Origin country', 'Origin region', 'Producer / station', 'Process',
              'Variety', 'Roast', 'Package size', 'Price (USD)', 'Price per lb', 'Tasting notes', 'Availability',
              'Public phone', 'Public email', 'Contact page', 'Location source', 'Quality evidence',
              'Independence evidence', 'Ethi CO opportunity (inference)', 'Checked date', 'Map basis']
TYPE_LABEL = {'importer': 'Coffee importer / green coffee supplier', 'roaster': 'Roaster', 'roaster_cafe': 'Roaster and café', 'cafe': 'Café'}
GL_HEAD = ['Record ID', 'Company', 'Origin continent', 'Origin country', 'Origin region', 'Coffee / lot', 'Availability',
           'Checked date', 'US city', 'US state', 'Business type', 'Process', 'Variety', 'Roast', 'Package size',
           'Price (USD)', 'Published price detail', 'Buna Verified', 'Listing URL', 'Regional sourcing evidence',
           'Location source', 'Notes', 'Lot pickup evidence', 'Pickup source']
BD_HEAD = ['Company', 'Existing master reference', 'US city', 'US state', 'Business type', 'Website', 'Reported origins',
           'Coffee records', 'Public email', 'Public phone', 'Contact source', 'Location source', 'Independence evidence',
           'Ethi CO opportunity (inference)', 'Contact evidence', 'Checked date', 'Public visit evidence', 'Visit city',
           'Visit state', 'Visit address', 'Access notes', 'Visit source', 'Visit evidence detail', 'Menu audit status']
IC_HEAD = ['Importer', 'US city', 'State', 'Website', 'Catalog source', 'Captured coffee records',
           'Coverage / remaining work', 'Location source', 'Map basis', 'Ethi CO opportunity (inference)', 'Checked date']

def map_basis(rec):
    if rec.get('pt'):
        return f'City reference point ({rec["pt"][1]}, {rec["pt"][0]}); not the storefront'
    return 'No map point'

def sheet_rows(acc, d, date):
    """acc = {'cafes': [(entry, rec)], 'importers': [...], 'coffees': [(entry, rec, company)], 'roasters': [(entry, rec)]}"""
    on = {o['id']: o for o in d['origins']}
    uni, gl, bd, ic = [], [], [], []
    def biz(kind, e, rec, evidence, visit):
        sid = stable_id(rec['n'], rec.get('city'), rec.get('st'))
        uni.append([kind, sid, rec['n'], '', TYPE_LABEL[rec['t']], rec.get('city', ''), rec.get('st', ''), rec.get('addr', ''),
                    rec.get('web', ''), rec.get('cat', ''), '', '', '', '', '', '', '', '', '', '', '',
                    rec.get('ph', ''), clean(e.get('email')), rec.get('cu', ''), rec.get('lu', ''), evidence,
                    clean(e.get('independence_evidence')), clean(e.get('opportunity')), date, map_basis(rec)])
        bd.append([rec['n'], sid, rec.get('city', ''), rec.get('st', ''), TYPE_LABEL[rec['t']], rec.get('web', ''),
                   clean(e.get('origins')) or 'Not audited', sum(1 for x in acc['coffees'] if x[2]['n'] == rec['n']),
                   clean(e.get('email')), rec.get('ph', ''), rec.get('cu', ''), rec.get('lu', ''),
                   clean(e.get('independence_evidence')) or 'Not independently verified', clean(e.get('opportunity')),
                   'Public business sources; blank contact fields unverified', date,
                   'Public storefront listed on the business site' if visit else 'Confirm access; no public visit claimed',
                   rec.get('city', '') if visit else '', rec.get('st', '') if visit else '', rec.get('addr', '') if visit else '',
                   f'Stable ID: {sid}. Added by the daily update {date}. {map_basis(rec)}.', rec.get('lu', ''), evidence,
                   'Business verified; individual product/menu availability not audited'])
    for e, rec in acc['cafes']:
        biz('Café', e, rec, clean(e.get('specialty_evidence')), True)
    for e, rec in acc['importers']:
        biz('Importer', e, rec, clean(e.get('evidence')), False)
        ic.append([rec['n'], rec.get('city', ''), rec.get('st', ''), rec.get('web', ''), rec.get('cat', ''), 0,
                   'Profile only; offer list not captured', rec.get('lu', ''), map_basis(rec), clean(e.get('opportunity')), date])
    for e, rec in acc['roasters']:
        biz('Roaster (new seller)', e, rec, 'Seller of roasted coffee added today', False)
    for e, rec, co in acc['coffees']:
        o = on.get(rec.get('o'))
        oname = 'Blend' if rec.get('o') == 'BLEND' else (o['n'] if o else clean(e.get('origin')))
        prod = ' / '.join(x for x in (rec.get('pd', ''), rec.get('ws', '')) if x)
        uni.append(['Roasted coffee', rec['id'], co['n'], rec['n'], TYPE_LABEL.get(co['t'], co['t']), co.get('city', ''), co.get('st', ''), '',
                    co.get('web', ''), rec['u'], oname, rec.get('rr') or ', '.join(rec.get('rg', [])), prod, rec.get('p', ''),
                    rec.get('v', ''), rec.get('ro', ''), rec.get('sz', ''), rec.get('pr', ''), rec.get('ppl', ''), rec.get('tn', ''),
                    'Available online', '', '', '', '', clean(e.get('quality_evidence')), '', '', date, ''])
        gl.append([rec['id'], co['n'], o.get('ct', '') if o else '', oname, rec.get('rr') or ', '.join(rec.get('rg', [])), rec['n'],
                   'Available online', date, co.get('city', ''), co.get('st', ''), TYPE_LABEL.get(co['t'], co['t']), rec.get('p', ''),
                   rec.get('v', ''), rec.get('ro', ''), rec.get('sz', ''), rec.get('pr', ''),
                   f'${rec["pr"]:.2f} for {rec["sz"]} (${rec["ppl"]:.2f}/lb)', 'Not cupped', rec['u'], rec['u'], co.get('lu') or co.get('web', ''),
                   clean(e.get('quality_evidence')) or 'Seller product page', 'No lot-specific pickup evidence recorded', ''])
    return uni, gl, bd, ic

# ----------------------------------------------------------------------------
# commands
# ----------------------------------------------------------------------------
METROS = """Boise, ID; Tulsa, OK; Omaha, NE; Richmond, VA; Madison, WI; Albuquerque, NM; Greenville, SC; Rochester, NY;
Sacramento, CA; Louisville, KY; Providence, RI; Tucson, AZ; Des Moines, IA; Chattanooga, TN; Spokane, WA; Birmingham, AL;
Pittsburgh, PA; Kansas City, MO; Salt Lake City, UT; Raleigh, NC; Durham, NC; Milwaukee, WI; Cincinnati, OH; Columbus, OH;
Cleveland, OH; Indianapolis, IN; Grand Rapids, MI; Detroit, MI; Ann Arbor, MI; Minneapolis, MN; Saint Paul, MN;
St. Louis, MO; Oklahoma City, OK; Little Rock, AR; Fayetteville, AR; Memphis, TN; Nashville, TN; Knoxville, TN;
Asheville, NC; Charlotte, NC; Charleston, SC; Columbia, SC; Savannah, GA; Atlanta, GA; Athens, GA; Jacksonville, FL;
Tampa, FL; St. Petersburg, FL; Orlando, FL; Miami, FL; New Orleans, LA; Baton Rouge, LA; Houston, TX; Austin, TX;
San Antonio, TX; Dallas, TX; Fort Worth, TX; El Paso, TX; Phoenix, AZ; Flagstaff, AZ; Las Vegas, NV; Reno, NV;
San Diego, CA; Los Angeles, CA; Long Beach, CA; Santa Barbara, CA; San Luis Obispo, CA; Fresno, CA; San Jose, CA;
Oakland, CA; San Francisco, CA; Santa Cruz, CA; Portland, OR; Eugene, OR; Bend, OR; Seattle, WA; Tacoma, WA;
Bellingham, WA; Anchorage, AK; Honolulu, HI; Missoula, MT; Bozeman, MT; Billings, MT; Fargo, ND; Sioux Falls, SD;
Lincoln, NE; Wichita, KS; Lawrence, KS; Colorado Springs, CO; Fort Collins, CO; Boulder, CO; Santa Fe, NM;
Cheyenne, WY; Jackson, WY; Buffalo, NY; Syracuse, NY; Albany, NY; Brooklyn, NY; New York, NY; Queens, NY;
Jersey City, NJ; Philadelphia, PA; Lancaster, PA; Baltimore, MD; Washington, DC; Arlington, VA; Norfolk, VA;
Charlottesville, VA; Wilmington, DE; Hartford, CT; New Haven, CT; Boston, MA; Cambridge, MA; Worcester, MA;
Portland, ME; Burlington, VT; Portsmouth, NH; Manchester, NH; Lexington, KY; Huntsville, AL; Mobile, AL;
Jackson, MS; Charleston, WV; Morgantown, WV; Dayton, OH; Toledo, OH; Akron, OH; Fort Wayne, IN; Bloomington, IN;
Chicago, IL; Champaign, IL; Springfield, MO; Columbia, MO; Iowa City, IA; Duluth, MN; Green Bay, WI; Lansing, MI;
Traverse City, MI; Kalamazoo, MI; Erie, PA; Harrisburg, PA; Wilmington, NC; Greensboro, NC; Winston-Salem, NC;
Tallahassee, FL; Gainesville, FL; Sarasota, FL; Pensacola, FL; Lafayette, LA; Shreveport, LA; Waco, TX; Lubbock, TX;
Corpus Christi, TX; Amarillo, TX; Tempe, AZ; Ogden, UT; Provo, UT; Olympia, WA; Salem, OR; Medford, OR; Arcata, CA;
Redding, CA; Pasadena, CA; Santa Rosa, CA; Riverside, CA; Bakersfield, CA; Durango, CO; Grand Junction, CO; Denver, CO"""

def metros():
    return [m.strip() for m in METROS.replace('\n', ' ').split(';') if m.strip()]

def ledger_path():
    return os.path.join(HERE, 'ledger.json')

def load_ledger():
    if os.path.exists(ledger_path()):
        return json.load(open(ledger_path(), encoding='utf-8'))
    return {'runs': [], 'cafe_metros_done': [], 'roasters_visited': [], 'importer_sources_done': []}

def save_ledger(L):
    json.dump(L, open(ledger_path(), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

def out_dir(date):
    p = os.path.join(HERE, 'out', date)
    os.makedirs(p, exist_ok=True)
    return p

def cmd_plan(a):
    d = load_data(a.site)
    L = load_ledger()
    C, K = d['companies'], d['coffees']
    od = out_dir(a.date)
    with open(os.path.join(od, 'known_businesses.tsv'), 'w', encoding='utf-8') as f:
        for c in sorted(C, key=lambda c: (c['t'], c.get('st', ''), c['n'])):
            f.write('\t'.join([c['t'], c['n'], c.get('city', ''), c.get('st', ''), domain(c.get('web'))]) + '\n')
    done = set(L.get('cafe_metros_done', []))
    todo = [m for m in metros() if m not in done]
    if len(todo) < 6:
        todo += [m for m in metros() if m not in todo]     # second lap: go deeper into suburbs and neighborhoods
    listed = {}
    for k in K:
        if k['s'] in ('avail', 'unc', 'sold') and k['k'] == 'r':
            listed[k['c']] = listed.get(k['c'], 0) + 1
    visited = set(L.get('roasters_visited', []))
    cand = [c for i, c in enumerate(C) if c['t'] in ('roaster', 'roaster_cafe') and c.get('web') and dedupe_domain(c['web'])
            and not listed.get(i) and c['n'] not in visited and not chain_hit(c['n'])]
    cand.sort(key=lambda c: hashlib.sha1((c['n'] + a.date[:7]).encode()).hexdigest())
    print(f'PLAN FOR {a.date}')
    print(f'Index now: {d["meta"]["counts"]}')
    print(f'Targets today: {TARGETS}')
    print()
    print('CAFES. Research these metro areas next (about 8 to 10 cafes each). Suburbs and nearby towns count:')
    for m in todo[:7]:
        print('  -', m)
    print()
    print('ROASTED COFFEES. These roasters are on the index with no priced listing yet. Visit their shops first')
    print(f'(at most {PER_ROASTER_CAP} coffees per roaster per day), then add new independent specialty roasters if short:')
    for c in cand[:18]:
        print(f'  - {c["n"]} | {c.get("city", "")}, {c.get("st", "")} | {c["web"]}')
    print(f'  ({len(cand)} roasters without a priced listing remain)')
    print()
    imps = sorted(c['n'] for c in C if c['t'] == 'importer')
    print(f'IMPORTERS. {len(imps)} already on the index. Do not re-add any of these:')
    print('  ' + '; '.join(imps))
    print()
    print('Importer source ideas already used:', '; '.join(L.get('importer_sources_done', [])) or 'none yet')
    print()
    print(f'Every business already on record: {os.path.join(od, "known_businesses.tsv")} (type, name, city, state, domain)')
    print('Check a single name with:  python3 buna_daily.py check --site SITE "Name" --web URL --st ST')

def cmd_check(a):
    d = load_data(a.site)
    ix = Index(d, a.site)
    i, why = ix.find_company(a.name, a.web, a.st, a.city)
    ch = chain_hit(a.name)
    if ch:
        print(f'EXCLUDED: chain or franchise ({ch})')
    elif i is not None and i < 0:
        print(f'EXCLUDED: {why}')
    elif i is not None:
        print(f'DUPLICATE: {why}')
    else:
        print('NEW: not on the index')

def cmd_apply(a):
    date = a.date
    datetime.date.fromisoformat(date)
    d = load_data(a.site)
    pre = integrity(d)
    if pre:
        sys.exit('Site data has problems before any change; stop and report:\n  ' + '\n  '.join(pre[:20]))
    ix = Index(d, a.site)
    od = out_dir(date)
    acc_path = os.path.join(od, 'accepted.json')
    prior = json.load(open(acc_path, encoding='utf-8')) if os.path.exists(acc_path) else {'cafes': [], 'importers': [], 'coffees': [], 'roasters': []}
    have = {k: len(prior[k]) for k in ('cafes', 'importers', 'coffees')}
    entries = {'cafes': [], 'importers': [], 'coffees': []}
    files = []
    for pat in a.batch:
        files += sorted(glob.glob(pat)) or [pat]
    for fp in files:
        try:
            b = json.load(open(fp, encoding='utf-8'))
        except Exception as ex:      # a malformed file must not sink the run
            print(f'SKIPPED {fp}: not valid JSON ({ex})')
            continue
        if isinstance(b, list):
            print(f'SKIPPED {fp}: top level must be an object with cafes / importers / coffees')
            continue
        for k in entries:
            for e in b.get(k) or []:
                if isinstance(e, dict):
                    e['_file'] = os.path.basename(fp)
                    entries[k].append(e)
    new = {'cafes': [], 'importers': [], 'coffees': [], 'roasters': []}
    rejected, extra = [], []
    def room(k):
        return have[k] + len(new[k]) < TARGETS[k] or a.no_cap
    for k, build in (('cafes', build_cafe), ('importers', build_importer)):
        for e in entries[k]:
            rec, errs = build(e, date, ix)
            if errs:
                rejected.append((k, clean(e.get('name')), e.get('_file'), errs))
                continue
            if not room(k):
                extra.append((k, e))
                continue
            d['companies'].append(rec)
            ix.add_company(len(d['companies']) - 1, rec)
            new[k].append((e, rec))
    per = {}
    for pc in prior['coffees']:
        per[pc['c']] = per.get(pc['c'], 0) + 1
    for e in entries['coffees']:
        rec, newco, errs = build_coffee(e, date, ix, new['roasters'], per)
        if errs:
            rn = e.get('roaster', {}).get('name') if isinstance(e.get('roaster'), dict) else e.get('roaster')
            rejected.append(('coffees', f'{clean(e.get("name"))} ({clean(rn)})', e.get('_file'), errs))
            continue
        if not room('coffees'):
            extra.append(('coffees', e))
            continue
        if newco:
            d['companies'].append(newco)
            ix.add_company(len(d['companies']) - 1, newco)
            new['roasters'].append((e['roaster'], newco))
        d['coffees'].append(rec)
        ix.add_coffee(rec)
        per[rec['c']] = per.get(rec['c'], 0) + 1
        new['coffees'].append((e, rec, d['companies'][rec['c']]))

    added = sum(len(v) for v in new.values())
    if added:
        d['meta']['built'] = date
        d['meta']['asof'] = date
        d['meta']['counts'] = recount(d)
        post = integrity(d)
        if post:
            sys.exit('Refusing to write: the result would be unsound:\n  ' + '\n  '.join(post[:20]))
        out = dump_data(d)
        open(data_path(a.site), 'w', encoding='utf-8').write(out)
        ver = hashlib.sha1(out.encode('utf-8')).hexdigest()[:8]
        ip = os.path.join(a.site, 'index.html')
        h = open(ip, encoding='utf-8').read()
        h2 = re.sub(r'(data/data\.js\?v=)[0-9a-f]+', r'\g<1>' + ver, h)
        if h2 == h and 'data/data.js?v=' + ver not in h:
            sys.exit('index.html has no data/data.js?v= reference to refresh; stop and report')
        open(ip, 'w', encoding='utf-8').write(h2)
        rp = os.path.join(a.site, 'README.md')
        if os.path.exists(rp):
            r = open(rp, encoding='utf-8').read()
            cnt = d['meta']['counts']
            r = re.sub(r'- Index date: .*', f'- Index date: {date}. Coffees: {cnt["coffees"]:,}. Businesses: {cnt["companies"]:,}.', r)
            open(rp, 'w', encoding='utf-8').write(r)
        sp = os.path.join(a.site, 'sitemap.xml')
        if os.path.exists(sp):
            s = open(sp, encoding='utf-8').read()
            open(sp, 'w', encoding='utf-8').write(re.sub(r'<lastmod>[^<]*</lastmod>', f'<lastmod>{date}</lastmod>', s))

    # everything accepted today (this call plus earlier calls today), for the spreadsheet
    for k in ('cafes', 'importers', 'roasters'):
        prior[k] += [{'e': {x: v for x, v in e.items() if x != '_file'}, 'rec': rec} for e, rec in new[k]]
    prior['coffees'] += [{'e': {x: v for x, v in e.items() if x != '_file'}, 'rec': rec, 'c': rec['c']} for e, rec, co in new['coffees']]
    json.dump(prior, open(acc_path, 'w', encoding='utf-8'), ensure_ascii=False)
    acc = {k: [(x['e'], x['rec']) for x in prior[k]] for k in ('cafes', 'importers', 'roasters')}
    acc['coffees'] = [(x['e'], x['rec'], d['companies'][x['rec']['c']]) for x in prior['coffees']]
    uni, gl, bd, ic = sheet_rows(acc, d, date)
    with open(os.path.join(od, 'additions.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(SHEET_HEAD)
        w.writerows(uni)
    json.dump({'Global Listings': {'header': GL_HEAD, 'rows': gl}, 'Business Development': {'header': BD_HEAD, 'rows': bd},
               'Importer Coverage': {'header': IC_HEAD, 'rows': ic}},
              open(os.path.join(od, 'master_rows.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump([{'kind': k, 'entry': {x: v for x, v in e.items() if x != '_file'}} for k, e in extra],
              open(os.path.join(od, 'extra.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    tot = {k: len(prior[k]) for k in ('coffees', 'cafes', 'importers', 'roasters')}
    L = load_ledger()
    run = next((r for r in L['runs'] if r['date'] == date), None)
    if not run:
        run = {'date': date}
        L['runs'].append(run)
    run['added'] = tot
    run['short'] = {k: TARGETS[k] - tot[k] for k in TARGETS if tot[k] < TARGETS[k]}
    run['index'] = d['meta']['counts'] if added else load_data(a.site)['meta']['counts']
    save_ledger(L)

    lines = [f'APPLIED {date}: this call added {len(new["coffees"])} coffees, {len(new["cafes"])} cafes, {len(new["importers"])} importers, {len(new["roasters"])} new roasters.',
             f'TODAY SO FAR: coffees {tot["coffees"]}/{TARGETS["coffees"]}, cafes {tot["cafes"]}/{TARGETS["cafes"]}, importers {tot["importers"]}/{TARGETS["importers"]} (plus {tot["roasters"]} new roasters as sellers).']
    short = {k: TARGETS[k] - tot[k] for k in TARGETS if tot[k] < TARGETS[k]}
    lines.append('STILL SHORT: ' + (', '.join(f'{v} {k}' for k, v in short.items()) if short else 'nothing; all three targets met'))
    if extra:
        lines.append(f'HELD BACK (over today\'s target, not added): {len(extra)}; saved in out/{date}/extra.json')
    if rejected:
        lines.append(f'REJECTED ({len(rejected)}):')
        for k, n, fp, errs in rejected:
            lines.append(f'  - [{k}] {n} [{fp}]: ' + '; '.join(errs))
    nopt = [rec['n'] for k in ('cafes', 'importers', 'roasters') for e, rec in new[k] if 'pt' not in rec]
    if nopt:
        lines.append('NO MAP POINT (city not in the reference table): ' + '; '.join(nopt))
    noorg = [rec['n'] for e, rec, co in new['coffees'] if 'o' not in rec]
    if noorg:
        lines.append('ORIGIN NOT ON THE ATLAS (listed without an origin link): ' + '; '.join(noorg))
    lines.append(f'Index counts: {json.dumps(d["meta"]["counts"])}')
    lines.append(f'Spreadsheet rows: {os.path.join(od, "additions.csv")} ({len(uni)} rows) and {os.path.join(od, "master_rows.json")}')
    rep = '\n'.join(lines)
    open(os.path.join(od, 'report.txt'), 'w', encoding='utf-8').write(rep + '\n')
    print(rep)

def cmd_verify(a):
    d = load_data(a.site)
    bad = integrity(d)
    h = open(os.path.join(a.site, 'index.html'), encoding='utf-8').read()
    raw = open(data_path(a.site), encoding='utf-8').read()
    ver = hashlib.sha1(raw.encode('utf-8')).hexdigest()[:8]
    m = re.search(r'data/data\.js\?v=([0-9a-f]+)', h)
    if a.date:
        n_c = sum(1 for k in d['coffees'] if k.get('ad') == a.date)
        n_b = sum(1 for c in d['companies'] if c.get('ad') == a.date)
        print(f'Records dated {a.date}: {n_c} coffees, {n_b} businesses')
        if d['meta']['asof'] != a.date and (n_c or n_b):
            bad.append('meta.asof is not the run date')
        if m and m.group(1) != ver and (n_c or n_b):
            bad.append('index.html still points at an older data version')
    for f in ('Ethi CO opportunity', 'opportunity', '@gmail.com', 'independence_evidence'):
        if f in raw:
            bad.append(f'private wording found in the public data: {f}')
    print('Counts:', json.dumps(d['meta']['counts']))
    if bad:
        print('PROBLEMS:')
        for b in bad[:30]:
            print('  -', b)
        sys.exit(1)
    print('OK: site data is sound')

def cmd_log(a):
    L = load_ledger()
    def add(key, text):
        for x in [t.strip() for t in (text or '').split(';') if t.strip()]:
            if x not in L.setdefault(key, []):
                L[key].append(x)
    add('cafe_metros_done', a.metros)
    add('roasters_visited', a.roasters)
    add('importer_sources_done', a.importer_sources)
    run = next((r for r in L['runs'] if r['date'] == a.date), None)
    if run is None:
        run = {'date': a.date}
        L['runs'].append(run)
    if a.note:
        run['note'] = a.note
    if a.sheet:
        run['sheet'] = a.sheet
    save_ledger(L)
    print('Ledger updated')

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('plan'); s.add_argument('--site', required=True); s.add_argument('--date', required=True); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser('check'); s.add_argument('--site', required=True); s.add_argument('name'); s.add_argument('--web'); s.add_argument('--st'); s.add_argument('--city'); s.set_defaults(fn=cmd_check)
    s = sub.add_parser('apply'); s.add_argument('--site', required=True); s.add_argument('--date', required=True); s.add_argument('--no-cap', action='store_true'); s.add_argument('batch', nargs='+'); s.set_defaults(fn=cmd_apply)
    s = sub.add_parser('verify'); s.add_argument('--site', required=True); s.add_argument('--date'); s.set_defaults(fn=cmd_verify)
    s = sub.add_parser('log'); s.add_argument('--date', required=True); s.add_argument('--metros'); s.add_argument('--roasters'); s.add_argument('--importer-sources'); s.add_argument('--note'); s.add_argument('--sheet', help='"created" or "appended"; never a link, this branch is public'); s.set_defaults(fn=cmd_log)
    a = p.parse_args()
    a.fn(a)

if __name__ == '__main__':
    main()
