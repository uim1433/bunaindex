/* Buna Index: member accounts. Sign-in is by a link sent to the member's email; there are no passwords.
   The account service is Supabase (auth and a small database). Nothing is requested from it unless a visitor
   signs in or is already signed in, so ordinary reading of the index still loads nothing from another host. */
(function () {
  'use strict';
  const B = window.B; if (!B) return;
  const { $, html, raw } = B;

  /* Public by design: the publishable key only identifies the project. What a visitor may read or write is
     decided by the row-level rules in the database, not by this key. */
  const API = 'https://xbhwvcoukzlvscoulqoe.supabase.co';
  const KEY = 'sb_publishable_YGBH0r7NpBYrF1lRIWWbtA_Az87vSJy';

  /* Until sign-in mail can reach every address, the account panel is shown only to someone who opens
     bunaindex.com/#account once (or who is already signed in). Set to true to show it to everyone. */
  B.ACCOUNTS_OPEN = false;

  /* ---------- the address bar: catch a sign-in link's return before the page router reads the hash ---------- */
  let returned = null;
  (function () {
    const h = (location.hash || '').replace(/^#/, '');
    const land = () => { try { history.replaceState(null, '', location.pathname + location.search + '#membership'); } catch (e) { /* address pinned */ } };
    if (/(^|&)(access_token|error|error_code|error_description)=/.test(h)) {
      returned = {}; h.split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) { try { returned[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* skip a broken pair */ } } });
      land();
    } else if (h === 'account') { B.store.set('acct', 1); land(); }
  })();
  window.addEventListener('hashchange', () => { if ((location.hash || '') === '#account') { B.store.set('acct', 1); B.go('membership', {}); } });

  /* ---------- session ---------- */
  let session = B.store.get('session', null);          // { access_token, refresh_token, expires_at, email, id }
  let claims = null, refreshing = null;
  const now = () => Math.floor(Date.now() / 1000);
  const save = (s) => { session = s; B.store.set('session', s); };
  const shown = () => B.ACCOUNTS_OPEN || !!session || !!B.store.get('acct', 0) || !!returned;
  B.account = { email: () => (session ? session.email : null), signedIn: () => !!session };

  async function call(path, opts, auth) {
    const o = opts || {};
    const headers = Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, o.headers || {});
    if (auth) { const t = await token(); if (!t) throw Object.assign(new Error('Signed out'), { status: 401 }); headers.Authorization = 'Bearer ' + t; }
    const res = await fetch(API + path, { method: o.method || 'GET', headers, body: o.body ? JSON.stringify(o.body) : undefined });
    let data = null; const text = await res.text(); if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
    if (!res.ok) throw Object.assign(new Error((data && (data.msg || data.message || data.error_description || data.error)) || 'Request failed'), { status: res.status, code: data && (data.error_code || data.code) });
    return data;
  }
  /* a current access token, renewed with the refresh token when it is about to run out */
  function token() {
    if (!session) return Promise.resolve(null);
    if (session.expires_at - now() > 60) return Promise.resolve(session.access_token);
    if (!refreshing) {
      refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
        .then((d) => { save({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || now() + (d.expires_in || 3600), email: (d.user && d.user.email) || session.email, id: (d.user && d.user.id) || session.id }); return session.access_token; })
        .catch((e) => { if (e.status === 400 || e.status === 401 || e.status === 403) { save(null); claims = null; } return null; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function finishReturn() {
    const r = returned; returned = null;
    if (!r) return;
    if (r.access_token && r.refresh_token) {
      try {
        const res = await fetch(API + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + r.access_token } });
        if (!res.ok) throw new Error('rejected');
        const u = await res.json();
        save({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: +r.expires_at || now() + (+r.expires_in || 3600), email: u.email, id: u.id });
        B.store.set('acct', 1);
        B.toast('Signed in as ' + u.email);
      } catch (e) { B.toast('That sign-in link did not work. Ask for a new one.'); }
    } else {
      B.store.set('acct', 1);
      B.toast(/expired|invalid/i.test(r.error_description || r.error_code || '') ? 'That sign-in link has expired or was already used. Ask for a new one.' : 'Sign-in did not finish. Ask for a new link.');
    }
    if (B.route() === 'membership') B.go('membership', {});
  }
  async function sendLink(email) {
    const back = location.origin + location.pathname;
    await call('/auth/v1/otp?redirect_to=' + encodeURIComponent(back), { method: 'POST', body: { email, create_user: true } });
  }
  async function signOut() {
    try { await call('/auth/v1/logout?scope=local', { method: 'POST' }, true); } catch (e) { /* the local sign-out still happens */ }
    save(null); claims = null;
  }
  async function loadClaims() {
    claims = await call('/rest/v1/claims?select=company_key,company_name,status,created_at&order=created_at.desc', {}, true) || [];
    return claims;
  }
  const keyOf = (co) => [co.n, co.city || '', co.st || ''].join('|').toLowerCase();
  const STATUS = {
    verified: ['Claimed', 'Confirmed from your business email address.'],
    pending: ['Waiting for a check', 'Your email address is not at this business’s website address, so the claim is confirmed by hand. You will get an email either way.'],
    rejected: ['Not confirmed', 'We could not confirm this claim. Reply to our email if that is a mistake.'],
  };
  const why = (e) => (e.status === 429 ? 'Too many requests just now. Wait a minute and try again.'
    : /not authorized/i.test(e.message) ? 'Sign-in is not open to this address yet. Use “This is mine” below to claim by email instead.'
    : /invalid/i.test(e.message) && e.status === 400 ? 'That does not look like an email address.'
    : 'That did not go through. Check your connection and try again.');

  /* ---------- the account panel on the membership page ---------- */
  function panel(main) {
    const wrap = $('.wrap', main); if (!wrap || !shown()) return;
    const sec = document.createElement('section'); sec.className = 'panel pad stack'; sec.id = 'acct'; sec.style.cssText = '--gap:12px;margin-bottom:22px';
    const tiers = $('.tiers', wrap); wrap.insertBefore(sec, tiers || wrap.firstChild);
    const draw = () => {
      if (!session) {
        sec.innerHTML = String(html`<h2>Your account</h2>
          <p class="muted">Sign in with your email address. We send you a link; there is no password to remember. If this is your first time, the same link creates your account.</p>
          <form id="acct-f" class="row" style="align-items:flex-end;--gap:12px"><label class="field" style="flex:1 1 240px"><span>Email address</span><input class="input" id="acct-email" type="email" autocomplete="email" inputmode="email"></label><button class="btn primary" type="submit">Email me a sign-in link</button></form>
          <p class="small" id="acct-msg" role="status" hidden></p>
          <p class="small muted">Use the address at your business’s own website (you@yourroastery.com) and your listing is confirmed at once. Your email address and the listings you claim are kept with Supabase, the service that runs sign-in.</p>`);
        const msg = $('#acct-msg', sec), f = $('#acct-f', sec);
        B.onSubmit(f, async () => {
          const email = $('#acct-email', sec).value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.hidden = false; msg.textContent = 'Enter your email address.'; return; }
          const btn = $('button', f); btn.disabled = true; msg.hidden = false; msg.textContent = 'Sending…';
          try { await sendLink(email); msg.textContent = 'Sent. Open the email from Buna Index on this device and follow the link. It works once and expires in an hour.'; }
          catch (e) { msg.textContent = why(e); }
          btn.disabled = false;
        });
        return;
      }
      sec.innerHTML = String(html`<h2>Your account</h2>
        <div class="row between"><span>Signed in as <b>${session.email}</b></span><button class="btn ghost sm" id="acct-out">Sign out</button></div>
        <div id="acct-claims" class="stack" style="--gap:8px"><p class="muted small">Loading your listings…</p></div>`);
      $('#acct-out', sec).addEventListener('click', async () => { await signOut(); B.toast('Signed out'); draw(); });
      const box = $('#acct-claims', sec);
      loadClaims().then((list) => {
        if (!session) return draw();
        box.innerHTML = String(list.length ? html`<div class="label">Your listings</div><ul class="biz">${list.map((c) => html`<li style="display:block"><b>${c.company_name}</b> <span class="pill ${c.status === 'verified' ? 'avail' : c.status === 'rejected' ? 'sold' : 'unc'}">${(STATUS[c.status] || STATUS.pending)[0]}</span><span class="sub" style="display:block">${(STATUS[c.status] || STATUS.pending)[1]}</span></li>`)}</ul>`
          : html`<p class="muted">No listing claimed yet. Find your business under “Claim your listing” below and choose “This is mine”.</p>`);
      }).catch(() => { if (!session) return draw(); box.innerHTML = String(html`<p class="muted small">Your listings could not be loaded just now. Reload the page to try again.</p>`); });
    };
    draw();
  }
  const view = B.views.membership;
  if (view) { const render = view.render; view.render = function (main, st) { render.call(view, main, st); try { panel(main); } catch (e) { /* the page works without the panel */ } }; }

  /* ---------- claiming while signed in: recorded straight away, no email to write ---------- */
  const claimByNote = B.claim;
  B.claim = function (i, fix) {
    if (fix || !session) return claimByNote(i, fix);
    const co = B.companies[i];
    const el = B.modal('Claim this listing', html`
      <p class="muted">You are claiming <b>${co.n}</b>${co.city ? ', ' + co.city + ', ' + (co.st || '') : ''} as <b>${session.email}</b>. Claiming is free.</p>
      <label class="field"><span>Anything we should correct (address, type, coffees, wholesale terms)</span><textarea class="input" id="ac-note" rows="3" maxlength="1500"></textarea></label>
      <div class="row"><button class="btn primary" id="ac-go">Claim this listing</button><button class="btn ghost" data-close>Not now</button></div>
      <p class="small" id="ac-msg" role="status" hidden></p>`);
    $('#ac-go', el).addEventListener('click', async () => {
      const btn = $('#ac-go', el), msg = $('#ac-msg', el); btn.disabled = true; msg.hidden = false; msg.textContent = 'Recording…';
      try {
        const rows = await call('/rest/v1/claims', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { company_key: keyOf(co), company_name: co.n, note: $('#ac-note', el).value.trim() || null } }, true);
        const c = rows && rows[0]; claims = null;
        msg.textContent = c && c.status === 'verified' ? 'Done. ' + co.n + ' is claimed by you, confirmed from your email address.'
          : 'Recorded. Your email address is not at this business’s website address, so we will confirm it by hand and email you.';
        btn.hidden = true;
        if (B.route() === 'membership') setTimeout(() => B.go('membership', {}), 1800);
      } catch (e) {
        msg.textContent = e.code === '23505' || e.status === 409 ? 'You have already claimed this listing. It is on your account.'
          : e.status === 401 ? 'Your sign-in has run out. Sign in again from the Membership page.'
          : 'That did not go through. Try again in a moment.';
        btn.disabled = false;
      }
    });
  };

  setTimeout(finishReturn, 0);   // after the page has started
})();
