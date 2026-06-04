// Script à exécuter UNE SEULE FOIS pour renvoyer les emails aux supporters existants
// Usage : BREVO_API_KEY=xxx node resend-emails.mjs

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (!BREVO_API_KEY) {
  console.error('BREVO_API_KEY manquant — lance : BREVO_API_KEY=ta_clé node resend-emails.mjs');
  process.exit(1);
}

const PALIER_LABEL = {
  graine:    'Graine',
  bouquet:   'Bouquet',
  lotbo_fam: 'Lotbo Fam',
  batisseur: 'Batisseur',
  platine:   'Platine',
};

const PALIER_EMOJI = {
  graine:    '🌱',
  bouquet:   '🥉',
  lotbo_fam: '🥈',
  batisseur: '🥇',
  platine:   '💎',
};

const supporters = [
  { nom: 'Joseph Closel Dabia', email: 'jdabia@yahoo.com',        palier: 'lotbo_fam' },
  { nom: 'Hans Valcinor',       email: 'anthonikatitus@gmail.com',   palier: 'graine'    },
  { nom: 'Mercedes Caso',       email: 'caso@me.com',            palier: 'bouquet'   },
  { nom: 'Corine Bonheur',      email: 'corinebonheur7@gmail.com',palier: 'lotbo_fam' },
  { nom: 'EVENCE JEAN LOUIS',   email: 'evencej@gmail.com',       palier: 'graine'    },
];

function buildEmailHtml(nom, palier, toEmail) {
  const label  = PALIER_LABEL[palier] || palier;
  const emoji  = PALIER_EMOJI[palier] || '🎉';
  const prenom = nom ? nom.trim().split(' ')[0] : 'Supporter';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F7F2E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E8;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#1A1410;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
<tr><td style="background:#C8431A;padding:32px 40px;text-align:center;">
<p style="margin:0;font-size:48px;line-height:1;">${emoji}</p>
<h1 style="margin:12px 0 0;color:#F7F2E8;font-size:26px;font-family:Georgia,serif;font-weight:bold;">Tu es Supporter Fondateur ${label}</h1>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="color:#F7F2E8;font-size:17px;line-height:1.7;margin:0 0 20px;">Bonjour ${prenom},</p>
<p style="color:#D4C5B0;font-size:16px;line-height:1.7;margin:0 0 20px;">Ton soutien est enregistre. Tu fais maintenant partie des premiers a avoir cru en LOTBO — une plateforme mondiale d'evenements nee en Haiti le 5 mai 2026.</p>
<p style="color:#D4C5B0;font-size:16px;line-height:1.7;margin:0 0 20px;">Ton nom sera visible pour toujours sur <a href="https://lotbo.app/supporters" style="color:#C8431A;">lotbo.app/supporters</a>.</p>
<p style="color:#F7F2E8;font-size:16px;font-weight:bold;line-height:1.7;margin:0 0 8px;">🏅 Ton badge Supporter Fondateur t'attend.</p>
<p style="color:#D4C5B0;font-size:15px;line-height:1.7;margin:0 0 32px;">Cree ton compte LOTBO avec cette adresse email (<strong style="color:#F7F2E8;">${toEmail}</strong>) pour recevoir ton badge automatiquement sur ton profil.</p>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="https://app.lotbo.app/login" style="display:inline-block;background:#C8431A;color:#F7F2E8;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;font-family:Georgia,serif;">Creer mon compte LOTBO →</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #2A1F18;text-align:center;">
<p style="margin:0;color:#8C5A40;font-size:13px;line-height:1.6;">LOTBO · Bup Mark Ltd · Manchester, UK · Ne en Haiti<br/><a href="https://lotbo.app" style="color:#C8431A;text-decoration:none;">lotbo.app</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(nom, email, palier) {
  const label = PALIER_LABEL[palier] || palier;
  const emoji = PALIER_EMOJI[palier] || '🎉';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: 'Handgod · LOTBO', email: 'hello@lotbo.app' },
      to:          [{ email, name: nom }],
      subject:     `${emoji} Tu es Supporter Fondateur ${label} — LOTBO`,
      htmlContent: buildEmailHtml(nom, palier, email),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || res.status);
  return json.messageId;
}

async function main() {
  console.log('Envoi des emails a ' + supporters.length + ' supporters...\n');
  for (const s of supporters) {
    try {
      const id = await sendEmail(s.nom, s.email, s.palier);
      console.log('OK ' + s.nom + ' (' + s.email + ') — messageId: ' + id);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error('ERREUR ' + s.nom + ' (' + s.email + ') — ' + e.message);
    }
  }
  console.log('\nTermine.');
}

main();
