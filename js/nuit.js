/*
 * Mode nuit : aux heures choisies, l'écran devient noir avec juste l'heure, en gris très sombre.
 *
 * Pour économiser au maximum :
 *   - tous les widgets sont arrêtés (plus de mises à jour, plus de requêtes internet) ;
 *   - l'heure n'est redessinée qu'une fois par minute ;
 *   - plus aucune animation.
 * Elle se décale un peu chaque minute pour ne pas "marquer" l'écran.
 * Toucher l'écran réveille la grille pendant 2 minutes.
 * Pas de mode nuit tant qu'un minuteur tourne (sinon il ne pourrait pas sonner).
 *
 * Une page web ne peut pas baisser la luminosité de l'écran : voir le README pour
 * l'astuce avec l'application Raccourcis de l'iPad.
 */
(function () {
  const REVEIL_MS = 2 * 60 * 1000;
  const ecran = document.getElementById('nuit');
  const heure = ecran.querySelector('.nuit-heure');

  let enNuit = false;
  let reveilleJusqua = 0;
  let minuteurHeure = null;

  const reglages = () => ({ actif: false, debut: '21:30', fin: '07:00', ...(Nidoo.appareil.lire().nuit || {}) });

  // "21:30" → 1290 (minutes depuis minuit)
  const minutes = (texte) => {
    const [h, m] = (texte || '0:0').split(':').map(Number);
    return h * 60 + m;
  };

  // Est-on dans la plage de nuit ? (elle peut passer minuit : 21:30 → 07:00)
  function cEstLaNuit(date = new Date()) {
    const r = reglages();
    if (!r.actif) return false;
    const maintenant = date.getHours() * 60 + date.getMinutes();
    const debut = minutes(r.debut);
    const fin = minutes(r.fin);
    return debut <= fin ? maintenant >= debut && maintenant < fin : maintenant >= debut || maintenant < fin;
  }

  function dessinerHeure() {
    const d = new Date();
    heure.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    // Petit décalage au hasard (anti-marquage de l'écran).
    const dx = Math.round((Math.random() - 0.5) * 60);
    const dy = Math.round((Math.random() - 0.5) * 60);
    heure.style.transform = `translate(${dx}px, ${dy}px)`;
    // Prochain dessin : pile à la minute suivante.
    clearTimeout(minuteurHeure);
    minuteurHeure = setTimeout(dessinerHeure, 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 50);
  }

  function endormir() {
    if (enNuit) return;
    enNuit = true;
    Nidoo.grilleApp.arreter();
    document.body.classList.add('nuit');
    ecran.hidden = false;
    dessinerHeure();
  }

  function reveiller() {
    if (!enNuit) return;
    enNuit = false;
    clearTimeout(minuteurHeure);
    ecran.hidden = true;
    document.body.classList.remove('nuit');
    Nidoo.grilleApp.relancer();
  }

  // Vérifie s'il faut passer en nuit ou en sortir.
  function verifier() {
    const nuit = cEstLaNuit() && Date.now() > reveilleJusqua && !Nidoo.grilleApp.minuteurEnCours();
    if (nuit) endormir();
    else reveiller();
  }

  // Toucher l'écran noir : on rallume pour 2 minutes.
  ecran.addEventListener('pointerdown', () => {
    reveilleJusqua = Date.now() + REVEIL_MS;
    reveiller();
  });
  // Tant qu'on touche la grille la nuit, on repousse le retour au noir.
  document.addEventListener('pointerdown', () => {
    if (!enNuit && cEstLaNuit()) reveilleJusqua = Date.now() + REVEIL_MS;
  });

  setInterval(verifier, 30 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && verifier());

  /* ---- Réglages (fenêtre "⚙️ Appareil") ---- */
  const champActif = document.getElementById('nuit-actif');
  const champDebut = document.getElementById('nuit-debut');
  const champFin = document.getElementById('nuit-fin');

  function remplir() {
    const r = reglages();
    champActif.checked = r.actif;
    champDebut.value = r.debut;
    champFin.value = r.fin;
    champDebut.disabled = champFin.disabled = !r.actif;
  }
  function enregistrer() {
    Nidoo.appareil.modifier({ nuit: { actif: champActif.checked, debut: champDebut.value || '21:30', fin: champFin.value || '07:00' } });
    remplir();
    reveilleJusqua = Date.now() + REVEIL_MS; // on ne bascule pas en noir pendant qu'on règle
  }
  [champActif, champDebut, champFin].forEach((c) => c.addEventListener('change', enregistrer));
  document.getElementById('appareil').addEventListener('nidoo:ouverture', remplir);

  remplir();
  verifier();
})();
