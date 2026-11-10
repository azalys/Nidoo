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

    // Boutons visibles uniquement en mode "Modifier" (voir css/style.css).
    caseWidget.innerHTML = `
      <div class="contenu"></div>
      <button class="bouton-widget bouton-supprimer" aria-label="Supprimer">×</button>
      <button class="bouton-widget bouton-taille" aria-label="Changer la taille">⤢</button>`;

    const zone = caseWidget.querySelector('.contenu');
    if (definition) {
      const nettoyage = definition.afficher(zone, {
        taille: w.taille,
        donnees: w.donnees,
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
    caseWidget.querySelector('.bouton-taille').addEventListener('click', () => changerTaille(w.id));
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
  }

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

  function ajouterWidget(type) {
    const definition = Nidoo.catalogue[type];
    const w = { id: nouvelIdentifiant(), type, taille: definition.tailleParDefaut, donnees: {} };
    etat.widgets.push(w);
    sauvegarder();
    const caseWidget = creerCase(w);
    grille.appendChild(caseWidget);
    afficherMessageVide();
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
  }

  /* Passe à la taille suivante parmi celles autorisées par le widget. */
  function changerTaille(id) {
    const w = trouverWidget(id);
    const tailles = Nidoo.catalogue[w.type]?.tailles || Object.keys(Nidoo.TAILLES);
    w.taille = tailles[(tailles.indexOf(w.taille) + 1) % tailles.length];
    sauvegarder();
    nettoyer(id);
    const ancienne = grille.querySelector('[data-id="' + id + '"]');
    ancienne.replaceWith(creerCase(w));
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
    Object.values(Nidoo.catalogue).forEach((definition) => {
      const bouton = document.createElement('button');
      bouton.className = 'choix-widget';
      bouton.innerHTML = '<span class="icone">' + definition.icone + '</span><span>' + definition.nom + '</span>';
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
  /* Glisser-déposer (en mode "Modifier")                               */
  /*                                                                    */
  /* Pendant le glissement, une copie ("fantôme") suit le doigt, et la  */
  /* vraie case change de place dans la grille au fur et à mesure.      */
  /* ------------------------------------------------------------------ */

  let glisse = null; // { caseWidget, fantome, decalageX, decalageY, departX, departY, actif }

  grille.addEventListener('pointerdown', (e) => {
    if (!modeEdition || e.button > 0 || e.target.closest('.bouton-widget')) return;
    const caseWidget = e.target.closest('.widget');
    if (!caseWidget) return;
    const rect = caseWidget.getBoundingClientRect();
    glisse = {
      caseWidget,
      fantome: null,
      decalageX: e.clientX - rect.left,
      decalageY: e.clientY - rect.top,
      departX: e.clientX,
      departY: e.clientY,
      actif: false,
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

    glisse.fantome.style.left = e.clientX - glisse.decalageX + 'px';
    glisse.fantome.style.top = e.clientY - glisse.decalageY + 'px';

    // Quelle case est sous le doigt ? On place la case déplacée avant ou après elle.
    const sous = document.elementFromPoint(e.clientX, e.clientY)?.closest('.widget');
    if (!sous || sous === glisse.caseWidget || sous.classList.contains('fantome')) return;
    const rect = sous.getBoundingClientRect();
    const avant = e.clientX < rect.left + rect.width / 2;
    const cible = avant ? sous : sous.nextSibling;
    if (cible !== glisse.caseWidget) grille.insertBefore(glisse.caseWidget, cible);
  });

  function terminerGlisse() {
    if (!glisse) return;
    if (glisse.actif) {
      glisse.fantome.remove();
      glisse.caseWidget.classList.remove('en-deplacement');
      // Le nouvel ordre = l'ordre des cases dans la page.
      const ordre = [...grille.querySelectorAll('.widget')].map((c) => c.dataset.id);
      etat.widgets.sort((a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id));
      sauvegarder();
    }
    glisse = null;
  }
  document.addEventListener('pointerup', terminerGlisse);
  document.addEventListener('pointercancel', terminerGlisse);

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                          */
  /* ------------------------------------------------------------------ */

  remplirGalerie();
  afficherGrille();
})();
