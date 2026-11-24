/*
 * Widget "Chauffage". En l'ajoutant, on choisit d'où viennent les informations :
 *
 *   💡 Conseils        aucun appareil : la bonne température pour ce moment de la journée
 *                      (19 °C le jour, 17 °C la nuit, hors-gel pendant les vacances…),
 *                      ajustée selon Tempo (jour rouge) et le froid annoncé.
 *   🏠 Netatmo         thermostat / vannes Netatmo (et Legrand, Muller Intuitiv, qui
 *                      utilisent la même application « Home + Control » / « Energy »).
 *                      Connexion par le site de Netatmo (api.php, actions netatmo_…).
 *   🔧 Home Assistant  n'importe quel thermostat déjà relié à Home Assistant
 *                      (api.php, action chauffage_ha).
 *   ❄️ Daikin          bientôt.
 *
 * Avec un thermostat : la température de la pièce, la consigne, et − / + pour la changer.
 * Toucher la température ouvre les conseils.
 *
 * Données : { source: 'conseils' | 'netatmo' | 'homeassistant',
 *             ville, lieu, confort, absence,              (conseils)
 *             url, jeton, entite,                          (Home Assistant)
 *             piece: { maison, id, nom } }                 (Netatmo)
 */
(function () {
  const API = 'api.php';
  const ACTUALISER_MS = 10 * 60 * 1000;   // relit le thermostat toutes les 10 minutes
  const ATTENTE_ENVOI_MS = 1200;           // − / + : on attend la fin des appuis avant d'envoyer
  const ATTENTE = 'nidoo.chauffage.attente';
  const instances = new Map();             // id du widget → { connecterNetatmo, choisirPiece }

  const FLAMME = '🔥';

  // ---- Retour du site Netatmo : Nidoo est rouvert avec ?chauffage=ok (ou un message). ----
  let retour = null;
  try {
    const parametres = new URLSearchParams(location.search);
    if (parametres.has('chauffage')) {
      retour = { resultat: parametres.get('chauffage'), widget: localStorage.getItem(ATTENTE) };
      localStorage.removeItem(ATTENTE);
      parametres.delete('chauffage');
      const reste = parametres.toString();
      history.replaceState(null, '', location.pathname + (reste ? '?' + reste : '') + location.hash);
    }
  } catch (e) {
    // pas de localStorage : tant pis pour le retour automatique
  }
  window.addEventListener('load', () =>
    setTimeout(() => {
      if (!retour) return;
      const r = retour;
      retour = null;
      const instance = r.widget && instances.get(r.widget);
      if (r.resultat === 'ok' && instance) instance.choisirPiece('✅ Netatmo est relié. Choisissez la pièce à afficher :');
      else Nidoo.ouvrirPopin('🌡️ Chauffage', `<p>${Nidoo.echapper(r.resultat === 'ok' ? '✅ Netatmo est relié.' : '⚠️ ' + r.resultat)}</p>`);
    }, 1500)
  );

  async function appel(action, { corps, parametres = '' } = {}) {
    const famille = Nidoo.appareil.lire().famille;
    if (!famille) throw new Error('Il faut d\'abord une famille : Modifier → ⚙️ Appareil → « Afficher un code ».');
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

  const degres = (t, decimales = 1) =>
    t === null || t === undefined || isNaN(t) ? '–' : Number(t).toLocaleString('fr-FR', { maximumFractionDigits: decimales }) + '°';

  // ------------------------------------------------------------------
  // Les conseils (sans appareil)
  // ------------------------------------------------------------------

  const NUIT_DEBUT = 22;
  const NUIT_FIN = 6;

  const debutDuJour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  /*
   * La température conseillée maintenant (repères ADEME) :
   *   jour 19 °C (réglable), nuit 17 °C (2 de moins), absence de moins de 2 jours 16 °C,
   *   absence plus longue 8 °C (hors-gel) ; jour rouge Tempo : 1 degré de moins.
   */
  function conseil(donnees, maintenant, tempo) {
    const confort = Math.min(23, Math.max(15, parseFloat(String(donnees.confort || '19').replace(',', '.')) || 19));
    const h = maintenant.getHours();
    const nuit = h >= NUIT_DEBUT || h < NUIT_FIN;

    if (donnees.absence) {
      const retourLe = new Date(donnees.absence + 'T00:00:00');
      if (!isNaN(retourLe) && retourLe > maintenant) {
        const jours = Math.round((retourLe - debutDuJour(maintenant)) / 86400000);
        const longue = jours >= 2;
        return {
          temperature: longue ? 8 : 16,
          raison: longue ? '🧳 Absents : hors-gel' : '🧳 Absents',
          suite: `Retour le ${retourLe.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ` +
            (longue ? 'relancer le chauffage la veille au soir.' : `${degres(confort)} à votre retour.`),
        };
      }
    }
    if (nuit) {
      return { temperature: confort - 2, raison: '🌙 La nuit', suite: `À ${NUIT_FIN} h : ${degres(confort)}` };
    }
    if (tempo === 3) {
      return { temperature: confort - 1, raison: '🔴 Jour rouge Tempo', suite: `À ${NUIT_DEBUT} h : ${degres(confort - 2)}` };
    }
    return { temperature: confort, raison: '☀️ La journée', suite: `À ${NUIT_DEBUT} h : ${degres(confort - 2)}` };
  }

  // Les infos qui changent les conseils : couleur Tempo et températures des prochaines 24 h.
  async function contexte(donnees, widget) {
    const resultat = { tempo: null, froid: null };
    const taches = [
      fetch('https://www.api-couleur-tempo.fr/api/jourTempo/today')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { resultat.tempo = j ? j.codeJour : null; })
        .catch(() => {}),
    ];
    if (donnees.ville) {
      taches.push((async () => {
        let lieu = donnees.lieu;
        if (!lieu || lieu.ville !== donnees.ville) {
          lieu = await Nidoo.trouverVille(donnees.ville);
          widget.enregistrer({ ...widget.donnees, lieu });
        }
        const r = await fetch('https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=2' +
          '&daily=temperature_2m_min,temperature_2m_max&latitude=' + lieu.latitude + '&longitude=' + lieu.longitude);
        const j = await r.json();
        // Demain (si on est le soir) ou cette nuit : la plus basse des deux minimales à venir.
        resultat.froid = Math.min(...j.daily.temperature_2m_min);
        resultat.chaud = Math.max(...j.daily.temperature_2m_max);
        resultat.ville = lieu.nom;
      })().catch(() => {}));
    }
    await Promise.all(taches);
    return resultat;
  }

  function ouvrirConseils(donnees, actuel, ctx) {
    const astuces = [
      ['🌡️', 'Chaque degré en moins, c\'est environ 7 % d\'économies sur le chauffage.'],
      ['🛏️', 'Dans les chambres, 16 à 17 °C suffisent pour bien dormir.'],
      ['🪟', 'Aérer 5 à 10 minutes par jour, chauffage coupé dans la pièce : l\'air sec et propre chauffe plus vite.'],
      ['🛋️', 'Radiateurs dégagés : pas de canapé ni de rideau devant.'],
      ['🧳', 'Absents plus de 2 jours : hors-gel (environ 8 °C). Pour quelques heures, 16 °C.'],
    ];
    if (ctx && ctx.froid !== null && ctx.froid !== undefined && ctx.froid <= 3) {
      astuces.unshift(['🥶', `Il va faire froid (jusqu'à ${degres(ctx.froid, 0)}${ctx.ville ? ' à ' + Nidoo.echapper(ctx.ville) : ''}) : volets et rideaux fermés dès la nuit tombée.`]);
    }
    if (ctx && ctx.chaud !== null && ctx.chaud !== undefined && ctx.chaud >= 15) {
      astuces.unshift(['🌤️', `Jusqu'à ${degres(ctx.chaud, 0)} en journée : chauffage au minimum, on ouvre les volets côté soleil.`]);
    }
    if (ctx && ctx.tempo === 3) {
      astuces.unshift(['🔴', 'Jour rouge Tempo : un degré de moins de 6 h à 22 h, pulls et plaids de sortie.']);
    } else if (ctx && ctx.tempo === 2) {
      astuces.unshift(['⚪', 'Jour blanc Tempo : l\'électricité coûte un peu plus, on évite de monter le chauffage.']);
    }
    Nidoo.ouvrirPopin(
      '🌡️ Bien chauffer la maison',
      `<div class="chauffage-conseils">
         ${actuel ? `<div class="chauffage-conseil-haut"><strong>${degres(actuel.temperature)}</strong>
           <div><b>${actuel.raison}</b><p>${Nidoo.echapper(actuel.suite)}</p></div></div>` : ''}
         <ul>${astuces.map(([e, t]) => `<li><span aria-hidden="true">${e}</span>${t}</li>`).join('')}</ul>
         <p class="aide">Repères de l'ADEME (agence de la transition écologique) : 19 °C dans les pièces à vivre,
           17 °C la nuit, hors-gel pendant les absences.</p>
       </div>`
    );
  }

  // ------------------------------------------------------------------
  // Le widget
  // ------------------------------------------------------------------

  const estSource = (...sources) => (d) => sources.includes(d.source || 'conseils');

  Nidoo.declarerWidget({
    type: 'chauffage',
    nom: 'Chauffage',
    icone: '🌡️',
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'moyen',
    donneesParDefaut: { source: 'conseils', ville: '', confort: '19', absence: '', url: '', jeton: '', entite: '', piece: null },

    // Au moment de l'ajout : d'où viennent les informations ?
    choixAjout: {
      titre: 'Quel chauffage ?',
      cle: 'source',
      options: [
        { valeur: 'conseils', icone: '💡', nom: 'Conseils', description: 'Sans appareil : la bonne température selon l\'heure, Tempo et la météo.' },
        { valeur: 'netatmo', icone: '🏠', nom: 'Netatmo', description: 'Thermostat ou vannes Netatmo, Legrand, Muller Intuitiv.' },
        { valeur: 'homeassistant', icone: '🔧', nom: 'Home Assistant', description: 'Tout thermostat déjà relié à Home Assistant.' },
        { valeur: 'daikin', icone: '❄️', nom: 'Daikin (bientôt)', description: 'Pompes à chaleur Daikin Onecta : pas encore disponible.', indisponible: true },
      ],
    },

    reglages: [
      // Conseils
      { cle: 'ville', libelle: 'Ville (pour le froid annoncé)', type: 'texte', exemple: 'Ex. Nantes', si: estSource('conseils') },
      { cle: 'confort', libelle: 'Température dans la journée (°C)', type: 'texte', exemple: '19', si: estSource('conseils'),
        aide: 'La nuit, 2 degrés de moins.' },
      { cle: 'absence', libelle: 'Absents jusqu\'au (vacances)', type: 'date', si: estSource('conseils'),
        aide: 'Laisser vide si vous êtes là. Au-delà de 2 jours : hors-gel.' },
      // Netatmo
      { cle: 'connexion', libelle: 'Compte Netatmo', type: 'bouton', texte: '🔑 Se connecter à Netatmo', si: estSource('netatmo'),
        action: (w) => instances.get(w.id)?.connecterNetatmo() },
      { cle: 'piece', libelle: 'Pièce affichée', type: 'bouton', texte: '🏠 Choisir la pièce', si: estSource('netatmo'),
        action: (w) => instances.get(w.id)?.choisirPiece() },
      // Home Assistant
      { cle: 'url', libelle: 'Adresse de Home Assistant', type: 'url', exemple: 'https://xxxx.ui.nabu.casa', si: estSource('homeassistant'),
        aide: 'Une adresse https joignable depuis internet (Nabu Casa, ou votre propre nom de domaine).' },
      { cle: 'jeton', libelle: 'Jeton d\'accès longue durée', type: 'texte', si: estSource('homeassistant'),
        aide: 'Home Assistant → votre profil → Sécurité → Jetons d\'accès longue durée → Créer.' },
      { cle: 'entite', libelle: 'Thermostat', type: 'texte', exemple: 'climate.salon', si: estSource('homeassistant') },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      const source = d().source || 'conseils';
      let arrete = false;
      let etat = null;        // thermostat : { nom, mesuree, consigne, mode, action, min, max, pas }
      let erreur = null;
      let ctx = null;         // conseils : Tempo et météo
      let envoi = null;       // minuterie d'envoi de la consigne

      // ---------- Dessin ----------

      function dessinerConseils() {
        const actuel = conseil(d(), new Date(), ctx && ctx.tempo);
        const froid = ctx && ctx.froid !== null && ctx.froid !== undefined && ctx.froid <= 3;
        zone.innerHTML = `
          <button type="button" class="chauffage chauffage-bouton" aria-label="Conseil : ${degres(actuel.temperature)}. Voir les conseils">
            <span class="chauffage-titre">🌡️ Conseillé</span>
            <span class="chauffage-temp">${degres(actuel.temperature)}</span>
            <span class="chauffage-raison">${actuel.raison}</span>
            <span class="chauffage-suite">${Nidoo.echapper(froid ? `🥶 ${degres(ctx.froid, 0)} annoncés : volets fermés` : actuel.suite)}</span>
          </button>`;
      }

      function dessinerThermostat() {
        const nom = source === 'netatmo' ? d().piece && d().piece.nom : etat && etat.nom;
        if (source === 'netatmo' && !d().piece) {
          zone.innerHTML = `<div class="chauffage chauffage-vide">
              <span class="chauffage-icone">🏠</span>
              <span class="chauffage-indication">Modifier → ⚙️ pour relier Netatmo</span>
            </div>`;
          return;
        }
        if (source === 'homeassistant' && !(d().url && d().jeton && d().entite)) {
          zone.innerHTML = `<div class="chauffage chauffage-vide">
              <span class="chauffage-icone">🔧</span>
              <span class="chauffage-indication">Modifier → ⚙️ pour relier Home Assistant</span>
            </div>`;
          return;
        }
        if (!etat) {
          zone.innerHTML = `<div class="chauffage"><p class="widget-message">${erreur ? '⚠️ ' + Nidoo.echapper(erreur) : 'Chargement…'}</p></div>`;
          return;
        }
        const chauffe = etat.action === 'heating' || (source === 'netatmo' && etat.consigne > etat.mesuree + 0.2);
        const eteint = etat.mode === 'off' || etat.mode === 'hg';
        zone.innerHTML = `
          <div class="chauffage chauffage-thermostat${chauffe ? ' chauffage-actif' : ''}">
            <span class="chauffage-titre">${chauffe ? FLAMME + ' ' : ''}${Nidoo.echapper(nom || 'Chauffage')}</span>
            <button type="button" class="chauffage-temp chauffage-ouvrir" aria-label="Il fait ${degres(etat.mesuree)}. Voir les conseils">${degres(etat.mesuree)}</button>
            <span class="chauffage-reglage">
              <button type="button" class="chauffage-moins" aria-label="Baisser la consigne" ${eteint ? 'disabled' : ''}>−</button>
              <span class="chauffage-consigne" aria-live="polite">${eteint ? (etat.mode === 'hg' ? 'Hors-gel' : 'Éteint') : '→ ' + degres(etat.consigne)}</span>
              <button type="button" class="chauffage-plus" aria-label="Monter la consigne" ${eteint ? 'disabled' : ''}>+</button>
            </span>
            ${erreur ? `<span class="chauffage-suite" title="${Nidoo.echapper(erreur)}">⚠️ ${Nidoo.echapper(erreur)}</span>` : ''}
          </div>`;
      }

      function dessiner() {
        if (arrete) return;
        if (source === 'conseils') dessinerConseils();
        else dessinerThermostat();
      }

      // ---------- Lecture ----------

      async function lireThermostat(temperature) {
        if (source === 'homeassistant') {
          const c = d();
          if (!(c.url && c.jeton && c.entite)) return null;
          const corps = { url: c.url, jeton: c.jeton, entite: c.entite };
          if (temperature !== undefined) corps.temperature = temperature;
          return appel('chauffage_ha', { corps });
        }
        if (source === 'netatmo') {
          const piece = d().piece;
          if (!piece) return null;
          if (temperature !== undefined) {
            await appel('netatmo_consigne', { corps: { maison: piece.maison, piece: piece.id, temperature } });
          }
          const r = await appel('netatmo_etat');
          const p = r.pieces.find((x) => x.id === piece.id && x.maison === piece.maison);
          if (!p) throw new Error('Pièce introuvable chez Netatmo.');
          return { ...p, min: 7, max: 30, pas: 0.5 };
        }
        return null;
      }

      async function charger() {
        try {
          if (source === 'conseils') {
            ctx = await contexte(d(), widget);
          } else {
            const r = await lireThermostat();
            if (r) etat = r;
            erreur = null;
          }
        } catch (e) {
          erreur = Nidoo.messageErreur(e);
        }
        dessiner();
      }

      // − / + : la consigne change tout de suite à l'écran, l'envoi part quand on arrête d'appuyer.
      function changerConsigne(ecart) {
        if (!etat || etat.consigne === null) return;
        const pas = etat.pas || 0.5;
        etat.consigne = Math.min(etat.max || 30, Math.max(etat.min || 7, Math.round((etat.consigne + ecart * pas) / pas) * pas));
        dessiner();
        clearTimeout(envoi);
        envoi = setTimeout(async () => {
          try {
            const r = await lireThermostat(etat.consigne);
            if (r) etat = { ...r, consigne: source === 'netatmo' ? etat.consigne : r.consigne };
            erreur = null;
          } catch (e) {
            erreur = Nidoo.messageErreur(e);
          }
          dessiner();
        }, ATTENTE_ENVOI_MS);
      }

      // ---------- Netatmo : connexion et choix de la pièce ----------

      function connecterNetatmo() {
        const contenu = Nidoo.ouvrirPopin(
          '🏠 Se connecter à Netatmo',
          `<p>Netatmo demande que chaque foyer crée sa propre « application » (gratuit, 2 minutes) :</p>
           <ol class="chauffage-etapes">
             <li>Sur <a href="https://dev.netatmo.com/apps/" target="_blank" rel="noopener">dev.netatmo.com</a>,
               connectez-vous avec votre compte Netatmo (ou Legrand / Muller), puis <b>Create</b>.</li>
             <li>Nom : « Nidoo », description : « Ma tablette ». Dans <b>Redirect URI</b>, copiez :
               <code class="chauffage-retour">…</code></li>
             <li>Enregistrez, puis copiez ici le <b>client ID</b> et le <b>client secret</b>.</li>
           </ol>
           <label class="champ"><span class="libelle">Client ID</span><input class="chauffage-id" autocomplete="off" spellcheck="false"></label>
           <label class="champ"><span class="libelle">Client secret</span><input class="chauffage-secret" type="password" autocomplete="off" spellcheck="false"></label>
           <p class="aide">Ils restent sur le serveur de Nidoo (jamais affichés sur les tablettes). Vous serez ensuite envoyé
             sur le site de Netatmo pour autoriser l'accès, puis ramené ici.</p>
           <button class="bouton bouton-principal chauffage-connecter" type="button">Continuer vers Netatmo</button>
           <p class="erreur chauffage-erreur"></p>`
        );
        contenu.querySelector('.chauffage-retour').textContent = new URL('chauffage.php', location.href).href;
        const bouton = contenu.querySelector('.chauffage-connecter');
        const messageErreur = contenu.querySelector('.chauffage-erreur');
        bouton.addEventListener('click', async () => {
          bouton.disabled = true;
          messageErreur.textContent = '';
          try {
            const r = await appel('netatmo_connexion', {
              corps: {
                client_id: contenu.querySelector('.chauffage-id').value.trim(),
                client_secret: contenu.querySelector('.chauffage-secret').value.trim(),
              },
            });
            try { localStorage.setItem(ATTENTE, widget.id); } catch (e) { /* tant pis */ }
            location.href = r.url;
          } catch (e) {
            messageErreur.textContent = Nidoo.messageErreur(e);
            bouton.disabled = false;
          }
        });
      }

      async function choisirPiece(message) {
        const contenu = Nidoo.ouvrirPopin(
          '🏠 Pièce affichée',
          `${message ? `<p>${Nidoo.echapper(message)}</p>` : ''}<div class="choix-listes chauffage-pieces"><p class="aide">Chargement…</p></div>`
        );
        const liste = contenu.querySelector('.chauffage-pieces');
        try {
          const r = await appel('netatmo_etat');
          if (!r.pieces.length) {
            liste.innerHTML = '<p class="aide">Aucune pièce avec un thermostat ou une vanne dans ce compte Netatmo.</p>';
            return;
          }
          liste.innerHTML = r.pieces.map((p, i) => `
            <button class="choix-liste" type="button" data-i="${i}">
              <span>🌡️</span><strong>${Nidoo.echapper(p.nom)}</strong>
              <small>${degres(p.mesuree)} · consigne ${degres(p.consigne)}</small>
            </button>`).join('');
          liste.querySelectorAll('button').forEach((b) =>
            b.addEventListener('click', () => {
              const p = r.pieces[Number(b.dataset.i)];
              widget.enregistrer({ ...d(), piece: { maison: p.maison, id: p.id, nom: p.nom } });
              etat = { ...p, min: 7, max: 30, pas: 0.5 };
              erreur = null;
              contenu.closest('dialog').close();
              dessiner();
            }));
        } catch (e) {
          liste.innerHTML = `<p class="erreur">${Nidoo.echapper(Nidoo.messageErreur(e))}</p>`;
        }
      }

      instances.set(widget.id, { connecterNetatmo, choisirPiece });

      zone.addEventListener('click', (e) => {
        if (e.target.closest('.chauffage-moins')) return changerConsigne(-1);
        if (e.target.closest('.chauffage-plus')) return changerConsigne(1);
        if (e.target.closest('.chauffage-bouton')) return ouvrirConseils(d(), conseil(d(), new Date(), ctx && ctx.tempo), ctx);
        if (e.target.closest('.chauffage-ouvrir')) return ouvrirConseils(d(), null, null);
      });

      dessiner();
      charger();
      const minuteur = setInterval(charger, ACTUALISER_MS);
      // Les conseils changent à 6 h et 22 h : on redessine chaque minute (sans rien relire).
      const horloge = source === 'conseils' ? setInterval(dessiner, 60 * 1000) : null;
      return () => {
        arrete = true;
        clearInterval(minuteur);
        clearInterval(horloge);
        clearTimeout(envoi);
        instances.delete(widget.id);
      };
    },
  });
})();
