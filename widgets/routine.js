/*
 * Widget "Routine" : la routine du matin avant midi, celle du soir après midi.
 * Les étapes se règlent avec ⚙️. Les cases se décochent toutes seules
 * quand on passe du matin au soir, et chaque nouveau jour.
 */
(function () {
  /*
   * L'emoji de chaque étape :
   *   - si la ligne commence par un emoji (ex. "🦷 Se brosser les dents"), c'est lui ;
   *   - sinon on le devine d'après les mots (liste ci-dessous, à compléter librement) ;
   *   - sinon ⭐.
   * Les mots sont cherchés en début de mot, sans accents ni majuscules
   * ("main" trouve "mains" mais pas "demain"). La première correspondance de la liste gagne.
   */
  const EMOJIS = [
    [['dent'], '🪥'],
    [['petit-dej', 'petit dej', 'dejeuner', 'manger', 'diner', 'repas'], '🥣'],
    [['gouter'], '🍪'],
    [['habill', 'habit', 'vetement', 'tenue'], '👕'],
    [['chaussure', 'basket'], '👟'],
    [['manteau', 'blouson', 'veste'], '🧥'],
    [['sac', 'cartable'], '🎒'],
    [['douche'], '🚿'],
    [['bain'], '🛁'],
    [['main', 'savon', 'visage', 'toilette'], '🧼'],
    [['wc', 'pipi'], '🚽'],
    [['cheveu', 'coiff', 'peigne', 'brosse a cheveux'], '💇'],
    [['devoir', 'lecon', 'reviser', 'ecole'], '📚'],
    [['lire', 'lecture', 'histoire', 'livre'], '📖'],
    [['pyjama', 'dormir', 'coucher', 'dodo', 'lit'], '🛏️'],
    [['ranger', 'chambre', 'jouet'], '🧸'],
    [['ecran', 'tablette', 'tele', 'console'], '📱'],
    [['table', 'vaisselle', 'couvert'], '🍽️'],
    [['poubelle'], '🗑️'],
    [['linge', 'lessive'], '🧺'],
    [['aspirateur', 'balai', 'menage'], '🧹'],
    [['boire', 'eau', 'gourde'], '💧'],
    [['medicament', 'vitamine', 'sirop'], '💊'],
    [['piano', 'musique', 'instrument', 'guitare'], '🎹'],
    [['sport', 'foot', 'danse', 'piscine'], '⚽'],
    [['chat', 'chien', 'animal', 'poisson', 'nourrir'], '🐾'],
    [['plante', 'arroser'], '🪴'],
    [['lunette'], '👓'],
    [['reveil', 'lever'], '⏰'],
    [['calin', 'bisou'], '🤗'],
  ];
  const EMOJI_DEBUT = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

  // "🦷 Se brosser les dents" → ['🦷', 'Se brosser les dents'] ; "S'habiller" → ['👕', "S'habiller"]
  function emojiEtTexte(ligne) {
    const m = ligne.match(EMOJI_DEBUT);
    if (m) return [m[1], ligne.slice(m[0].length)];
    const simple = ligne.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const debutDeMot = (mot) => new RegExp('(^|[^a-z])' + mot.replace(/[-]/g, '\\-')).test(simple);
    const trouve = EMOJIS.find(([mots]) => mots.some(debutDeMot));
    return [trouve ? trouve[1] : '⭐', ligne];
  }

  // 'matin' avant midi, 'soir' à partir de midi.
  const momentActuel = () => (new Date().getHours() < 12 ? 'matin' : 'soir');

  // Ex. "2026-11-10-matin" : change à midi et à minuit.
  function cleDuMoment() {
    const d = new Date();
    const jour = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    return jour + '-' + momentActuel();
  }

  Nidoo.declarerWidget({
    type: 'routine',
    nom: 'Routine',
    icone: '✅',
    tailles: ['grand'],
    tailleParDefaut: 'grand',
    donneesParDefaut: {
      titre: '',
      matin: ['Petit-déjeuner', "S'habiller", 'Se brosser les dents', 'Préparer son sac'],
      soir: ['Faire ses devoirs', 'Prendre sa douche', 'Se brosser les dents', 'Préparer ses habits'],
    },
    reglages: [
      { cle: 'titre', libelle: 'Pour qui ? (facultatif)', type: 'texte', exemple: 'Ex. Léa' },
      {
        cle: 'matin',
        libelle: 'Routine du matin (une étape par ligne)',
        type: 'liste',
        aide: 'L\'emoji est choisi tout seul. Pour en imposer un, mettez-le au début de la ligne, ex. « 🦷 Se brosser les dents ».',
      },
      { cle: 'soir', libelle: 'Routine du soir (une étape par ligne)', type: 'liste' },
    ],

    afficher(zone, widget) {
      let cleAffichee = null;

      function faites() {
        const c = widget.donnees.coches;
        return c && c.cle === cleDuMoment() ? c.faites : [];
      }

      function dessiner() {
        cleAffichee = cleDuMoment();
        const moment = momentActuel();
        const etapes = widget.donnees[moment] || [];
        const fait = faites();
        const total = etapes.length;
        const nbFaites = etapes.filter((e) => fait.includes(e)).length;
        const titre = (moment === 'matin' ? '☀️ Matin' : '🌙 Soir') +
          (widget.donnees.titre ? ' · ' + Nidoo.echapper(widget.donnees.titre) : '');

        zone.innerHTML = `
          <div class="liste-widget">
            <div class="widget-entete">
              <span>${titre}</span>
              ${total ? `<span class="compteur">${nbFaites}/${total}</span>` : ''}
            </div>
            ${total && nbFaites === total ? '<div class="bravo">Bravo, tout est fait ! 🎉</div>' : ''}
            <ul class="cases routine-etapes" style="--etapes:${total}">
              ${total === 0 ? '<li class="liste-vide">Aucune étape. Ajoutez-en avec ⚙️</li>' : ''}
              ${etapes.map((e, i) => {
                const [emoji, texte] = emojiEtTexte(e);
                return `
                <li class="${fait.includes(e) ? 'fait' : ''}">
                  <button class="case case-emoji" data-index="${i}" aria-pressed="${fait.includes(e)}" aria-label="${Nidoo.echapper(texte)}">${emoji}</button>
                  <span>${Nidoo.echapper(texte)}</span>
                </li>`;
              }).join('')}
            </ul>
          </div>`;
      }

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('.case');
        if (!bouton) return;
        const etape = (widget.donnees[momentActuel()] || [])[Number(bouton.dataset.index)];
        const fait = faites();
        const nouvelles = fait.includes(etape) ? fait.filter((x) => x !== etape) : [...fait, etape];
        widget.enregistrer({ ...widget.donnees, coches: { cle: cleDuMoment(), faites: nouvelles } });
        dessiner();
      });

      dessiner();
      // Chaque minute : si on est passé au soir (ou au lendemain), on redessine.
      const minuteur = setInterval(() => cleDuMoment() !== cleAffichee && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
