#!/usr/bin/env bash
#
# Envoie Nidoo sur le serveur (par SSH, avec rsync).
#
#   ./deploy.sh           déploie
#   ./deploy.sh --test    montre ce qui serait envoyé ou supprimé, sans rien changer
#
# À lancer depuis l'ordinateur qui a déjà accès SSH au serveur.
# Le serveur et le dossier se règlent ci-dessous, ou sans modifier le fichier :
#   NIDOO_SERVEUR=latanieregeek@mon-serveur.fr ./deploy.sh
#
set -euo pipefail

# ---- Réglages ---------------------------------------------------------------
SERVEUR="${NIDOO_SERVEUR:-latanieregeek@A_REMPLIR}"    # utilisateur@adresse du serveur
DOSSIER="${NIDOO_DOSSIER:-/home/latanieregeek/nidoo}"  # dossier de Nidoo sur le serveur
# -----------------------------------------------------------------------------

cd "$(dirname "$0")"

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
)

if [ "${1:-}" = "--test" ]; then
  options+=(--dry-run)
  echo "🔍 Test : rien ne sera modifié sur le serveur."
fi

echo "🚀 Envoi vers $SERVEUR:$DOSSIER"
if [ "${1:-}" != "--test" ]; then
  ssh "$SERVEUR" "mkdir -p '$DOSSIER'"
fi
rsync "${options[@]}" ./ "$SERVEUR:$DOSSIER/"

echo "✅ Terminé."
