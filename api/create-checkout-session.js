export default async function handler(req, res) {
  // CORS — accepte l'origine de la requête (même Vercel preview URLs)
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || 'https://lotbo.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

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
    console.error('[create-checkout-session] priceId invalide:', priceId);
    return res.status(400).json({ error: 'priceId invalide' });
  }

  const ALLOWED_PALIERS = ['graine', 'bouquet', 'lotbo_fam', 'batisseur', 'platine'];
  if (!ALLOWED_PALIERS.includes(palier)) {
    console.error('[create-checkout-session] palier invalide:', palier);
    return res.status(400).json({ error: 'palier invalide' });
  }

  // Clé secrète Stripe — essaie les deux noms possibles (le .env.local utilise STRIPE_WEBHOOK_SECRET pour sk_live_...)
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    console.error('[create-checkout-session] Clé Stripe manquante ou invalide. STRIPE_SECRET_KEY=', process.env.STRIPE_SECRET_KEY ? 'défini' : 'indéfini', '| STRIPE_WEBHOOK_SECRET=', process.env.STRIPE_WEBHOOK_SECRET ? 'défini' : 'indéfini');
    return res.status(500).json({ error: 'Configuration Stripe manquante côté serveur' });
  }

  // URL de base : utilise l'origin de la requête ou lotbo.app
  const baseUrl = origin && !origin.includes('localhost')
    ? origin
    : 'https://lotbo.app';

  const params = new URLSearchParams({
    'payment_method_types[]':     'card',
    'line_items[0][price]':       priceId,
    'line_items[0][quantity]':    '1',
    'mode':                       'payment',
    'success_url':                `${baseUrl}/supporters?success=true`,
    'cancel_url':                 `${baseUrl}/supporter-fondateur`,
    'billing_address_collection': 'auto',
    'metadata[palier]':           palier,
  });

  console.log('[create-checkout-session] Création session Stripe — palier:', palier, '| priceId:', priceId);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('[create-checkout-session] Stripe error:', JSON.stringify(session.error));
      return res.status(stripeRes.status).json({
        error: session.error?.message || 'Erreur Stripe'
      });
    }

    console.log('[create-checkout-session] Session créée:', session.id);
    return res.status(200).json({ url: session.url });

  } catch (e) {
    console.error('[create-checkout-session] Erreur réseau:', e.message);
    return res.status(500).json({ error: 'Erreur interne : ' + e.message });
  }
}
