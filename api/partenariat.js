function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lotbo.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  let body = {}
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body)
    } else if (typeof req.body === 'object' && req.body !== null) {
      body = req.body
    } else {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = JSON.parse(Buffer.concat(chunks).toString())
    }
  } catch {
    return res.status(400).json({ error: 'Body invalide' })
  }

  const { nom, organisation, email, type_partenariat, message } = body

  if (!nom || !organisation || !email || !email.includes('@') || !type_partenariat || !message) {
    return res.status(400).json({ error: 'Champs requis manquants ou invalides' })
  }

  // ── 1. Insertion Supabase ──────────────────────────────────────────────────
  try {
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/partenariats`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ nom, organisation, email, type_partenariat, message })
      }
    )

    if (!supaRes.ok) {
      const errText = await supaRes.text()
      return res.status(500).json({ error: `Supabase: ${errText}` })
    }
  } catch (e) {
    return res.status(500).json({ error: `Supabase: ${String(e)}` })
  }

  // ── 2. Email de notification Brevo ────────────────────────────────────────
  // Si l'email échoue, on ne bloque pas — la donnée est déjà sauvegardée.
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: 'LOTBO Partenariats', email: 'no-reply@lotbo.app' },
        to: [{ email: 'hello@lotbo.app', name: 'LOTBO Équipe' }],
        replyTo: { email, name: nom },
        subject: `Nouvelle proposition de partenariat — ${organisation}`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#C8431A;margin-bottom:24px;">Nouvelle proposition de partenariat</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#8C5A40;width:160px;vertical-align:top;"><strong>Nom</strong></td><td style="padding:8px 0;">${esc(nom)}</td></tr>
              <tr><td style="padding:8px 0;color:#8C5A40;vertical-align:top;"><strong>Organisation</strong></td><td style="padding:8px 0;">${esc(organisation)}</td></tr>
              <tr><td style="padding:8px 0;color:#8C5A40;vertical-align:top;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
              <tr><td style="padding:8px 0;color:#8C5A40;vertical-align:top;"><strong>Type</strong></td><td style="padding:8px 0;">${esc(type_partenariat)}</td></tr>
              <tr><td style="padding:8px 0;color:#8C5A40;vertical-align:top;"><strong>Message</strong></td><td style="padding:8px 0;">${esc(message)}</td></tr>
            </table>
            <p style="margin-top:24px;color:#8C5A40;font-size:12px;">Ce message a été envoyé depuis la page Partenariats de lotbo.app</p>
          </div>
        `
      })
    })
  } catch {
    // Email non bloquant
  }

  return res.status(200).json({ success: true })
}
