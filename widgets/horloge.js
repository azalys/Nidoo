/* Widget "Horloge" : l'heure et la date du jour. */
Nidoo.declarerWidget({
  type: 'horloge',
  nom: 'Horloge',
  icone: '🕒',
  tailles: ['petit', 'moyen', 'grand'],
  tailleParDefaut: 'moyen',

  afficher(zone, widget) {
    zone.innerHTML = `
      <div class="horloge">
        <div class="horloge-heure"></div>
        <div class="horloge-date"></div>
      </div>`;

    const heure = zone.querySelector('.horloge-heure');
    const date = zone.querySelector('.horloge-date');

    function mettreAJour() {
      const maintenant = new Date();
      heure.textContent = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      date.textContent = maintenant.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: widget.taille === 'petit' ? 'short' : 'long',
      });
    }

    mettreAJour();
    const minuteur = setInterval(mettreAJour, 1000);

    // Nettoyage : on arrête le minuteur quand le widget disparaît.
    return () => clearInterval(minuteur);
  },
});
