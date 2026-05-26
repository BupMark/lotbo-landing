export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lotbo.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // Parse body
  let body = {};
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
  } catch {
    return res.status(400).json({ error: 'Body invalide' });
  }

  const { priceId, palier } = body;
  if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
    return res.status(400).json({ error: 'priceId invalide' });
  }

  const ALLOWED_PALIERS = ['graine', 'bouquet', 'lotbo_fam', 'batisseur', 'platine'];
  if (!ALLOWED_PALIERS.includes(palier)) {
    return res.status(400).json({ error: 'palier invalide' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Clé Stripe manquante' });

  const baseUrl = 'https://lotbo.app';

  const params = new URLSearchParams({
    'payment_method_types[]':      'card',
    'line_items[0][price]':        priceId,
    'line_items[0][quantity]':     '1',
    'mode':                        'payment',
    'success_url':                 `${baseUrl}/supporters?success=true`,
    'cancel_url':                  `${baseUrl}/supporter-fondateur`,
    'billing_address_collection':  'auto',
    'metadata[palier]':            palier,
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${secretKey}`,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('[Stripe]', session.error);
      return res.status(stripeRes.status).json({ error: session.error?.message || 'Erreur Stripe' });
    }

    return res.status(200).json({ url: session.url });

  } catch (e) {
    console.error('[create-checkout-session]', e);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}
