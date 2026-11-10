# Nidoo
Aide familiale

Une grille de widgets, comme l'écran d'accueil d'un iPad.
Code simple en HTML, CSS, JavaScript (et un peu de PHP), sans rien à installer.

## Lancer Nidoo

Dans le dossier du projet, lancer

```
php -S localhost:8000
```

puis ouvrir http://localhost:8000

(Un double-clic sur `index.html` marche aussi, mais sans PHP les agendas ne peuvent pas se charger.)

## Mettre en ligne

Depuis un ordinateur qui a accès SSH au serveur :

```
./deploy.sh --test    # montre ce qui serait envoyé, sans rien changer
./deploy.sh           # récupère la dernière version (git pull) puis l'envoie
./deploy.sh --sans-pull   # envoie les fichiers tels qu'ils sont, sans git pull
```

Réglages personnels : copier `deploy.local.exemple` en `deploy.local` et le remplir
(adresse du serveur, et mot de passe si on n'utilise pas de clé SSH).
`deploy.local` n'est jamais commité.
Le serveur doit avoir PHP 8 ou plus.
Attention : les fichiers retirés du projet sont aussi supprimés sur le serveur.
Le script ajoute un numéro de version aux fichiers CSS et JS (dans la copie envoyée),
pour que les navigateurs et la webapp chargent bien la nouvelle version, puis vérifie
que le serveur l'a reçue (fichier `version.txt`).

## Les widgets

| Widget | Tailles | Source des données |
|---|---|---|
| 🌤️ Météo | petit : aujourd'hui · moyen : aujourd'hui + demain ; toucher un jour = graphique de 7 h à 21 h (température, risque de pluie, temps heure par heure) | [Open-Meteo](https://open-meteo.com), gratuit, sans clé |
| ⚡ Tempo EDF | petit : couleur du moment · moyen : aujourd'hui + demain | [api-couleur-tempo.fr](https://www.api-couleur-tempo.fr), gratuit, sans clé |
| 📝 Liste | 1×2, 2×2 | titre et emoji réglables (🛒 Courses, 📝 À faire, 🧳 Valise…), remplace l'ancien widget Courses ; cocher retire l'élément ; toucher le texte pour dire qui et pour quand (date en rouge si dépassée) |
| ✅ Routine | grand | matin avant midi, soir après midi ; étapes réglables avec ⚙️ ; un emoji par étape (deviné, ou mis en début de ligne) |
| 📅 Agenda | grand | adresse iCal de l'agenda, lue par `api.php` ; exemples tant qu'elle n'est pas réglée |
| ⏰ Minuteur | 1×1, 1×2, 2×2 | minuteur de cuisine : + / − pour les minutes et les secondes, ▶/⏸, ↺ ; sonne à la fin ; empêche la mise en veille tant qu'il tourne (page en https uniquement) |
| 🧹 Corvées | petit | qui s'en occupe aujourd'hui (et demain) ; rotation jours pairs/impairs, chaque jour ou chaque semaine (⚙️) |
| ⏳ Compte à rebours | 1×1 | « Vacances dans 12 jours » ; date, emoji, une fois ou chaque année, jours ou dodos (⚙️) |
| 🗑️ Poubelles | 1×1 | « Ce soir : sortir la jaune » ; jours de ramassage et semaines paires/impaires pour chaque poubelle (⚙️) |
| 😊 Humeurs | 1×1 | l'humeur du jour de 1 à 4 enfants (🙂 par défaut, repart à zéro chaque matin) |
| 🆘 Urgences | 1×1 | 15, 18, 17, 112 en gros ; le toucher affiche aussi les parents et l'adresse (⚙️) |
| 🌼 Pollen et air | 1×1 | qualité de l'air et pollen aujourd'hui/demain (Open-Meteo, gratuit, sans clé) |
| ⛽ Carburants | 1×1 | la station la moins chère autour de votre adresse (données de l'État, gratuit, sans clé) |
| 📋 Échéances | 1×2, 2×2 | contrôle technique, assurance… : alerte avant la date, « C'est fait » fait avancer les échéances qui reviennent |
| 🕒 Horloge, 📝 Note | petit, moyen, grand | — |

### Brancher un agenda Google

1. Sur un ordinateur, ouvrir Google Agenda → ⚙️ Paramètres.
2. À gauche, cliquer sur l'agenda voulu → « Intégrer l'agenda ».
3. Copier l'« Adresse secrète au format iCal ».
4. Dans Nidoo : Modifier → ⚙️ sur le widget Agenda → coller l'adresse.

Cette adresse donne accès à l'agenda : ne pas la partager.
Les sites d'agendas acceptés sont listés en haut de `api.php`.

## Utilisation

- **Modifier** (ou appui long sur la grille) : les widgets tremblent.
  - glisser un widget sur n'importe quelle case (les cases libres sont en pointillés) ;
    sur un widget de même taille, les deux échangent leur place ;
  - **×** pour le supprimer ;
  - **🎨** pour changer sa couleur ;
  - **⚙️** pour ses réglages : taille (1×1, 1×2 ou 2×2 selon le widget), ville,
    étapes de la routine, adresse de l'agenda… ;
  - **+ Ajouter** pour ajouter un widget.
- **Terminé** pour revenir à l'affichage normal.

Les données sont enregistrées dans le navigateur (`localStorage`) :
elles restent sur cet appareil uniquement.

## Organisation des fichiers

```
index.html         la page (liste des fichiers JS à charger)
css/style.css      tous les styles (couleurs et tailles réglables en haut)
js/stockage.js     lecture / enregistrement dans le localStorage
js/widgets.js      le catalogue des widgets, les tailles et les couleurs
js/appareil.js     réglages propres à cet appareil (mode nuit, partage)
js/nuit.js         le mode nuit
js/synchro.js      le partage entre appareils (code, synchronisation)
js/style.js        l'interrupteur enfant / adulte
js/depart.js       les widgets installés au premier lancement
js/placement.js    calcul de la position des widgets (sans chevauchement)
js/app.js          la grille, le mode Modifier, le glisser-déposer, les réglages
widgets/           un fichier par widget
api.php            l'API côté serveur (lecture des agendas iCal)
```

## Créer un nouveau widget

1. Copier `widgets/note.js` en `widgets/mon-widget.js`.
2. Changer `type`, `nom`, `icone`, et le contenu de `afficher()`.
3. Ajouter dans `index.html`, avec les autres widgets :
   ```html
   <script src="widgets/mon-widget.js"></script>
   ```
4. (Facultatif) Ajouter ses styles à la fin de `css/style.css`.

Le widget apparaît alors dans la fenêtre « + Ajouter ».
Pour lui donner des réglages (bouton ⚙️), voir `reglages` dans `js/widgets.js`
et l'exemple de `widgets/routine.js`.

## Mode enfant / mode adulte

L'interrupteur **Adulte** en haut à droite passe de la version colorée (pour les enfants)
à une version sobre : fond blanc, cartes à fin filet, typographie élégante
(Cormorant Garamond pour les titres et les chiffres, Manrope pour le texte).
Le choix du mode est propre à chaque appareil.

Chaque mode a **sa propre grille** de widgets : basculer l'interrupteur change de grille
(l'autre reste intacte). La première fois, la grille adulte est vide ; le bouton
**Copier la grille enfant** en fait une copie (les listes copiées deviennent des listes
séparées). Les deux grilles sont partagées entre appareils reliés.
Les styles du mode adulte sont regroupés à la fin de `css/style.css`.

## Partager entre appareils (⚙️ Appareil, en mode Modifier)

1. Sur l'appareil qui a la bonne grille : **Afficher un code** (ex. `4T2B`, valable 10 minutes).
2. Sur l'autre appareil : taper ce code puis **Relier**. Pour chaque grille (enfant, adulte) :
   si un seul des deux appareils a des widgets, c'est celle-là qui est gardée ; si les deux
   en ont, Nidoo demande laquelle garder (elle remplace l'autre sur tous les appareils).
3. Ensuite, les appareils restent synchronisés : une modification apparaît sur les autres
   en une vingtaine de secondes (5 minutes en mode nuit).

- Il faut que Nidoo soit servi par PHP (`api.php`) : les données partagées sont gardées
  dans des fichiers JSON sur le serveur, dans `../nidoo-donnees/` (à côté du site, hors
  d'internet) ou, à défaut, dans `donnees/` protégé par un `.htaccess`.
  `deploy.sh` ne touche jamais à ces dossiers.
- Si deux appareils modifient le même widget en même temps, la modification la plus
  récente gagne ; pour les Listes, les ajouts des deux côtés sont gardés.
- Le mode nuit reste propre à chaque appareil. **Délier cet appareil** arrête la synchro
  (il garde sa grille).
- Les adresses iCal des agendas font partie de la grille : elles sont donc aussi
  enregistrées sur le serveur.

## Mode nuit (⚙️ Appareil, en mode Modifier)

Aux heures choisies (par appareil), l'écran devient noir avec juste l'heure en gris
très sombre ; tous les widgets sont mis en pause (plus de requêtes internet ni
d'animations). Toucher l'écran rallume la grille 2 minutes. Pas de mode nuit tant
qu'un minuteur tourne.

**Pour vraiment économiser la batterie**, il faut baisser la luminosité, ce qu'une page
web ne peut pas faire. Sur iPad, avec l'application **Raccourcis** → *Automatisation* →
*Heure de la journée* (ex. 21 h 30) → action *Régler la luminosité* à 0 %, et une
deuxième automatisation le matin pour la remettre.

## Taille de l'écran

La grille a une taille fixe et remplit tout l'écran :
8 colonnes × 4 lignes à l'horizontale, 4 × 8 à la verticale
(réglables en haut de `css/style.css`). Sur un téléphone : 2 colonnes, on fait défiler.
Les positions sont enregistrées par appareil. En passant à la verticale, les widgets
qui ne tiennent plus vont à la première place libre.
