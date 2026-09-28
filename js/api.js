// CIPHER client app — shared API helper
// Stores JWT in localStorage; adds Bearer header to every request.

const API = (() => {
  // Default is a same-origin relative path — Netlify's /api/* redirect
  // (netlify.toml) proxies this server-side to the HTTP VM. This is required:
  // the app is served over HTTPS, and a browser blocks a direct fetch() to
  // http://136.119.32.195:8001 as mixed content before it ever leaves the
  // device. window.CIPHER_API_URL stays available as an override for local
  // dev against a real server.
  const BASE = window.CIPHER_API_URL || ''

  function token() { return localStorage.getItem('cipher_token') || '' }
  function saveToken(t) { localStorage.setItem('cipher_token', t) }
  function clearToken() { localStorage.removeItem('cipher_token') }

  function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra }
    const t = token()
    if (t) h['Authorization'] = 'Bearer ' + t
    return h
  }

  async function request(method, path, body) {
    const opts = { method, headers: headers() }
    if (body !== undefined) opts.body = JSON.stringify(body)
    const r = await fetch(BASE + path, opts)
    if (r.status === 401) {
      clearToken()
      location.href = 'login.html'
      // Throw a recognizable error instead of returning undefined — callers
      // that do `const data = await API.x(); data.someField` would otherwise
      // hit a confusing "Cannot read properties of undefined" from THAT line
      // instead of a 401, which callers' error handling checked for and
      // never matched — a red raw-JS-error card flashed for a moment before
      // the redirect landed.
      throw new Error('UNAUTHORIZED')
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }))
      throw new Error(err.detail || 'Request failed')
    }
    // CSV / non-JSON responses
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('text/csv')) return r
    return r.json()
  }

  return {
    BASE,
    token, saveToken, clearToken,
    isLoggedIn: () => !!token(),
    get:  (path)        => request('GET',  path),
    post: (path, body)  => request('POST', path, body),
    put:  (path, body)  => request('PUT',  path, body),

    login(email, password) {
      return fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || 'Login failed')
        saveToken(data.token)
        return data
      })
    },
    logout() { clearToken(); location.href = 'login.html' },

    forgotPassword(email) {
      return fetch(BASE + '/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).then(r => r.json())
    },
    setPassword(token, password) {
      return fetch(BASE + '/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }).then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || 'Could not set password')
        return data
      })
    },

    me()            { return this.get('/api/auth/me') },
    getConfig()     { return this.get('/api/client/config') },
    saveConfig(cfg) { return this.put('/api/client/config', { config: cfg }) },
    getLeads()      { return this.get('/api/auth/leads') },
    getNotifications() { return this.get('/api/auth/notifications') },
    // The server only reads the Authorization header, never a ?token= query
    // param — a plain <a href> can't attach a header, so export always 401'd.
    // Fetch with the header, then trigger the download from the blob.
    async downloadLeadsCsv() {
      const r = await fetch(BASE + '/api/auth/leads/export', { headers: headers() })
      if (!r.ok) throw new Error('Export failed')
      downloadBlob(await r.blob(), 'cipher-leads.csv')
    },
  }
})()

// Guard — call on every page except login.html
function requireAuth() {
  if (!API.isLoggedIn()) {
    location.href = 'login.html'
    return false
  }
  return true
}

// Trigger a browser download for an in-memory blob (JSON export, CSV export, etc.)
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Apple-style emoji image instead of raw unicode glyphs (render inconsistently across OSes)
// Line icons in the same stroke as the navigation dock (these used to be emoji images).
const ICONS = {
  '1f916': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  '1f465': '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.4-4.5"/>',
  '1f514': '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  '1f511': '<circle cx="8" cy="15" r="3.8"/><path d="M10.8 12.4 19 4.2M16 7.2l2.3 2.3M13.8 9.4l1.8 1.8"/>',
  '1f4c5': '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  '26a0-fe0f': '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17.2h.01"/>',
}
function emoji(codepoint, size = 18) {
  const p = ICONS[codepoint]
  if (!p) return `<img src="https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${codepoint}.png" alt="" style="width:${size}px;height:${size}px;vertical-align:-3px">`
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:${size}px;height:${size}px;vertical-align:-4px;fill:none;stroke:var(--accent-deep,#1F4FD1);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round">${p}</svg>`
}

// Shared toast
function toast(msg, ms = 2500) {
  let t = document.getElementById('toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'toast'
    t.style.cssText = 'position:fixed;bottom:calc(104px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%) translateY(20px);background:#0E1320;color:#fff;box-shadow:0 10px 24px -10px rgba(14,19,32,.5);padding:10px 18px;border-radius:99px;font-size:14px;opacity:0;transition:.25s;pointer-events:none;white-space:nowrap;z-index:999;'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.style.opacity = '1'
  t.style.transform = 'translateX(-50%) translateY(0)'
  clearTimeout(t._tid)
  t._tid = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)' }, ms)
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
