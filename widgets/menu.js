/*
 * Widget "Menu de la semaine" : Nidoo compose les repas de la semaine, équilibrés.
 *
 * Comment le menu est fait :
 *   - une liste de plats familiaux (ci-dessous, à compléter librement), chacun avec ses
 *     ingrédients et son type (poisson, volaille, viande rouge, porc, œufs, légumineuses,
 *     végétarien) ;
 *   - chaque semaine, un nombre de repas de chaque type, selon les repères habituels
 *     (poisson 2 fois par semaine, viande rouge limitée, légumineuses et repas sans viande
 *     chaque semaine) ; deux repas de suite ne sont pas du même type ;
 *   - pas deux fois le même plat dans la semaine, ni un plat de la semaine d'avant ;
 *   - les aliments interdits (⚙️) sont retirés : un aliment (« champignons », « porc »)
 *     ou un régime (« végétarien », « sans gluten », « sans lactose »…).
 * Le menu ne dépend que de la semaine et des réglages : il est le même sur tous les
 * appareils. 🔄 change un plat ou toute la semaine.
 *
 * ⚠️ Pour une allergie grave, toujours vérifier les ingrédients réellement utilisés.
 */
(function () {
  // [nom, emoji, type, ingrédients] — les ingrédients servent aux interdits (et à la liste de courses).
  const PLATS = [
    // Poisson et fruits de mer
    ['Saumon au four, riz et brocolis', '🐟', 'poisson', 'saumon, riz, brocoli, citron'],
    ['Cabillaud et purée de carottes', '🐟', 'poisson', 'cabillaud, carotte, pomme de terre, lait, beurre'],
    ['Poisson pané, haricots verts et pommes vapeur', '🐟', 'poisson', 'colin, chapelure, farine, oeuf, haricots verts, pomme de terre'],
    ['Pâtes au thon et à la tomate', '🍝', 'poisson', 'pates, thon, tomate, oignon'],
    ['Brandade de morue et salade verte', '🐟', 'poisson', 'morue, pomme de terre, lait, ail, salade'],
    ['Gratin de poisson aux épinards', '🐟', 'poisson', 'colin, epinard, creme, fromage'],
    ['Papillote de colin, courgettes et quinoa', '🐟', 'poisson', 'colin, courgette, quinoa, citron'],
    ['Curry de poisson au coco, riz', '🍛', 'poisson', 'cabillaud, coco, riz, curry, tomate'],
    ['Crevettes sautées aux nouilles et légumes', '🍤', 'poisson', 'crevettes, nouilles, poivron, carotte, sauce soja'],
    ['Quiche saumon-poireaux et salade', '🥧', 'poisson', 'saumon, poireau, pate brisee, farine, oeuf, creme, salade'],
    ['Maquereau grillé, pommes de terre et salade', '🐟', 'poisson', 'maquereau, pomme de terre, salade'],
    ['Moules-frites', '🦪', 'poisson', 'moules, pomme de terre, oignon, vin blanc'],
    ['Riz sauté aux crevettes, petits pois et œuf', '🍚', 'poisson', 'riz, crevettes, oeuf, petits pois, sauce soja'],
    ['Tartines de sardines, crudités et pain complet', '🥖', 'poisson', 'sardine, fromage frais, pain, carotte, concombre'],
    // Volaille
    ['Poulet rôti, pommes de terre et haricots verts', '🍗', 'volaille', 'poulet, pomme de terre, haricots verts'],
    ['Escalope de dinde à la crème, pâtes', '🦃', 'volaille', 'dinde, creme, champignon, pates'],
    ['Curry de poulet et riz basmati', '🍛', 'volaille', 'poulet, coco, riz, curry, oignon'],
    ['Fajitas au poulet et poivrons', '🌮', 'volaille', 'poulet, tortilla, poivron, oignon, creme'],
    ['Brochettes de poulet, semoule et ratatouille', '🍢', 'volaille', 'poulet, semoule, courgette, aubergine, tomate, poivron'],
    ['Poulet basquaise et riz', '🍗', 'volaille', 'poulet, poivron, tomate, oignon, riz'],
    ['Nuggets maison et purée de patate douce', '🍗', 'volaille', 'poulet, chapelure, farine, oeuf, patate douce, lait, beurre'],
    ['Blanquette de dinde et riz', '🦃', 'volaille', 'dinde, carotte, champignon, creme, riz'],
    ['Wok de poulet aux légumes et nouilles', '🥢', 'volaille', 'poulet, nouilles, brocoli, carotte, sauce soja'],
    ['Cuisses de poulet, courgettes et boulgour', '🍗', 'volaille', 'poulet, courgette, boulgour'],
    ['Salade César au poulet', '🥗', 'volaille', 'poulet, salade, parmesan, pain, oeuf'],
    // Viande rouge (bœuf, agneau)
    ['Spaghetti bolognaise', '🍝', 'viande', 'boeuf, tomate, oignon, carotte, pates, parmesan'],
    ['Hachis parmentier et salade', '🥔', 'viande', 'boeuf, pomme de terre, lait, beurre, fromage, salade'],
    ['Chili con carne et riz', '🌶️', 'viande', 'boeuf, haricots rouges, tomate, poivron, riz'],
    ['Steak haché, frites au four et salade', '🍔', 'viande', 'boeuf, pomme de terre, salade'],
    ['Burgers maison et potatoes', '🍔', 'viande', 'boeuf, pain, fromage, tomate, salade, pomme de terre'],
    ['Bœuf-carottes et pommes vapeur', '🥕', 'viande', 'boeuf, carotte, pomme de terre, oignon'],
    ['Lasagnes à la bolognaise et salade', '🍝', 'viande', 'boeuf, pates, tomate, bechamel, lait, beurre, farine, fromage, salade'],
    ['Boulettes de bœuf à la tomate, semoule', '🧆', 'viande', 'boeuf, chapelure, oeuf, tomate, semoule'],
    ['Tajine d\'agneau aux légumes, semoule', '🍲', 'viande', 'agneau, carotte, courgette, pois chiches, semoule'],
    ['Couscous aux légumes et merguez', '🍲', 'viande', 'merguez, agneau, boeuf, semoule, carotte, courgette, navet, pois chiches'],
    // Porc
    ['Croque-monsieur et salade verte', '🥪', 'porc', 'jambon, pain, fromage, bechamel, lait, beurre, farine, salade'],
    ['Quiche lorraine et salade', '🥧', 'porc', 'lardons, oeuf, creme, lait, pate brisee, farine, salade'],
    ['Pâtes à la carbonara', '🍝', 'porc', 'lardons, pates, creme, oeuf, parmesan'],
    ['Saucisses, lentilles et carottes', '🌭', 'porc', 'saucisse, lentilles, carotte, oignon'],
    ['Filet mignon, purée et haricots verts', '🥩', 'porc', 'porc, pomme de terre, lait, beurre, haricots verts'],
    ['Galettes complètes et salade', '🥞', 'porc', 'jambon, oeuf, fromage, sarrasin, beurre, salade'],
    ['Endives au jambon', '🥬', 'porc', 'endive, jambon, bechamel, lait, beurre, farine, fromage'],
    ['Tartiflette et salade verte', '🧀', 'porc', 'pomme de terre, lardons, reblochon, fromage, creme, oignon, salade'],
    // Œufs
    ['Omelette aux pommes de terre et salade', '🍳', 'oeufs', 'oeuf, pomme de terre, oignon, salade'],
    ['Œufs cocotte aux épinards et mouillettes', '🥚', 'oeufs', 'oeuf, epinard, creme, pain'],
    ['Quiche courgette-chèvre et salade', '🥧', 'oeufs', 'courgette, oeuf, creme, chevre, fromage, pate brisee, farine, salade'],
    ['Shakshuka (œufs à la tomate) et pain', '🍳', 'oeufs', 'oeuf, tomate, poivron, oignon, pain'],
    ['Crêpes au fromage et aux épinards', '🥞', 'oeufs', 'farine, oeuf, lait, fromage, epinard'],
    ['Frittata aux légumes', '🍳', 'oeufs', 'oeuf, courgette, poivron, pomme de terre, fromage'],
    ['Ratatouille, riz et œuf au plat', '🍳', 'oeufs', 'courgette, aubergine, tomate, poivron, riz, oeuf'],
    // Légumineuses
    ['Dahl de lentilles corail et riz', '🍛', 'legumineuses', 'lentilles, coco, tomate, riz, curry'],
    ['Chili sin carne et riz', '🌶️', 'legumineuses', 'haricots rouges, mais, tomate, poivron, riz'],
    ['Falafels, houmous, pain pita et crudités', '🧆', 'legumineuses', 'pois chiches, sesame, pain, concombre, tomate'],
    ['Salade de lentilles, œuf dur et carottes', '🥗', 'legumineuses', 'lentilles, oeuf, carotte, echalote'],
    ['Curry de pois chiches aux épinards, riz', '🍛', 'legumineuses', 'pois chiches, epinard, coco, tomate, riz'],
    ['Soupe de pois cassés et pain', '🥣', 'legumineuses', 'pois casses, carotte, oignon, pain'],
    ['Burritos aux haricots noirs', '🌯', 'legumineuses', 'haricots noirs, tortilla, riz, mais, tomate, fromage'],
    // Végétarien
    ['Gratin de courgettes et riz', '🧀', 'vege', 'courgette, creme, fromage, riz'],
    ['Pizza maison aux légumes', '🍕', 'vege', 'pate a pizza, farine, tomate, mozzarella, poivron, champignon'],
    ['Risotto aux champignons', '🍚', 'vege', 'riz, champignon, parmesan, oignon'],
    ['Soupe de légumes et tartines au fromage', '🥣', 'vege', 'carotte, poireau, pomme de terre, pain, fromage'],
    ['Gnocchis à la tomate et mozzarella', '🍅', 'vege', 'gnocchi, pomme de terre, farine, tomate, mozzarella'],
    ['Pâtes au pesto et tomates cerises', '🍝', 'vege', 'pates, basilic, parmesan, pignons, tomate'],
    ['Lasagnes aux légumes', '🍝', 'vege', 'pates, courgette, aubergine, tomate, bechamel, lait, farine, fromage'],
    ['Tarte à la tomate et salade', '🥧', 'vege', 'tomate, moutarde, pate brisee, farine, fromage, salade'],
    ['Velouté de potiron, croûtons et fromage', '🎃', 'vege', 'potiron, creme, pain, fromage'],
    ['Wok de tofu, légumes et riz', '🥢', 'vege', 'tofu, sauce soja, brocoli, carotte, riz'],
    ['Cannellonis ricotta-épinards', '🍝', 'vege', 'pates, ricotta, epinard, tomate, fromage'],
    ['Poêlée de légumes, quinoa et feta', '🥗', 'vege', 'quinoa, courgette, poivron, feta'],
  ].map(([nom, emoji, type, ingredients]) => ({ nom, emoji, type, ingredients: ingredients.split(/\s*,\s*/) }));

  // Part de chaque type de plat dans la semaine (repères habituels pour une famille).
  const PARTS = { poisson: 0.25, volaille: 0.18, legumineuses: 0.13, oeufs: 0.12, vege: 0.12, viande: 0.12, porc: 0.08 };

  const VEGAN = ['type:viande', 'type:volaille', 'type:porc', 'type:poisson', 'merguez', 'oeuf', 'lait', 'fromage', 'creme', 'beurre',
    'bechamel', 'parmesan', 'mozzarella', 'chevre', 'feta', 'ricotta', 'reblochon', 'fromage frais'];

  // Mots-clés des interdits : un régime ou une famille d'aliments → les mots à éviter.
  const GROUPES = {
    viande: ['type:viande', 'type:volaille', 'type:porc', 'merguez'],
    vegetarien: ['type:viande', 'type:volaille', 'type:porc', 'type:poisson', 'merguez'],
    vegetarienne: ['type:viande', 'type:volaille', 'type:porc', 'type:poisson', 'merguez'],
    vegan: VEGAN,
    vegetalien: VEGAN,
    vegane: VEGAN,
    porc: ['type:porc', 'jambon', 'lardons', 'saucisse'],
    poisson: ['type:poisson'],
    'fruits de mer': ['crevettes', 'moules'],
    crustace: ['crevettes'],
    gluten: ['pates', 'pain', 'farine', 'semoule', 'chapelure', 'boulgour', 'nouilles', 'tortilla', 'pate brisee', 'pate a pizza', 'gnocchi', 'sauce soja'],
    ble: ['pates', 'pain', 'farine', 'semoule', 'chapelure', 'boulgour', 'nouilles', 'tortilla', 'pate brisee', 'pate a pizza', 'gnocchi'],
    lactose: ['lait', 'fromage', 'creme', 'beurre', 'bechamel', 'parmesan', 'mozzarella', 'chevre', 'feta', 'ricotta', 'reblochon', 'fromage frais'],
    lait: ['lait', 'fromage', 'creme', 'beurre', 'bechamel', 'parmesan', 'mozzarella', 'chevre', 'feta', 'ricotta', 'reblochon', 'fromage frais'],
    laitage: ['lait', 'fromage', 'creme', 'beurre', 'bechamel', 'parmesan', 'mozzarella', 'chevre', 'feta', 'ricotta', 'reblochon', 'fromage frais'],
    fromage: ['fromage', 'parmesan', 'mozzarella', 'chevre', 'feta', 'ricotta', 'reblochon', 'fromage frais'],
    oeuf: ['oeuf'],
    soja: ['tofu', 'sauce soja'],
    sesame: ['sesame'],
    'fruits a coque': ['pignons'],
    legumineuse: ['type:legumineuses', 'lentilles', 'pois chiches', 'haricots rouges', 'haricots noirs', 'pois casses'],
    epice: ['curry', 'chili'],
    piment: ['chili', 'merguez'],
  };

  const simplifier = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').trim();
  // « Sans gluten », « champignons », « Pas de porc » → « gluten », « champignon », « porc »
  const motInterdit = (t) => simplifier(t).replace(/^(sans|pas de|pas d'|aucun|aucune|no)\s+/, '').replace(/s$|x$/, '');

  /* Le plat est-il interdit ? */
  function interdit(plat, interdits) {
    const mots = [simplifier(plat.nom), ...plat.ingredients.map(simplifier)];
    return interdits.some((brut) => {
      const mot = motInterdit(brut);
      if (!mot) return false;
      const groupe = GROUPES[mot] || GROUPES[mot + 's'] || GROUPES[mot.replace(/(ien|al)$/, '')] || null;
      const cherches = groupe || [mot];
      return cherches.some((c) =>
        c.startsWith('type:') ? plat.type === c.slice(5) : mots.some((m) => (' ' + m + ' ').includes(' ' + c) || m.startsWith(c))
      );
    });
  }

  // Petit générateur de hasard "reproductible" : le même texte donne toujours les mêmes tirages
  // (ainsi tous les appareils affichent le même menu).
  function hasard(texte) {
    let h = 1779033703 ^ texte.length;
    for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
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
  const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

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
      const jour = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i);
      repasDuJour(i, d.repas).forEach((repas) => creneaux.push(cleJour(jour) + '|' + repas));
    }

    // Combien de plats de chaque type (au plus proche des parts, sans type tout interdit).
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

    // L'ordre des types dans la semaine : tiré au hasard, sans deux fois le même type de suite
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

    // Un plat pour chaque créneau : pas de doublon dans la semaine, et si possible pas
    // un plat de la semaine d'avant.
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

  // Le menu d'une semaine, avec les plats changés à la main (🔄) par-dessus.
  function menuFinal(lundi, d) {
    const avant = menuSemaine(new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() - 7), d);
    const menu = menuSemaine(lundi, d, new Set([...avant.values()].map((p) => p.nom)));
    Object.entries(d.changes || {}).forEach(([creneau, nom]) => {
      const plat = PLATS.find((p) => p.nom === nom);
      if (menu.has(creneau) && plat) menu.set(creneau, plat);
    });
    return menu;
  }

  /* ---- Le widget ----------------------------------------------------------- */

  // Les prochains repas à afficher : le midi jusqu'à 14 h, le soir jusqu'à 21 h 30.
  function prochainsRepas(d, nombre) {
    const maintenant = new Date();
    const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
    const resultat = [];
    for (let ecart = 0; ecart < 14 && resultat.length < nombre; ecart++) {
      const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + ecart);
      const index = (jour.getDay() + 6) % 7;
      for (const repas of repasDuJour(index, d.repas)) {
        if (ecart === 0 && (repas === 'midi' ? minutes >= 14 * 60 : minutes >= 21 * 60 + 30)) continue;
        const plat = menuFinal(lundiDe(jour), d).get(cleJour(jour) + '|' + repas);
        if (plat) resultat.push({ jour, ecart, repas, plat });
        if (resultat.length >= nombre) break;
      }
    }
    return resultat;
  }

  function etiquette(r) {
    const quand = r.repas === 'midi' ? 'midi' : 'soir';
    if (r.ecart === 0) return r.repas === 'midi' ? 'Ce midi' : 'Ce soir';
    if (r.ecart === 1) return 'Demain ' + quand;
    const nom = NOMS_JOURS[r.jour.getDay()];
    return nom.charAt(0).toUpperCase() + nom.slice(1) + ' ' + quand;
  }

  Nidoo.declarerWidget({
    type: 'menu',
    nom: 'Menu de la semaine',
    icone: '🍽️',
    tailles: ['moyen', 'grand', 'haut3'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { repas: 'soir-weekend', interdits: [], graines: {}, changes: {} },
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
        cle: 'interdits',
        libelle: 'Aliments interdits (un par ligne)',
        type: 'liste',
        aide: 'Un aliment (champignons, porc, poisson…) ou un régime (végétarien, sans gluten, sans lactose, '
          + 'sans œuf, fruits de mer…). Pour une allergie grave, vérifiez toujours les ingrédients.',
      },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      const nombre = { moyen: 2, grand: 4, haut3: 6 }[widget.taille] || 4;
      let cleAffichee = null;

      const moment = () => {
        const m = new Date();
        return m.toDateString() + '-' + (m.getHours() * 60 + m.getMinutes() >= 14 * 60) + '-' + (m.getHours() * 60 + m.getMinutes() >= 21 * 60 + 30);
      };

      function dessiner() {
        cleAffichee = moment();
        const repas = prochainsRepas(d(), nombre);
        zone.innerHTML = `
          <div class="liste-widget menu">
            <div class="widget-entete"><span>🍽️ Au menu</span><span class="compteur">Semaine</span></div>
            <ul class="menu-liste">
              ${repas.length === 0 ? '<li class="liste-vide">Tous les plats sont interdits : vérifiez ⚙️</li>' : ''}
              ${repas.map((r) => `
                <li class="menu-repas">
                  <span class="menu-quand">${etiquette(r)}</span>
                  <span class="menu-plat"><span class="menu-emoji">${r.plat.emoji}</span>${Nidoo.echapper(r.plat.nom)}</span>
                </li>`).join('')}
            </ul>
          </div>`;
      }

      /* La semaine entière (cette semaine ou la suivante), avec 🔄 pour changer un plat. */
      function ouvrirSemaine(decalage = 0) {
        const lundi = lundiDe(new Date());
        lundi.setDate(lundi.getDate() + 7 * decalage);
        const menu = menuFinal(lundi, d());
        const lignes = [];
        for (let i = 0; i < 7; i++) {
          const jour = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i);
          const repas = repasDuJour(i, d().repas)
            .map((r) => {
              const creneau = cleJour(jour) + '|' + r;
              const plat = menu.get(creneau);
              if (!plat) return '';
              return `<div class="menu-semaine-repas">
                  <span class="menu-quand">${r === 'midi' ? 'Midi' : 'Soir'}</span>
                  <span class="menu-plat"><span class="menu-emoji">${plat.emoji}</span>${Nidoo.echapper(plat.nom)}
                    <small>${Nidoo.echapper(plat.ingredients.join(', '))}</small></span>
                  <button class="bouton menu-changer" type="button" data-creneau="${creneau}" aria-label="Changer ce plat">🔄</button>
                </div>`;
            })
            .join('');
          const nom = NOMS_JOURS[jour.getDay()];
          lignes.push(`<div class="menu-semaine-jour"><h3>${nom.charAt(0).toUpperCase() + nom.slice(1)} ${jour.getDate()}</h3>${repas}</div>`);
        }
        const contenu = Nidoo.ouvrirPopin(
          '🍽️ Menu de la semaine',
          `<div class="menu-onglets">
             <button class="bouton${decalage === 0 ? ' bouton-principal' : ''}" type="button" data-semaine="0">Cette semaine</button>
             <button class="bouton${decalage === 1 ? ' bouton-principal' : ''}" type="button" data-semaine="1">Semaine prochaine</button>
           </div>
           <div class="menu-semaine">${lignes.join('')}</div>
           <p class="aide">À chaque repas : des légumes (dans le plat ou en entrée), et un fruit ou un laitage en dessert.</p>
           <button class="bouton menu-tout-changer" type="button">🔄 Un autre menu pour toute la semaine</button>`
        );
        contenu.querySelectorAll('[data-semaine]').forEach((b) =>
          b.addEventListener('click', () => ouvrirSemaine(Number(b.dataset.semaine)))
        );
        contenu.querySelectorAll('.menu-changer').forEach((b) =>
          b.addEventListener('click', () => {
            // Un autre plat du même type, pas déjà dans la semaine (au hasard).
            const actuel = menu.get(b.dataset.creneau);
            const dans = new Set([...menu.values()].map((p) => p.nom));
            const choix = PLATS.filter((p) => p.type === actuel.type && !dans.has(p.nom) && !interdit(p, d().interdits || []));
            const autres = choix.length ? choix : PLATS.filter((p) => p.nom !== actuel.nom && !interdit(p, d().interdits || []));
            if (!autres.length) return;
            const plat = autres[Math.floor(Math.random() * autres.length)];
            widget.enregistrer({ ...d(), changes: { ...(d().changes || {}), [b.dataset.creneau]: plat.nom } });
            dessiner();
            ouvrirSemaine(decalage);
          })
        );
        contenu.querySelector('.menu-tout-changer').addEventListener('click', () => {
          const cle = cleJour(lundi);
          const changes = Object.fromEntries(
            Object.entries(d().changes || {}).filter(([c]) => lundiDe(new Date(c.slice(0, 10) + 'T12:00')).getTime() !== lundi.getTime())
          );
          widget.enregistrer({ ...d(), changes, graines: { ...(d().graines || {}), [cle]: ((d().graines || {})[cle] || 0) + 1 } });
          dessiner();
          ouvrirSemaine(decalage);
        });
      }

      zone.addEventListener('click', () => ouvrirSemaine(0));
      dessiner();
      // Chaque minute : après le midi ou le soir, on passe au repas suivant.
      const minuteur = setInterval(() => moment() !== cleAffichee && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });

  // Pour les tests et pour bricoler (console du navigateur) : Nidoo.menu.semaine(new Date(), { repas: 'tous', interdits: ['porc'] })
  Nidoo.menu = { PLATS, interdit, semaine: (date, d) => menuFinal(lundiDe(date), d) };
})();
