#!/usr/bin/env bash
#
# Envoie Nidoo sur le serveur (par SSH, avec rsync).
#
#   ./deploy.sh           déploie
#   ./deploy.sh --test    montre ce qui serait envoyé ou supprimé, sans rien changer
#
# À lancer depuis l'ordinateur qui a déjà accès SSH au serveur.
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
  echo "❌ Indiquez l'adresse du serveur : variable SERVEUR en haut de deploy.sh,"
  echo "   ou : NIDOO_SERVEUR=utilisateur@serveur ./deploy.sh"
  exit 1
fi

for outil in rsync ssh; do
  if ! command -v "$outil" >/dev/null; then
    echo "❌ « $outil » n'est pas installé sur cet ordinateur."
    exit 1
  fi
done

# Prévient si des modifications ne sont pas encore enregistrées dans git
# (elles seront quand même envoyées : on déploie les fichiers tels qu'ils sont).
if command -v git >/dev/null && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "⚠️  Attention : des modifications ne sont pas commitées, elles seront envoyées telles quelles."
fi

options=(
  --archive --compress --verbose --human-readable
  --delete                 # supprime sur le serveur les fichiers retirés du projet
  --exclude '.git/'
  --exclude '.gitignore'
  --exclude '.DS_Store'
  --exclude 'deploy.sh'
  --exclude 'deploy.local'
  --exclude 'deploy.local.exemple'
)

if [ "${1:-}" = "--test" ]; then
  options+=(--dry-run)
  echo "🔍 Test : rien ne sera modifié sur le serveur."
fi

echo "🚀 Envoi vers $SERVEUR:$DOSSIER"
if [ "${1:-}" != "--test" ]; then
  "${ssh_cmd[@]}" "$SERVEUR" "mkdir -p '$DOSSIER'"
fi
rsync "${options[@]}" -e "${ssh_cmd[*]}" ./ "$SERVEUR:$DOSSIER/"

echo "✅ Terminé."
