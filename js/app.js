/*
 * L'application : la grille, le mode "Modifier", l'ajout et le déplacement des widgets.
 */
(function () {
  const etat = Nidoo.stockage.charger();

  const grille = document.getElementById('grille');
  const boutonModifier = document.getElementById('bouton-modifier');
  const boutonAjouter = document.getElementById('bouton-ajouter');
  const galerie = document.getElementById('galerie');
  const listeWidgets = document.getElementById('liste-widgets');

  let modeEdition = false;

  // Pour chaque widget affiché : sa fonction de nettoyage (voir js/widgets.js).
  const nettoyages = new Map();

  function sauvegarder() {
    Nidoo.stockage.enregistrer(etat);
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
      <button class="bouton-widget bouton-supprimer" aria-label="Supprimer">×</button>
      <button class="bouton-widget bouton-taille" aria-label="Changer la taille">⤢</button>
      <button class="bouton-widget bouton-couleur" aria-label="Changer la couleur">🎨</button>
      <button class="bouton-widget bouton-reglages" aria-label="Réglages du widget">⚙️</button>`;

    // On cache les boutons inutiles pour ce widget.
    if (!definition || (definition.tailles || []).length < 2) caseWidget.querySelector('.bouton-taille').remove();
    if (!definition || !definition.reglages) caseWidget.querySelector('.bouton-reglages').remove();

    const zone = caseWidget.querySelector('.contenu');
    if (definition) {
      const nettoyage = definition.afficher(zone, {
        taille: w.taille,
        // "get" : on lit toujours les données les plus récentes.
        get donnees() {
          return w.donnees;
        },
        enregistrer(nouvellesDonnees) {
          w.donnees = nouvellesDonnees;
          sauvegarder();
        },
      });
      nettoyages.set(w.id, nettoyage);
    } else {
      zone.innerHTML = '<p class="widget-inconnu">Widget « ' + w.type + ' » introuvable</p>';
    }

    caseWidget.querySelector('.bouton-supprimer').addEventListener('click', () => supprimerWidget(w.id));
    caseWidget.querySelector('.bouton-taille')?.addEventListener('click', () => changerTaille(w.id));
    caseWidget.querySelector('.bouton-reglages')?.addEventListener('click', () => ouvrirReglages(w.id));
    caseWidget.querySelector('.bouton-couleur').addEventListener('click', () => {
      w.couleur = couleurSuivante(w.couleur);
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
    etat.widgets.forEach((w) => grille.appendChild(creerCase(w)));
    afficherMessageVide();
    placer();
  }

  /* ------------------------------------------------------------------ */
  /* Taille des cases et position des widgets                           */
  /* ------------------------------------------------------------------ */

  let colonnes = 6;     // calculé selon la largeur de l'écran
  let lignesEcran = 4;  // lignes qui tiennent dans la hauteur de l'écran
  let placement = new Map();

  /*
   * Calcule la taille des cases : la hauteur de l'écran fixe la taille
   * (4 lignes à l'horizontale, 6 à la verticale), puis on met autant
   * de colonnes que la largeur le permet. Sur un petit écran : 2 colonnes.
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
      lignesEcran = hauteur > largeur ? nombre('--lignes-verticale') : nombre('--lignes-horizontale');
      const place = hauteur - barre - 12 - marge - relief - (lignesEcran - 1) * (ecart + relief);
      taille = Math.max(80, place / lignesEcran);
      colonnes = Math.max(2, Math.floor((largeur - 2 * marge + ecart) / (taille + ecart)));
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
    placement = Nidoo.placement.calculer(etat.widgets, colonnes, prioritaire);
    if (enregistrer) {
      etat.widgets.forEach((w) => {
        const p = placement.get(w.id);
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
    if (etat.widgets.length === 0 && !message) {
      grille.insertAdjacentHTML(
        'beforeend',
        '<p class="vide">La grille est vide.<br>Touchez « Modifier » puis « + Ajouter ».</p>'
      );
    } else if (etat.widgets.length > 0 && message) {
      message.remove();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Actions sur les widgets                                            */
  /* ------------------------------------------------------------------ */

  /* Crée un widget. `options` (facultatif) : { taille, couleur, donnees }. */
  function creerWidget(type, options = {}) {
    const definition = Nidoo.catalogue[type];
    const derniere = etat.widgets[etat.widgets.length - 1];
    const w = {
      id: nouvelIdentifiant(),
      type,
      taille: options.taille || definition.tailleParDefaut,
      couleur: options.couleur || (derniere ? couleurSuivante(derniere.couleur) : nomsCouleurs[0]),
      donnees: { ...(definition.donneesParDefaut || {}), ...(options.donnees || {}) },
    };
    etat.widgets.push(w);
    return w;
  }

  function ajouterWidget(type) {
    const w = creerWidget(type);
    const caseWidget = creerCase(w);
    grille.appendChild(caseWidget);
    afficherMessageVide();
    placer({ enregistrer: true }); // il va à la première place libre
    caseWidget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function supprimerWidget(id) {
    const w = trouverWidget(id);
    const nom = Nidoo.catalogue[w.type]?.nom || w.type;
    if (!confirm('Supprimer le widget « ' + nom + ' » ?')) return;
    nettoyer(id);
    etat.widgets = etat.widgets.filter((x) => x.id !== id);
    sauvegarder();
    grille.querySelector('[data-id="' + id + '"]').remove();
    afficherMessageVide();
    placer();
  }

  /* Passe à la taille suivante parmi celles autorisées par le widget. */
  function changerTaille(id) {
    const w = trouverWidget(id);
    const tailles = Nidoo.catalogue[w.type]?.tailles || Object.keys(Nidoo.TAILLES);
    w.taille = tailles[(tailles.indexOf(w.taille) + 1) % tailles.length];
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
    etat.widgets.forEach((w) => {
      const p = placement.get(w.id);
      if (p) {
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
    boutonModifier.textContent = actif ? 'Terminé' : 'Modifier';
    boutonAjouter.hidden = !actif;
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

  function ouvrirReglages(id) {
    const w = trouverWidget(id);
    const definition = Nidoo.catalogue[w.type];
    widgetEnReglage = w;
    document.getElementById('titre-reglages').textContent = definition.icone + ' ' + definition.nom;
    champsReglages.innerHTML = '';

    definition.reglages.forEach((r) => {
      const valeur = w.donnees[r.cle];
      const bloc = document.createElement('label');
      bloc.className = 'champ';
      bloc.innerHTML = '<span class="libelle"></span>';
      bloc.querySelector('.libelle').textContent = r.libelle;

      let champ;
      if (r.type === 'choix') {
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
        champ.type = r.type === 'url' ? 'url' : 'text';
        champ.value = valeur || '';
      }
      champ.name = r.cle;
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
    const nouvelles = { ...w.donnees };
    definition.reglages.forEach((r) => {
      const brut = formReglages.elements[r.cle].value;
      nouvelles[r.cle] =
        r.type === 'liste'
          ? brut.split('\n').map((l) => l.trim()).filter(Boolean)
          : brut.trim();
    });
    w.donnees = nouvelles;
    sauvegarder();
    fenetreReglages.close();
    redessiner(w.id);
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

  // Premier lancement : on installe la grille de départ (voir js/depart.js).
  if (etat.nouveau) {
    delete etat.nouveau;
    Nidoo.GRILLE_DE_DEPART.forEach((widget) => {
      if (Nidoo.catalogue[widget.type]) creerWidget(widget.type, widget);
    });
    sauvegarder();
  }

  remplirGalerie();
  mesurer();
  afficherGrille();
})();
