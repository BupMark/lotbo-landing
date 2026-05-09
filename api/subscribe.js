export default async function handler(req, res) {
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://lotbo.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  // Parse manuel du body
  let body = {}
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body)
    } else if (typeof req.body === 'object' && req.body !== null) {
      body = req.body
    } else {
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      body = JSON.parse(Buffer.concat(chunks).toString())
    }
  } catch {
    return res.status(400).json({ error: 'Body invalide' })
  }

  const { email } = body
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email invalide' })
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        listIds: [3],
        updateEnabled: true
      })
    })

    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true })
    }
    if (response.status === 400) {
      return res.status(200).json({ success: true, already: true })
    }

    const err = await response.json()
    return res.status(500).json({ error: err })

  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}