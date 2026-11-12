#!/usr/bin/env bash
#
# Dépose sur le serveur ce qui ne doit JAMAIS aller dans git (le dépôt est public) :
#
#   ./premium.sh --cle ~/Downloads/fichier.pem   la clé privée Enable Banking (widget Solde bancaire)
#   ./premium.sh --mot-de-passe                  le mot de passe des widgets premium (tapé au clavier, caché)
#   ./premium.sh --cle ~/Downloads/fichier.pem --mot-de-passe   les deux d'un coup
#
# Utilise les mêmes réglages que deploy.sh (fichier deploy.local : serveur, dossier, mot de passe SSH).
# Les fichiers vont dans le dossier des données, À CÔTÉ du site (pas accessible depuis internet) :
#   nidoo-donnees/premium.txt
#   nidoo-donnees/enablebanking/IDENTIFIANT-APPLICATION.pem
#
set -euo pipefail

SERVEUR="${NIDOO_SERVEUR:-utilisateur@A_REMPLIR}"
DOSSIER="${NIDOO_DOSSIER:-}"
APPLICATION="d5076923-cca3-44c5-be0a-2bc867dbf073"   # identifiant de l'application Enable Banking (pas secret)

cd "$(dirname "$0")"

CLE=""
MOT_DE_PASSE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --cle) CLE="${2:-}"; shift 2 || { echo "❌ --cle : indiquez le fichier .pem"; exit 1; } ;;
    --application) APPLICATION="${2:-}"; shift 2 ;;
    --mot-de-passe) MOT_DE_PASSE=true; shift ;;
    *) echo "❌ Option inconnue : $1 (options : --cle FICHIER.pem, --mot-de-passe, --application ID)"; exit 1 ;;
  esac
done
if [ -z "$CLE" ] && ! $MOT_DE_PASSE; then
  echo "Usage : ./premium.sh --cle ~/Downloads/fichier.pem   et/ou   ./premium.sh --mot-de-passe"
  exit 1
fi

# Réglages personnels (les mêmes que pour deploy.sh).
if [ -f deploy.local ]; then
  # shellcheck disable=SC1091
  source deploy.local
fi
SERVEUR="${NIDOO_SERVEUR:-$SERVEUR}"
DOSSIER="${NIDOO_DOSSIER:-$DOSSIER}"
# Par défaut : le dossier "nidoo" de l'utilisateur du serveur (ex. /home/moi/nidoo).
[ -n "$DOSSIER" ] || DOSSIER="/home/${SERVEUR%%@*}/nidoo"
if [[ "$SERVEUR" == *A_REMPLIR* ]]; then
  echo "❌ Indiquez l'adresse du serveur dans deploy.local (voir deploy.local.exemple)."
  exit 1
fi

ssh_cmd=(ssh)
if [ -n "${NIDOO_MOT_DE_PASSE:-}" ]; then
  if ! command -v sshpass >/dev/null; then
    echo "❌ Un mot de passe est réglé dans deploy.local, mais « sshpass » n'est pas installé."
    exit 1
  fi
  export SSHPASS="$NIDOO_MOT_DE_PASSE"
  ssh_cmd=(sshpass -e ssh)
fi

DONNEES="$(dirname "$DOSSIER")/nidoo-donnees"
echo "📁 Dossier des données sur le serveur : $SERVEUR:$DONNEES"
"${ssh_cmd[@]}" "$SERVEUR" "mkdir -p '$DONNEES' && chmod 700 '$DONNEES' && ls '$DONNEES' | grep -c '^famille-' || true" \
  | { read -r n; echo "   ($n famille(s) déjà enregistrée(s) dans ce dossier)"; }

# ---- La clé Enable Banking -------------------------------------------------
if [ -n "$CLE" ]; then
  if [ ! -f "$CLE" ]; then
    echo "❌ Fichier introuvable : $CLE"
    exit 1
  fi
  if ! grep -q -- "-----BEGIN .*PRIVATE KEY-----" "$CLE"; then
    echo "❌ $CLE ne ressemble pas à une clé privée (.pem téléchargé à la création de l'application)."
    exit 1
  fi
  if [[ ! "$APPLICATION" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo "❌ Identifiant d'application incorrect : $APPLICATION"
    exit 1
  fi
  # Envoyée par l'entrée de ssh : jamais écrite ailleurs, lisible seulement par vous sur le serveur.
  "${ssh_cmd[@]}" "$SERVEUR" "umask 077 && mkdir -p '$DONNEES/enablebanking' && cat > '$DONNEES/enablebanking/$APPLICATION.pem'" < "$CLE"
  echo "🔑 Clé déposée : $DONNEES/enablebanking/$APPLICATION.pem"
fi

# ---- Le mot de passe des widgets premium -----------------------------------
if $MOT_DE_PASSE; then
  read -r -s -p "Mot de passe des widgets premium : " premier; echo
  read -r -s -p "Encore une fois : " second; echo
  if [ -z "$premier" ] || [ "$premier" != "$second" ]; then
    echo "❌ Les deux mots de passe sont vides ou différents. Rien n'a été changé."
    exit 1
  fi
  printf '%s\n' "$premier" | "${ssh_cmd[@]}" "$SERVEUR" "umask 077 && cat > '$DONNEES/premium.txt'"
  echo "🔒 Mot de passe enregistré : $DONNEES/premium.txt"
fi

echo "✅ Terminé. (Rien de tout cela n'est dans git ni dans le site public.)"
