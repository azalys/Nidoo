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
  const EMOJI_DEBUT = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\p{Regional_Indicator}{2})\s*/u;
  // "8h30", "8 h", "08:30", "14h" au début de la ligne (suivi ou non de "-" ou ":")
  const HEURE_DEBUT = /^(\d{1,2})\s*[h:]\s*(\d{2})?\s*[-–:]?\s*/i;

  // "8h30 Maths" → { heure: '8h30', emoji: '📐', texte: 'Maths' }
  function lireCours(ligne) {
    let reste = ligne.trim();
    let heure = '';
    let emoji = '';
    let m = reste.match(EMOJI_DEBUT);
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
      const simple = reste.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const debutDeMot = (mot) => new RegExp('(^|[^a-z])' + mot.replace(/[-]/g, '\\-')).test(simple);
      const trouve = EMOJIS.find(([mots]) => mots.some(debutDeMot));
      emoji = trouve ? trouve[1] : '📘';
    }
    return { heure, emoji, texte: reste || ligne.trim() };
  }

  /*
   * Le jour à afficher : aujourd'hui avant midi, demain à partir de midi ;
   * s'il n'y a pas cours ce jour-là, le prochain jour qui a des cours.
   */
  function jourAffiche(donnees) {
    const maintenant = new Date();
    const depart = maintenant.getHours() < 12 ? 0 : 1;
    for (let ecart = depart; ecart < depart + 7; ecart++) {
      const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + ecart);
      const cours = donnees[JOURS[jour.getDay()]] || [];
      if (cours.length) return { ecart, nom: JOURS[jour.getDay()], cours };
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
        const cours = jour ? jour.cours.map(lireCours) : [];

        zone.innerHTML = `
          <div class="liste-widget emploi-du-temps">
            <div class="widget-entete">
              <span>${titre}</span>
              ${jour && jour.ecart === 1 ? `<span class="compteur">${Nidoo.echapper(majuscule(jour.nom))}</span>` : ''}
            </div>
            <ul class="cases routine-etapes edt-cours" style="--etapes:${cours.length}">
              ${!jour ? '<li class="liste-vide">Ajoutez les cours de chaque jour avec ⚙️</li>' : ''}
              ${cours.map((c) => `
                <li>
                  <span class="case case-emoji" aria-hidden="true">${c.emoji}</span>
                  ${c.heure ? `<span class="edt-heure">${c.heure}</span>` : ''}
                  <span class="edt-matiere">${Nidoo.echapper(c.texte)}</span>
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
