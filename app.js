/* Sample Portfolio Dashboard — vanilla JS, no build step. */
(function () {
  'use strict';

  var PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948',
                 '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#7b8cde'];
  var charts = {};
  var state = { rows: [], total: 0, cfg: {}, history: null, barMode: 'sector', perfRange: 252 };

  var fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var fmtUSD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtSignedUSD(x) { return (x < 0 ? '−' : '+') + fmtUSD.format(Math.abs(x)); }
  function fmtPct(x, d) { d = (d === undefined) ? 1 : d; return (x < 0 ? '−' : '+') + Math.abs(x).toFixed(d) + '%'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- Theme ---------------- */
  function themeColors() {
    var dark = document.documentElement.dataset.theme === 'dark';
    return {
      text: dark ? '#e8eaf0' : '#1c2333',
      muted: dark ? '#9aa3b8' : '#5b6478',
      grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      accent: dark ? '#6b9bff' : '#2f6fed'
    };
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('dashboard-theme'); } catch (e) {}
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('dashboard-theme', next); } catch (e) {}
      refreshChartTheme();
    });
  }
  function refreshChartTheme() {
    var c = themeColors();
    Object.keys(charts).forEach(function (k) {
      var ch = charts[k];
      if (ch.options.plugins && ch.options.plugins.legend && ch.options.plugins.legend.labels) {
        ch.options.plugins.legend.labels.color = c.muted;
      }
      if (ch.options.scales) {
        ['x', 'y'].forEach(function (ax) {
          if (ch.options.scales[ax]) {
            ch.options.scales[ax].ticks.color = c.muted;
            ch.options.scales[ax].grid.color = c.grid;
          }
        });
      }
      ch.update();
    });
  }

  /* ---------------- Data ---------------- */
  function computeRows(holdings, prices) {
    var rows = holdings.map(function (h) {
      var p = prices[h.ticker] || {};
      var price = (p.price !== undefined) ? p.price : 0;
      var prev = (p.prevClose !== undefined) ? p.prevClose : price;
      var value = h.shares * price;
      return {
        ticker: h.ticker, name: h.name, type: h.type, sector: h.sector,
        assetClass: h.assetClass, targetWeight: h.targetWeight,
        shares: h.shares, costBasis: h.costBasis,
        thesis: h.thesis, risk: h.risk,
        price: price, prevClose: prev, value: value,
        dayChg: (price - prev) * h.shares,
        totRet: (price - h.costBasis) * h.shares,
        totRetPct: h.costBasis ? (price - h.costBasis) / h.costBasis * 100 : 0,
        weight: 0, drift: 0
      };
    });
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0);
    rows.forEach(function (r) {
      r.weight = total ? r.value / total * 100 : 0;
      r.drift = r.weight - r.targetWeight;
    });
    rows.sort(function (a, b) { return b.weight - a.weight; });
    return { rows: rows, total: total };
  }

  /* ---------------- Summary cards ---------------- */
  function renderSummary(rows, total, benchmark) {
    var dayChg = rows.reduce(function (s, r) { return s + r.dayChg; }, 0);
    var totRet = rows.reduce(function (s, r) { return s + r.totRet; }, 0);
    var cost = total - totRet;
    var dayPct = (total - dayChg) ? dayChg / (total - dayChg) * 100 : 0;
    var retPct = cost ? totRet / cost * 100 : 0;

    document.getElementById('stat-total').textContent = fmtUSD.format(total);
    document.getElementById('stat-count').textContent = rows.length;
    document.getElementById('stat-count-sub').textContent =
      rows.filter(function (r) { return r.type === 'ETF'; }).length + ' ETFs · ' +
      rows.filter(function (r) { return r.type === 'Stock'; }).length + ' stocks';

    var dayEl = document.getElementById('stat-day');
    dayEl.textContent = fmtSignedUSD(dayChg);
    dayEl.className = 'stat-value ' + (dayChg >= 0 ? 'pos' : 'neg');
    document.getElementById('stat-day-sub').textContent = fmtPct(dayPct) + ' today';

    var retEl = document.getElementById('stat-return');
    retEl.textContent = fmtSignedUSD(totRet);
    retEl.className = 'stat-value ' + (totRet >= 0 ? 'pos' : 'neg');
    document.getElementById('stat-return-sub').textContent = fmtPct(retPct) + ' all-time';
  }

  /* ---------------- Donut ---------------- */
  function renderDonut(rows) {
    var c = themeColors();
    var ctx = document.getElementById('chart-donut');
    charts.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(function (r) { return r.ticker; }),
        datasets: [{
          data: rows.map(function (r) { return +r.weight.toFixed(2); }),
          backgroundColor: rows.map(function (_, i) { return PALETTE[i % PALETTE.length]; }),
          borderWidth: 2,
          borderColor: document.documentElement.dataset.theme === 'dark' ? '#161c2c' : '#ffffff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: c.muted, boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: function (item) {
                var r = rows[item.dataIndex];
                return ' ' + r.ticker + ': ' + r.weight.toFixed(1) + '% (' + fmtUSD.format(r.value) + ')';
              }
            }
          }
        }
      }
    });
  }

  /* ---------------- Bar (sector / asset class) ---------------- */
  function aggregate(rows, key) {
    var agg = {};
    rows.forEach(function (r) { agg[r[key]] = (agg[r[key]] || 0) + r.weight; });
    return Object.keys(agg).map(function (k) { return { label: k, weight: agg[k] }; })
      .sort(function (a, b) { return b.weight - a.weight; });
  }
  function renderBar(rows) {
    var c = themeColors();
    var data = aggregate(rows, state.barMode);
    document.getElementById('bar-title').textContent =
      state.barMode === 'sector' ? 'By sector' : 'By asset class';
    var cfg = {
      type: 'bar',
      data: {
        labels: data.map(function (d) { return d.label; }),
        datasets: [{
          data: data.map(function (d) { return +d.weight.toFixed(2); }),
          backgroundColor: data.map(function (_, i) { return PALETTE[i % PALETTE.length]; }),
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (item) { return ' ' + item.parsed.x.toFixed(1) + '%'; } } }
        },
        scales: {
          x: { ticks: { color: c.muted, callback: function (v) { return v + '%'; } }, grid: { color: c.grid } },
          y: { ticks: { color: c.text }, grid: { display: false } }
        }
      }
    };
    if (charts.bar) { charts.bar.destroy(); }
    charts.bar = new Chart(document.getElementById('chart-bar'), cfg);
  }

  /* ---------------- Performance ---------------- */
  function renderPerf(history) {
    var c = themeColors();
    var n = state.perfRange === 'all' ? history.dates.length : Math.min(state.perfRange, history.dates.length);
    var dates = history.dates.slice(-n);
    var pf = history.portfolio.slice(-n);
    var sp = history.sp500.slice(-n);
    var pf0 = pf[0], sp0 = sp[0];
    var pfN = pf.map(function (v) { return +(v / pf0 * 100).toFixed(2); });
    var spN = sp.map(function (v) { return +(v / sp0 * 100).toFixed(2); });
    // Thin labels for readability
    var step = Math.max(1, Math.floor(dates.length / 8));
    var labels = dates.map(function (d, i) { return (i % step === 0 || i === dates.length - 1) ? d.slice(2) : ''; });

    var cfg = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Portfolio', data: pfN, borderColor: c.accent, backgroundColor: c.accent, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
          { label: 'S&P 500', data: spN, borderColor: '#9aa3b8', backgroundColor: '#9aa3b8', tension: 0.15, pointRadius: 0, borderWidth: 1.5, borderDash: [6, 4] }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: c.muted, boxWidth: 24 } },
          tooltip: {
            callbacks: {
              title: function (items) { return dates[items[0].dataIndex]; },
              label: function (item) { return ' ' + item.dataset.label + ': ' + item.parsed.y.toFixed(1); }
            }
          }
        },
        scales: {
          x: { ticks: { color: c.muted, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: c.muted }, grid: { color: c.grid } }
        }
      }
    };
    if (charts.perf) { charts.perf.destroy(); }
    charts.perf = new Chart(document.getElementById('chart-perf'), cfg);
  }

  /* ---------------- Risk ---------------- */
  function diversification(rows, cfg) {
    var score = 100;
    var stocks = rows.filter(function (r) { return r.type === 'Stock'; });
    var maxStock = stocks.length ? Math.max.apply(null, stocks.map(function (r) { return r.weight; })) : 0;
    if (maxStock > cfg.maxSingleStockWeight) score -= 15;
    var agg = {};
    rows.forEach(function (r) {
      if (r.sector !== 'Broad Market' && r.sector !== 'Bonds') {
        agg[r.sector] = (agg[r.sector] || 0) + r.weight;
      }
    });
    var sectors = Object.keys(agg);
    var maxSector = sectors.length ? Math.max.apply(null, sectors.map(function (k) { return agg[k]; })) : 0;
    var maxSectorName = sectors.length ? sectors.reduce(function (a, b) { return agg[a] >= agg[b] ? a : b; }) : '—';
    if (maxSector > cfg.maxSectorWeight) score -= 15;
    else if (maxSector > 20) score -= 5;
    var drifted = rows.filter(function (r) { return Math.abs(r.drift) > cfg.rebalanceThresholdPp; }).length;
    score -= 3 * drifted;
    if (rows.length < 10 || rows.length > 15) score -= 5;
    if (sectors.length < 6) score -= 10;
    score = Math.max(0, Math.min(100, Math.round(score)));
    var label = score >= 80 ? 'Strong' : score >= 60 ? 'Adequate' : 'Concentrated';
    var topStock = stocks.length ? stocks.reduce(function (a, b) { return a.weight >= b.weight ? a : b; }) : null;
    return { score: score, label: label, maxStock: maxStock, topStock: topStock, maxSector: maxSector, maxSectorName: maxSectorName, sectorCount: sectors.length, drifted: drifted };
  }

  function renderRisk(rows, cfg) {
    var r = diversification(rows, cfg);
    document.getElementById('risk-score').textContent = r.score;
    document.getElementById('risk-label').textContent = r.label + ' diversification';
    document.getElementById('risk-fill').style.width = r.score + '%';
    document.getElementById('risk-largest').textContent =
      r.topStock ? r.topStock.ticker + ' at ' + r.topStock.weight.toFixed(1) + '%' : '—';
    document.getElementById('risk-sector').textContent =
      r.maxSectorName + ' at ' + r.maxSector.toFixed(1) + '%';
    document.getElementById('risk-sectors').textContent = r.sectorCount;
    document.getElementById('drift-threshold-label').textContent = cfg.rebalanceThresholdPp;

    var alerts = document.getElementById('drift-alerts');
    var drifted = rows.filter(function (x) { return Math.abs(x.drift) > cfg.rebalanceThresholdPp; })
                      .sort(function (a, b) { return Math.abs(b.drift) - Math.abs(a.drift); });
    if (!drifted.length) {
      alerts.innerHTML = '<li class="all-clear">✅ All holdings within ' + cfg.rebalanceThresholdPp + 'pp of target. No action needed.</li>';
    } else {
      alerts.innerHTML = drifted.map(function (x) {
        var action = x.drift > 0 ? 'trim back toward' : 'add to reach';
        return '<li><strong>' + esc(x.ticker) + '</strong> is at ' + x.weight.toFixed(1) +
          '% vs. a ' + x.targetWeight.toFixed(1) + '% target (' +
          (x.drift > 0 ? '+' : '−') + Math.abs(x.drift).toFixed(1) +
          'pp). Consider a rebalance: ' + action + ' target.</li>';
      }).join('');
    }
  }

  /* ---------------- Holdings table ---------------- */
  function renderTable(rows, cfg) {
    var tbody = document.querySelector('#holdings-table tbody');
    tbody.innerHTML = rows.map(function (r) {
      var drifted = Math.abs(r.drift) > cfg.rebalanceThresholdPp;
      var badge = drifted
        ? '<span class="drift-badge ' + (r.drift > 0 ? 'over' : 'under') + '">' +
          (r.drift > 0 ? '+' : '−') + Math.abs(r.drift).toFixed(1) + 'pp</span>'
        : '';
      var dayCls = r.dayChg >= 0 ? 'pos' : 'neg';
      var retCls = r.totRet >= 0 ? 'pos' : 'neg';
      return '<tr>' +
        '<td><span class="ticker">' + esc(r.ticker) + '</span><span class="type-badge">' + esc(r.type) + '</span></td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.sector) + '</td>' +
        '<td><strong>' + r.weight.toFixed(1) + '%</strong> <span class="tgt">tgt ' + r.targetWeight.toFixed(1) + '%</span>' + badge + '</td>' +
        '<td>' + fmtUSD2.format(r.price) + '</td>' +
        '<td class="' + dayCls + '">' + fmtPct(r.price && r.prevClose ? (r.price - r.prevClose) / r.prevClose * 100 : 0) + '</td>' +
        '<td class="' + retCls + '"><strong>' + fmtPct(r.totRetPct) + '</strong><div class="tgt">' + fmtSignedUSD(r.totRet) + '</div></td>' +
        '<td class="thesis-cell">' + esc(r.thesis) + '<div class="tgt">Risk: ' + esc(r.risk) + '</div></td>' +
      '</tr>';
    }).join('');
  }

  /* ---------------- Commentary (tiny markdown) ---------------- */
  function renderMarkdown(md) {
    var lines = esc(md).split('\n');
    var html = '', inList = false;
    function inline(s) {
      return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
              .replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    lines.forEach(function (line) {
      var t = line.trim();
      if (/^---+$/.test(t)) { if (inList) { html += '</ul>'; inList = false; } html += '<hr>'; return; }
      var h = t.match(/^(#{1,4})\s+(.*)/);
      if (h) { if (inList) { html += '</ul>'; inList = false; } html += '<h3>' + inline(h[2]) + '</h3>'; return; }
      if (/^&gt;\s?/.test(t)) { if (inList) { html += '</ul>'; inList = false; } html += '<blockquote>' + inline(t.replace(/^&gt;\s?/, '')) + '</blockquote>'; return; }
      var li = t.match(/^[-*]\s+(.*)/);
      if (li) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; return; }
      if (/^\d+\.\s+/.test(t)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(t.replace(/^\d+\.\s+/, '')) + '</li>'; return; }
      if (t === '') { if (inList) { html += '</ul>'; inList = false; } return; }
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + inline(t) + '</p>';
    });
    if (inList) html += '</ul>';
    return html;
  }

  /* ---------------- Boot ---------------- */
  function fail(msg) {
    var el = document.getElementById('commentary');
    if (el) el.innerHTML = '<p>' + esc(msg) + '</p>';
  }

  function boot() {
    initTheme();
    var get = function (u, type) {
      return fetch(u).then(function (res) {
        if (!res.ok) throw new Error('Could not load ' + u + ' (' + res.status + ')');
        return type === 'text' ? res.text() : res.json();
      });
    };
    Promise.all([
      get('holdings.json', 'json'),
      get('prices.json', 'json'),
      get('history.json', 'json'),
      get('commentary.md', 'text').catch(function () { return null; })
    ]).then(function (results) {
      var holdingsDoc = results[0], pricesDoc = results[1], history = results[2], commentary = results[3];
      var cfg = {
        rebalanceThresholdPp: holdingsDoc.rebalanceThresholdPp || 5,
        maxSingleStockWeight: holdingsDoc.maxSingleStockWeight || 8,
        maxSectorWeight: holdingsDoc.maxSectorWeight || 25
      };
      state.cfg = cfg;
      state.history = history;
      document.getElementById('portfolio-name').textContent = holdingsDoc.portfolioName || 'Portfolio Dashboard';

      var computed = computeRows(holdingsDoc.holdings, pricesDoc.prices || {});
      state.rows = computed.rows; state.total = computed.total;

      if (pricesDoc.updated) {
        var d = new Date(pricesDoc.updated);
        document.getElementById('updated-badge').textContent = 'Updated ' +
          d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
          d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      }

      if (typeof Chart === 'undefined') { fail('Chart.js failed to load from the CDN — charts are unavailable, but the table and commentary below still work.'); }
      else {
        renderSummary(state.rows, state.total, pricesDoc.benchmark);
        renderDonut(state.rows);
        renderBar(state.rows);
        renderPerf(history);
      }
      renderRisk(state.rows, cfg);
      renderTable(state.rows, cfg);
      document.getElementById('commentary').innerHTML = commentary
        ? renderMarkdown(commentary)
        : '<p>commentary.md not found.</p>';

      // Controls
      document.querySelectorAll('[data-bar]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('[data-bar]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          state.barMode = btn.dataset.bar;
          renderBar(state.rows);
        });
      });
      document.querySelectorAll('[data-range]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('[data-range]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          state.perfRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range, 10);
          renderPerf(state.history);
        });
      });
    }).catch(function (err) {
      fail('Could not load dashboard data: ' + err.message +
           '. If you opened index.html directly from disk, serve the folder with a local web server (see README).');
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
