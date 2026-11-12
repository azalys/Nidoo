/*
 * L'application : la grille, le mode "Modifier", l'ajout et le déplacement des widgets.
 */
(function () {
  const etat = Nidoo.stockage.charger();

  const grille = document.getElementById('grille');
  const boutonModifier = document.getElementById('bouton-modifier');
  const boutonAjouter = document.getElementById('bouton-ajouter');
  const boutonAppareil = document.getElementById('bouton-appareil');
  const galerie = document.getElementById('galerie');
  const listeWidgets = document.getElementById('liste-widgets');

  let modeEdition = false;

  // Pour chaque widget affiché : sa fonction de nettoyage (voir js/widgets.js).
  const nettoyages = new Map();

  // Nom de la famille affiché en haut ("Nidoo — Famille Dupond"), partagé entre appareils.
  const NOM_PAR_DEFAUT = 'Famille Dupond';
  const nomFamille = document.getElementById('famille-nom');
  const champFamille = document.getElementById('famille-champ');
  function afficherNomFamille() {
    const texte = (etat.famille && etat.famille.texte) || NOM_PAR_DEFAUT;
    nomFamille.textContent = texte;
    if (document.activeElement !== champFamille) champFamille.value = texte;
  }
  function changerNomFamille() {
    const texte = champFamille.value.trim() || NOM_PAR_DEFAUT;
    if (texte === ((etat.famille && etat.famille.texte) || NOM_PAR_DEFAUT)) return afficherNomFamille();
    etat.famille = { texte, maj: Date.now() };
    sauvegarder();
    afficherNomFamille();
  }
  champFamille.addEventListener('change', changerNomFamille);
  champFamille.addEventListener('keydown', (e) => e.key === 'Enter' && champFamille.blur());

  // Les widgets supprimés (id → date), pour que la suppression se propage aux autres appareils.
  etat.supprimes = etat.supprimes && !Array.isArray(etat.supprimes) ? etat.supprimes : {};

  function sauvegarder() {
    Nidoo.stockage.enregistrer(etat);
    // Prévient le partage entre appareils (js/synchro.js) qu'il y a du nouveau.
    document.dispatchEvent(new Event('nidoo:modifie'));
  }

  // Date de dernière modification d'un widget : en cas de modifications sur deux
  // appareils, c'est la plus récente qui gagne (voir js/synchro.js).
  function toucher(w) {
    w.maj = Date.now();
  }

  function nouvelIdentifiant() {
    return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  const nomsCouleurs = Object.keys(Nidoo.COULEURS);

  /* Couleur suivante dans la palette (pour que deux widgets ajoutés à la suite soient différents). */
  function couleurSuivante(couleur) {
    return nomsCouleurs[(nomsCouleurs.indexOf(couleur) + 1) % nomsCouleurs.length];
  }

  /* Applique la couleur d'un widget à sa case (variables CSS --w-fond, --w-ombre, --w-texte). */
  function appliquerCouleur(caseWidget, couleur) {
    const c = Nidoo.COULEURS[couleur] || Nidoo.COULEURS[nomsCouleurs[0]];
    caseWidget.style.setProperty('--w-fond', c.fond);
    caseWidget.style.setProperty('--w-ombre', c.ombre);
    caseWidget.style.setProperty('--w-texte', c.texte);
  }

  // Les widgets enregistrés avant l'arrivée des couleurs en reçoivent une.
  etat.widgets.forEach((w, i) => {
    if (!Nidoo.COULEURS[w.couleur]) w.couleur = nomsCouleurs[i % nomsCouleurs.length];
  });

  // Les anciens widgets "Courses" deviennent des Listes "🛒 Courses" (voir widgets/liste.js).
  const convertis = etat.widgets.filter((w) => Nidoo.convertirCourses(w));
  convertis.forEach(toucher);
  if (convertis.length > 0) sauvegarder();

  /*
   * Listes partagées : le contenu des widgets Liste est rangé à part, dans etat.listes,
   * et chaque widget Liste indique juste quelle liste il affiche (donnees.liste).
   * Deux widgets (côté enfant et côté parents) peuvent ainsi afficher LA MÊME liste.
   */
  // Les types de widgets dont le contenu peut être partagé entre plusieurs widgets.
  const PARTAGEABLES = new Set(['liste', 'echeances']);
  etat.listes = etat.listes && !Array.isArray(etat.listes) ? etat.listes : {};
  let listesConverties = false;
  etat.widgets.forEach((w) => {
    if (!PARTAGEABLES.has(w.type) || (w.donnees && w.donnees.liste)) return;
    // Ancienne liste (contenu dans le widget) → liste partagée. L'identifiant dépend du
    // widget : deux appareils qui convertissent la même liste obtiennent le même.
    const id = 'l' + w.id;
    etat.listes[id] = { ...(etat.listes[id] || {}), ...(w.donnees || {}), maj: w.maj || Date.now() };
    w.donnees = { liste: id };
    listesConverties = true;
  });
  if (listesConverties) sauvegarder();

  const estListePartagee = (w) => PARTAGEABLES.has(w.type) && w.donnees && w.donnees.liste;

  // Les données d'un widget : les siennes, ou celles de la liste partagée qu'il affiche.
  function donneesDe(w) {
    if (estListePartagee(w)) return etat.listes[w.donnees.liste] || {};
    return w.donnees;
  }

  // Enregistre les données d'un widget (dans la liste partagée si c'en est une).
  function ecrireDonnees(w, donnees) {
    if (estListePartagee(w)) {
      etat.listes[w.donnees.liste] = { ...donnees, maj: Date.now() };
      // Les autres widgets affichés qui montrent la même liste se redessinent.
      widgetsAffiches()
        .filter((x) => x.id !== w.id && estListePartagee(x) && x.donnees.liste === w.donnees.liste)
        .forEach((x) => grille.querySelector('.widget[data-id="' + x.id + '"]') && redessinerEnGardantSaisie(x.id));
    } else {
      w.donnees = donnees;
      toucher(w);
    }
  }

  /*
   * Deux grilles : celle du mode enfant et celle du mode adulte (interrupteur "Adulte").
   * Chaque widget appartient à l'une des deux (w.grille = 'adulte', sinon enfant).
   * Les deux sont partagées entre appareils ; seule celle du mode en cours est affichée.
   */
  const grilleActive = () => (document.documentElement.dataset.style === 'adulte' ? 'adulte' : 'enfant');
  const estAffiche = (w) => (w.grille || 'enfant') === grilleActive();
  const widgetsAffiches = () => etat.widgets.filter(estAffiche);

  function trouverWidget(id) {
    return etat.widgets.find((w) => w.id === id);
  }

  /* ------------------------------------------------------------------ */
  /* Affichage                                                          */
  /* ------------------------------------------------------------------ */

  /* Fabrique la case HTML d'un widget. */
  function creerCase(w) {
    const definition = Nidoo.catalogue[w.type];

    const caseWidget = document.createElement('div');
    caseWidget.className = 'widget taille-' + w.taille;
    caseWidget.dataset.id = w.id;
    appliquerCouleur(caseWidget, w.couleur);

    // Boutons visibles uniquement en mode "Modifier" (voir css/style.css).
    caseWidget.innerHTML = `
      <div class="contenu"></div>
      <button class="bouton-widget bouton-supprimer" aria-label="Supprimer">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>
      </button>
      <button class="bouton-widget bouton-couleur" aria-label="Changer la couleur"><span class="emoji">🎨</span></button>
      <button class="bouton-widget bouton-reglages" aria-label="Réglages du widget"><span class="emoji">⚙️</span></button>`;

    // On cache les boutons inutiles pour ce widget.
    // ⚙️ seulement s'il y a quelque chose à régler (des réglages, ou plusieurs tailles possibles).
    if (!definition || (!definition.reglages && (definition.tailles || []).length < 2)) {
      caseWidget.querySelector('.bouton-reglages').remove();
    }

    const zone = caseWidget.querySelector('.contenu');
    if (definition) {
      const nettoyage = definition.afficher(zone, {
        taille: w.taille,
        // "get" : on lit toujours les données les plus récentes.
        get donnees() {
          return donneesDe(w);
        },
        enregistrer(nouvellesDonnees) {
          ecrireDonnees(w, nouvellesDonnees);
          sauvegarder();
        },
      });
      nettoyages.set(w.id, nettoyage);
    } else {
      zone.innerHTML = '<p class="widget-inconnu">Widget « ' + w.type + ' » introuvable</p>';
    }

    caseWidget.querySelector('.bouton-supprimer').addEventListener('click', () => supprimerWidget(w.id));
    caseWidget.querySelector('.bouton-reglages')?.addEventListener('click', () => ouvrirReglages(w.id));
    caseWidget.querySelector('.bouton-couleur').addEventListener('click', () => {
      w.couleur = couleurSuivante(w.couleur);
      toucher(w);
      sauvegarder();
      appliquerCouleur(caseWidget, w.couleur);
    });
    return caseWidget;
  }

  function nettoyer(id) {
    const nettoyage = nettoyages.get(id);
    if (typeof nettoyage === 'function') nettoyage();
    nettoyages.delete(id);
  }

  /* Redessine toute la grille. */
  function afficherGrille() {
    nettoyages.forEach((_, id) => nettoyer(id));
    grille.innerHTML = '';
    widgetsAffiches().forEach((w) => grille.appendChild(creerCase(w)));
    afficherMessageVide();
    placer();
  }

  /* ------------------------------------------------------------------ */
  /* Taille des cases et position des widgets                           */
  /* ------------------------------------------------------------------ */

  let colonnes = 8;     // colonnes de la grille (réglées en haut de css/style.css)
  let lignesEcran = 4;  // lignes qui tiennent dans la hauteur de l'écran
  let placement = new Map();

  /*
   * Grille fixe qui remplit tout l'écran : à l'horizontale 8 colonnes × 4 lignes,
   * à la verticale 4 × 8 (réglages en haut de css/style.css).
   * Les colonnes se partagent la largeur, les lignes la hauteur.
   * Sur un petit écran (téléphone) : 2 colonnes et on fait défiler.
   */
  function mesurer() {
    const css = getComputedStyle(document.documentElement);
    const nombre = (nom) => parseFloat(css.getPropertyValue(nom)) || 0;
    const marge = nombre('--marge');
    const ecart = nombre('--ecart');
    const relief = nombre('--relief');
    const largeur = document.documentElement.clientWidth;
    const hauteur = window.innerHeight;
    const barre = document.querySelector('.barre').offsetHeight;
    let taille;

    if (largeur <= 600) {
      colonnes = 2;
      taille = (largeur - 2 * marge - ecart) / 2;
      lignesEcran = 1;
    } else {
      const vertical = hauteur > largeur;
      colonnes = nombre(vertical ? '--colonnes-verticale' : '--colonnes-horizontale');
      lignesEcran = nombre(vertical ? '--lignes-verticale' : '--lignes-horizontale');
      const place = hauteur - barre - 12 - marge - relief - (lignesEcran - 1) * (ecart + relief);
      taille = Math.max(60, place / lignesEcran); // hauteur d'une ligne
    }
    grille.style.setProperty('--colonnes', colonnes);
    grille.style.setProperty('--case', taille + 'px');
  }

  /*
   * Calcule où va chaque widget et l'affiche.
   * `enregistrer` : garde ces positions (après une action de l'utilisateur).
   * Un simple changement de taille de fenêtre ne les enregistre pas.
   */
  function placer({ enregistrer = false, prioritaire } = {}) {
    placement = Nidoo.placement.calculer(widgetsAffiches(), colonnes, prioritaire);
    if (enregistrer) {
      widgetsAffiches().forEach((w) => {
        const p = placement.get(w.id);
        if (w.x !== p.x || w.y !== p.y) toucher(w);
        w.x = p.x;
        w.y = p.y;
      });
      sauvegarder();
    }
    placement.forEach((p, id) => {
      const caseWidget = grille.querySelector('.widget[data-id="' + id + '"]');
      if (!caseWidget) return;
      caseWidget.style.gridColumn = p.x + 1 + ' / span ' + p.l;
      caseWidget.style.gridRow = p.y + 1 + ' / span ' + p.h;
    });
    dessinerEmplacements();
  }

  /* Les cases vides, visibles en mode "Modifier" : on peut y déposer un widget. */
  function dessinerEmplacements() {
    grille.querySelectorAll('.emplacement').forEach((e) => e.remove());
    const lignes = Math.max(lignesEcran, Nidoo.placement.hauteur(placement));
    const fragment = document.createDocumentFragment();
    for (let y = 0; y < lignes; y++) {
      for (let x = 0; x < colonnes; x++) {
        const emplacement = document.createElement('div');
        emplacement.className = 'emplacement';
        emplacement.dataset.x = x;
        emplacement.dataset.y = y;
        emplacement.style.gridColumn = String(x + 1);
        emplacement.style.gridRow = String(y + 1);
        fragment.appendChild(emplacement);
      }
    }
    grille.prepend(fragment);
  }

  let attenteRedimension = null;
  window.addEventListener('resize', () => {
    clearTimeout(attenteRedimension);
    attenteRedimension = setTimeout(() => {
      mesurer();
      placer();
    }, 150);
  });

  function afficherMessageVide() {
    const message = grille.querySelector('.vide');
    const vide = widgetsAffiches().length === 0;
    if (vide && !message) {
      // Si l'autre grille (enfant ou adulte) a des widgets, on propose de la copier.
      const autre = grilleActive() === 'adulte' ? 'enfant' : 'adulte';
      const copiable = etat.widgets.some((w) => (w.grille || 'enfant') === autre);
      grille.insertAdjacentHTML(
        'beforeend',
        '<div class="vide"><p>La grille ' + grilleActive() + ' est vide.<br>' +
          'Touchez « Modifier » puis « + Ajouter ».</p>' +
          (copiable ? '<button class="bouton copier-grille">Copier la grille ' + autre + '</button>' +
            '<p class="aide">Les listes restent les mêmes des deux côtés ; les autres widgets sont copiés.</p>' : '') +
          '</div>'
      );
      grille.querySelector('.copier-grille')?.addEventListener('click', () => copierGrille(autre));
    } else if (!vide && message) {
      message.remove();
    }
  }

  /* Copie les widgets de l'autre grille dans celle affichée. Les Listes copiées affichent
     les mêmes listes (partagées) ; les autres widgets sont des copies indépendantes. */
  function copierGrille(source) {
    const cible = grilleActive();
    etat.widgets
      .filter((w) => (w.grille || 'enfant') === source)
      .forEach((w) => {
        const copie = JSON.parse(JSON.stringify(w));
        copie.id = nouvelIdentifiant();
        if (cible === 'adulte') copie.grille = 'adulte';
        else delete copie.grille;
        copie.maj = Date.now();
        etat.widgets.push(copie);
      });
    sauvegarder();
    afficherGrille();
  }

  /* ------------------------------------------------------------------ */
  /* Actions sur les widgets                                            */
  /* ------------------------------------------------------------------ */

  /* Crée un widget. `options` (facultatif) : { taille, couleur, donnees, x, y }. */
  function creerWidget(type, options = {}) {
    const definition = Nidoo.catalogue[type];
    const derniere = etat.widgets[etat.widgets.length - 1];
    const w = {
      id: nouvelIdentifiant(),
      type,
      taille: options.taille || definition.tailleParDefaut,
      couleur: options.couleur || (derniere ? couleurSuivante(derniere.couleur) : nomsCouleurs[0]),
      // Une Liste partagée ne garde que la référence à sa liste (le contenu est dans etat.listes).
      donnees: options.donnees && options.donnees.liste
        ? { liste: options.donnees.liste }
        : { ...(definition.donneesParDefaut || {}), ...(options.donnees || {}) },
      maj: Date.now(),
    };
    if (grilleActive() === 'adulte') w.grille = 'adulte';
    if (Number.isInteger(options.x) && Number.isInteger(options.y)) {
      w.x = options.x;
      w.y = options.y;
    }
    etat.widgets.push(w);
    return w;
  }

  function ajouterWidget(type, options) {
    if (PARTAGEABLES.has(type) && !options) return choisirListe(type);
    const w = creerWidget(type, options);
    const caseWidget = creerCase(w);
    grille.appendChild(caseWidget);
    afficherMessageVide();
    placer({ enregistrer: true }); // il va à la première place libre
    caseWidget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /*
   * Ajouter une Liste : une liste vierge, ou une liste qui existe déjà (côté enfant ou
   * parents). Une liste existante est partagée : même contenu des deux côtés.
   */
  function choisirListe(type) {
    const definition = Nidoo.catalogue[type];
    const existantes = new Map(); // id de liste → { donnees, cotes }
    etat.widgets.filter((w) => w.type === type && estListePartagee(w)).forEach((w) => {
      const id = w.donnees.liste;
      if (!etat.listes[id]) return;
      const e = existantes.get(id) || { donnees: etat.listes[id], cotes: new Set() };
      e.cotes.add((w.grille || 'enfant') === 'adulte' ? 'parents' : 'enfant');
      existantes.set(id, e);
    });
    const nouvelleListe = () => {
      const id = 'l' + nouvelIdentifiant();
      etat.listes[id] = { ...JSON.parse(JSON.stringify(definition.donneesParDefaut || {})), maj: Date.now() };
      return id;
    };
    if (existantes.size === 0) return ajouterWidget(type, { donnees: { liste: nouvelleListe() } });

    const contenu = Nidoo.ouvrirPopin(
      `${definition.icone} ${type === 'liste' ? 'Quelle liste ?' : 'Quelles ' + definition.nom.toLowerCase() + ' ?'}`,
      `<div class="choix-listes">
         <button class="choix-liste" data-liste=""><span>➕</span><strong>${type === 'liste' ? 'Nouvelle liste vierge' : 'Nouveau widget vierge'}</strong></button>
         ${[...existantes].map(([id, e]) => `
           <button class="choix-liste" data-liste="${id}">
             <span>${Nidoo.echapper(e.donnees.emoji || definition.icone)}</span>
             <strong>${Nidoo.echapper(e.donnees.titre || definition.nom)}</strong>
             <small>${(e.donnees.elements || []).length} élément(s) · côté ${[...e.cotes].join(' et ')}</small>
           </button>`).join('')}
       </div>
       <p class="aide">Si vous choisissez un existant, il est partagé : ce qu'on y ajoute ou coche apparaît des deux côtés.</p>`
    );
    contenu.querySelectorAll('.choix-liste').forEach((bouton) =>
      bouton.addEventListener('click', () => {
        contenu.closest('dialog').close();
        ajouterWidget(type, { donnees: { liste: bouton.dataset.liste || nouvelleListe() } });
      })
    );
  }

  function supprimerWidget(id) {
    const w = trouverWidget(id);
    const nom = Nidoo.catalogue[w.type]?.nom || w.type;
    if (!confirm('Supprimer le widget « ' + nom + ' » ?')) return;
    nettoyer(id);
    etat.widgets = etat.widgets.filter((x) => x.id !== id);
    etat.supprimes[id] = Date.now();
    sauvegarder();
    grille.querySelector('[data-id="' + id + '"]').remove();
    afficherMessageVide();
    placer();
  }

  /* Donne une nouvelle taille à un widget (choisie dans ⚙️). */
  function changerTaille(id, taille) {
    const w = trouverWidget(id);
    w.taille = taille;
    toucher(w);
    redessiner(id);
    // Il garde sa place si possible ; ce qu'il recouvre va à la première place libre.
    gelerPositions();
    const p = placement.get(id);
    const { l, h } = Nidoo.placement.dimensions(w, colonnes);
    Nidoo.placement.chevauchements(placement, p.x, p.y, l, h, id).forEach((autre) => {
      delete trouverWidget(autre).x;
      delete trouverWidget(autre).y;
    });
    placer({ enregistrer: true, prioritaire: id });
  }

  /* Enregistre dans chaque widget la position où il est affiché maintenant. */
  function gelerPositions() {
    widgetsAffiches().forEach((w) => {
      const p = placement.get(w.id);
      if (p) {
        if (w.x !== p.x || w.y !== p.y) toucher(w); // nouvelle position : à partager
        w.x = p.x;
        w.y = p.y;
      }
    });
  }

  /* Redessine un seul widget (après un changement de taille ou de réglages). */
  function redessiner(id) {
    nettoyer(id);
    const ancienne = grille.querySelector('[data-id="' + id + '"]');
    const nouvelle = creerCase(trouverWidget(id));
    nouvelle.style.gridColumn = ancienne.style.gridColumn;
    nouvelle.style.gridRow = ancienne.style.gridRow;
    ancienne.replaceWith(nouvelle);
  }

  /* ------------------------------------------------------------------ */
  /* Mode "Modifier"                                                    */
  /* ------------------------------------------------------------------ */

  function basculerEdition(actif) {
    modeEdition = actif;
    document.body.classList.toggle('edition', actif);
    boutonModifier.querySelector('.texte-bouton').textContent = actif ? 'Terminé' : 'Modifier';
    boutonModifier.querySelector('.icone-bouton').textContent = actif ? '👍' : '✏️';
    boutonModifier.setAttribute('aria-label', actif ? 'Terminé' : 'Modifier');
    boutonAjouter.hidden = !actif;
    boutonAppareil.hidden = !actif;
  }

  boutonModifier.addEventListener('click', () => basculerEdition(!modeEdition));

  // Appui long sur la grille (comme sur iPad) : entre en mode "Modifier".
  let minuteurAppuiLong = null;
  let departAppui = null;
  grille.addEventListener('pointerdown', (e) => {
    if (modeEdition || e.target.closest('textarea, input, button, select, a')) return;
    departAppui = { x: e.clientX, y: e.clientY };
    minuteurAppuiLong = setTimeout(() => basculerEdition(true), 600);
  });
  grille.addEventListener('pointermove', (e) => {
    if (departAppui && Math.hypot(e.clientX - departAppui.x, e.clientY - departAppui.y) > 10) {
      clearTimeout(minuteurAppuiLong);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) =>
    grille.addEventListener(evt, () => {
      clearTimeout(minuteurAppuiLong);
      departAppui = null;
    })
  );

  /* ------------------------------------------------------------------ */
  /* Fenêtre "Ajouter un widget"                                        */
  /* ------------------------------------------------------------------ */

  function remplirGalerie() {
    listeWidgets.innerHTML = '';
    Object.values(Nidoo.catalogue).forEach((definition, i) => {
      const bouton = document.createElement('button');
      bouton.className = 'choix-widget';
      bouton.innerHTML = '<span class="icone">' + definition.icone + '</span><span>' + definition.nom + '</span>';
      const c = Nidoo.COULEURS[nomsCouleurs[i % nomsCouleurs.length]];
      bouton.style.setProperty('--w-fond', c.fond);
      bouton.style.setProperty('--w-ombre', c.ombre);
      bouton.style.setProperty('--w-texte', c.texte);
      bouton.addEventListener('click', () => {
        ajouterWidget(definition.type);
        galerie.close();
      });
      listeWidgets.appendChild(bouton);
    });
  }

  boutonAjouter.addEventListener('click', () => galerie.showModal());
  document.getElementById('fermer-galerie').addEventListener('click', () => galerie.close());
  // Toucher en dehors de la fenêtre la ferme aussi.
  galerie.addEventListener('click', (e) => {
    if (e.target === galerie) galerie.close();
  });

  /* ------------------------------------------------------------------ */
  /* Fenêtre "Réglages" d'un widget                                     */
  /*                                                                    */
  /* Le formulaire est construit à partir de `reglages` dans la         */
  /* déclaration du widget (voir js/widgets.js).                        */
  /* ------------------------------------------------------------------ */

  const fenetreReglages = document.getElementById('reglages');
  const formReglages = document.getElementById('form-reglages');
  const champsReglages = document.getElementById('champs-reglages');
  let widgetEnReglage = null;

  const TAILLE = '__taille'; // nom du champ "Taille" dans le formulaire

  /* Les champs de la fenêtre : la taille (si le widget en a plusieurs), puis ses propres réglages. */
  function champsDuWidget(definition) {
    const champs = [];
    const tailles = definition.tailles || [];
    if (tailles.length > 1) {
      champs.push({
        cle: TAILLE,
        libelle: 'Taille (lignes × colonnes)',
        type: 'choix',
        options: tailles.map((t) => ({ valeur: t, libelle: Nidoo.TAILLES[t].nom })),
      });
    }
    return champs.concat(definition.reglages || []);
  }

  function ouvrirReglages(id) {
    const w = trouverWidget(id);
    const definition = Nidoo.catalogue[w.type];
    widgetEnReglage = w;
    document.getElementById('titre-reglages').textContent = definition.icone + ' ' + definition.nom;
    champsReglages.innerHTML = '';

    champsDuWidget(definition).forEach((r) => {
      const valeur = r.cle === TAILLE ? w.taille : donneesDe(w)[r.cle];
      // (Pour les jours de la semaine, plusieurs cases : le bloc ne peut pas être un <label>.)
      const bloc = document.createElement(r.type === 'jours' ? 'div' : 'label');
      bloc.className = 'champ';
      bloc.innerHTML = '<span class="libelle"></span>';
      bloc.querySelector('.libelle').textContent = r.libelle;

      let champ;
      if (r.type === 'jours') {
        // Jours de la semaine à cocher : la valeur est une liste de numéros (1 = lundi … 7 = dimanche).
        champ = document.createElement('div');
        champ.className = 'jours';
        ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((lettre, i) => {
          const jour = document.createElement('label');
          jour.className = 'jour';
          jour.innerHTML = `<input type="checkbox" name="${r.cle}" value="${i + 1}"><span>${lettre}</span>`;
          jour.querySelector('input').checked = Array.isArray(valeur) && valeur.includes(i + 1);
          champ.appendChild(jour);
        });
      } else if (r.type === 'choix') {
        // Liste déroulante : r.options = [{ valeur, libelle }, ...]
        champ = document.createElement('select');
        r.options.forEach((o) => {
          const option = document.createElement('option');
          option.value = o.valeur;
          option.textContent = o.libelle;
          champ.appendChild(option);
        });
        champ.value = valeur || r.options[0].valeur;
      } else if (r.type === 'liste') {
        // Une ligne = un élément.
        champ = document.createElement('textarea');
        champ.rows = 5;
        champ.value = Array.isArray(valeur) ? valeur.join('\n') : '';
      } else {
        champ = document.createElement('input');
        champ.type = { url: 'url', date: 'date', heure: 'time' }[r.type] || 'text';
        champ.value = valeur || '';
      }
      if (r.type !== 'jours') champ.name = r.cle;
      if (r.exemple) champ.placeholder = r.exemple;
      bloc.appendChild(champ);

      if (r.aide) {
        const aide = document.createElement('small');
        aide.textContent = r.aide;
        bloc.appendChild(aide);
      }
      champsReglages.appendChild(bloc);
    });
    fenetreReglages.showModal();
  }

  formReglages.addEventListener('submit', (e) => {
    e.preventDefault();
    const w = widgetEnReglage;
    const definition = Nidoo.catalogue[w.type];
    const nouvelles = { ...donneesDe(w) };
    (definition.reglages || []).forEach((r) => {
      if (r.type === 'jours') {
        nouvelles[r.cle] = [...formReglages.querySelectorAll(`[name="${r.cle}"]:checked`)].map((c) => Number(c.value));
        return;
      }
      const brut = formReglages.elements[r.cle].value;
      nouvelles[r.cle] =
        r.type === 'liste'
          ? brut.split('\n').map((l) => l.trim()).filter(Boolean)
          : brut.trim();
    });
    ecrireDonnees(w, nouvelles);
    sauvegarder();
    fenetreReglages.close();

    const taille = formReglages.elements[TAILLE]?.value;
    if (taille && taille !== w.taille) changerTaille(w.id, taille); // redessine et replace
    else redessiner(w.id);
  });

  document.getElementById('annuler-reglages').addEventListener('click', () => fenetreReglages.close());

  /* ------------------------------------------------------------------ */
  /* Glisser-déposer (en mode "Modifier")                               */
  /*                                                                    */
  /* Une copie ("fantôme") suit le doigt ; les cases où le widget va    */
  /* atterrir sont surlignées. Au lâcher :                              */
  /*   - place libre : le widget y va ;                                 */
  /*   - un seul widget de même taille dessous : ils échangent ;        */
  /*   - sinon : les widgets recouverts vont à la première place libre. */
  /* ------------------------------------------------------------------ */

  let glisse = null; // { id, caseWidget, fantome, decalageX, decalageY, departX, departY, actif, cible }

  /* La case (colonne, ligne) sous le coin haut-gauche du fantôme. */
  function caseSous(gauche, haut, l, h) {
    const rect = grille.getBoundingClientRect();
    const css = getComputedStyle(grille);
    const debutX = rect.left + parseFloat(css.paddingLeft);
    const debutY = rect.top + parseFloat(css.paddingTop);
    const largeurUtile = rect.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const ecartX = parseFloat(css.columnGap);
    const pasX = (largeurUtile + ecartX) / colonnes;
    const pasY = parseFloat(grille.style.getPropertyValue('--case')) + parseFloat(css.rowGap);
    const lignes = Math.max(lignesEcran, Nidoo.placement.hauteur(placement));
    return {
      x: Math.min(Math.max(0, Math.round((gauche - debutX) / pasX)), colonnes - l),
      y: Math.min(Math.max(0, Math.round((haut - debutY) / pasY)), Math.max(0, lignes - h)),
    };
  }

  function surligner(cible, l, h) {
    grille.querySelectorAll('.emplacement.cible').forEach((e) => e.classList.remove('cible'));
    if (!cible) return;
    grille.querySelectorAll('.emplacement').forEach((e) => {
      const x = Number(e.dataset.x);
      const y = Number(e.dataset.y);
      if (x >= cible.x && x < cible.x + l && y >= cible.y && y < cible.y + h) e.classList.add('cible');
    });
  }

  grille.addEventListener('pointerdown', (e) => {
    if (!modeEdition || e.button > 0 || e.target.closest('.bouton-widget')) return;
    const caseWidget = e.target.closest('.widget');
    if (!caseWidget) return;
    const rect = caseWidget.getBoundingClientRect();
    glisse = {
      id: caseWidget.dataset.id,
      caseWidget,
      fantome: null,
      decalageX: e.clientX - rect.left,
      decalageY: e.clientY - rect.top,
      departX: e.clientX,
      departY: e.clientY,
      actif: false,
      cible: null,
    };
  });

  // On écoute toute la page : le doigt peut sortir de la grille pendant le glissement.
  document.addEventListener('pointermove', (e) => {
    if (!glisse) return;

    // On ne commence vraiment qu'après quelques pixels (évite les faux départs).
    if (!glisse.actif) {
      if (Math.hypot(e.clientX - glisse.departX, e.clientY - glisse.departY) < 8) return;
      const rect = glisse.caseWidget.getBoundingClientRect();
      const fantome = glisse.caseWidget.cloneNode(true);
      fantome.classList.add('fantome');
      fantome.style.width = rect.width + 'px';
      fantome.style.height = rect.height + 'px';
      document.body.appendChild(fantome);
      glisse.fantome = fantome;
      glisse.caseWidget.classList.add('en-deplacement');
      glisse.actif = true;
    }

    const gauche = e.clientX - glisse.decalageX;
    const haut = e.clientY - glisse.decalageY;
    glisse.fantome.style.left = gauche + 'px';
    glisse.fantome.style.top = haut + 'px';

    const p = placement.get(glisse.id);
    glisse.cible = caseSous(gauche, haut, p.l, p.h);
    surligner(glisse.cible, p.l, p.h);
  });

  function deposer(id, cible) {
    const p = placement.get(id);
    if (cible.x === p.x && cible.y === p.y) return;
    gelerPositions();
    const dessous = Nidoo.placement.chevauchements(placement, cible.x, cible.y, p.l, p.h, id);
    const seul = dessous.length === 1 && placement.get(dessous[0]);

    if (seul && seul.l === p.l && seul.h === p.h) {
      // Même taille : on échange les places.
      const autre = trouverWidget(dessous[0]);
      autre.x = p.x;
      autre.y = p.y;
      toucher(autre);
    } else {
      // Les widgets recouverts iront à la première place libre.
      dessous.forEach((autreId) => {
        delete trouverWidget(autreId).x;
        delete trouverWidget(autreId).y;
      });
    }
    const w = trouverWidget(id);
    w.x = cible.x;
    w.y = cible.y;
    toucher(w); // le déplacement doit être partagé avec les autres appareils
    placer({ enregistrer: true, prioritaire: id });
  }

  function terminerGlisse() {
    if (!glisse) return;
    if (glisse.actif) {
      glisse.fantome.remove();
      glisse.caseWidget.classList.remove('en-deplacement');
      surligner(null);
      if (glisse.cible) deposer(glisse.id, glisse.cible);
    }
    glisse = null;
  }
  document.addEventListener('pointerup', terminerGlisse);
  document.addEventListener('pointercancel', terminerGlisse);

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                          */
  /* ------------------------------------------------------------------ */

  // Premier lancement : les deux grilles commencent vides, chacun choisit ses widgets.
  delete etat.nouveau;

  // Fenêtre "⚙️ Appareil" (mode nuit, partage…). Les sections écoutent "nidoo:ouverture".
  const fenetreAppareil = document.getElementById('appareil');
  boutonAppareil.addEventListener('click', () => {
    fenetreAppareil.dispatchEvent(new Event('nidoo:ouverture'));
    fenetreAppareil.showModal();
  });
  document.getElementById('fermer-appareil').addEventListener('click', () => fenetreAppareil.close());
  fenetreAppareil.addEventListener('click', (e) => e.target === fenetreAppareil && fenetreAppareil.close());

  /*
   * Applique un état venu d'un autre appareil (js/synchro.js), sans tout recharger :
   * seuls les widgets qui ont changé sont redessinés. Un widget dans lequel on est
   * en train d'écrire attend qu'on en sorte.
   */
  let grilleArretee = false;
  const enAttente = new Set();

  function appliquerEtat(nouveau) {
    const avant = new Map(etat.widgets.map((w) => [w.id, w]));
    const ids = new Set(nouveau.widgets.map((w) => w.id));
    const changes = [];

    etat.widgets.forEach((w) => {
      if (ids.has(w.id)) return;
      nettoyer(w.id);
      grille.querySelector('.widget[data-id="' + w.id + '"]')?.remove();
    });
    etat.widgets = nouveau.widgets.map((n) => {
      const a = avant.get(n.id);
      if (!a) {
        changes.push({ id: n.id, nouveau: true });
        return n;
      }
      if (JSON.stringify(a) !== JSON.stringify(n)) {
        // Mise à jour "sur place" : les widgets affichés gardent le même objet.
        Object.keys(a).forEach((k) => !(k in n) && delete a[k]);
        Object.assign(a, n);
        changes.push({ id: n.id });
      }
      return a;
    });
    etat.supprimes = nouveau.supprimes;
    if (nouveau.famille) etat.famille = nouveau.famille;
    // Listes partagées modifiées ailleurs : on redessine les widgets qui les affichent.
    const listesChangees = new Set(
      Object.keys(nouveau.listes || {}).filter((id) => JSON.stringify((etat.listes || {})[id]) !== JSON.stringify(nouveau.listes[id]))
    );
    etat.listes = nouveau.listes || {};
    etat.widgets
      .filter((w) => estListePartagee(w) && listesChangees.has(w.donnees.liste) && !changes.some((c) => c.id === w.id))
      .forEach((w) => changes.push({ id: w.id }));
    afficherNomFamille();
    Nidoo.stockage.enregistrer(etat);
    if (grilleArretee) return;

    changes.forEach((c) => {
      const caseWidget = grille.querySelector('.widget[data-id="' + c.id + '"]');
      if (!estAffiche(trouverWidget(c.id))) {
        caseWidget?.remove(); // widget de l'autre grille : rien à afficher
        return;
      }
      if (c.nouveau || !caseWidget) {
        if (!caseWidget) grille.appendChild(creerCase(trouverWidget(c.id)));
      } else if (caseWidget.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') {
        enAttente.add(c.id); // on écrit dans une note : on attend
      } else {
        redessinerEnGardantSaisie(c.id);
      }
    });
    afficherMessageVide();
    placer();
  }

  // Redessine un widget en gardant le champ en cours (texte tapé, curseur) s'il y en a un.
  function redessinerEnGardantSaisie(id) {
    const ancienne = grille.querySelector('.widget[data-id="' + id + '"]');
    const actif = document.activeElement;
    const champs = [...ancienne.querySelectorAll('input')];
    const rang = champs.indexOf(actif);
    const saisie = rang >= 0 ? { valeur: actif.value, debut: actif.selectionStart, fin: actif.selectionEnd } : null;
    redessiner(id);
    if (!saisie) return;
    const champ = grille.querySelector('.widget[data-id="' + id + '"]').querySelectorAll('input')[rang];
    if (!champ) return;
    champ.value = saisie.valeur;
    champ.focus();
    try {
      champ.setSelectionRange(saisie.debut, saisie.fin);
    } catch (e) {
      /* certains champs (date…) n'ont pas de curseur */
    }
  }

  // On redessine les widgets mis en attente dès qu'on n'écrit plus dedans.
  grille.addEventListener('focusout', () => {
    setTimeout(() => {
      enAttente.forEach((id) => {
        const caseWidget = grille.querySelector('.widget[data-id="' + id + '"]');
        if (caseWidget && !caseWidget.contains(document.activeElement)) {
          enAttente.delete(id);
          if (trouverWidget(id)) redessiner(id);
        }
      });
    }, 0);
  });

  // Ce dont les autres fichiers (mode nuit, partage) ont besoin.
  Nidoo.grilleApp = {
    // Arrête tous les widgets et vide la grille (mode nuit).
    arreter() {
      grilleArretee = true;
      nettoyages.forEach((_, id) => nettoyer(id));
      grille.innerHTML = '';
    },
    relancer() {
      grilleArretee = false;
      afficherGrille();
    },
    minuteurEnCours: () => etat.widgets.some((w) => w.type === 'minuteur' && w.donnees && w.donnees.fin != null),

    // Partage entre appareils : une copie de l'état, et deux façons de le changer.
    etat: () => JSON.parse(JSON.stringify({ widgets: etat.widgets, supprimes: etat.supprimes, famille: etat.famille || null, listes: etat.listes })),
    appliquer: appliquerEtat,
    remplacer(nouveau) {
      etat.widgets = nouveau.widgets;
      etat.supprimes = nouveau.supprimes;
      if (nouveau.famille) etat.famille = nouveau.famille;
      etat.listes = nouveau.listes || {};
      afficherNomFamille();
      Nidoo.stockage.enregistrer(etat);
      if (!grilleArretee) afficherGrille();
    },
  };

  // Interrupteur enfant / adulte (js/style.js) : on affiche l'autre grille.
  document.addEventListener('nidoo:style', () => {
    if (grilleArretee) return;
    mesurer();
    afficherGrille();
  });

  afficherNomFamille();
  remplirGalerie();
  mesurer();
  afficherGrille();
})();
