export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email } = req.body
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email invalide' })
  }

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

  return res.status(500).json({ error: 'Erreur Brevo' })
}