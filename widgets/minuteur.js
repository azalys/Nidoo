/*
 * Widget "Minuteur" : un compte à rebours qui sonne à la fin.
 *
 * Le son est fabriqué par le navigateur (Web Audio), pas besoin de fichier.
 * Les navigateurs n'autorisent le son qu'après un appui de l'utilisateur :
 * chaque bouton du minuteur "débloque" donc le son au passage.
 *
 * Données enregistrées :
 *   fin      heure de fin (en millisecondes) quand le minuteur tourne, sinon null
 *   restant  temps restant (en millisecondes) quand il est arrêté ou en pause
 */
(function () {
  const SONNERIE_MAX_MS = 60 * 1000; // la sonnerie s'arrête seule après 1 minute
  const PRESETS = [1, 5, 10];        // boutons "+1 min", "+5 min", "+10 min"

  /* ---- Le son ---------------------------------------------------------- */

  let audio = null;

  // À appeler pendant un appui (sinon le navigateur bloque le son).
  function debloquerSon() {
    const Contexte = window.AudioContext || window.webkitAudioContext;
    if (!Contexte) return;
    audio = audio || new Contexte();
    if (audio.state === 'suspended') audio.resume();
  }

  // Un petit "bip-bip-bip" joyeux (trois notes qui montent).
  function bipBipBip() {
    if (!audio) return;
    const maintenant = audio.currentTime;
    [880, 988, 1175].forEach((frequence, i) => {
      const oscillateur = audio.createOscillator();
      const volume = audio.createGain();
      oscillateur.type = 'triangle';
      oscillateur.frequency.value = frequence;
      const debut = maintenant + i * 0.18;
      volume.gain.setValueAtTime(0.0001, debut);
      volume.gain.exponentialRampToValueAtTime(0.5, debut + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, debut + 0.16);
      oscillateur.connect(volume).connect(audio.destination);
      oscillateur.start(debut);
      oscillateur.stop(debut + 0.17);
    });
  }

  /* ---- Outils ---------------------------------------------------------- */

  // 125 000 ms → "2:05" ; 3 725 000 ms → "1:02:05"
  function formater(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
  }

  /* ---- Le widget ------------------------------------------------------- */

  Nidoo.declarerWidget({
    type: 'minuteur',
    nom: 'Minuteur',
    icone: '⏰',
    tailles: ['petit', 'moyen', 'grand'],
    tailleParDefaut: 'moyen',
    donneesParDefaut: { fin: null, restant: 0 },

    afficher(zone, widget) {
      zone.innerHTML = `
        <div class="minuteur">
          <div class="minuteur-temps">0:00</div>
          <div class="minuteur-presets">
            ${PRESETS.map((m) => `<button data-ajout="${m}">+${m} min</button>`).join('')}
          </div>
          <div class="minuteur-commandes">
            <button class="minuteur-zero" aria-label="Remettre à zéro">↺</button>
            <button class="minuteur-principal">▶</button>
          </div>
        </div>`;

      const boite = zone.querySelector('.minuteur');
      const affichage = zone.querySelector('.minuteur-temps');
      const principal = zone.querySelector('.minuteur-principal');
      const caseWidget = zone.closest('.widget');

      let sonnerie = null;     // minuteur de répétition du bip
      let finSonnerie = null;  // arrêt automatique de la sonnerie

      const enCours = () => widget.donnees.fin !== null && widget.donnees.fin !== undefined;
      const restant = () => (enCours() ? widget.donnees.fin - Date.now() : widget.donnees.restant || 0);
      const enregistrer = (changements) => widget.enregistrer({ ...widget.donnees, ...changements });

      function arreterSonnerie() {
        clearInterval(sonnerie);
        clearTimeout(finSonnerie);
        sonnerie = null;
        caseWidget?.classList.remove('sonne');
      }

      function sonner() {
        if (sonnerie) return;
        caseWidget?.classList.add('sonne');
        bipBipBip();
        sonnerie = setInterval(bipBipBip, 1000);
        finSonnerie = setTimeout(arreterSonnerie, SONNERIE_MAX_MS);
      }

      function rafraichir() {
        const reste = restant();
        const termine = enCours() && reste <= 0;
        affichage.textContent = termine ? '🎉 Fini !' : formater(reste);
        boite.classList.toggle('termine', termine);

        if (termine) {
          principal.textContent = sonnerie ? '🔕 Stop' : 'OK';
        } else if (enCours()) {
          principal.textContent = '⏸';
        } else {
          principal.textContent = '▶';
        }
        principal.disabled = !enCours() && reste <= 0;
      }

      // Toutes les 250 ms : on met à jour l'affichage, et on sonne si c'est fini.
      function tic() {
        if (enCours() && restant() <= 0 && !boite.classList.contains('termine')) {
          // Le minuteur vient de finir (pas au rechargement de la page :
          // dans ce cas le navigateur bloquerait le son, on affiche juste "Fini !").
          if (audio) sonner();
        }
        rafraichir();
      }

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('button');
        if (!bouton) return;
        debloquerSon();

        if (bouton.dataset.ajout) {
          const ajout = Number(bouton.dataset.ajout) * 60 * 1000;
          if (enCours() && restant() > 0) enregistrer({ fin: widget.donnees.fin + ajout });
          else enregistrer({ fin: null, restant: (enCours() ? 0 : restant()) + ajout });
          arreterSonnerie();
        } else if (bouton.classList.contains('minuteur-zero')) {
          arreterSonnerie();
          enregistrer({ fin: null, restant: 0 });
        } else if (bouton === principal) {
          if (enCours() && restant() <= 0) {
            // Fini : on arrête la sonnerie et on revient à zéro.
            arreterSonnerie();
            enregistrer({ fin: null, restant: 0 });
          } else if (enCours()) {
            enregistrer({ fin: null, restant: restant() }); // pause
          } else if (restant() > 0) {
            enregistrer({ fin: Date.now() + restant(), restant: 0 }); // départ
          }
        }
        rafraichir();
      });

      // Au premier affichage, on ne sonne pas pour un minuteur déjà fini avant.
      if (enCours() && restant() <= 0) boite.classList.add('termine');
      rafraichir();
      const minuteur = setInterval(tic, 250);

      return () => {
        clearInterval(minuteur);
        arreterSonnerie();
      };
    },
  });
})();
