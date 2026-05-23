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

  const { email, whatsapp, type, reponses, ville, pays, langue, enqueteur, profil } = body

  // List ID selon le type de formulaire
  // type = 'public' → liste #6 LOTBO-Enquete-Public
  // type = 'terrain' → liste #7 Jacmel-Terrain
  const listId = type === 'terrain' ? 7 : 6

  // Construire les attributs de contact
  const attributes = {}
  if (ville)      attributes.VILLE = ville
  if (pays)       attributes.PAYS = pays
  if (langue)     attributes.LANGUE = langue
  if (whatsapp)   attributes.WHATSAPP = whatsapp
  if (enqueteur)  attributes.ENQUETEUR = enqueteur
  if (profil)     attributes.PROFIL = profil

  // Stocker les réponses en JSON stringifié si présentes
  if (reponses) {
    try {
      attributes.REPONSES = typeof reponses === 'string' ? reponses : JSON.stringify(reponses)
    } catch { /* ignorer */ }
  }

  // Email requis pour le formulaire public
  // Optionnel pour terrain (peut avoir seulement WhatsApp)
  const emailFinal = email && email.includes('@') ? email : null
  if (!emailFinal && type !== 'terrain') {
    return res.status(400).json({ error: 'Email invalide' })
  }

  try {
    // Si email disponible → créer/mettre à jour contact Brevo
    if (emailFinal) {
      const response = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          email: emailFinal,
          listIds: [listId],
          attributes,
          updateEnabled: true
        })
      })

      if (!response.ok && response.status !== 204 && response.status !== 400) {
        const err = await response.json()
        return res.status(500).json({ error: err })
      }
    }

    // Si terrain sans email mais avec WhatsApp → log simple (pas de contact Brevo sans email)
    // Dans ce cas on retourne succès quand même
    return res.status(200).json({ success: true })

  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
