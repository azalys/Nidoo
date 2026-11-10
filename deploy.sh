#!/usr/bin/env bash
#
# Envoie Nidoo sur le serveur (par SSH, avec rsync).
#
#   ./deploy.sh              récupère la dernière version (git pull), puis déploie
#   ./deploy.sh --test       montre ce qui serait envoyé ou supprimé, sans rien changer
#   ./deploy.sh --sans-pull  déploie les fichiers tels qu'ils sont, sans git pull
#
# Ce qui est envoyé : les fichiers de CE dossier (y compris les modifications pas encore
# commitées). Le serveur est remplacé par cette version.
#
# Pour que les navigateurs (et la webapp sur iPad) ne gardent pas d'anciens fichiers
# en mémoire, la copie envoyée ajoute un numéro de version à chaque fichier CSS et JS
# dans index.html (ex. js/app.js?v=…). Les fichiers de ce dossier ne sont pas modifiés.
#
# Réglages personnels (jamais commités) : fichier deploy.local à côté de ce script,
# voir deploy.local.exemple. On peut y mettre le serveur, le dossier et, si on n'utilise
# pas de clé SSH, le mot de passe (il faut alors installer "sshpass").
#
set -euo pipefail

# ---- Réglages ---------------------------------------------------------------
SERVEUR="${NIDOO_SERVEUR:-latanieregeek@A_REMPLIR}"    # utilisateur@adresse du serveur
DOSSIER="${NIDOO_DOSSIER:-/home/latanieregeek/nidoo}"  # dossier de Nidoo sur le serveur
# -----------------------------------------------------------------------------

cd "$(dirname "$0")"

TEST=false
PULL=true
for argument in "$@"; do
  case "$argument" in
    --test) TEST=true ;;
    --sans-pull) PULL=false ;;
    *) echo "❌ Option inconnue : $argument (options : --test, --sans-pull)"; exit 1 ;;
  esac
done

# Réglages personnels, s'ils existent.
if [ -f deploy.local ]; then
  # shellcheck disable=SC1091
  source deploy.local
fi
SERVEUR="${NIDOO_SERVEUR:-$SERVEUR}"
DOSSIER="${NIDOO_DOSSIER:-$DOSSIER}"

# Avec un mot de passe : sshpass le donne à ssh (variable d'environnement, jamais en clair
# dans la liste des processus). Sans mot de passe : ssh normal (clé SSH recommandée).
ssh_cmd=(ssh)
if [ -n "${NIDOO_MOT_DE_PASSE:-}" ]; then
  if ! command -v sshpass >/dev/null; then
    echo "❌ Un mot de passe est réglé dans deploy.local, mais « sshpass » n'est pas installé."
    echo "   macOS : brew install hudochenkov/sshpass/sshpass   ·   Debian/Ubuntu : sudo apt install sshpass"
    exit 1
  fi
  export SSHPASS="$NIDOO_MOT_DE_PASSE"
  ssh_cmd=(sshpass -e ssh)
fi

if [[ "$SERVEUR" == *A_REMPLIR* ]]; then
  echo "❌ Indiquez l'adresse du serveur dans deploy.local (voir deploy.local.exemple),"
  echo "   ou : NIDOO_SERVEUR=utilisateur@serveur ./deploy.sh"
  exit 1
fi

for outil in rsync ssh git; do
  if ! command -v "$outil" >/dev/null; then
    echo "❌ « $outil » n'est pas installé sur cet ordinateur."
    exit 1
  fi
done

# ---- 1. Récupérer la dernière version depuis GitHub -------------------------
if $PULL; then
  branche="$(git rev-parse --abbrev-ref HEAD)"
  echo "⬇️  Récupération de la dernière version (branche $branche)…"
  # --autostash : les modifications pas encore commitées sont mises de côté puis remises.
  if ! git pull --rebase --autostash; then
    git rebase --abort 2>/dev/null || true
    echo
    echo "❌ La récupération a échoué (conflit avec vos modifications locales, ou pas d'accès à GitHub)."
    echo "   Rien n'a été envoyé. Vos fichiers sont revenus comme avant."
    echo "   Regardez « git status », réglez le problème, ou déployez quand même avec : ./deploy.sh --sans-pull"
    exit 1
  fi
fi

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "⚠️  Des modifications ne sont pas commitées : elles seront envoyées telles quelles."
fi

# ---- 2. Préparer la copie à envoyer -----------------------------------------
version="$(git rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)"
copie="$(mktemp -d)"
trap 'rm -rf "$copie"' EXIT

exclusions=(
  --exclude '.git/'
  --exclude '.gitignore'
  --exclude '.DS_Store'
  --exclude 'deploy.sh'
  --exclude 'deploy.local'
  --exclude 'deploy.local.exemple'
)
rsync --archive "${exclusions[@]}" ./ "$copie/"

# Numéro de version sur les fichiers CSS et JS du projet (pas sur Google Fonts).
sed -E \
  -e "s#(src=\"(js|widgets)/[^\"?]+\\.js)\"#\\1?v=$version\"#g" \
  -e "s#(href=\"css/[^\"?]+\\.css)\"#\\1?v=$version\"#g" \
  "$copie/index.html" > "$copie/index.html.tmp"
mv "$copie/index.html.tmp" "$copie/index.html"
echo "$version" > "$copie/version.txt"

# ---- 3. Envoyer --------------------------------------------------------------
options=(
  --archive --compress --verbose --human-readable --checksum
  --delete                 # supprime sur le serveur les fichiers retirés du projet
  "${exclusions[@]}"
)
if $TEST; then
  options+=(--dry-run)
  echo "🔍 Test : rien ne sera modifié sur le serveur."
fi

echo "🚀 Envoi de la version $version vers $SERVEUR:$DOSSIER"
if ! $TEST; then
  "${ssh_cmd[@]}" "$SERVEUR" "mkdir -p '$DOSSIER'"
fi
rsync "${options[@]}" -e "${ssh_cmd[*]}" "$copie/" "$SERVEUR:$DOSSIER/"

# ---- 4. Vérifier -------------------------------------------------------------
if ! $TEST; then
  sur_le_serveur="$("${ssh_cmd[@]}" "$SERVEUR" "cat '$DOSSIER/version.txt' 2>/dev/null" || true)"
  if [ "$sur_le_serveur" = "$version" ]; then
    echo "✅ Terminé : le serveur a bien la version $version."
    echo "   (Dans le navigateur : recharger la page. Sur iPad : fermer et rouvrir la webapp.)"
  else
    echo "⚠️  Envoi terminé, mais le serveur indique la version « $sur_le_serveur » au lieu de « $version »."
    exit 1
  fi
else
  echo "✅ Test terminé."
fi
