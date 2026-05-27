import crypto from 'crypto';

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

const PALIER_EMOJI = {
  graine:    '🌱',
  bouquet:   '🥉',
  lotbo_fam: '🥈',
  batisseur: '🥇',
  platine:   '💎',
};

// ── Stripe webhook signature verification ─────────────────────────────────────
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
async function insertSupporter({ nom, email, palier, montant, stripe_payment_id }) {
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
      email,
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

// ── Template email HTML inline ────────────────────────────────────────────────
function buildEmailHtml({ nom, palier }) {
  const label = PALIER_LABEL[palier] || palier;
  const emoji = PALIER_EMOJI[palier] || '🎉';
  const prenom = nom ? nom.split(' ')[0] : 'Supporter';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenue parmi les ${label} LOTBO</title>
</head>
<body style="margin:0;padding:0;background:#F7F2E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1A1410;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#C8431A;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:48px;line-height:1;">${emoji}</p>
              <h1 style="margin:12px 0 0;color:#F7F2E8;font-size:26px;font-family:Georgia,serif;font-weight:bold;">
                Tu es Supporter Fondateur ${label}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#F7F2E8;font-size:17px;line-height:1.7;margin:0 0 20px;">
                Bonjour ${prenom},
              </p>
              <p style="color:#D4C5B0;font-size:16px;line-height:1.7;margin:0 0 20px;">
                Ton soutien est enregistré. Tu fais maintenant partie des premiers à avoir cru en LOTBO — 
                une plateforme mondiale d'événements née en Haïti le 5 mai 2026.
              </p>
              <p style="color:#D4C5B0;font-size:16px;line-height:1.7;margin:0 0 32px;">
                Ton nom sera visible pour toujours sur 
                <a href="https://lotbo.app/supporters" style="color:#C8431A;">lotbo.app/supporters</a> — 
                rappelant que tu as été là dès le premier jour.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://app.lotbo.app" 
                       style="display:inline-block;background:#C8431A;color:#F7F2E8;text-decoration:none;
                              padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;
                              font-family:Georgia,serif;">
                      Découvrir LOTBO →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2A1F18;text-align:center;">
              <p style="margin:0;color:#8C5A40;font-size:13px;line-height:1.6;">
                LOTBO · Bup Mark Ltd · Manchester, UK 🇬🇧 · Né en Haïti 🇭🇹<br/>
                <a href="https://lotbo.app" style="color:#C8431A;text-decoration:none;">lotbo.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Brevo email ────────────────────────────────────────────────────────────────
async function sendSupporterEmail({ toEmail, toName, palier }) {
  const label = PALIER_LABEL[palier] || palier;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'api-key':      process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'Handgod · LOTBO', email: 'hello@lotbo.app' },
      to:          [{ email: toEmail, name: toName || 'Supporter' }],
      subject:     `${PALIER_EMOJI[palier] || '🎉'} Tu es Supporter Fondateur ${label} — LOTBO`,
      htmlContent: buildEmailHtml({ nom: toName, palier }),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo send failed: ${err.message || res.status}`);
  }
}

// ── Raw body ───────────────────────────────────────────────────────────────────
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
  console.log('[Webhook] reçu — method:', req.method);

  if (req.method !== 'POST') return res.status(405).end();

  const rawBodyBuffer = await getRawBody(req);
  const rawBody       = rawBodyBuffer.toString('utf8');
  const sigHeader     = req.headers['stripe-signature'];

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET manquant');
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET manquant' });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('[Webhook] NEXT_PUBLIC_SUPABASE_URL manquant');
    return res.status(500).json({ error: 'NEXT_PUBLIC_SUPABASE_URL manquant' });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Webhook] SUPABASE_SERVICE_ROLE_KEY manquant');
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant' });
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

  console.log('[Webhook] event type:', event.type);

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: true });
  }

  const session = event.data?.object;
  if (!session) return res.status(400).json({ error: 'Session manquante' });

  const customerEmail = session.customer_details?.email || '';
  const customerName  = session.customer_details?.name  || '';
  const amountTotal   = session.amount_total || 0;
  const paymentIntent = session.payment_intent || session.id;

  // Déterminer le palier
  let palier = session.metadata?.palier;
  if (!palier || !PALIER_LABEL[palier]) {
    const lineItems = session.line_items?.data || [];
    const priceId   = lineItems[0]?.price?.id;
    palier = PRICE_TO_PALIER[priceId] || 'graine';
  }

  console.log(`[Webhook] palier: ${palier} | email: ${customerEmail} | montant: ${amountTotal}`);

  // Insert Supabase
  try {
    await insertSupporter({
      nom:               customerName,
      email:             customerEmail,
      palier,
      montant:           Math.round(amountTotal / 100),
      stripe_payment_id: paymentIntent,
    });
    console.log('[Webhook] ✅ Supabase insert OK');
  } catch (e) {
    console.error('[Webhook] ❌ Supabase insert failed:', e.message);
  }

  // Email Brevo
  if (customerEmail) {
    try {
      await sendSupporterEmail({
        toEmail: customerEmail,
        toName:  customerName,
        palier,
      });
      console.log('[Webhook] ✅ Brevo email envoyé à', customerEmail);
    } catch (e) {
      console.error('[Webhook] ❌ Brevo email failed:', e.message);
    }
  } else {
    console.warn('[Webhook] ⚠️ Pas d\'email client — Brevo skipped');
  }

  return res.status(200).json({ received: true });
}

export const config = {
  api: {
    bodyParser: false,
  },
};