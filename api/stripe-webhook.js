import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const PRICE_TO_PALIER = {
  'price_1TbL4SQe7LMIgCnJR9nSs6WA': 'graine',
  'price_1TbL96Qe7LMIgCnJV4gecu5z': 'bouquet',
  'price_1TbLDjQe7LMIgCnJmurEET1W': 'lotbo_fam',
  'price_1TbLHDQe7LMIgCnJczD51n85': 'batisseur',
  'price_1TbLK3Qe7LMIgCnJirzvmpTO': 'platine',
};

const PALIER_LABEL = {
  graine:    'Graine',
  bouquet:   'Bouquet',
  lotbo_fam: 'Lotbo Fam',
  batisseur: 'Bâtisseur',
  platine:   'Platine',
};

// ── Stripe webhook signature verification (sans npm) ──────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret) {
  const elements  = sigHeader.split(',');
  const timestamp = (elements.find(e => e.startsWith('t=')) || '').slice(2);
  const sigs      = elements.filter(e => e.startsWith('v1=')).map(e => e.slice(3));

  if (!timestamp || !sigs.length) throw new Error('En-tête signature invalide');

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error('Webhook trop ancien (replay attack)');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const valid = sigs.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch { return false; }
  });

  if (!valid) throw new Error('Signature webhook invalide');
}

// ── Supabase insert ────────────────────────────────────────────────────────────
async function insertSupporter({ nom, palier, montant, stripe_payment_id }) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/supporters`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      nom,
      affichage:         'complet',
      palier,
      montant,
      stripe_payment_id,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${txt}`);
  }
}

// ── Brevo email ────────────────────────────────────────────────────────────────
async function sendSupporterEmail({ toEmail, toName, palier }) {
  const label = PALIER_LABEL[palier] || palier;

  // Lire le template HTML depuis le disque
  const fileName = `supporter-${palier.replace('_', '-')}.html`;
  let htmlContent = '';
  try {
    htmlContent = readFileSync(join(__dirname, '..', 'emails', fileName), 'utf-8');
    htmlContent = htmlContent.replace(/\{\{NOM\}\}/g, toName || 'Supporter');
    htmlContent = htmlContent.replace(/\{\{PALIER\}\}/g, label);
  } catch (e) {
    console.warn(`[Brevo] template non trouvé: ${fileName}`, e.message);
    htmlContent = `<p>Bienvenue parmi les ${label} LOTBO ! Merci ${toName || ''} pour ton soutien.</p>`;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'api-key':      process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'LOTBO', email: 'hello@lotbo.app' },
      to:          [{ email: toEmail, name: toName || 'Supporter' }],
      subject:     `Bienvenue parmi les ${label} LOTBO 🎉`,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Brevo]', err);
    throw new Error(`Brevo send failed: ${err.message || res.status}`);
  }
}

// ── Raw body (Vercel désactive bodyParser via export config) ──────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  console.log('[Webhook] reçu — secret présent:', !!process.env.STRIPE_WEBHOOK_SECRET);

  if (req.method !== 'POST') return res.status(405).end();

  // Lire le raw body (obligatoire pour la vérification de signature Stripe)
  const rawBodyBuffer = await getRawBody(req);
  const rawBody       = rawBodyBuffer.toString('utf8');
  const sigHeader     = req.headers['stripe-signature'];

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET manquant');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  // Vérification signature
  try {
    verifyStripeSignature(rawBody, sigHeader || '', webhookSecret);
  } catch (e) {
    console.error('[Webhook] Signature invalide:', e.message);
    return res.status(400).json({ error: e.message });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  // Traiter uniquement checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: true });
  }

  const session = event.data?.object;
  if (!session) return res.status(400).json({ error: 'Session manquante' });

  // Extraire les données
  const customerEmail  = session.customer_details?.email;
  const customerName   = session.customer_details?.name || '';
  const amountTotal    = session.amount_total || 0;
  const paymentIntent  = session.payment_intent || session.id;

  // Déterminer le palier depuis metadata ou price_id
  let palier = session.metadata?.palier;

  if (!palier || !PALIER_LABEL[palier]) {
    // Fallback : chercher via line_items si disponibles
    const lineItems = session.line_items?.data || [];
    const priceId   = lineItems[0]?.price?.id;
    palier = PRICE_TO_PALIER[priceId] || 'graine';
  }

  console.log(`[Webhook] checkout.session.completed — palier: ${palier} — email: ${customerEmail}`);

  // Insert Supabase
  try {
    await insertSupporter({
      nom:               customerName,
      palier,
      montant:           Math.round(amountTotal / 100),
      stripe_payment_id: paymentIntent,
    });
    console.log('[Webhook] Supabase insert OK');
  } catch (e) {
    console.error('[Webhook] Supabase insert failed:', e.message);
    // Ne pas bloquer la réponse — log et continuer
  }

  // Envoi email Brevo
  if (customerEmail) {
    try {
      await sendSupporterEmail({
        toEmail: customerEmail,
        toName:  customerName,
        palier,
      });
      console.log('[Webhook] Brevo email envoyé à', customerEmail);
    } catch (e) {
      console.error('[Webhook] Brevo email failed:', e.message);
      // Ne pas bloquer la réponse — log et continuer
    }
  }

  return res.status(200).json({ received: true });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
