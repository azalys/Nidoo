/*
 * Partage entre appareils.
 *
 * 1. Sur un appareil : "⚙️ Appareil" → "Afficher un code" (ex. 4T2B, valable 10 minutes).
 * 2. Sur l'autre : taper ce code → il reprend les grilles de l'autre appareil. Si les deux
 *    appareils ont déjà des widgets dans la même grille (enfant ou adulte), on choisit
 *    laquelle garder ; sinon, chaque grille non vide est gardée telle quelle.
 * 3. Ensuite les appareils restent synchronisés : chaque modification est envoyée à
 *    api.php (sur le serveur), et chaque appareil vient chercher les nouveautés
 *    toutes les 20 secondes (toutes les 5 minutes en mode nuit).
 *
 * Si deux appareils modifient en même temps : pour chaque widget, c'est la
 * modification la plus récente qui gagne (date "maj" posée par js/app.js),
 * sauf pour les widgets qui savent fusionner (ex. Liste : les ajouts des deux côtés sont gardés).
 *
 * La clé de la famille est gardée dans les réglages de l'appareil (Nidoo.appareil),
 * jamais dans le code ni dans git. Le mode nuit reste propre à chaque appareil.
 */
(function () {
  const API = 'api.php';
  const INTERVALLE_MS = 20 * 1000;
  const INTERVALLE_NUIT_MS = 5 * 60 * 1000;
  const GARDER_SUPPRESSIONS_MS = 30 * 24 * 3600 * 1000; // on oublie les suppressions après 30 jours

  const cle = () => Nidoo.appareil.lire().famille || null;

  let enCours = false;
  let encore = false;
  let derniere = null;     // date de la dernière synchro réussie
  let probleme = null;     // message s'il y a un souci

  /* ---- Échanges avec api.php ------------------------------------------ */

  async function requete(action, { corps, avecCle = false, cleFamille = null } = {}) {
    const entetes = { 'Content-Type': 'application/json' };
    if (avecCle) entetes['X-Nidoo-Famille'] = cleFamille || cle();
    let reponse;
    try {
      reponse = await fetch(API + '?action=' + action, {
        method: corps ? 'POST' : 'GET',
        headers: entetes,
        body: corps ? JSON.stringify(corps) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new Error('Pas de connexion au serveur.');
    }
    const json = await reponse.json().catch(() => {
      throw new Error('api.php ne répond pas (Nidoo doit être servi par PHP).');
    });
    if (!json.ok && !json.conflit) {
      const erreur = new Error(json.erreur || 'Erreur du serveur.');
      erreur.statut = reponse.status;
      throw erreur;
    }
    return json;
  }

  /* ---- Fusion de deux états -------------------------------------------- */

  function normaliser(e) {
    return {
      widgets: Array.isArray(e && e.widgets) ? e.widgets : [],
      supprimes: e && e.supprimes && !Array.isArray(e.supprimes) ? e.supprimes : {},
    };
  }

  // Réunit deux états : le plus récent de chaque widget, sans les widgets supprimés depuis.
  function fusionner(a, b) {
    const supprimes = { ...a.supprimes };
    Object.entries(b.supprimes).forEach(([id, t]) => (supprimes[id] = Math.max(supprimes[id] || 0, t)));
    const limite = Date.now() - GARDER_SUPPRESSIONS_MS;
    Object.keys(supprimes).forEach((id) => supprimes[id] < limite && delete supprimes[id]);

    const parId = new Map();
    const ordre = [];
    [...a.widgets, ...b.widgets].forEach((w) => {
      const deja = parId.get(w.id);
      if (!deja) {
        ordre.push(w.id);
        parId.set(w.id, w);
        return;
      }
      const recent = (w.maj || 0) > (deja.maj || 0) ? w : deja;
      const ancien = recent === w ? deja : w;
      // Certains widgets savent fusionner leurs données (ex. Liste : élément par élément).
      const definition = Nidoo.catalogue[w.type];
      if (definition && definition.fusionner && JSON.stringify(w) !== JSON.stringify(deja)) {
        parId.set(w.id, { ...recent, donnees: definition.fusionner(ancien.donnees || {}, recent.donnees || {}) });
      } else {
        parId.set(w.id, recent);
      }
    });
    const widgets = ordre.map((id) => parId.get(id)).filter((w) => !(supprimes[w.id] >= (w.maj || 0)));
    return { widgets, supprimes };
  }

  // Pour comparer deux états sans tenir compte de l'ordre.
  function signature(e) {
    const widgets = [...e.widgets].sort((x, y) => (x.id < y.id ? -1 : 1));
    const supprimes = Object.keys(e.supprimes).sort().map((k) => [k, e.supprimes[k]]);
    return JSON.stringify([widgets, supprimes]);
  }

  /* ---- Synchronisation -------------------------------------------------- */

  async function synchroniser() {
    if (!cle()) return;
    if (enCours) {
      encore = true;
      return;
    }
    enCours = true;
    try {
      // Jusqu'à 3 essais si un autre appareil écrit en même temps.
      for (let essai = 0; essai < 3; essai++) {
        const distant = await requete('lire', { avecCle: true });
        const etatDistant = normaliser(distant.etat);
        const local = Nidoo.grilleApp.etat();
        const fusion = fusionner(local, etatDistant);

        if (signature(fusion) !== signature(local)) Nidoo.grilleApp.appliquer(fusion);
        if (distant.etat && signature(fusion) === signature(etatDistant)) break; // rien à envoyer

        const resultat = await requete('ecrire', { avecCle: true, corps: { version: distant.version, etat: fusion } });
        if (resultat.ok) break; // sinon : conflit, on recommence
      }
      derniere = new Date();
      probleme = null;
    } catch (erreur) {
      probleme = erreur.statut === 401 ? 'Ce lien n\'existe plus sur le serveur. Déliez puis reliez cet appareil.' : erreur.message;
    }
    enCours = false;
    afficherStatut();
    if (encore) {
      encore = false;
      synchroniser();
    }
  }

  // Après une modification sur cet appareil : on envoie 1,5 s plus tard (regroupe les frappes).
  let attente = null;
  document.addEventListener('nidoo:modifie', () => {
    if (!cle()) return;
    clearTimeout(attente);
    attente = setTimeout(synchroniser, 1500);
  });

  // Régulièrement : on va chercher les nouveautés des autres appareils.
  let dernierPassage = 0;
  setInterval(() => {
    if (!cle() || document.visibilityState !== 'visible') return;
    const intervalle = document.body.classList.contains('nuit') ? INTERVALLE_NUIT_MS : INTERVALLE_MS;
    if (Date.now() - dernierPassage < intervalle) return;
    dernierPassage = Date.now();
    synchroniser();
  }, 5000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && synchroniser());

  /* ---- Fenêtre "⚙️ Appareil" : section Partage ------------------------- */

  const statut = document.getElementById('partage-statut');
  const zoneCode = document.getElementById('partage-code');
  const codeGros = zoneCode.querySelector('.code-gros');
  const codeExpire = zoneCode.querySelector('.code-expire');
  const boutonCode = document.getElementById('partage-afficher');
  const boutonDelier = document.getElementById('partage-delier');
  const formulaire = document.getElementById('partage-rejoindre');
  const saisie = document.getElementById('partage-saisie');
  const zoneErreur = document.getElementById('partage-erreur');
  let compteARebours = null;

  const heure = (d) => String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');

  function afficherStatut() {
    const relie = !!cle();
    boutonDelier.hidden = !relie;
    if (!relie) {
      statut.textContent = 'Cet appareil n\'est relié à aucun autre. Affichez un code ici, puis tapez-le sur l\'autre appareil (ou l\'inverse).';
    } else if (probleme) {
      statut.textContent = '📡 ' + probleme;
    } else if (derniere) {
      statut.textContent = '✅ Relié aux autres appareils de la famille · synchronisé à ' + heure(derniere);
    } else {
      statut.textContent = '✅ Relié aux autres appareils de la famille.';
    }
  }

  function montrerErreur(message) {
    zoneErreur.textContent = message || '';
  }

  boutonCode.addEventListener('click', async () => {
    montrerErreur('');
    boutonCode.disabled = true;
    try {
      const r = await requete('code', { corps: { famille: cle() } });
      Nidoo.appareil.modifier({ famille: r.famille });
      await synchroniser(); // envoie la grille de cet appareil pour l'autre
      codeGros.textContent = r.code;
      zoneCode.hidden = false;
      boutonCode.textContent = 'Nouveau code';
      const fin = Date.now() + r.expire * 1000;
      clearInterval(compteARebours);
      const tic = () => {
        const reste = Math.max(0, Math.round((fin - Date.now()) / 1000));
        codeExpire.textContent = reste > 0
          ? `À taper sur l'autre appareil · valable encore ${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`
          : 'Code expiré : demandez-en un nouveau.';
        if (reste === 0) clearInterval(compteARebours);
      };
      tic();
      compteARebours = setInterval(tic, 1000);
    } catch (erreur) {
      montrerErreur(erreur.message);
    }
    boutonCode.disabled = false;
    afficherStatut();
  });

  saisie.addEventListener('input', () => {
    saisie.value = saisie.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  /*
   * Au moment de relier : chaque appareil a peut-être déjà une grille enfant et une
   * grille adulte. Pour chacune : si un seul côté a des widgets, on garde celle-là ;
   * si les deux en ont, on demande laquelle garder. Renvoie { enfant: 'ici'|'autre', adulte: … },
   * ou null si on annule.
   */
  const GRILLES = [
    { cle: 'enfant', nom: 'Grille enfant' },
    { cle: 'adulte', nom: 'Grille adulte' },
  ];
  const deLaGrille = (etat, g) => etat.widgets.filter((w) => (w.grille || 'enfant') === g);

  function choisirGrilles(ici, autre) {
    const choix = {};
    const aDemander = [];
    GRILLES.forEach((g) => {
      const nIci = deLaGrille(ici, g.cle).length;
      const nAutre = deLaGrille(autre, g.cle).length;
      if (!nAutre) choix[g.cle] = 'ici';
      else if (!nIci) choix[g.cle] = 'autre';
      else aDemander.push({ ...g, nIci, nAutre });
    });
    if (!aDemander.length) return Promise.resolve(choix);

    return new Promise((resoudre) => {
      const pluriel = (n) => n + ' widget' + (n > 1 ? 's' : '');
      const contenu = Nidoo.ouvrirPopin(
        '🔗 Quelles grilles garder ?',
        `<form class="champs choix-grilles">
           <p class="aide">Les deux appareils ont déjà des widgets. Pour chaque grille, choisissez celle à garder :
             elle remplacera l'autre sur tous les appareils reliés.</p>
           ${aDemander.map((g) => `
             <fieldset class="choix-grille">
               <legend>${g.nom}</legend>
               <label><input type="radio" name="${g.cle}" value="autre" checked> Celle de l'autre appareil (${pluriel(g.nAutre)})</label>
               <label><input type="radio" name="${g.cle}" value="ici"> Celle de cet appareil (${pluriel(g.nIci)})</label>
             </fieldset>`).join('')}
           <div class="boutons-fenetre">
             <button type="button" class="bouton choix-annuler">Annuler</button>
             <button type="submit" class="bouton bouton-principal">Relier</button>
           </div>
         </form>`
      );
      const dialogue = contenu.closest('dialog');
      const form = contenu.querySelector('form');
      let repondu = false;
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        aDemander.forEach((g) => (choix[g.cle] = form.elements[g.cle].value));
        repondu = true;
        dialogue.close();
        resoudre(choix);
      });
      form.querySelector('.choix-annuler').addEventListener('click', () => dialogue.close());
      dialogue.addEventListener('close', () => !repondu && resoudre(null), { once: true });
    });
  }

  // Construit l'état commun à partir des grilles choisies ; les widgets écartés sont
  // marqués supprimés pour qu'ils ne reviennent pas à la synchro suivante.
  function assembler(ici, autre, choix) {
    const widgets = [];
    const supprimes = { ...autre.supprimes };
    Object.entries(ici.supprimes).forEach(([id, t]) => (supprimes[id] = Math.max(supprimes[id] || 0, t)));
    const maintenant = Date.now();
    GRILLES.forEach((g) => {
      const garde = deLaGrille(choix[g.cle] === 'ici' ? ici : autre, g.cle);
      const ecarte = deLaGrille(choix[g.cle] === 'ici' ? autre : ici, g.cle);
      const ids = new Set(garde.map((w) => w.id));
      garde.forEach((w) => widgets.push({ ...w, maj: Math.max(w.maj || 0, maintenant) }));
      ecarte.forEach((w) => !ids.has(w.id) && (supprimes[w.id] = maintenant));
    });
    return { widgets, supprimes };
  }

  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    montrerErreur('');
    if (saisie.value.length !== 4) return montrerErreur('Le code fait 4 caractères.');
    try {
      const r = await requete('rejoindre', { corps: { code: saisie.value } });
      const distant = await requete('lire', { avecCle: true, cleFamille: r.famille });
      const autre = normaliser(distant.etat);
      const ici = Nidoo.grilleApp.etat();
      const choix = await choisirGrilles(ici, autre);
      if (!choix) return; // annulé : rien n'a changé
      Nidoo.appareil.modifier({ famille: r.famille });
      Nidoo.grilleApp.remplacer(assembler(ici, autre, choix));
      saisie.value = '';
      zoneCode.hidden = true;
      await synchroniser();
    } catch (erreur) {
      montrerErreur(erreur.message);
    }
    afficherStatut();
  });

  boutonDelier.addEventListener('click', () => {
    if (!confirm('Délier cet appareil ? Il garde sa grille actuelle, mais ne sera plus synchronisé.')) return;
    Nidoo.appareil.modifier({ famille: null });
    zoneCode.hidden = true;
    clearInterval(compteARebours);
    boutonCode.textContent = 'Afficher un code';
    derniere = null;
    probleme = null;
    afficherStatut();
  });

  document.getElementById('appareil').addEventListener('nidoo:ouverture', () => {
    montrerErreur('');
    afficherStatut();
  });

  // Pour les tests et le débogage.
  Nidoo.synchro = { synchroniser, fusionner };

  afficherStatut();
  synchroniser();
})();
