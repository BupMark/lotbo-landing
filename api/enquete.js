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

  const emailFinal = email && email.includes('@') ? email : null

  // ── Sauvegarde Supabase si type public ───────────────────────────────────
  if (type === 'public') {
    const now = new Date()
    const fmt = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Port-au-Prince',
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const timeFmt = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Port-au-Prince',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const dateStr  = fmt.format(now)
    const heureStr = timeFmt.format(now).replace(':', ':').slice(0, 5)

    const r = body.reponses || {}
    const { error: dbError } = await supabase.from('enquetes_terrain').insert([{
      type:             'public',
      enqueteur:        null,
      date:             dateStr,
      heure:            heureStr,
      a1:               r.q1 ? [r.q1] : [],
      a2:               r.q2 || null,
      a3:               r.q3 ? parseInt(r.q3) : null,
      a4:               r.q4 || [],
      a5:               r.q5 || null,
      a6:               r.q6 || null,
      a7:               r.q7 || [],
      ville:            body.ville || null,
      pays:             body.pays  || null,
      notes:            body.commentaire || null,
      newsletter:       body.newsletter === true,
      contact_email:    emailFinal || null,
      contact_whatsapp: body.whatsapp || null,
    }])

    if (dbError) {
      console.error('Supabase public insert error:', dbError)
      return res.status(500).json({ success: false, error: 'db_insert_failed' })
    }
  }

  // ── Brevo si email disponible ─────────────────────────────────────────────
  const listId = type === 'terrain' ? 7 : 6

  if (emailFinal) {
    const attributes = {}
    if (enqueteur)              attributes.ENQUETEUR  = enqueteur
    if (profil)                 attributes.PROFIL     = profil
    if (body.whatsapp)          attributes.WHATSAPP   = body.whatsapp
    if (body.newsletter === true) attributes.NEWSLETTER = true

    try {
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({ email: emailFinal, listIds: [listId], attributes, updateEnabled: true })
      })
    } catch (brevoErr) {
      console.error('Brevo error:', brevoErr)
    }
  }

  return res.status(200).json({ success: true })
}
