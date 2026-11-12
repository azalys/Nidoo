/*
 * Widget "Solde bancaire" (premium, côté parents uniquement) : comme le widget de
 * l'application de la banque : nom du compte, solde, "au 12/11/26 à 12:06".
 *
 * - Le solde est masqué par défaut ; 👁 l'affiche 30 secondes (et le relit).
 * - Toucher le widget : choisir le compte affiché, ou relier une banque.
 * - Les données passent par api.php (actions banque_…) et Enable Banking :
 *   le navigateur ne voit jamais la clé privée ni les accès bancaires.
 * - Le serveur relit la banque au plus toutes les 6 heures (limite des banques quand
 *   personne n'est devant l'écran) ; 👁 permet une relecture plus fraîche.
 */
(function () {
  const API = 'api.php';
  const VISIBLE_MS = 30 * 1000;            // durée d'affichage du solde après 👁
  const ACTUALISER_MS = 30 * 60 * 1000;    // demande au serveur toutes les 30 min (il garde le solde en mémoire)
  const PREVENIR_JOURS = 14;               // prévenir 14 jours avant la fin de l'autorisation bancaire
  const ATTENTE = 'nidoo.banque.attente';  // widget qui a lancé la connexion (pour y revenir)

  // Noms des soldes renvoyés par les banques (codes standard).
  const TYPES = {
    ITBD: 'Solde du jour',
    CLBD: 'Solde comptable (fin de journée)',
    XPCD: 'Solde prévisionnel',
    ITAV: 'Disponible du jour',
    CLAV: 'Disponible (fin de journée)',
    OPBD: 'Solde en début de journée',
  };

  const OEIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const OEIL_BARRE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>`;

  // Retour de la banque : Nidoo est rouvert avec ?banque=ok (ou un message d'erreur).
  let retour = null;
  try {
    const parametres = new URLSearchParams(location.search);
    if (parametres.has('banque')) {
      retour = { resultat: parametres.get('banque'), widget: localStorage.getItem(ATTENTE) };
      localStorage.removeItem(ATTENTE);
      parametres.delete('banque');
      const reste = parametres.toString();
      history.replaceState(null, '', location.pathname + (reste ? '?' + reste : '') + location.hash);
    }
  } catch (e) {
    // pas de localStorage : tant pis pour le retour automatique
  }
  const messageRetour = (r) =>
    r.resultat === 'ok' ? '✅ Banque reliée. Choisissez le compte à afficher :' : '⚠️ ' + r.resultat;
  // Si le widget qui a lancé la connexion n'est plus là, on affiche quand même le résultat.
  window.addEventListener('load', () =>
    setTimeout(() => {
      if (retour) {
        Nidoo.ouvrirPopin('🏦 Banque', `<p>${Nidoo.echapper(messageRetour(retour))}</p>`);
        retour = null;
      }
    }, 1500)
  );

  async function appel(action, { corps, parametres = '' } = {}) {
    const famille = Nidoo.appareil.lire().famille;
    if (!famille) throw new Error('Débloquez d\'abord les widgets premium.');
    let reponse;
    try {
      reponse = await fetch(API + '?action=' + action + parametres, {
        method: corps ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Nidoo-Famille': famille },
        body: corps ? JSON.stringify(corps) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new Error('Pas de connexion au serveur.');
    }
    const json = await reponse.json().catch(() => {
      throw new Error('api.php ne répond pas (Nidoo doit être servi par PHP).');
    });
    if (!json.ok) throw new Error(json.erreur || 'Erreur du serveur.');
    return json;
  }

  const montantTexte = (montant, devise) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise || 'EUR' }).format(montant);
  const jourTexte = (secondes) =>
    new Date(secondes * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const heureTexte = (secondes) =>
    new Date(secondes * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  Nidoo.declarerWidget({
    type: 'banque',
    nom: 'Solde bancaire',
    icone: '🏦',
    premium: true,
    grilles: ['adulte'],
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'moyen',
    donneesParDefaut: { titre: '', compte: '', nomCompte: '', type: '' },
    reglages: [
      { cle: 'titre', libelle: 'Nom affiché', type: 'texte', exemple: 'Ex. Compte perso Gwen (sinon : le nom donné par la banque)' },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      let info = null;      // dernière réponse du serveur
      let erreur = null;
      let visible = false;
      let minuterie = null;
      let arrete = false;

      function dessiner() {
        const c = d();
        if (!c.compte) {
          zone.innerHTML = `<div class="banque banque-vide">
              <div class="banque-icone">🏦</div>
              <button class="bouton banque-choisir" type="button">Choisir un compte</button>
            </div>`;
          return;
        }
        const solde = info && info.solde;
        let montant;
        if (!solde) montant = `<div class="banque-montant banque-attente">${erreur ? '—' : '…'}</div>`;
        else if (visible) montant = `<div class="banque-montant">${Nidoo.echapper(montantTexte(solde.montant, solde.devise))}</div>`;
        else montant = `<div class="banque-montant banque-cache" aria-label="Solde masqué">••••• €</div>`;

        const maintenant = Date.now() / 1000;
        let bas = '';
        if (info && info.fin && info.fin < maintenant) {
          bas = '⚠️ Accès expiré : touchez pour reconnecter';
        } else if (!solde && erreur) {
          bas = '⚠️ ' + erreur;
        } else if (info && info.lu) {
          bas = 'au ' + jourTexte(info.lu) + ' à ' + heureTexte(info.lu);
          if (erreur) bas += ' ⚠️';
          else if (info.fin && info.fin - maintenant < PREVENIR_JOURS * 86400) bas += ' · ⚠️ accès à renouveler';
        }

        zone.innerHTML = `<div class="banque">
            <div class="banque-haut">
              <span class="banque-nom">${Nidoo.echapper(c.titre || c.nomCompte || 'Compte')}</span>
              <button class="banque-oeil" type="button" aria-label="${visible ? 'Masquer' : 'Afficher'} le solde">${visible ? OEIL_BARRE : OEIL}</button>
            </div>
            ${montant}
            <div class="banque-date" ${erreur ? `title="${Nidoo.echapper(erreur)}"` : ''}>${Nidoo.echapper(bas)}</div>
          </div>`;
      }

      async function charger(present = false) {
        const c = d();
        if (!c.compte) return dessiner();
        try {
          const parametres =
            '&compte=' + encodeURIComponent(c.compte) + (present ? '&present=1' : '') +
            (c.type ? '&type=' + encodeURIComponent(c.type) : '');
          info = await appel('banque_solde', { parametres });
          erreur = info.probleme || null;
        } catch (e) {
          erreur = Nidoo.messageErreur(e);
        }
        if (!arrete) dessiner();
      }

      function basculer() {
        visible = !visible;
        clearTimeout(minuterie);
        if (visible) {
          minuterie = setTimeout(() => {
            visible = false;
            if (!arrete) dessiner();
          }, VISIBLE_MS);
          charger(true);
        }
        dessiner();
      }

      /* La fenêtre "Compte affiché" : les comptes reliés, le type de solde, relier une banque. */
      async function ouvrirComptes(message) {
        const contenu = Nidoo.ouvrirPopin(
          '🏦 Compte affiché',
          `${message ? `<p class="banque-message">${Nidoo.echapper(message)}</p>` : ''}
           <div class="banque-comptes"><p class="aide">Chargement…</p></div>
           <div class="banque-types"></div>
           <h3>Relier une banque</h3>
           <p class="aide">Vous serez envoyé sur le site de la banque pour vous identifier, puis ramené ici.
             L'autorisation dure quelques mois ; il faudra ensuite la renouveler ici.</p>
           <div class="banque-connexion">
             <select class="banque-liste" aria-label="Banque"><option>Chargement…</option></select>
             <button class="bouton bouton-principal banque-connecter" type="button">Se connecter</button>
           </div>
           <p class="erreur banque-erreur"></p>`
        );
        const zoneComptes = contenu.querySelector('.banque-comptes');
        const zoneTypes = contenu.querySelector('.banque-types');
        const liste = contenu.querySelector('.banque-liste');
        const zoneErreur = contenu.querySelector('.banque-erreur');

        // Relier une banque.
        contenu.querySelector('.banque-connecter').addEventListener('click', async (e) => {
          e.target.disabled = true;
          zoneErreur.textContent = '';
          try {
            const r = await appel('banque_connexion', { corps: { banque: liste.value } });
            try {
              localStorage.setItem(ATTENTE, widget.id);
            } catch (x) {}
            location.href = r.url;
          } catch (x) {
            zoneErreur.textContent = Nidoo.messageErreur(x);
            e.target.disabled = false;
          }
        });

        // Les banques disponibles (Boursorama choisie d'avance).
        appel('banque_banques')
          .then(({ banques }) => {
            liste.innerHTML = banques.map((b) => `<option>${Nidoo.echapper(b)}</option>`).join('');
            const bourso = banques.find((b) => /bourso/i.test(b));
            if (bourso) liste.value = bourso;
          })
          .catch((x) => {
            liste.innerHTML = '<option value="">—</option>';
            zoneErreur.textContent = Nidoo.messageErreur(x);
          });

        // Les comptes déjà reliés.
        try {
          const { comptes } = await appel('banque_comptes');
          if (!comptes.length) {
            zoneComptes.innerHTML = '<p class="aide">Aucun compte relié pour l\'instant.</p>';
          } else {
            zoneComptes.innerHTML = comptes
              .map((c) => {
                const details = [c.banque, c.numero && '••' + c.numero, c.titulaire,
                  c.fin && (c.fin * 1000 < Date.now() ? 'accès expiré' : 'accès jusqu\'au ' + jourTexte(c.fin))]
                  .filter(Boolean).join(' · ');
                return `<button type="button" class="banque-compte${c.id === d().compte ? ' choisi' : ''}" data-id="${Nidoo.echapper(c.id)}">
                    <strong>${Nidoo.echapper(c.nom)}</strong><span>${Nidoo.echapper(details)}</span>
                  </button>`;
              })
              .join('');
            zoneComptes.querySelectorAll('.banque-compte').forEach((bouton) =>
              bouton.addEventListener('click', () => {
                const compte = comptes.find((c) => c.id === bouton.dataset.id);
                widget.enregistrer({ ...d(), compte: compte.id, nomCompte: compte.nom, type: '' });
                info = null;
                erreur = null;
                document.getElementById('popin').close();
                charger();
              })
            );
          }
        } catch (x) {
          zoneComptes.innerHTML = `<p class="erreur">${Nidoo.echapper(Nidoo.messageErreur(x))}</p>`;
        }

        // Plusieurs soldes pour ce compte : on peut choisir lequel afficher.
        if (info && info.soldes && info.soldes.length > 1) {
          zoneTypes.innerHTML =
            '<h3>Solde affiché</h3>' +
            info.soldes
              .map((s) => `<button type="button" class="banque-type${info.solde && s.type === info.solde.type ? ' choisi' : ''}" data-type="${Nidoo.echapper(s.type)}">
                  <strong>${Nidoo.echapper(TYPES[s.type] || s.nom || s.type)}</strong>
                  <span>${Nidoo.echapper(montantTexte(s.montant, s.devise))}</span>
                </button>`)
              .join('');
          zoneTypes.querySelectorAll('.banque-type').forEach((bouton) =>
            bouton.addEventListener('click', () => {
              widget.enregistrer({ ...d(), type: bouton.dataset.type });
              document.getElementById('popin').close();
              charger();
            })
          );
        }
      }

      zone.addEventListener('click', (e) => {
        if (e.target.closest('.banque-oeil')) {
          e.stopPropagation();
          basculer();
          return;
        }
        ouvrirComptes();
      });

      // De retour de la banque : on rouvre la fenêtre de ce widget.
      if (retour && retour.widget === widget.id) {
        const r = retour;
        retour = null;
        setTimeout(() => !arrete && ouvrirComptes(messageRetour(r)), 300);
      }

      dessiner();
      charger();
      const intervalle = setInterval(() => charger(), ACTUALISER_MS);
      return () => {
        arrete = true;
        clearInterval(intervalle);
        clearTimeout(minuterie);
      };
    },
  });
})();
