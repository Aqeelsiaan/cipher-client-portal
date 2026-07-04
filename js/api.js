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
      location.href = '/login.html'
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
    logout() { clearToken(); location.href = '/login.html' },

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
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cipher-leads.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  }
})()

// Guard — call on every page except login.html
function requireAuth() {
  if (!API.isLoggedIn()) {
    location.href = '/login.html'
    return false
  }
  return true
}

// Shared toast
function toast(msg, ms = 2500) {
  let t = document.getElementById('toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'toast'
    t.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%) translateY(20px);background:#333;color:#fff;padding:10px 18px;border-radius:99px;font-size:14px;opacity:0;transition:.25s;pointer-events:none;white-space:nowrap;z-index:999;'
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
