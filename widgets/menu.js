/*
 * Widget "Menu de la semaine" : Nidoo compose les repas de la semaine.
 *
 *   - les recettes sont dans widgets/menu-recettes.js : 150 plats simples, prêts en
 *     15 minutes ou moins, pour des enfants qui ne raffolent pas des légumes ;
 *   - chaque semaine, un nombre de repas de chaque type selon les repères habituels
 *     (poisson 2 fois par semaine, viande rouge limitée, œufs, légumineuses, repas sans
 *     viande) ; jamais deux repas du même type de suite, pas de plat répété dans la
 *     semaine ni repris de la semaine d'avant ;
 *   - les aliments interdits (⚙️) sont retirés : un aliment (« champignons », « porc »)
 *     ou un régime (« végétarien », « sans gluten », « sans lactose »…).
 * Le menu ne dépend que de la semaine et des réglages : il est le même sur tous les
 * appareils.
 *
 * Le widget montre la semaine entière (on fait défiler, aujourd'hui est en évidence).
 * Toucher un repas : la recette. ↻ sur une ligne : une autre recette au hasard.
 *
 * ⚠️ Pour une allergie grave, toujours vérifier les ingrédients réellement utilisés.
 */
(function () {
  const PLATS = (Nidoo.RECETTES || []).map(([nom, emoji, type, minutes, ingredients, etapes]) => ({
    nom,
    emoji,
    type,
    minutes,
    ingredients: ingredients.split(/\s*;\s*/),
    etapes: etapes.split(/\s*\|\s*/),
  }));

  /* ---- Quantités selon le nombre de personnes ----------------------------- */

  // Les recettes sont écrites pour 4 portions. Réglage "personnes" : 3, 2,5… (un enfant ≈ une demi-portion).
  const PORTIONS_RECETTES = 4;
  const nombrePersonnes = (d) => {
    const n = parseFloat(String(d.personnes || '').replace(',', '.'));
    return n > 0 && n <= 20 ? n : PORTIONS_RECETTES;
  };
  const enTexte = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

  /*
   * Une ligne d'ingrédient pour `personnes` portions :
   * « 350 g de pâtes » → « 260 g de pâtes » (pour 3), « 8 œufs » → « 6 œufs »,
   * « 1/2 concombre » reste « 1/2 concombre ». Sans nombre (« parmesan ») : inchangée.
   */
  function ajuster(ingredient, personnes) {
    const m = ingredient.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s+(.*)$/);
    if (!m || personnes === PORTIONS_RECETTES) return ingredient;
    const [haut, bas] = m[1].split('/');
    const valeur = bas ? Number(haut) / Number(bas) : parseFloat(m[1].replace(',', '.'));
    let n = (valeur * personnes) / PORTIONS_RECETTES;
    let reste = m[2];
    const unite = reste.match(/^(kg|g|l|cl|ml)\s/);
    if (unite) {
      let u = unite[1];
      reste = reste.slice(u.length);
      if (u === 'kg' && n < 1) (n *= 1000), (u = 'g');
      if (u === 'l' && n < 1) (n *= 100), (u = 'cl');
      if (u === 'g') n = n < 100 ? Math.max(5, Math.round(n / 5) * 5) : Math.round(n / 10) * 10;
      else if (u === 'cl') n = Math.max(5, Math.round(n / 5) * 5);
      else n = Math.round(n * 10) / 10;
      return enTexte(n) + ' ' + u + reste;
    }
    if (/^c\. à [sc]\./.test(reste)) return enTexte(Math.max(0.5, Math.round(n * 2) / 2)) + ' ' + reste;
    if (n < 0.75) return '1/2 ' + reste;
    const entier = Math.max(1, Math.round(n));
    // Accord : « 1 boîtes de thon » → « 1 boîte », « 2 grand paquet de chips » → « 2 grands paquets ».
    const [nom, ...suite] = reste.split(/(?=\s(?:de|d'|à|au|aux)\s|\s(?:de|d')\S|\s\()/);
    let mots = nom.split(' ');
    if (entier === 1 && valeur > 1) mots = mots.map((m) => m.replace(/s$/, ''));
    if (entier > 1 && valeur <= 1) mots = mots.map((m) => (/[sx]$/.test(m) ? m : m + 's'));
    return entier + ' ' + mots.join(' ') + suite.join('');
  }
  const ingredientsPour = (plat, d) => plat.ingredients.map((i) => ajuster(i, nombrePersonnes(d)));

  // Part de chaque type de plat dans la semaine (repères habituels pour une famille).
  const PARTS = { poisson: 0.25, volaille: 0.18, legumineuses: 0.13, oeufs: 0.12, vege: 0.12, viande: 0.12, porc: 0.08 };

  /* ---- Aliments interdits ------------------------------------------------- */

  const LAITIERS = ['lait', 'fromage', 'creme', 'beurre', 'gruyere', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta',
    'yaourt', 'emmental', 'chevre', 'raclette', 'mascarpone', 'sauce blanche', 'sauce cesar'];
  const VIANDES = ['type:viande', 'type:volaille', 'type:porc', 'jambon', 'lardons', 'chorizo', 'saucisse', 'poulet', 'dinde', 'boeuf'];
  const BLE = ['pates', 'spaghetti', 'coquillettes', 'tagliatelles', 'linguine', 'macaronis', 'nouilles', 'pain', 'tortilla',
    'chapelure', 'farine', 'semoule', 'gnocchis', 'raviolis', 'tortellini', 'bagels', 'muffins', 'croutons', 'cornflakes',
    'pane', 'sauce soja', 'galettes'];
  const OEUFS = ['oeuf', 'mayonnaise', 'sauce cesar', 'sauce tartare'];
  // Un régime ou une famille d'aliments → les mots à éviter ("type:…" = tout ce type de plat).
  const GROUPES = {
    viande: VIANDES,
    vegetarien: [...VIANDES, 'type:poisson'],
    vegetarienne: [...VIANDES, 'type:poisson'],
    vegan: [...VIANDES, 'type:poisson', ...LAITIERS, ...OEUFS, 'miel'],
    vegetalien: [...VIANDES, 'type:poisson', ...LAITIERS, ...OEUFS, 'miel'],
    porc: ['type:porc', 'jambon', 'lardons', 'saucisse', 'chipolata', 'chorizo', 'bacon'],
    poisson: ['type:poisson', 'thon', 'saumon', 'surimi', 'sardine'],
    'fruits de mer': ['crevettes', 'moules'],
    crustace: ['crevettes'],
    gluten: BLE,
    ble: BLE,
    lactose: LAITIERS,
    lait: LAITIERS,
    laitage: LAITIERS,
    fromage: ['fromage', 'gruyere', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'emmental', 'chevre', 'raclette'],
    oeuf: OEUFS,
    soja: ['tofu', 'sauce soja'],
    sesame: ['sesame'],
    arachide: ['cacahuete'],
    'fruits a coque': ['pesto', 'pignons', 'noix', 'amande', 'noisette'],
    legumineuse: ['type:legumineuses', 'lentilles', 'pois chiches', 'haricots rouges', 'haricots noirs', 'haricots blancs', 'falafels', 'houmous'],
    epice: ['curry', 'chili', 'epices', 'tikka', 'kebab'],
    piment: ['chili', 'chorizo'],
  };

  // Texte simplifié pour comparer : minuscules, sans accents ni ponctuation.
  const simplifier = (t) =>
    ' ' + t.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/lait de coco/g, 'coco').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  // « Sans gluten », « Champignons », « Pas de porc » → « gluten », « champignon », « porc »
  const motInterdit = (t) => simplifier(t).trim().replace(/^(sans|pas de|pas d|aucun|aucune|no)\s+/, '').replace(/[sx]$/, '');

  /* Le plat contient-il un aliment interdit ? */
  function interdit(plat, interdits) {
    const texte = simplifier([plat.nom, ...plat.ingredients].join(' ; '));
    return interdits.some((brut) => {
      const mot = motInterdit(brut);
      if (!mot) return false;
      const cherches = GROUPES[mot] || GROUPES[mot + 's'] || [mot];
      return cherches.some((c) => (c.startsWith('type:') ? plat.type === c.slice(5) : texte.includes(' ' + c)));
    });
  }

  /* ---- Hasard reproductible (le même menu sur tous les appareils) ------------ */

  function hasard(texte) {
    let h = 1779033703 ^ texte.length;
    for (let i = 0; i < texte.length; i++) {
      h = Math.imul(h ^ texte.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function melanger(tableau, aleatoire) {
    const t = [...tableau];
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(aleatoire() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    return t;
  }

  /* ---- Dates ------------------------------------------------------------ */

  const cleJour = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const lundiDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const plusJours = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // Les repas prévus un jour donné (0 = lundi … 6 = dimanche), selon le réglage "repas".
  function repasDuJour(indexJour, reglage) {
    if (reglage === 'tous') return ['midi', 'soir'];
    if (reglage === 'soir') return ['soir'];
    return indexJour >= 5 ? ['midi', 'soir'] : ['soir']; // le soir, et le midi le week-end
  }

  /* ---- Composition du menu d'une semaine -------------------------------- */

  /*
   * Le menu de la semaine qui commence le lundi `lundi` :
   * Map "2026-11-16|soir" → plat. `eviter` : plats à ne pas reprendre (semaine d'avant).
   */
  function menuSemaine(lundi, d, eviter = new Set()) {
    const interdits = d.interdits || [];
    const autorises = PLATS.filter((p) => !interdit(p, interdits));
    const graine = (d.graines || {})[cleJour(lundi)] || 0;
    const aleatoire = hasard([cleJour(lundi), graine, d.repas, interdits.join('|')].join('#'));

    const creneaux = [];
    for (let i = 0; i < 7; i++) {
      repasDuJour(i, d.repas).forEach((repas) => creneaux.push(cleJour(plusJours(lundi, i)) + '|' + repas));
    }

    // Combien de plats de chaque type (au plus proche des parts ; un type tout interdit est sauté).
    const types = Object.keys(PARTS).filter((t) => autorises.some((p) => p.type === t));
    if (!types.length) return new Map();
    const total = types.reduce((s, t) => s + PARTS[t], 0);
    const nombres = {};
    const restes = types.map((t) => {
      const exact = (creneaux.length * PARTS[t]) / total;
      nombres[t] = Math.floor(exact);
      return [t, exact - nombres[t]];
    });
    let manque = creneaux.length - Object.values(nombres).reduce((a, b) => a + b, 0);
    restes.sort((a, b) => b[1] - a[1]).forEach(([t]) => manque-- > 0 && nombres[t]++);

    // L'ordre des types : tiré au hasard, sans deux fois le même type de suite
    // (les types qui restent le plus souvent ont plus de chances, pour ne pas finir coincé).
    const restant = { ...nombres };
    const ordre = [];
    creneaux.forEach(() => {
      const precedent = ordre[ordre.length - 1];
      let choix = types.filter((t) => restant[t] > 0 && t !== precedent);
      if (!choix.length) choix = types.filter((t) => restant[t] > 0);
      const poids = choix.map((t) => restant[t] * restant[t]);
      let tirage = aleatoire() * poids.reduce((a, b) => a + b, 0);
      const type = choix.find((t, i) => (tirage -= poids[i]) < 0) || choix[choix.length - 1];
      restant[type]--;
      ordre.push(type);
    });

    // Un plat par créneau : pas de doublon dans la semaine, et si possible pas un plat de
    // la semaine d'avant.
    const pris = new Set();
    const menu = new Map();
    const parType = {};
    types.forEach((t) => (parType[t] = melanger(autorises.filter((p) => p.type === t), aleatoire)));
    creneaux.forEach((creneau, i) => {
      const liste = parType[ordre[i]];
      const plat = liste.find((p) => !pris.has(p.nom) && !eviter.has(p.nom)) || liste.find((p) => !pris.has(p.nom)) || liste[0];
      pris.add(plat.nom);
      menu.set(creneau, plat);
    });
    return menu;
  }

  // Le menu d'une semaine, avec les plats changés à la main (↻) par-dessus.
  function menuFinal(lundi, d) {
    const avant = menuSemaine(plusJours(lundi, -7), d);
    const menu = menuSemaine(lundi, d, new Set([...avant.values()].map((p) => p.nom)));
    Object.entries(d.changes || {}).forEach(([creneau, nom]) => {
      const plat = PLATS.find((p) => p.nom === nom);
      if (menu.has(creneau) && plat) menu.set(creneau, plat);
    });
    return menu;
  }

  /* ---- Le widget ----------------------------------------------------------- */

  Nidoo.declarerWidget({
    type: 'menu',
    nom: 'Menu de la semaine',
    icone: '🍽️',
    tailles: ['moyen', 'grand', 'haut3', 'haut4'],
    tailleParDefaut: 'haut3',
    donneesParDefaut: { repas: 'soir-weekend', personnes: '4', interdits: [], graines: {}, changes: {} },
    reglages: [
      {
        cle: 'repas',
        libelle: 'Quels repas ?',
        type: 'choix',
        options: [
          { valeur: 'soir-weekend', libelle: 'Le soir, et le midi le week-end' },
          { valeur: 'soir', libelle: 'Le soir seulement' },
          { valeur: 'tous', libelle: 'Midi et soir, tous les jours' },
        ],
      },
      {
        cle: 'personnes',
        libelle: 'Nombre de personnes',
        type: 'texte',
        exemple: 'Ex. 3',
        aide: 'En portions : un enfant mange à peu près une demi-portion (2 adultes + 2 enfants ≈ 3). '
          + 'Les quantités des recettes et de la liste de courses sont ajustées.',
      },
      {
        cle: 'interdits',
        libelle: 'Aliments interdits (un par ligne)',
        type: 'liste',
        aide: 'Un aliment (champignons, porc, poisson…) ou un régime (végétarien, sans gluten, sans lactose, '
          + 'sans œuf, fruits de mer…). Pour une allergie grave, vérifiez toujours les ingrédients.',
      },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      let semaine = 0; // 0 : cette semaine, 1 : la semaine prochaine
      let cleAffichee = null;
      let menu = new Map();

      // Le repas "en cours ou à venir" : midi jusqu'à 14 h, soir jusqu'à 21 h 30.
      function repasActuel() {
        const m = new Date();
        const minutes = m.getHours() * 60 + m.getMinutes();
        const jour = cleJour(m);
        return minutes < 14 * 60 ? jour + '|midi' : minutes < 21 * 60 + 30 ? jour + '|soir' : cleJour(plusJours(m, 1)) + '|';
      }

      function dessiner() {
        cleAffichee = repasActuel() + semaine;
        const lundi = plusJours(lundiDe(new Date()), 7 * semaine);
        menu = menuFinal(lundi, d());
        const aujourdhui = cleJour(new Date());
        const actuel = repasActuel();
        let premierAVenir = null;
        const jours = [];
        for (let i = 0; i < 7; i++) {
          const jour = plusJours(lundi, i);
          const cle = cleJour(jour);
          const lignes = repasDuJour(i, d().repas)
            .map((r) => {
              const creneau = cle + '|' + r;
              const plat = menu.get(creneau);
              if (!plat) return '';
              const passe = semaine === 0 && creneau < actuel && !actuel.startsWith(creneau);
              if (!passe && !premierAVenir) premierAVenir = creneau;
              return `<li class="menu-repas${passe ? ' passe' : ''}" data-creneau="${creneau}">
                  <span class="menu-quand">${r === 'midi' ? 'Midi' : 'Soir'}</span>
                  <span class="menu-plat"><span class="menu-emoji">${plat.emoji}</span>${Nidoo.echapper(plat.nom)}</span>
                  <button class="menu-autre" type="button" aria-label="Une autre recette" title="Une autre recette au hasard">
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </li>`;
            })
            .join('');
          jours.push(`<li class="menu-jour${cle === aujourdhui ? ' aujourdhui' : ''}" data-jour="${cle}">${
            cle === aujourdhui ? "Aujourd'hui" : majuscule(NOMS_JOURS[jour.getDay()]) + ' ' + jour.getDate()}</li>${lignes}`);
        }

        zone.innerHTML = `
          <div class="liste-widget menu">
            <div class="widget-entete">
              <span class="menu-titre">🍽️ Menu</span>
              <span class="menu-semaines">
                <button class="menu-courses-icone" type="button" aria-label="Liste de courses de la semaine" title="Liste de courses">🛒</button>
                <button class="menu-nav${semaine === 0 ? ' actif' : ''}" type="button" data-semaine="0">Semaine</button>
                <button class="menu-nav${semaine === 1 ? ' actif' : ''}" type="button" data-semaine="1">Suivante</button>
              </span>
            </div>
            <ul class="menu-liste">
              ${menu.size === 0 ? '<li class="liste-vide">Tous les plats sont interdits : vérifiez ⚙️</li>' : jours.join('')}
              ${menu.size ? `<li class="menu-fin">
                  <button class="menu-petit menu-courses" type="button">🛒 Courses</button>
                  <button class="menu-petit menu-tout-changer" type="button" title="Un autre menu pour toute la semaine">↻ Tout changer</button>
                </li>` : ''}
            </ul>
          </div>`;

        // On fait défiler jusqu'au prochain repas (une fois le widget affiché à l'écran).
        const liste = zone.querySelector('.menu-liste');
        const cible = semaine === 0 && premierAVenir && zone.querySelector(`[data-creneau="${premierAVenir}"]`);
        if (cible) {
          const titre = cible.previousElementSibling && cible.previousElementSibling.classList.contains('menu-jour') ? cible.previousElementSibling : cible;
          requestAnimationFrame(() => {
            liste.scrollTop = titre.getBoundingClientRect().top - liste.getBoundingClientRect().top + liste.scrollTop;
          });
        }
      }

      // Une autre recette au hasard pour un repas (même type si possible, pas déjà dans la semaine).
      function changer(creneau) {
        const actuel = menu.get(creneau);
        const dans = new Set([...menu.values()].map((p) => p.nom));
        const permis = PLATS.filter((p) => !dans.has(p.nom) && !interdit(p, d().interdits || []));
        const memeType = permis.filter((p) => p.type === actuel.type);
        const choix = memeType.length ? memeType : permis;
        if (!choix.length) return;
        const plat = choix[Math.floor(Math.random() * choix.length)];
        widget.enregistrer({ ...d(), changes: { ...(d().changes || {}), [creneau]: plat.nom } });
        const position = zone.querySelector('.menu-liste').scrollTop;
        dessiner();
        requestAnimationFrame(() => requestAnimationFrame(() => (zone.querySelector('.menu-liste').scrollTop = position)));
        return plat;
      }

      /*
       * La liste de courses de la semaine affichée : tous les ingrédients (un ingrédient
       * présent dans plusieurs recettes est regroupé, "×2"), à cocher, puis ajoutés à la
       * liste nommée « Courses » (ou « Course »).
       */
      function ouvrirCourses() {
        // Un même ingrédient dans plusieurs recettes : les quantités s'additionnent
        // (« 300 g de poulet » + « 300 g de poulet » → « 600 g de poulet (2 recettes) »).
        const compte = new Map();
        [...menu.values()].forEach((plat) =>
          ingredientsPour(plat, d()).forEach((i) => {
            const m = i.trim().match(/^(\d+(?:,\d+)?)\s+(.*)$/);
            const quantite = m ? parseFloat(m[1].replace(',', '.')) : null;
            const reste = m ? m[2] : i.trim();
            const cle = (m ? '#' : '') + reste.toLowerCase();
            const deja = compte.get(cle);
            compte.set(cle, { reste, quantite: deja ? (deja.quantite || 0) + (quantite || 0) : quantite, nombre: deja ? deja.nombre + 1 : 1 });
          })
        );
        compte.forEach((c) => (c.texte = (c.quantite !== null ? enTexte(c.quantite) + ' ' : '') + c.reste));
        // Tri par aliment (sans la quantité du début) : « 400 g de pâtes » → « pâtes ».
        const sansQuantite = (t) => simplifier(t).trim()
          .replace(/^(\d+ )*(\d+|un|une|quelques|1 2)( (g|kg|cl|l|ml|c a s|c a c|boites?|grandes?|petites?|tranches?|pots?|paquets?|cubes?|boules?|pains?|gousses?|morceaux?|feuilles?))* ?(de |d |des )?/, '');
        const ingredients = [...compte.values()].sort((a, b) => sansQuantite(a.texte).localeCompare(sansQuantite(b.texte)));
        const textes = ingredients.map((i) => i.texte + (i.nombre > 1 ? ' (' + i.nombre + ' recettes)' : ''));

        const nomListe = (t) => simplifier(t).trim();
        const listes = (Nidoo.grilleApp ? Nidoo.grilleApp.listes() : [])
          .filter((l) => ['courses', 'course', 'liste de courses', 'liste des courses'].includes(nomListe(l.titre)));

        const contenu = Nidoo.ouvrirPopin(
          '🛒 Courses ' + (semaine === 0 ? 'de la semaine' : 'de la semaine prochaine'),
          `<div class="courses">
             <div class="courses-tout">
               <button class="bouton" type="button" data-tout="1">Tout cocher</button>
               <button class="bouton" type="button" data-tout="0">Tout décocher</button>
             </div>
             <ul class="courses-liste">
               ${textes.map((t, i) => `<li><label><input type="checkbox" value="${i}"><span>${Nidoo.echapper(t)}</span></label></li>`).join('')}
             </ul>
             ${listes.length
               ? `${listes.length > 1
                   ? `<label class="champ"><span>Dans la liste</span><select class="courses-cible">${listes.map((l) =>
                       `<option value="${Nidoo.echapper(l.id)}">${Nidoo.echapper((l.emoji ? l.emoji + ' ' : '') + l.titre)}</option>`).join('')}</select></label>`
                   : ''}
                  <button class="bouton bouton-principal courses-ajouter" type="button">Ajouter à la liste des courses</button>
                  <p class="courses-message"></p>`
               : `<p class="courses-message courses-aucune">Vous n'avez aucune liste nommée « courses » actuellement : créez une liste « Courses » afin d'y ajouter des ingrédients.</p>`}
           </div>`
        );
        contenu.querySelectorAll('[data-tout]').forEach((b) =>
          b.addEventListener('click', () => contenu.querySelectorAll('.courses-liste input').forEach((c) => (c.checked = b.dataset.tout === '1')))
        );
        const bouton = contenu.querySelector('.courses-ajouter');
        if (!bouton) return;
        bouton.addEventListener('click', () => {
          const message = contenu.querySelector('.courses-message');
          const coches = [...contenu.querySelectorAll('.courses-liste input:checked')].map((c) => textes[Number(c.value)]);
          if (!coches.length) {
            message.textContent = 'Cochez d\'abord les ingrédients à ajouter.';
            return;
          }
          const cible = contenu.querySelector('.courses-cible');
          const liste = cible ? listes.find((l) => l.id === cible.value) : listes[0];
          const ajoutes = Nidoo.grilleApp.ajouterALaListe(liste.id, coches);
          const deja = coches.length - ajoutes;
          message.textContent = '✅ ' + ajoutes + ' ingrédient' + (ajoutes > 1 ? 's' : '') + ' ajouté' + (ajoutes > 1 ? 's' : '')
            + ' à « ' + liste.titre + ' »' + (deja ? ' (' + deja + ' déjà dans la liste)' : '') + '.';
          contenu.querySelectorAll('.courses-liste input:checked').forEach((c) => (c.checked = false));
        });
      }

      function ouvrirRecette(creneau) {
        const plat = menu.get(creneau);
        if (!plat) return;
        const [jour, repas] = creneau.split('|');
        const date = new Date(jour + 'T12:00');
        const contenu = Nidoo.ouvrirPopin(
          plat.emoji + ' ' + plat.nom,
          `<div class="recette">
             <p class="recette-infos">${majuscule(NOMS_JOURS[date.getDay()])} ${date.getDate()} · ${repas === 'midi' ? 'midi' : 'soir'}
               · ⏱️ ${plat.minutes} min · pour ${enTexte(nombrePersonnes(d()))} personne${nombrePersonnes(d()) > 1 ? 's' : ''}</p>
             <h3>Ingrédients</h3>
             <ul class="recette-ingredients">${ingredientsPour(plat, d()).map((i) => `<li>${Nidoo.echapper(i)}</li>`).join('')}</ul>
             <h3>Préparation</h3>
             <ol class="recette-etapes">${plat.etapes.map((e) => `<li>${Nidoo.echapper(e)}</li>`).join('')}</ol>
             <button class="bouton recette-autre" type="button">↻ Une autre recette</button>
           </div>`
        );
        contenu.querySelector('.recette-autre').addEventListener('click', () => {
          if (changer(creneau)) ouvrirRecette(creneau);
        });
      }

      zone.addEventListener('click', (e) => {
        const nav = e.target.closest('.menu-nav');
        if (nav) {
          semaine = Number(nav.dataset.semaine);
          return dessiner();
        }
        if (e.target.closest('.menu-courses, .menu-courses-icone')) return ouvrirCourses();
        if (e.target.closest('.menu-tout-changer')) {
          const lundi = cleJour(plusJours(lundiDe(new Date()), 7 * semaine));
          const changes = Object.fromEntries(
            Object.entries(d().changes || {}).filter(([c]) => cleJour(lundiDe(new Date(c.slice(0, 10) + 'T12:00'))) !== lundi)
          );
          widget.enregistrer({ ...d(), changes, graines: { ...(d().graines || {}), [lundi]: ((d().graines || {})[lundi] || 0) + 1 } });
          return dessiner();
        }
        const ligne = e.target.closest('.menu-repas');
        if (!ligne) return;
        if (e.target.closest('.menu-autre')) changer(ligne.dataset.creneau);
        else ouvrirRecette(ligne.dataset.creneau);
      });

      dessiner();
      // Chaque minute : après le midi ou le soir, le repas suivant passe en premier.
      const minuteur = setInterval(() => repasActuel() + semaine !== cleAffichee && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });

  // Pour les tests et pour bricoler (console du navigateur) :
  //   Nidoo.menu.semaine(new Date(), { repas: 'tous', interdits: ['porc'] })
  Nidoo.menu = { PLATS, interdit, ajuster, semaine: (date, d) => menuFinal(lundiDe(date), d) };
})();
