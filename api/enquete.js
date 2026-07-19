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

  // Nom lisible de l'enquêteur — rempli seulement pour le type 'terrain', reste null sinon
  let nomAffiche = null

  // ── Sauvegarde Supabase si type terrain ──────────────────────────────────
  if (type === 'terrain' && reponses) {
    const r = reponses
    const enqueteurId = r.enqueteur || enqueteur || null

    // Lookup du nom lisible depuis l'id — best effort, ne bloque jamais la soumission
    if (enqueteurId) {
      try {
        const { data: enq } = await supabase
          .from('enqueteurs')
          .select('nom_affichage')
          .eq('id', enqueteurId)
          .single()
        nomAffiche = enq?.nom_affichage || null
      } catch {
        nomAffiche = null
      }
    }

    const { error: insertError } = await supabase.from('enquetes_terrain').insert([{
      enqueteur:        nomAffiche,
      enqueteur_id:     enqueteurId,
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

    // Incrément non-bloquant — une fiche terrain ne doit jamais être perdue
    // à cause d'un échec de comptage
    if (!insertError && enqueteurId) {
      try {
        await supabase.rpc('increment_fiches_total', { p_enqueteur_id: enqueteurId })
      } catch (incrErr) {
        console.error('INCREMENT_FICHES_TOTAL_ERROR', incrErr)
      }
    }
  }

  const emailFinal = email && email.includes('@') ? email : null

  // ── Sauvegarde Supabase si type public ───────────────────────────────────
  if (type === 'public') {
    const now = new Date()
    // locale 'sv' (suédois) produit toujours "YYYY-MM-DD HH:MM:SS" — indépendant de la locale système
    const haitiStr = now.toLocaleString('sv', { timeZone: 'America/Port-au-Prince' })
    const dateStr  = haitiStr.slice(0, 10)   // "YYYY-MM-DD"
    const heureStr = haitiStr.slice(11, 16)  // "HH:MM"

    const r = body.reponses || {}
    const { error: dbError } = await supabase.from('enquetes_terrain').insert([{
      type:             'public',
      enqueteur:        null,
      date:             dateStr,
      heure:            heureStr,
      a1:               r.q1 ? [r.q1] : [],
      a2:               r.q2 || null,
      a3:               (v => Number.isNaN(v) ? null : v)(parseInt(r.q3, 10)),
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
      console.error('ENQUETE_PUBLIC_INSERT_ERROR', JSON.stringify(dbError))
      return res.status(500).json({ success: false, error: 'db_insert_failed' })
    }
  }

  // ── Brevo si email disponible ─────────────────────────────────────────────
  const listId = type === 'terrain' ? 7 : 6

  if (emailFinal) {
    const attributes = {}
    if (nomAffiche)             attributes.ENQUETEUR  = nomAffiche
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
