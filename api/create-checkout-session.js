export default async function handler(req, res) {
  // ── Diagnostic Stripe au démarrage ────────────────────────────────────────
  console.log('STRIPE_SECRET_KEY présente ?', !!process.env.STRIPE_SECRET_KEY);
  console.log('STRIPE_SECRET_KEY prefix:', process.env.STRIPE_SECRET_KEY?.substring(0, 7));

  // CORS — accepte l'origine de la requête (Vercel preview URLs incluses)
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

  // Clé secrète Stripe — lire process.env.STRIPE_SECRET_KEY en priorité
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error(
      '[create-checkout-session] STRIPE_SECRET_KEY absente du runtime Vercel.\n' +
      'Action requise : ajouter STRIPE_SECRET_KEY dans Settings → Environment Variables de ton projet Vercel,\n' +
      'puis redéployer. Valeur attendue : sk_live_... (ou sk_test_... en mode test).'
    );
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY absente — ajouter la variable dans Vercel Settings et redéployer'
    });
  }

  if (!secretKey.startsWith('sk_')) {
    console.error('[create-checkout-session] STRIPE_SECRET_KEY invalide — prefix:', secretKey.substring(0, 7));
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY invalide (doit commencer par sk_live_ ou sk_test_)'
    });
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
