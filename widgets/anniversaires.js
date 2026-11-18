/*
 * Widget "Anniversaires" : les prochains anniversaires, avec l'âge quand on le connaît.
 *
 * Deux sources :
 *   - les agendas : dans les agendas des widgets Agenda de Nidoo (et d'autres adresses
 *     iCal si on veut), les événements qui reviennent CHAQUE ANNÉE et dont le titre parle
 *     d'anniversaire : « Anniversaire de Mamie », « Anniv Lou 2017 », « 🎂 Paul »…
 *     (l'année écrite dans le titre sert à calculer l'âge) ;
 *   - les dates réglées dans ⚙️, une par ligne : « Mamie : 22/03/1951 », « Lou : 02/12 ».
 * Une date réglée dans ⚙️ remplace celle trouvée dans un agenda pour la même personne.
 */
(function () {
  const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const RELIRE_MS = 6 * 3600 * 1000; // les agendas sont relus toutes les 6 heures

  // « Mamie : 22/03/1951 », « Lou 2/12 », « Paul - 04/07/80 » → { nom, jour, mois, annee }
  function lireDate(ligne) {
    const m = ligne.match(/^(.*?)[\s:–-]*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\s*$/);
    if (!m) return null;
    const jour = Number(m[2]);
    const mois = Number(m[3]);
    if (jour < 1 || jour > 31 || mois < 1 || mois > 12) return null;
    let annee = m[4] ? Number(m[4]) : null;
    if (annee !== null && annee < 100) annee += annee > new Date().getFullYear() % 100 ? 1900 : 2000;
    return { nom: m[1].trim() || 'Anniversaire', jour, mois, annee };
  }

  // Le prochain anniversaire (aujourd'hui compris) : { date, dans (jours), age }
  function prochain(a) {
    const maintenant = new Date();
    const aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const le = (annee) => {
      // 29 février : fêté le 28 les années non bissextiles.
      const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
      return new Date(annee, a.mois - 1, a.mois === 2 && a.jour === 29 && !bissextile ? 28 : a.jour);
    };
    let date = le(aujourdhui.getFullYear());
    if (date < aujourdhui) date = le(aujourdhui.getFullYear() + 1);
    return {
      date,
      dans: Math.round((date - aujourdhui) / 86400000),
      age: a.annee ? date.getFullYear() - a.annee : null,
    };
  }

  function quand(p) {
    if (p.dans === 0) return "Aujourd'hui !";
    if (p.dans === 1) return 'Demain';
    if (p.dans < 7) return 'dans ' + p.dans + ' jours';
    return p.date.getDate() + ' ' + MOIS[p.date.getMonth()];
  }

  const simplifier = (texte) => texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Les adresses d'agenda : celles des widgets Agenda de Nidoo (si demandé), et celles de ⚙️.
  function adressesAgendas(d) {
    const adresses = new Set((d.agendas || []).map((u) => u.trim()).filter(Boolean));
    if (d.chercher !== 'non' && Nidoo.grilleApp) {
      Nidoo.grilleApp.etat().widgets
        .filter((w) => w.type === 'agenda' && w.donnees && (w.donnees.url || '').trim())
        .forEach((w) => adresses.add(w.donnees.url.trim()));
    }
    return [...adresses];
  }

  Nidoo.declarerWidget({
    type: 'anniversaires',
    nom: 'Anniversaires',
    icone: '🎂',
    tailles: ['moyen', 'grand', 'haut3', 'haut4'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { dates: [], chercher: 'oui', agendas: [] },
    reglages: [
      {
        cle: 'dates',
        libelle: 'Anniversaires (un par ligne)',
        type: 'liste',
        aide: 'Ex. « Mamie : 22/03/1951 » ou « Lou : 02/12 » (sans l\'année, l\'âge n\'est pas affiché).',
      },
      {
        cle: 'chercher',
        libelle: 'Chercher aussi dans les agendas',
        type: 'choix',
        options: [
          { valeur: 'oui', libelle: 'Oui, dans les agendas des widgets Agenda' },
          { valeur: 'non', libelle: 'Non, seulement les dates ci-dessus' },
        ],
        aide: 'Les événements qui reviennent chaque année et dont le titre contient « anniv », « anniversaire », '
          + '« birthday » ou 🎂. Écrivez l\'année dans le titre pour avoir l\'âge : « Anniv Lou 2017 ».',
      },
      {
        cle: 'agendas',
        libelle: 'Autres agendas (adresses iCal, une par ligne, facultatif)',
        type: 'liste',
      },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      let trouves = [];   // anniversaires trouvés dans les agendas
      let probleme = null;
      let arrete = false;
      let jourAffiche = null;

      function tous() {
        const reglees = (d().dates || []).map(lireDate).filter(Boolean);
        const noms = new Set(reglees.map((a) => simplifier(a.nom)));
        return [...reglees, ...trouves.filter((a) => !noms.has(simplifier(a.nom)))]
          .map((a) => ({ ...a, ...prochain(a) }))
          .sort((a, b) => a.dans - b.dans || a.nom.localeCompare(b.nom));
      }

      function dessiner() {
        jourAffiche = new Date().toDateString();
        const liste = tous();
        zone.innerHTML = `
          <div class="liste-widget anniversaires">
            <div class="widget-entete"><span>🎂 Anniversaires</span></div>
            <ul class="anniv-liste">
              ${liste.length === 0
                ? `<li class="liste-vide">${probleme ? '📡 ' + Nidoo.echapper(probleme) : 'Ajoutez des anniversaires avec ⚙️'}</li>`
                : ''}
              ${liste.map((a) => `
                <li class="anniv${a.dans === 0 ? ' anniv-aujourdhui' : a.dans < 7 ? ' anniv-bientot' : ''}">
                  <span class="anniv-emoji">${a.dans === 0 ? '🎉' : '🎂'}</span>
                  <span class="anniv-nom">${Nidoo.echapper(a.nom)}</span>
                  <span class="anniv-quand">${quand(a)}${a.age !== null && a.age > 0 ? `<small>${a.age} an${a.age > 1 ? 's' : ''}</small>` : ''}</span>
                </li>`).join('')}
            </ul>
          </div>`;
      }

      async function chargerAgendas() {
        const adresses = adressesAgendas(d());
        if (!adresses.length) {
          trouves = [];
          probleme = null;
          return dessiner();
        }
        const resultats = await Promise.all(adresses.map(async (url) => {
          try {
            const reponse = await fetch('api.php?action=anniversaires&url=' + encodeURIComponent(url), { cache: 'no-store' });
            const json = await reponse.json();
            if (!json.ok) throw new Error(json.erreur);
            return { liste: json.anniversaires };
          } catch (e) {
            return { erreur: e.message === 'Failed to fetch' ? 'Pas de connexion' : e.message };
          }
        }));
        if (arrete) return;
        trouves = resultats.flatMap((r) => r.liste || []);
        const erreurs = resultats.filter((r) => r.erreur);
        probleme = erreurs.length ? 'Agenda illisible : ' + erreurs[0].erreur : null;
        dessiner();
      }

      dessiner();
      // Après le démarrage de la grille (les autres widgets Agenda sont alors connus).
      const depart = setTimeout(chargerAgendas, 300);
      const relire = setInterval(chargerAgendas, RELIRE_MS);
      // À minuit : "Demain" devient "Aujourd'hui !".
      const minuit = setInterval(() => new Date().toDateString() !== jourAffiche && dessiner(), 60 * 1000);
      return () => {
        arrete = true;
        clearTimeout(depart);
        clearInterval(relire);
        clearInterval(minuit);
      };
    },
  });
})();
