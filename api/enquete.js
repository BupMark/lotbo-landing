const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lotbo.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  let body = {}
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body)
    else if (typeof req.body === 'object' && req.body !== null) body = req.body
    else {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = JSON.parse(Buffer.concat(chunks).toString())
    }
  } catch { return res.status(400).json({ error: 'Body invalide' }) }

  const { email, whatsapp, type, enqueteur, profil, reponses } = body

  // ── Sauvegarde Supabase si type terrain ──────────────────────────────────
  if (type === 'terrain' && reponses) {
    const r = reponses
    await supabase.from('enquetes_terrain').insert([{
      enqueteur:        r.enqueteur || enqueteur || null,
      date:             r.date || null,
      heure:            r.heure || null,
      zone:             r.zone || null,
      age:              r.age || null,
      genre:            r.genre || null,
      lieu:             r.lieu || null,
      profil:           r.profil || profil || null,
      a1:               r.a1 || null,
      a2:               r.a2 || null,
      a3:               r.a3 ? parseInt(r.a3) : null,
      a4:               r.a4 || null,
      a5:               r.a5 || null,
      a6:               r.a6 || null,
      a7:               r.a7 || null,
      b1:               r.b1 || null,
      b2:               r.b2 || null,
      b3:               r.b3 || null,
      b4:               r.b4 ? parseInt(r.b4) : null,
      b5:               r.b5 || null,
      b6:               r.b6 || null,
      citation:         r.citation || null,
      enthousiasme:     r.enthousiasme || null,
      notes:            r.notes || null,
      contact_whatsapp: whatsapp || null,
      contact_email:    email || null,
    }])
  }

  // ── Brevo si email disponible ─────────────────────────────────────────────
  const listId = type === 'terrain' ? 7 : 6
  const emailFinal = email && email.includes('@') ? email : null
  if (!emailFinal && type !== 'terrain') {
    return res.status(400).json({ error: 'Email invalide' })
  }

  if (emailFinal) {
    const attributes = {}
    if (enqueteur) attributes.ENQUETEUR = enqueteur
    if (profil)    attributes.PROFIL = profil
    if (whatsapp)  attributes.WHATSAPP = whatsapp

    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({ email: emailFinal, listIds: [listId], attributes, updateEnabled: true })
    }).catch(() => {})
  }

  return res.status(200).json({ success: true })
}
