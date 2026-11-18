/*
 * Widget "Emploi du temps" : les cours du jour le matin, ceux du lendemain l'après-midi.
 *
 *   - avant midi : les cours d'aujourd'hui ;
 *   - à partir de midi : ceux de demain (pour préparer le cartable) ;
 *   - un jour sans cours (mercredi après-midi, week-end…) : on passe au prochain jour
 *     qui en a, ex. le vendredi après-midi on voit déjà le lundi.
 *
 * Réglages (⚙️) : pour qui, et les cours de chaque jour, un par ligne,
 * avec l'heure au début si on veut : « 8h30 Maths », « 14h Piscine ».
 *
 * Semaines A et B (facultatif) : dans ⚙️, une date d'une semaine A ; les semaines
 * alternent ensuite A, B, A, B… Dans les cours, « A: » ou « B: » devant ceux qui n'ont
 * lieu qu'une semaine sur deux (ex. « A: 14h Piscine ») ; les autres ont lieu chaque semaine.
 */
(function () {
  // Clés des réglages, dans l'ordre de getDay() : 0 = dimanche.
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  /*
   * L'emoji de chaque cours : celui mis en début de ligne, sinon deviné d'après les mots
   * (début de mot, sans accents ni majuscules ; la première correspondance gagne), sinon 📘.
   */
  const EMOJIS = [
    [['math', 'calcul', 'geometrie'], '📐'],
    [['francais', 'grammaire', 'conjugaison', 'orthographe'], '📖'],
    [['dictee', 'ecriture', 'redaction'], '✏️'],
    [['lecture', 'bibliotheque', 'cdi'], '📚'],
    [['poesie', 'poeme'], '📜'],
    [['anglais', 'english'], '🇬🇧'],
    [['espagnol'], '🇪🇸'],
    [['allemand'], '🇩🇪'],
    [['italien'], '🇮🇹'],
    [['latin', 'grec'], '🏺'],
    [['geo', 'hist-geo', 'histoire-geo', 'histoire geo'], '🌍'],
    [['histoire'], '🏛️'],
    [['svt', 'sciences de la vie', 'biologie'], '🌱'],
    [['physique', 'chimie', 'sciences', 'pc'], '🧪'],
    [['techno'], '🔧'],
    [['informatique', 'numerique', 'ordinateur'], '💻'],
    [['piscine', 'natation'], '🏊'],
    [['eps', 'sport', 'gym', 'athletisme', 'foot', 'basket', 'hand', 'judo', 'danse'], '🏃'],
    [['musique', 'chant', 'chorale', 'flute', 'education musicale'], '🎵'],
    [['art', 'dessin', 'peinture', 'plastique'], '🎨'],
    [['theatre'], '🎭'],
    [['emc', 'civique', 'morale'], '⚖️'],
    [['vie de classe', 'heure de vie'], '🗣️'],
    [['etude', 'devoir', 'perm', 'aide'], '📝'],
    [['recre'], '🛝'],
    [['cantine', 'repas', 'dejeuner', 'self'], '🍽️'],
    [['sortie', 'visite', 'voyage'], '🚌'],
  ];
  const EMOJI_DEBUT = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\p{Regional_Indicator}{2})\s*/u;
  // "8h30", "8 h", "08:30", "14h" au début de la ligne (suivi ou non de "-" ou ":")
  const HEURE_DEBUT = /^(\d{1,2})\s*[h:]\s*(\d{2})?\s*[-–:]?\s*/i;

  // « A: », « B - », « (A) », « Sem. A : » au début, ou « (A) » à la fin de la ligne.
  const SEMAINE_DEBUT = /^(?:sem(?:aine|\.)?\s*)?\(?([AB])\)?\s*[:\-–]\s*|^\(([AB])\)\s*/i;
  const SEMAINE_FIN = /\s*\(([AB])\)\s*$/i;

  // "A: 8h30 Maths" → { semaine: 'A', heure: '8h30', emoji: '📐', texte: 'Maths' }
  function lireCours(ligne) {
    let reste = ligne.trim();
    let semaine = '';
    let heure = '';
    let emoji = '';
    let m = reste.match(SEMAINE_DEBUT) || reste.match(SEMAINE_FIN);
    if (m) {
      semaine = (m[1] || m[2]).toUpperCase();
      reste = reste.replace(m[0], ' ').trim();
    }
    m = reste.match(EMOJI_DEBUT);
    if (m) {
      emoji = m[1];
      reste = reste.slice(m[0].length);
    }
    m = reste.match(HEURE_DEBUT);
    if (m && Number(m[1]) < 24) {
      heure = Number(m[1]) + 'h' + (m[2] || '');
      reste = reste.slice(m[0].length);
    }
    if (!emoji) {
      m = reste.match(EMOJI_DEBUT);
      if (m) {
        emoji = m[1];
        reste = reste.slice(m[0].length);
      }
    }
    if (!emoji) {
      const simple = reste.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const debutDeMot = (mot) => new RegExp('(^|[^a-z])' + mot.replace(/[-]/g, '\\-')).test(simple);
      const trouve = EMOJIS.find(([mots]) => mots.some(debutDeMot));
      emoji = trouve ? trouve[1] : '📘';
    }
    return { semaine, heure, emoji, texte: reste || ligne.trim() };
  }

  /*
   * Semaine A ou B d'un jour, d'après la date de référence (un jour d'une semaine A) :
   * on compte les semaines (du lundi au dimanche) d'écart. '' si pas de semaines A/B.
   */
  function semaineDe(jour, reference) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reference || '')) return '';
    const lundi = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const [a, mo, j] = reference.split('-').map(Number);
    const ecart = Math.round((lundi(jour) - lundi(new Date(a, mo - 1, j))) / (7 * 86400000));
    return ecart % 2 === 0 ? 'A' : 'B';
  }

  /*
   * Le jour à afficher : aujourd'hui avant midi, demain à partir de midi ;
   * s'il n'y a pas cours ce jour-là, le prochain jour qui a des cours.
   */
  function jourAffiche(donnees) {
    const maintenant = new Date();
    const depart = maintenant.getHours() < 12 ? 0 : 1;
    for (let ecart = depart; ecart < depart + 14; ecart++) {
      const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + ecart);
      const semaine = semaineDe(jour, donnees.semaineA);
      // Sans semaine A/B réglée, on garde tous les cours (ceux d'une seule semaine sont marqués).
      const cours = (donnees[JOURS[jour.getDay()]] || [])
        .map(lireCours)
        .filter((c) => !semaine || !c.semaine || c.semaine === semaine);
      if (cours.length) return { ecart, nom: JOURS[jour.getDay()], cours, semaine };
    }
    return null;
  }

  // Change à midi et à minuit (pour savoir quand redessiner).
  function cleDuMoment() {
    const d = new Date();
    return d.toDateString() + (d.getHours() < 12 ? '-matin' : '-apres-midi');
  }

  const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

  Nidoo.declarerWidget({
    type: 'emploi-du-temps',
    nom: 'Emploi du temps',
    icone: '🎒',
    tailles: ['moyen', 'grand'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { titre: '', lundi: [], mardi: [], mercredi: [], jeudi: [], vendredi: [], samedi: [] },
    reglages: [
      { cle: 'titre', libelle: 'Pour qui ? (facultatif)', type: 'texte', exemple: 'Ex. Léa' },
      {
        cle: 'semaineA',
        libelle: 'Semaines A et B (facultatif) : un jour d\'une semaine A',
        type: 'date',
        aide: 'Les semaines alternent ensuite A, B, A, B… Dans les cours, mettez « A: » ou « B: » devant '
          + 'ceux qui n\'ont lieu qu\'une semaine sur deux (ex. « A: 14h Piscine ») ; les autres ont lieu chaque semaine.',
      },
      {
        cle: 'lundi',
        libelle: 'Lundi (un cours par ligne)',
        type: 'liste',
        aide: 'L\'heure au début si vous voulez : « 8h30 Maths ». L\'emoji est choisi tout seul ; '
          + 'pour en imposer un, mettez-le au début : « 🎻 Violon ».',
      },
      { cle: 'mardi', libelle: 'Mardi', type: 'liste' },
      { cle: 'mercredi', libelle: 'Mercredi', type: 'liste' },
      { cle: 'jeudi', libelle: 'Jeudi', type: 'liste' },
      { cle: 'vendredi', libelle: 'Vendredi', type: 'liste' },
      { cle: 'samedi', libelle: 'Samedi', type: 'liste' },
    ],

    afficher(zone, widget) {
      let cleAffichee = null;

      function dessiner() {
        cleAffichee = cleDuMoment();
        const d = widget.donnees;
        const jour = jourAffiche(d);
        const quand = !jour
          ? 'Emploi du temps'
          : jour.ecart === 0 ? 'Aujourd\'hui' : jour.ecart === 1 ? 'Demain' : majuscule(jour.nom);
        const titre = '🎒 ' + quand + (d.titre ? ' · ' + Nidoo.echapper(d.titre) : '');
        const cours = jour ? jour.cours : [];
        // À droite du titre : le jour (si c'est demain) et la semaine A ou B.
        const pastille = [jour && jour.ecart === 1 ? majuscule(jour.nom) : '', jour && jour.semaine ? 'Sem. ' + jour.semaine : '']
          .filter(Boolean).join(' · ');

        zone.innerHTML = `
          <div class="liste-widget emploi-du-temps">
            <div class="widget-entete">
              <span>${titre}</span>
              ${pastille ? `<span class="compteur">${Nidoo.echapper(pastille)}</span>` : ''}
            </div>
            <ul class="cases routine-etapes edt-cours" style="--etapes:${cours.length}">
              ${!jour ? '<li class="liste-vide">Ajoutez les cours de chaque jour avec ⚙️</li>' : ''}
              ${cours.map((c) => `
                <li>
                  <span class="case case-emoji" aria-hidden="true">${c.emoji}</span>
                  ${c.heure ? `<span class="edt-heure">${c.heure}</span>` : ''}
                  <span class="edt-matiere">${Nidoo.echapper(c.texte)}</span>
                  ${c.semaine && !jour.semaine ? `<span class="edt-semaine" title="Seulement en semaine ${c.semaine} (réglez les semaines A/B dans ⚙️)">${c.semaine}</span>` : ''}
                </li>`).join('')}
            </ul>
          </div>`;
      }

      dessiner();
      // Chaque minute : à midi on passe au lendemain, à minuit au nouveau jour.
      const minuteur = setInterval(() => cleDuMoment() !== cleAffichee && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
