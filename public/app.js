(function () {
  'use strict';
  var QL = window.QL || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n, cur) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(n || 0); }
    catch (e) { return (cur || '') + ' ' + (Math.round((n || 0) * 100) / 100).toFixed(2); }
  }
  var r2 = function (n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; };
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
        return data;
      });
    });
  }

  function loggedOut(err) { if (err && /log in/i.test(err.message)) location.href = '/login'; }

  // Copy buttons
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var input = $(btn.getAttribute('data-copy'));
      input.select();
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
      toast('Copied');
    });
  });

  // ---------- Dashboard ----------
  $$('tr.clickable').forEach(function (tr) {
    tr.addEventListener('click', function () { location.href = tr.getAttribute('data-href'); });
  });
  if (QL.rev !== undefined && !QL.id && !QL.settings) {
    // Highlight rows that changed since the last visit (e.g. a quote Claude just created).
    try {
      var seen = sessionStorage.getItem('ql_seen');
      $$('tr.clickable').forEach(function (tr) {
        if (seen && tr.getAttribute('data-updated') > seen) tr.classList.add('flash');
      });
      sessionStorage.setItem('ql_seen', new Date().toISOString());
    } catch (e) {}
    setInterval(function () {
      if (document.hidden) return;
      api('GET', '/app/api/rev').then(function (d) {
        if (d.loggedOut) { location.href = '/login'; return; }
        if (d.rev !== QL.rev) location.reload();
      }).catch(loggedOut);
    }, 3000);
  }

  // ---------- Quote editor ----------
  var form = $('#quote-form');
  if (form) {
    var items = (QL.items || []).map(function (x) { return Object.assign({}, x); });
    var tbody = $('#items');
    var dirty = false;
    var changed = {}; // fields edited here since the last save (so we never overwrite Claude's edits)
    var locked = !!QL.locked;
    var setDirty = function (v) {
      dirty = v;
      if (!v) changed = {};
      var s = $('#savestate');
      if (s) { s.textContent = v ? 'Unsaved changes' : 'All changes saved'; s.classList.toggle('dirty', v); }
    };

    function renderItems() {
      tbody.innerHTML = items.map(function (it, i) {
        var dis = locked ? ' disabled' : '';
        return '<tr data-i="' + i + '">' +
          '<td><input data-k="description" value="' + esc(it.description) + '" placeholder="Item or service"' + dis + '>' +
          '<textarea data-k="details" rows="1" placeholder="Details (optional)"' + dis + '>' + esc(it.details || '') + '</textarea></td>' +
          '<td style="width:72px"><input data-k="quantity" type="number" step="0.01" placeholder="Qty" aria-label="Quantity" value="' + esc(it.quantity) + '"' + dis + '></td>' +
          '<td style="width:110px"><input data-k="unit" value="' + esc(it.unit || '') + '" placeholder="unit"' + dis + '></td>' +
          '<td style="width:112px"><input data-k="unit_price" type="number" step="0.01" placeholder="Price" aria-label="Price" value="' + esc(it.unit_price) + '"' + dis + '></td>' +
          '<td class="amt">' + money(r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), currency()) + '</td>' +
          '<td class="del">' + (locked ? '' : '<button type="button" class="icon-btn" data-del="' + i + '" title="Remove">✕</button>') + '</td></tr>';
      }).join('');
      recalc();
    }
    function currency() {
      var c = (form.elements.currency.value || 'USD').toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? c : 'USD';
    }
    function recalc() {
      var cur = currency();
      var sub = r2(items.reduce(function (s, it) { return s + r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)); }, 0));
      var disc = r2(Math.min(Math.max(Number(form.elements.discount.value) || 0, 0), Math.max(sub, 0)));
      var tax = r2((sub - disc) * (Number(form.elements.tax_rate.value) || 0) / 100);
      $('#t-sub').textContent = money(sub, cur);
      $('#t-disc').textContent = disc ? '−' + money(disc, cur) : money(0, cur);
      $('#t-tax').textContent = money(tax, cur);
      $('#t-total').textContent = money(r2(sub - disc + tax), cur);
      $$('tr[data-i]', tbody).forEach(function (tr) {
        var it = items[+tr.getAttribute('data-i')];
        tr.querySelector('.amt').textContent = money(r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), cur);
      });
    }
    tbody.addEventListener('input', function (e) {
      var tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      var it = items[+tr.getAttribute('data-i')];
      var k = e.target.getAttribute('data-k');
      it[k] = e.target.value;
      changed.items = true;
      setDirty(true);
      recalc();
    });
    tbody.addEventListener('click', function (e) {
      var d = e.target.getAttribute('data-del');
      if (d !== null) { items.splice(+d, 1); changed.items = true; setDirty(true); renderItems(); }
    });
    var add = $('#add-item');
    if (add) add.addEventListener('click', function () {
      items.push({ description: '', quantity: 1, unit: '', unit_price: 0 });
      changed.items = true; renderItems(); setDirty(true);
      var inputs = $$('input[data-k="description"]', tbody); inputs[inputs.length - 1].focus();
    });
    var pick = $('#rate-pick');
    if (pick) pick.addEventListener('change', function () {
      var r = QL.rateCard[+pick.value];
      if (r) {
        items = items.filter(function (it) { return it.description; });
        items.push({ description: r.name, details: r.notes || '', quantity: 1, unit: r.unit || '', unit_price: r.unit_price });
        changed.items = true; renderItems(); setDirty(true);
      }
      pick.value = '';
    });
    form.addEventListener('input', function (e) {
      if (!e.target.closest('#items') && e.target.name) { changed[e.target.name] = true; setDirty(true); recalc(); }
    });

    function payload() {
      var f = form.elements;
      var all = {
        title: f.title.value, client_name: f.client_name.value, client_company: f.client_company.value,
        client_email: f.client_email.value, intro: f.intro.value, currency: f.currency.value,
        discount: f.discount.value, tax_rate: f.tax_rate.value, valid_until: f.valid_until.value || undefined, terms: f.terms.value,
        items: items.filter(function (it) { return String(it.description || '').trim(); }).map(function (it) {
          return { description: it.description, details: it.details, quantity: Number(it.quantity) || 0, unit: it.unit, unit_price: Number(it.unit_price) || 0 };
        }),
      };
      if (!QL.id) return all; // new quote: send everything
      var out = {};
      Object.keys(changed).forEach(function (k) { if (k in all) out[k] = all[k]; });
      return out;
    }
    function save() {
      var btn = $('#save-btn');
      if (btn) btn.disabled = true;
      var req = QL.id ? api('PUT', '/app/api/quotes/' + QL.id, payload()) : api('POST', '/app/api/quotes', payload());
      return req.then(function (d) {
        if (!QL.id) { dirty = false; location.href = '/app/quotes/' + d.quote.id; return d; }
        QL.updated = d.quote.updated_at;
        setDirty(false);
        // If someone else changed the quote meanwhile, show the merged result.
        if (!$('#ext-banner').classList.contains('hidden')) { location.reload(); return d; }
        toast('Saved');
        return d;
      }).catch(function (err) { toast(err.message); throw err; })
        .finally(function () { if (btn) btn.disabled = false; });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); if (!locked) save(); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (!locked) save(); }
    });
    var send = $('#send-btn');
    if (send) send.addEventListener('click', function () {
      (dirty ? save() : Promise.resolve()).then(function () {
        return api('POST', '/app/api/quotes/' + QL.id + '/send');
      }).then(function () { dirty = false; location.reload(); }).catch(function (err) { toast(err.message); });
    });
    var del = $('#delete-btn');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Delete this quote? The client link will stop working.')) return;
      api('DELETE', '/app/api/quotes/' + QL.id).then(function () { location.href = '/app'; });
    });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    // Live: pick up changes made by Claude or the client.
    if (QL.id) setInterval(function () {
      if (document.hidden) return;
      api('GET', '/app/api/quotes/' + QL.id + '/rev').then(function (d) {
        if (d.loggedOut) { location.href = '/login'; return; }
        if (d.updated_at && d.updated_at !== QL.updated) {
          if (!dirty) location.reload();
          else $('#ext-banner').classList.remove('hidden');
        }
      }).catch(loggedOut);
    }, 3000);

    renderItems();
  }

  // ---------- Settings: rate card ----------
  var sform = $('#settings-form');
  if (sform) {
    var rates = (QL.rateCard || []).map(function (x) { return Object.assign({}, x); });
    var rb = $('#rates');
    var renderRates = function () {
      rb.innerHTML = rates.map(function (r, i) {
        return '<tr data-i="' + i + '"><td><input data-k="name" value="' + esc(r.name) + '" placeholder="e.g. Logo design"></td>' +
          '<td style="width:90px"><input data-k="unit" value="' + esc(r.unit || '') + '" placeholder="unit"></td>' +
          '<td style="width:110px"><input data-k="unit_price" type="number" step="0.01" value="' + esc(r.unit_price) + '"></td>' +
          '<td><input data-k="notes" value="' + esc(r.notes || '') + '"></td>' +
          '<td><button type="button" class="icon-btn" data-del="' + i + '">✕</button></td></tr>';
      }).join('');
    };
    rb.addEventListener('input', function (e) {
      var tr = e.target.closest('tr[data-i]');
      rates[+tr.getAttribute('data-i')][e.target.getAttribute('data-k')] = e.target.value;
    });
    rb.addEventListener('click', function (e) {
      var d = e.target.getAttribute('data-del');
      if (d !== null) { rates.splice(+d, 1); renderRates(); }
    });
    $('#add-rate').addEventListener('click', function () { rates.push({ name: '', unit: '', unit_price: 0, notes: '' }); renderRates(); });
    sform.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = sform.elements;
      api('PUT', '/app/api/settings', {
        business_name: f.business_name.value, name: f.name.value, business_email: f.business_email.value,
        business_address: f.business_address.value, currency: f.currency.value, tax_rate: f.tax_rate.value,
        default_terms: f.default_terms.value, rate_card: rates,
      }).then(function () { toast('Saved'); }).catch(function (err) { toast(err.message); });
    });
    renderRates();
  }

  // ---------- Public quote page ----------
  if (QL.publicView) {
    $$('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-tab]').forEach(function (x) { x.classList.toggle('active', x === b); });
        $$('.resp-form').forEach(function (f) { f.classList.toggle('hidden', f.getAttribute('data-action') !== b.getAttribute('data-tab')); });
      });
    });
    var nameInput = $('form[data-action="accept"] input[name="name"]');
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
    if (nameInput) nameInput.addEventListener('input', function () {
      $('#sig').textContent = nameInput.value;
      var hint = $('#sig-hint');
      if (!QL.signer || !nameInput.value.trim()) { hint.textContent = ''; return; }
      var ok = norm(nameInput.value) === norm(QL.signer);
      hint.textContent = ok ? '✓ Name matches the quote' : 'Must match the name on the quote: ' + QL.signer;
      hint.style.color = ok ? 'var(--green)' : 'var(--red)';
    });
    $$('.resp-form').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = f.querySelector('button[type="submit"]');
        btn.disabled = true;
        api('POST', '/q/' + QL.slug + '/respond', {
          action: f.getAttribute('data-action'),
          name: f.elements.name ? f.elements.name.value : undefined,
          message: f.elements.message ? f.elements.message.value : undefined,
        }).then(function () { location.href = '/q/' + QL.slug + '?done=1'; })
          .catch(function (err) {
            var box = $('#resp-error'); box.textContent = err.message; box.classList.remove('hidden'); btn.disabled = false;
          });
      });
    });
  }
})();
