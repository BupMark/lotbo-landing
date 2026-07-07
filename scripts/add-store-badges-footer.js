#!/usr/bin/env node
// Remplace le bloc footer "Télécharger" (liens texte App Store / Google Play)
// par une version avec badges images compacts, et ajoute la règle CSS
// .footer-store-badges juste après .footer-col-links.
//
// Usage:
//   node scripts/add-store-badges-footer.js index.html            (un seul fichier)
//   node scripts/add-store-badges-footer.js --all                 (tous les fichiers concernés)

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

const APP_STORE_BADGE = '<img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Télécharger sur l\'App Store" width="120" height="40"/>'
const GOOGLE_PLAY_BADGE = '<img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Disponible sur Google Play" width="135" height="40"/>'

// Bloc texte existant (celui déjà inséré dans les fichiers), indentation capturée en groupe 1.
const OLD_BLOCK_RE = /([ \t]*)<div>\n\1  <div class="footer-col-title">Télécharger<\/div>\n\1  <div class="footer-col-links">\n\1    <a href="https:\/\/apps\.apple\.com\/us\/app\/lotbo-local-events\/id6779059022" class="footer-col-link" target="_blank" rel="noopener noreferrer">App Store<\/a>\n\1    <a href="https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.lotbo\.app\.twa" class="footer-col-link" target="_blank" rel="noopener noreferrer">Google Play<\/a>\n\1  <\/div>\n\1<\/div>/

function buildNewBlock(indent) {
  return `${indent}<div>\n` +
    `${indent}  <div class="footer-col-title">Télécharger</div>\n` +
    `${indent}  <div class="footer-col-links footer-store-badges">\n` +
    `${indent}    <a href="https://apps.apple.com/us/app/lotbo-local-events/id6779059022" target="_blank" rel="noopener noreferrer">\n` +
    `${indent}      ${APP_STORE_BADGE}\n` +
    `${indent}    </a>\n` +
    `${indent}    <a href="https://play.google.com/store/apps/details?id=app.lotbo.app.twa" target="_blank" rel="noopener noreferrer">\n` +
    `${indent}      ${GOOGLE_PLAY_BADGE}\n` +
    `${indent}    </a>\n` +
    `${indent}  </div>\n` +
    `${indent}</div>`
}

function addComplementaryCss(content, relPath) {
  if (content.includes('.footer-store-badges')) return content

  const cssRe = /([ \t]*)(\.footer-col-links\s*\{[^}]*\}\n?)/
  const match = cssRe.exec(content)
  if (!match) {
    console.log(`ATTENTION — règle CSS .footer-col-links introuvable, CSS non ajouté : ${relPath}`)
    return content
  }

  const indent = match[1]
  const rule = match[2].endsWith('\n') ? match[2] : match[2] + '\n'
  const complementary =
    `${indent}.footer-store-badges { gap: 10px; }\n` +
    `${indent}.footer-store-badges img { display: block; width: auto; }\n`

  const insertAt = match.index + indent.length + rule.length
  return content.slice(0, insertAt) + complementary + content.slice(insertAt)
}

function processFile(absPath) {
  const relPath = path.relative(ROOT, absPath)
  let content = fs.readFileSync(absPath, 'utf8')

  if (content.includes('footer-store-badges') && !OLD_BLOCK_RE.test(content)) {
    console.log(`SKIP (badges déjà présents) : ${relPath}`)
    return
  }

  const match = OLD_BLOCK_RE.exec(content)
  if (!match) {
    console.log(`SKIP (ancien bloc introuvable) : ${relPath}`)
    return
  }

  const indent = match[1]
  content = content.slice(0, match.index) + buildNewBlock(indent) + content.slice(match.index + match[0].length)
  content = addComplementaryCss(content, relPath)

  fs.writeFileSync(absPath, content, 'utf8')
  console.log(`OK : ${relPath}`)
}

function main() {
  const args = process.argv.slice(2)
  let files

  if (args[0] === '--all') {
    const out = execSync(
      `grep -rl "footer-col-title\\">Télécharger" "${ROOT}" --include="*.html"`,
      { encoding: 'utf8' }
    )
    files = out.trim().split('\n').filter(Boolean)
  } else if (args.length > 0) {
    files = args.map(f => path.resolve(ROOT, f))
  } else {
    console.error('Usage: node add-store-badges-footer.js <fichier.html> | --all')
    process.exit(1)
  }

  for (const f of files) processFile(f)
}

main()
