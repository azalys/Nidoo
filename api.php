<?php
/*
 * API de Nidoo : ce que le navigateur ne peut pas faire seul.
 *
 *   api.php?action=ping                 vérifie que l'API fonctionne
 *   api.php?action=agenda&url=...       événements des 7 prochains jours d'un agenda iCal
 *                                       (&forcer=1 : relire tout de suite, sans la copie en cache)
 *   api.php?action=anniversaires&url=…  les anniversaires (événements annuels « anniv… ») d'un agenda iCal
 *
 * Partage entre appareils (voir js/synchro.js) :
 *   POST api.php?action=code             donne un code de 4 caractères valable 10 min
 *   POST api.php?action=rejoindre        échange un code contre la clé de la famille
 *   GET  api.php?action=lire             l'état partagé (en-tête X-Nidoo-Famille : la clé)
 *   POST api.php?action=ecrire           enregistre l'état partagé (si personne ne l'a changé entre-temps)
 *
 * Chauffage (widget widgets/chauffage.js) :
 *   POST api.php?action=chauffage_ha        lit (et règle) un thermostat Home Assistant
 *   POST api.php?action=netatmo_connexion   adresse où se connecter à Netatmo (puis retour sur chauffage.php)
 *   GET  api.php?action=netatmo_retour      (appelé par chauffage.php) enregistre l'accès Netatmo
 *   GET  api.php?action=netatmo_etat        les pièces Netatmo et leurs températures
 *   POST api.php?action=netatmo_consigne    change la température d'une pièce Netatmo
 *
 * Widgets premium (réservés à la famille qui connaît le mot de passe) :
 *   POST api.php?action=premium          débloque avec le mot de passe (crée la famille si besoin)
 *   GET  api.php?action=premium          cette famille a-t-elle débloqué les widgets premium ?
 *
 * Solde bancaire (widget widgets/banque.js, via Enable Banking ; en-tête X-Nidoo-Famille obligatoire) :
 *   GET  api.php?action=banque_banques   les banques françaises disponibles
 *   POST api.php?action=banque_connexion adresse de la banque où se connecter (puis retour sur banque.php)
 *   GET  api.php?action=banque_retour    (appelé par banque.php) enregistre les comptes autorisés
 *   GET  api.php?action=banque_comptes   les comptes reliés à la famille
 *   GET  api.php?action=banque_solde&compte=…[&present=1]   le solde d'un compte
 *
 * Pour ajouter une action : ajouter un "case" dans le switch tout en bas.
 */

// ---------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------

const FUSEAU = 'Europe/Paris';      // fuseau horaire de la famille
const JOURS_AGENDA = 7;             // nombre de jours affichés dans les agendas
const CACHE_SECONDES = 600;         // un agenda est relu au plus toutes les 10 minutes

// Sites d'agendas autorisés (évite que api.php serve à lire n'importe quel site).
const SITES_AGENDA = [
    'calendar.google.com',
    'icloud.com',
    'outlook.live.com',
    'outlook.office365.com',
];

// Partage entre appareils.
const CODE_VALIDITE = 600;          // un code de partage est valable 10 minutes
const CODE_LETTRES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L (faciles à confondre)
const ESSAIS_MAX = 10;              // essais de code ratés autorisés par adresse et par 10 minutes
const TAILLE_MAX_ETAT = 1000000;    // 1 Mo maximum pour l'état partagé

// Widgets premium : le mot de passe est dans le fichier premium.txt du dossier des données
// (déposé à la main sur le serveur, jamais dans git : le dépôt est public).
const PREMIUM_FICHIER = 'premium.txt';

// Solde bancaire (Enable Banking, offre gratuite « comptes reliés »).
// La clé privée est déposée à la main sur le serveur (jamais dans git), dans le dossier
// "enablebanking" du dossier des données, et nommée avec l'identifiant de l'application :
//   nidoo-donnees/enablebanking/d5076923-cca3-44c5-be0a-2bc867dbf073.pem
// (voir le README).
const BANQUE_DOSSIER_CLES = 'enablebanking';
const BANQUE_API = 'https://api.enablebanking.com';
const BANQUE_PAYS = 'FR';
const BANQUE_RELIRE = 6 * 3600;        // relecture automatique du solde : 4 fois par jour au plus
                                       // (les banques limitent les lectures « sans personne devant l'écran »)
const BANQUE_RELIRE_PRESENT = 120;     // quand quelqu'un touche 👁 : au plus toutes les 2 minutes
const BANQUE_REESSAYER = 900;          // après un échec, on réessaie au plus tôt 15 minutes plus tard
const BANQUE_ACCES_MAX = 180 * 86400;  // durée maximale d'une autorisation (la banque peut imposer moins)

date_default_timezone_set(FUSEAU);
header('Content-Type: application/json; charset=utf-8');

function repondre(array $donnees, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

function erreur(string $message, int $code = 400): void
{
    repondre(['ok' => false, 'erreur' => $message], $code);
}

// ---------------------------------------------------------------------
// Téléchargement avec cache (fichiers dans le dossier temporaire du système)
// ---------------------------------------------------------------------

/*
 * $forcer : relit tout de suite (bouton ↻ de l'agenda), sauf si la copie a moins
 * de 30 secondes (évite de solliciter Google à chaque appui).
 */
function telecharger(string $url, bool $forcer = false): string
{
    $dossier = sys_get_temp_dir() . '/nidoo-cache';
    if (!is_dir($dossier)) {
        @mkdir($dossier, 0700, true);
    }
    $fichier = $dossier . '/' . md5($url);
    $age = is_file($fichier) ? time() - filemtime($fichier) : PHP_INT_MAX;
    if ($age < ($forcer ? 30 : CACHE_SECONDES)) {
        return file_get_contents($fichier);
    }

    $contexte = stream_context_create(['http' => [
        'timeout' => 10,
        'header' => "User-Agent: Nidoo\r\n",
    ]]);
    $texte = @file_get_contents($url, false, $contexte);
    if ($texte === false) {
        // En cas de panne, on garde l'ancienne version si on en a une.
        if (is_file($fichier)) {
            return file_get_contents($fichier);
        }
        if (strpos($url, '/public/') !== false) {
            // Cas fréquent : l'adresse publique d'un agenda qui n'est pas public.
            erreur("Impossible de lire l'agenda : il n'est sans doute pas public. Dans Google Agenda → Paramètres "
                . "→ l'agenda → « Intégrer l'agenda », copiez plutôt l'« Adresse secrète au format iCal ».", 502);
        }
        erreur("Impossible de lire l'agenda (adresse incorrecte ou pas de connexion).", 502);
    }
    @file_put_contents($fichier, $texte);
    return $texte;
}

// ---------------------------------------------------------------------
// Lecture d'un fichier iCal (.ics)
// ---------------------------------------------------------------------

/* Découpe le fichier en événements : chaque événement = liste de [nom, paramètres, valeur]. */
function lireEvenementsIcs(string $texte): array
{
    // Les longues lignes sont coupées : une ligne qui commence par un espace continue la précédente.
    $texte = preg_replace("/\r?\n[ \t]/", '', $texte);
    $evenements = [];
    $courant = null;
    foreach (preg_split("/\r?\n/", $texte) as $ligne) {
        if ($ligne === 'BEGIN:VEVENT') {
            $courant = [];
        } elseif ($ligne === 'END:VEVENT') {
            if ($courant !== null) {
                $evenements[] = $courant;
            }
            $courant = null;
        } elseif ($courant !== null && preg_match('/^([A-Za-z0-9-]+)((?:;[^:;]+=(?:"[^"]*"|[^:;]*))*):(.*)$/', $ligne, $m)) {
            $parametres = [];
            preg_match_all('/;([^=;]+)=("[^"]*"|[^;]*)/', $m[2], $p, PREG_SET_ORDER);
            foreach ($p as $param) {
                $parametres[strtoupper($param[1])] = trim($param[2], '"');
            }
            $courant[] = [strtoupper($m[1]), $parametres, $m[3]];
        }
    }
    return $evenements;
}

/* Première valeur d'une propriété (ex. 'SUMMARY'), ou null. */
function propriete(array $evenement, string $nom): ?array
{
    foreach ($evenement as $p) {
        if ($p[0] === $nom) {
            return $p;
        }
    }
    return null;
}

/* Lit une date iCal. Renvoie [DateTimeImmutable, journéeEntière]. */
function lireDate(string $valeur, array $parametres): array
{
    $local = new DateTimeZone(FUSEAU);
    $valeur = trim($valeur);
    if (($parametres['VALUE'] ?? '') === 'DATE' || preg_match('/^\d{8}$/', $valeur)) {
        return [DateTimeImmutable::createFromFormat('!Ymd', substr($valeur, 0, 8), $local), true];
    }
    if (str_ends_with($valeur, 'Z')) {
        $date = DateTimeImmutable::createFromFormat('Ymd\THis\Z', $valeur, new DateTimeZone('UTC'));
    } else {
        try {
            $fuseau = isset($parametres['TZID']) ? new DateTimeZone($parametres['TZID']) : $local;
        } catch (Exception $e) {
            $fuseau = $local; // fuseau inconnu (ex. noms Windows) : on suppose l'heure locale
        }
        $date = DateTimeImmutable::createFromFormat('Ymd\THis', $valeur, $fuseau);
    }
    if (!$date) {
        return [null, false];
    }
    return [$date->setTimezone($local), false];
}

function texteIcs(string $valeur): string
{
    return str_replace(['\\n', '\\N', '\\,', '\\;', '\\\\'], [' ', ' ', ',', ';', '\\'], $valeur);
}

/*
 * Toutes les dates de début d'un événement répétitif (RRULE) jusqu'à $fin.
 * Gère : FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL,
 *        BYDAY (jours de la semaine, ou "2TU" = 2e mardi du mois).
 * Les règles plus rares (BYSETPOS, BYMONTHDAY multiples…) ne sont pas gérées.
 */
function repetitions(DateTimeImmutable $debut, string $regle, DateTimeImmutable $debutFenetre, DateTimeImmutable $fin): array
{
    $r = [];
    foreach (explode(';', $regle) as $morceau) {
        [$cle, $val] = array_pad(explode('=', $morceau, 2), 2, '');
        $r[strtoupper($cle)] = $val;
    }
    $frequence = $r['FREQ'] ?? '';
    $intervalle = max(1, (int)($r['INTERVAL'] ?? 1));
    $nombreMax = isset($r['COUNT']) ? (int)$r['COUNT'] : PHP_INT_MAX;
    $jusqua = $fin;
    if (isset($r['UNTIL'])) {
        [$u, $journee] = lireDate($r['UNTIL'], []);
        if ($u) {
            $u = $journee ? $u->setTime(23, 59, 59) : $u;
            $jusqua = min($fin, $u);
        }
    }
    $codesJours = ['MO' => 1, 'TU' => 2, 'WE' => 3, 'TH' => 4, 'FR' => 5, 'SA' => 6, 'SU' => 7];
    $parJour = [];
    foreach (array_filter(explode(',', $r['BYDAY'] ?? '')) as $j) {
        if (preg_match('/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/', $j, $m)) {
            $parJour[] = ['rang' => $m[1] === '' ? 0 : (int)$m[1], 'jour' => $codesJours[$m[2]]];
        }
    }

    // Sans COUNT, on saute directement près de la fenêtre (utile pour les vieux événements).
    $sauter = 0;
    if (!isset($r['COUNT']) && $debutFenetre > $debut) {
        $jours = (int)$debut->diff($debutFenetre)->days;
        $parPas = ['DAILY' => 1, 'WEEKLY' => 7, 'MONTHLY' => 31, 'YEARLY' => 366][$frequence] ?? 1;
        $sauter = max(0, intdiv($jours, $parPas * $intervalle) - 1);
    }

    $resultats = [];
    $compte = 0;
    $heure = [(int)$debut->format('H'), (int)$debut->format('i'), (int)$debut->format('s')];
    $ajouter = function (DateTimeImmutable $d) use (&$resultats, &$compte, $debut, $jusqua, $nombreMax): bool {
        if ($d < $debut) {
            return true;
        }
        if ($d > $jusqua || $compte >= $nombreMax) {
            return false; // on arrête
        }
        $compte++;
        $resultats[] = $d;
        return true;
    };

    for ($n = $sauter; $n < $sauter + 2000; $n++) {
        if ($frequence === 'DAILY') {
            $candidats = [$debut->modify('+' . ($n * $intervalle) . ' days')];
        } elseif ($frequence === 'WEEKLY') {
            $lundi = $debut->modify('monday this week')->modify('+' . ($n * $intervalle) . ' weeks')->setTime(...$heure);
            $jours = $parJour ? array_column($parJour, 'jour') : [(int)$debut->format('N')];
            sort($jours);
            $candidats = array_map(fn($j) => $lundi->modify('+' . ($j - 1) . ' days'), $jours);
        } elseif ($frequence === 'MONTHLY' || $frequence === 'YEARLY') {
            $mois = $frequence === 'MONTHLY' ? $n * $intervalle : $n * 12 * $intervalle;
            $premier = $debut->modify('first day of this month')->modify('+' . $mois . ' months')->setTime(...$heure);
            $candidats = [];
            if ($parJour) {
                foreach ($parJour as $pj) {
                    $candidats[] = nemeJourDuMois($premier, $pj['jour'], $pj['rang'] ?: 1);
                }
            } else {
                // Même numéro de jour ; on saute les mois où il n'existe pas (ex. 31).
                $jour = (int)$debut->format('j');
                if ($jour <= (int)$premier->format('t')) {
                    $candidats[] = $premier->setDate((int)$premier->format('Y'), (int)$premier->format('n'), $jour);
                }
            }
            $candidats = array_filter($candidats);
            usort($candidats, fn($a, $b) => $a <=> $b);
        } else {
            return [$debut]; // fréquence non gérée : seulement la première date
        }
        foreach ($candidats as $c) {
            if (!$ajouter($c)) {
                return $resultats;
            }
        }
    }
    return $resultats;
}

/* Le n-ième jour (1 = lundi … 7 = dimanche) d'un mois. $rang < 0 : en partant de la fin. */
function nemeJourDuMois(DateTimeImmutable $premier, int $jour, int $rang): ?DateTimeImmutable
{
    if ($rang > 0) {
        $d = $premier->modify('+' . (($jour - (int)$premier->format('N') + 7) % 7) . ' days');
        $d = $d->modify('+' . ($rang - 1) . ' weeks');
    } else {
        $dernier = $premier->modify('last day of this month');
        $d = $dernier->modify('-' . (((int)$dernier->format('N') - $jour + 7) % 7) . ' days');
        $d = $d->modify('-' . (-$rang - 1) . ' weeks');
    }
    return $d->format('n') === $premier->format('n') ? $d : null;
}

/* Les événements entre $debutFenetre et $finFenetre, triés, prêts pour le widget. */
function evenementsAgenda(string $ics, DateTimeImmutable $debutFenetre, DateTimeImmutable $finFenetre): array
{
    $evenements = lireEvenementsIcs($ics);

    // Les occurrences modifiées une à une (RECURRENCE-ID) remplacent l'occurrence d'origine.
    $remplacees = [];
    foreach ($evenements as $e) {
        $rid = propriete($e, 'RECURRENCE-ID');
        $uid = propriete($e, 'UID');
        if ($rid && $uid) {
            [$d] = lireDate($rid[2], $rid[1]);
            if ($d) {
                $remplacees[$uid[2] . '|' . $d->getTimestamp()] = true;
            }
        }
    }

    $resultat = [];
    foreach ($evenements as $e) {
        $statut = propriete($e, 'STATUS');
        if ($statut && strtoupper($statut[2]) === 'CANCELLED') {
            continue;
        }
        $dtDebut = propriete($e, 'DTSTART');
        if (!$dtDebut) {
            continue;
        }
        [$debut, $journee] = lireDate($dtDebut[2], $dtDebut[1]);
        if (!$debut) {
            continue;
        }
        $dtFin = propriete($e, 'DTEND');
        [$fin] = $dtFin ? lireDate($dtFin[2], $dtFin[1]) : [null];
        $duree = $fin ? $fin->getTimestamp() - $debut->getTimestamp() : ($journee ? 86400 : 0);

        $titre = texteIcs(propriete($e, 'SUMMARY')[2] ?? '(sans titre)');
        $uid = propriete($e, 'UID')[2] ?? '';

        // Dates exclues (EXDATE).
        $exclues = [];
        foreach ($e as $p) {
            if ($p[0] === 'EXDATE') {
                foreach (explode(',', $p[2]) as $v) {
                    [$x] = lireDate($v, $p[1]);
                    if ($x) {
                        $exclues[$x->getTimestamp()] = true;
                    }
                }
            }
        }

        $regle = propriete($e, 'RRULE');
        $debuts = $regle && !propriete($e, 'RECURRENCE-ID')
            ? repetitions($debut, $regle[2], $debutFenetre, $finFenetre)
            : [$debut];

        foreach ($debuts as $d) {
            $t = $d->getTimestamp();
            if (isset($exclues[$t]) || ($regle && isset($remplacees[$uid . '|' . $t]))) {
                continue;
            }
            // Gardé s'il commence avant la fin de la fenêtre et n'est pas déjà terminé avant son début.
            $commenceAvantFin = $d < $finFenetre;
            $pasTermine = $d >= $debutFenetre || $t + $duree > $debutFenetre->getTimestamp();
            if (!$commenceAvantFin || !$pasTermine) {
                continue;
            }
            // Un événement commencé avant aujourd'hui (ex. vacances) est affiché aujourd'hui.
            $affiche = $d < $debutFenetre ? $debutFenetre : $d;
            $resultat[] = [
                'debut' => $affiche->format('Y-m-d\TH:i'),
                'journee' => $journee,
                'titre' => $titre,
            ];
        }
    }

    usort($resultat, fn($a, $b) => [$a['debut'], !$a['journee']] <=> [$b['debut'], !$b['journee']]);
    return $resultat;
}

// ---------------------------------------------------------------------
// Partage entre appareils : stockage dans des fichiers JSON
// ---------------------------------------------------------------------

/*
 * Le dossier des données partagées. De préférence À CÔTÉ du dossier du site
 * (pas accessible depuis internet) ; sinon dans "donnees/" protégé par un .htaccess.
 * deploy.sh ne touche jamais à ces dossiers.
 */
function dossierDonnees(): string
{
    static $dossier = null;
    if ($dossier !== null) {
        return $dossier;
    }
    $dehors = dirname(__DIR__) . '/nidoo-donnees';
    if ((is_dir($dehors) || @mkdir($dehors, 0700, true)) && is_writable($dehors)) {
        return $dossier = $dehors;
    }
    $dedans = __DIR__ . '/donnees';
    if (!is_dir($dedans) && !@mkdir($dedans, 0700, true)) {
        erreur("Impossible de créer le dossier des données sur le serveur.", 500);
    }
    if (!is_file($dedans . '/.htaccess')) {
        @file_put_contents($dedans . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    if (!is_file($dedans . '/index.html')) {
        @file_put_contents($dedans . '/index.html', '');
    }
    return $dossier = $dedans;
}

/* Lit un fichier JSON du dossier des données (tableau vide s'il n'existe pas). */
function lireJson(string $nom): array
{
    $chemin = dossierDonnees() . '/' . $nom;
    if (!is_file($chemin)) {
        return [];
    }
    $donnees = json_decode((string)file_get_contents($chemin), true);
    return is_array($donnees) ? $donnees : [];
}

/* Écrit un fichier JSON d'un coup (fichier temporaire puis renommage : jamais à moitié écrit). */
function ecrireJson(string $nom, array $donnees): void
{
    $chemin = dossierDonnees() . '/' . $nom;
    $temporaire = $chemin . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($temporaire, json_encode($donnees, JSON_UNESCAPED_UNICODE)) === false || !rename($temporaire, $chemin)) {
        @unlink($temporaire);
        erreur("Impossible d'enregistrer sur le serveur.", 500);
    }
}

/* Verrou : une seule requête à la fois modifie les fichiers (évite les écritures croisées). */
function verrouiller()
{
    $verrou = fopen(dossierDonnees() . '/.verrou', 'c');
    flock($verrou, LOCK_EX);
    return $verrou;
}

/*
 * Les données d'une famille sont lues et écrites en gardant les objets JSON tels quels
 * (avec un tableau PHP, un objet vide {} deviendrait une liste vide []).
 */
function lireFamille(string $cle): stdClass
{
    $chemin = dossierDonnees() . '/' . fichierFamille($cle);
    $donnees = is_file($chemin) ? json_decode((string)file_get_contents($chemin)) : null;
    return $donnees instanceof stdClass ? $donnees : (object)['version' => 0, 'etat' => null];
}

function ecrireFamille(string $cle, int $version, $etat): void
{
    $chemin = dossierDonnees() . '/' . fichierFamille($cle);
    $temporaire = $chemin . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $json = json_encode(['version' => $version, 'etat' => $etat], JSON_UNESCAPED_UNICODE);
    if (file_put_contents($temporaire, $json) === false || !rename($temporaire, $chemin)) {
        @unlink($temporaire);
        erreur("Impossible d'enregistrer sur le serveur.", 500);
    }
}

/* Le fichier d'une famille, à partir de sa clé secrète (le nom ne révèle pas la clé). */
function fichierFamille(string $cle): string
{
    return 'famille-' . hash('sha256', $cle) . '.json';
}

/* La clé de famille envoyée par l'appareil (en-tête X-Nidoo-Famille), vérifiée. */
function cleFamille(): string
{
    $cle = $_SERVER['HTTP_X_NIDOO_FAMILLE'] ?? '';
    if (!preg_match('/^[a-f0-9]{32}$/', $cle) || !is_file(dossierDonnees() . '/' . fichierFamille($cle))) {
        erreur("Cet appareil n'est relié à aucune famille (ou elle a été supprimée).", 401);
    }
    return $cle;
}

function corpsJson(): array
{
    $brut = file_get_contents('php://input');
    if (strlen($brut) > TAILLE_MAX_ETAT + 1000) {
        erreur('Données trop volumineuses.', 413);
    }
    $donnees = json_decode($brut ?: '{}', true);
    return is_array($donnees) ? $donnees : [];
}

/* Limite les essais de code ratés (contre quelqu'un qui essaierait tous les codes). */
function verifierEssais(bool $rate = false): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnue';
    $essais = lireJson('essais.json');
    $maintenant = time();
    foreach ($essais as $adresse => $dates) {
        $essais[$adresse] = array_values(array_filter($dates, fn($t) => $t > $maintenant - CODE_VALIDITE));
        if (!$essais[$adresse]) {
            unset($essais[$adresse]);
        }
    }
    if ($rate) {
        $essais[$ip][] = $maintenant;
    }
    ecrireJson('essais.json', $essais);
    if (count($essais[$ip] ?? []) >= ESSAIS_MAX) {
        erreur('Trop d\'essais. Réessayez dans quelques minutes.', 429);
    }
}

/* Le mot de passe des widgets premium est-il le bon ? (fichier premium.txt sur le serveur) */
function bonMotDePasse(string $essai): bool
{
    $chemin = dossierDonnees() . '/' . PREMIUM_FICHIER;
    if (!is_file($chemin)) {
        erreur("Les widgets premium ne sont pas réglés sur ce serveur (fichier " . PREMIUM_FICHIER
            . " à créer dans le dossier des données, voir le README).", 500);
    }
    $attendu = trim((string)file_get_contents($chemin));
    if ($attendu === '') {
        return false;
    }
    // Le fichier peut contenir le mot de passe, ou son empreinte faite avec password_hash().
    return str_starts_with($attendu, '$2') ? password_verify($essai, $attendu) : hash_equals($attendu, $essai);
}

/* La clé de la famille, si elle a débloqué les widgets premium (sinon : erreur). */
function famillePremium(): string
{
    $cle = cleFamille();
    if (!in_array(hash('sha256', $cle), lireJson('premium.json'), true)) {
        erreur('Widget premium : débloquez-le d\'abord (Ajouter → 🔒 Widgets premium).', 403);
    }
    return $cle;
}

// ---------------------------------------------------------------------
// Solde bancaire (Enable Banking)
// ---------------------------------------------------------------------

function base64url(string $texte): string
{
    return rtrim(strtr(base64_encode($texte), '+/', '-_'), '=');
}

/*
 * L'application Enable Banking à utiliser : [identifiant, chemin de la clé].
 * Pour l'instant une seule (la première clé du dossier). Pour d'autres familles avec leur
 * propre application, il faudra choisir ici la clé selon la famille.
 */
function applicationBanque(): array
{
    $cles = glob(dossierDonnees() . '/' . BANQUE_DOSSIER_CLES . '/*.pem') ?: [];
    sort($cles);
    foreach ($cles as $chemin) {
        $id = basename($chemin, '.pem');
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id)) {
            return [$id, $chemin];
        }
    }
    erreur("La clé Enable Banking n'est pas encore sur le serveur (fichier IDENTIFIANT-APPLICATION.pem "
        . "à déposer dans le dossier " . BANQUE_DOSSIER_CLES . " des données, voir le README).", 500);
}

/* Le jeton signé avec la clé privée, demandé par Enable Banking à chaque appel (valable 1 heure). */
function jetonBanque(): string
{
    [$application, $chemin] = applicationBanque();
    $cle = openssl_pkey_get_private((string)file_get_contents($chemin));
    if (!$cle) {
        erreur('La clé Enable Banking est illisible (ce doit être le fichier .pem téléchargé à la création de l\'application).', 500);
    }
    $maintenant = time();
    $entete = base64url(json_encode(['typ' => 'JWT', 'alg' => 'RS256', 'kid' => $application]));
    $contenu = base64url(json_encode([
        'iss' => 'enablebanking.com',
        'aud' => 'api.enablebanking.com',
        'iat' => $maintenant,
        'exp' => $maintenant + 3600,
    ]));
    if (!openssl_sign($entete . '.' . $contenu, $signature, $cle, OPENSSL_ALGO_SHA256)) {
        erreur('Impossible de signer la demande pour Enable Banking.', 500);
    }
    return $entete . '.' . $contenu . '.' . base64url($signature);
}

/* Un appel à l'API Enable Banking. Renvoie ['statut' => 200, 'json' => [...]]. */
function appelBanque(string $methode, string $chemin, ?array $corps = null, array $entetes = []): array
{
    $lignes = ['Authorization: Bearer ' . jetonBanque(), 'Content-Type: application/json', 'Accept: application/json'];
    foreach ($entetes as $nom => $valeur) {
        $lignes[] = $nom . ': ' . str_replace(["\r", "\n"], '', (string)$valeur);
    }
    $contexte = stream_context_create(['http' => [
        'method' => $methode,
        'header' => implode("\r\n", $lignes),
        'content' => $corps === null ? '' : json_encode($corps),
        'timeout' => 25,
        'ignore_errors' => true, // pour lire le message d'erreur renvoyé
    ]]);
    $texte = @file_get_contents(BANQUE_API . $chemin, false, $contexte);
    $statut = 0;
    foreach ($http_response_header ?? [] as $ligne) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $ligne, $m)) {
            $statut = (int)$m[1];
        }
    }
    $json = json_decode((string)$texte, true);
    return ['statut' => $statut, 'json' => is_array($json) ? $json : []];
}

/* Message lisible pour un appel raté. */
function messageBanque(array $reponse): string
{
    if ($reponse['statut'] === 0) {
        return 'Enable Banking ne répond pas.';
    }
    $j = $reponse['json'];
    $detail = $j['message'] ?? $j['error'] ?? null;
    if (isset($j['detail']) && is_string($j['detail'])) {
        $detail = trim(($detail ? $detail . ' : ' : '') . $j['detail']);
    }
    return 'Erreur de la banque (' . $reponse['statut'] . ($detail ? ' : ' . $detail : '') . ').';
}

/* Les infos du navigateur de la personne devant l'écran (la banque sait qu'elle est là). */
function entetesPresence(): array
{
    return [
        'Psu-Ip-Address' => $_SERVER['REMOTE_ADDR'] ?? '',
        'Psu-User-Agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? 'Nidoo', 0, 300),
    ];
}

/* Le fichier des comptes d'une famille (nom tiré de la clé, qui n'apparaît pas). */
function fichierBanque(string $empreinte): string
{
    return 'banque-' . $empreinte . '.json';
}

/* Les banques françaises disponibles (relues une fois par jour). */
function banquesDisponibles(): array
{
    $copie = lireJson('banque-liste.json');
    if (($copie['lu'] ?? 0) > time() - 86400 && !empty($copie['banques'])) {
        return $copie['banques'];
    }
    $r = appelBanque('GET', '/aspsps?country=' . BANQUE_PAYS);
    if ($r['statut'] !== 200) {
        if (!empty($copie['banques'])) {
            return $copie['banques'];
        }
        erreur(messageBanque($r), 502);
    }
    $banques = [];
    foreach ($r['json']['aspsps'] ?? [] as $a) {
        $types = $a['psu_types'] ?? ['personal'];
        if (!in_array('personal', $types, true)) {
            continue;
        }
        $banques[] = [
            'nom' => $a['name'],
            'pays' => $a['country'] ?? BANQUE_PAYS,
            'duree' => (int)($a['maximum_consent_validity'] ?? 0), // en secondes (0 : inconnu)
        ];
    }
    usort($banques, fn($a, $b) => strcasecmp($a['nom'], $b['nom']));
    ecrireJson('banque-liste.json', ['lu' => time(), 'banques' => $banques]);
    return $banques;
}

/* Parmi les soldes renvoyés par la banque, celui à afficher. */
function choisirSolde(array $soldes, string $prefere = ''): ?array
{
    $ordre = array_merge($prefere ? [$prefere] : [], ['ITBD', 'CLBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD']);
    foreach ($ordre as $type) {
        foreach ($soldes as $s) {
            if (($s['type'] ?? '') === $type) {
                return $s;
            }
        }
    }
    return $soldes[0] ?? null;
}

/* Retour dans Nidoo après la banque (avec un message pour le widget). */
function retourNidoo(string $resultat): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Location: ./?banque=' . rawurlencode($resultat));
    exit;
}

// ---------------------------------------------------------------------
// Anniversaires trouvés dans un agenda
// ---------------------------------------------------------------------

/* L'adresse d'agenda demandée, vérifiée (https et site autorisé), sinon erreur. */
function urlAgendaAutorisee(string $url): string
{
    $url = preg_replace('#^webcal://#i', 'https://', trim($url));
    $hote = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
    foreach (SITES_AGENDA as $site) {
        if (preg_match('#^https://#i', $url) && ($hote === $site || str_ends_with($hote, '.' . $site))) {
            return $url;
        }
    }
    erreur("Adresse d'agenda non autorisée. Sites acceptés : " . implode(', ', SITES_AGENDA)
        . ' (à modifier en haut de api.php).');
}

/*
 * Les événements qui reviennent chaque année et dont le titre parle d'anniversaire
 * ("Anniversaire de Mamie", "Anniv Lou 2017", "🎂 Paul", "Léa's birthday").
 * Renvoie [{ titre, nom, mois, jour, annee }] (annee : année de naissance si elle est
 * écrite dans le titre, sinon null).
 */
function anniversairesIcs(string $ics): array
{
    $resultat = [];
    $vus = [];
    foreach (lireEvenementsIcs($ics) as $e) {
        $titre = propriete($e, 'SUMMARY');
        $regle = propriete($e, 'RRULE');
        $debut = propriete($e, 'DTSTART');
        if (!$titre || !$debut || propriete($e, 'RECURRENCE-ID')) {
            continue;
        }
        $titre = trim(texteIcs($titre[2]));
        if (!preg_match('/anniv|birthday|\x{1F382}/iu', $titre)) {
            continue;
        }
        if (!$regle || !preg_match('/FREQ=YEARLY/i', $regle[2])) {
            continue; // seulement ce qui revient chaque année
        }
        [$date] = lireDate($debut[2], $debut[1]);
        if (!$date) {
            continue;
        }
        // Le nom : le titre sans "Anniversaire de", "Anniv", "birthday", 🎂, ni l'année.
        $annee = preg_match('/\b(19\d\d|20\d\d)\b/', $titre, $m) ? (int)$m[1] : null;
        $nom = preg_replace([
            '/\x{1F382}|\x{1F389}|\x{1F381}/u',
            '/\b(19\d\d|20\d\d)\b/',
            "/\b(anniversaire|anniv)\b\.?\s*(de\s+|d['’]\s*|du\s+|des\s+)?/iu",
            "/['’]s\s+birthday|\bbirthday\b(\s+of)?/iu",
            '/[()\-–:!]+/u',
        ], ' ', $titre);
        $nom = trim(preg_replace('/\s+/u', ' ', $nom)) ?: $titre;
        // "Anniversaire de mariage" : un nom commun, on garde le titre entier.
        if (preg_match('/^\p{Ll}/u', $nom)) {
            $nom = $titre;
        }
        $cle = mb_strtolower($nom) . '|' . $date->format('m-d');
        if (isset($vus[$cle])) {
            continue;
        }
        $vus[$cle] = true;
        $resultat[] = [
            'titre' => $titre,
            'nom' => $nom,
            'mois' => (int)$date->format('n'),
            'jour' => (int)$date->format('j'),
            'annee' => $annee,
        ];
    }
    return $resultat;
}

// ---------------------------------------------------------------------
// Chauffage : Home Assistant et Netatmo
// ---------------------------------------------------------------------

const NETATMO_API = 'https://api.netatmo.com';
const NETATMO_PORTEE = 'read_thermostat write_thermostat';

/*
 * Une requête HTTP qui renvoie ['statut' => 200, 'json' => [...]].
 * $corps : tableau envoyé en JSON (ou en formulaire si $formulaire), ou null.
 * Pas de redirection suivie (sécurité).
 */
function requeteHttp(string $methode, string $url, array $entetes = [], ?array $corps = null, bool $formulaire = false): array
{
    $lignes = ['Accept: application/json'];
    $contenu = '';
    if ($corps !== null) {
        $lignes[] = 'Content-Type: ' . ($formulaire ? 'application/x-www-form-urlencoded' : 'application/json');
        $contenu = $formulaire ? http_build_query($corps) : json_encode($corps);
    }
    foreach ($entetes as $nom => $valeur) {
        $lignes[] = $nom . ': ' . str_replace(["\r", "\n"], '', (string)$valeur);
    }
    $contexte = stream_context_create(['http' => [
        'method' => $methode,
        'header' => implode("\r\n", $lignes),
        'content' => $contenu,
        'timeout' => 15,
        'ignore_errors' => true,
        'follow_location' => 0,
    ]]);
    $texte = @file_get_contents($url, false, $contexte);
    $statut = 0;
    foreach ($http_response_header ?? [] as $ligne) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $ligne, $m)) {
            $statut = (int)$m[1];
        }
    }
    $json = json_decode((string)$texte, true);
    return ['statut' => $statut, 'json' => is_array($json) ? $json : []];
}

/*
 * Une adresse https vers une machine publique (pas le réseau interne du serveur) :
 * empêche d'utiliser Nidoo pour atteindre des machines privées.
 */
function urlPubliqueHttps(string $url): string
{
    $url = rtrim(trim($url), '/');
    $p = parse_url($url);
    if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['query'])) {
        erreur('Adresse invalide : il faut une adresse https://… joignable depuis internet (ex. Nabu Casa).');
    }
    $adresses = filter_var($p['host'], FILTER_VALIDATE_IP) ? [$p['host']] : (gethostbynamel($p['host']) ?: []);
    if (!$adresses) {
        erreur('Adresse introuvable : ' . $p['host']);
    }
    foreach ($adresses as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            erreur('Cette adresse mène à un réseau privé : utilisez une adresse joignable depuis internet.');
        }
    }
    return $url;
}

/* Le fichier Chauffage d'une famille (accès Netatmo), hors du site. */
function fichierChauffage(string $cle): string
{
    return 'chauffage-' . hash('sha256', $cle) . '.json';
}

/* Un jeton Netatmo valable (renouvelé s'il a expiré). */
function jetonNetatmo(string $fichier): string
{
    $d = lireJson($fichier);
    if (empty($d['netatmo']['rafraichir'])) {
        erreur('Netatmo n\'est pas encore connecté : ⚙️ du widget, puis « Se connecter à Netatmo ».', 404);
    }
    $n = $d['netatmo'];
    if (($n['expire'] ?? 0) > time() + 60) {
        return $n['acces'];
    }
    $r = requeteHttp('POST', NETATMO_API . '/oauth2/token', [], [
        'grant_type' => 'refresh_token',
        'refresh_token' => $n['rafraichir'],
        'client_id' => $n['client_id'],
        'client_secret' => $n['client_secret'],
    ], true);
    if ($r['statut'] !== 200 || empty($r['json']['access_token'])) {
        erreur('Netatmo refuse l\'accès : reconnectez-vous (⚙️ du widget).', 502);
    }
    $verrou = verrouiller();
    $d = lireJson($fichier);
    $d['netatmo']['acces'] = $r['json']['access_token'];
    $d['netatmo']['rafraichir'] = $r['json']['refresh_token'] ?? $n['rafraichir'];
    $d['netatmo']['expire'] = time() + (int)($r['json']['expires_in'] ?? 3600);
    ecrireJson($fichier, $d);
    flock($verrou, LOCK_UN);
    return $d['netatmo']['acces'];
}

/* L'adresse de retour après la connexion Netatmo (à déclarer dans l'application Netatmo). */
function retourNetatmo(): string
{
    $dossier = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/');
    return 'https://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dossier . '/chauffage.php';
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

$action = $_GET['action'] ?? '';

switch ($action) {
    // Vérifie que l'API fonctionne.
    case 'ping':
        repondre(['ok' => true, 'heure' => date('c')]);

    // Les événements d'un agenda iCal.
    case 'agenda':
        $url = trim($_GET['url'] ?? '');
        $url = preg_replace('#^webcal://#i', 'https://', $url);
        $hote = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
        $autorise = false;
        foreach (SITES_AGENDA as $site) {
            if ($hote === $site || str_ends_with($hote, '.' . $site)) {
                $autorise = true;
            }
        }
        if (!preg_match('#^https://#i', $url) || !$autorise) {
            erreur("Adresse d'agenda non autorisée. Sites acceptés : " . implode(', ', SITES_AGENDA)
                . ' (à modifier en haut de api.php).');
        }
        $ics = telecharger($url, ($_GET['forcer'] ?? '') === '1');
        if (strpos($ics, 'BEGIN:VCALENDAR') === false) {
            erreur("Ce n'est pas un agenda iCal. Vérifiez l'adresse.", 502);
        }
        $aujourdhui = new DateTimeImmutable('today');
        repondre([
            'ok' => true,
            'evenements' => evenementsAgenda($ics, $aujourdhui, $aujourdhui->modify('+' . JOURS_AGENDA . ' days')),
        ]);

    // Les anniversaires d'un agenda (événements annuels dont le titre parle d'anniversaire).
    case 'anniversaires':
        $ics = telecharger(urlAgendaAutorisee($_GET['url'] ?? ''));
        if (strpos($ics, 'BEGIN:VCALENDAR') === false) {
            erreur("Ce n'est pas un agenda iCal. Vérifiez l'adresse.", 502);
        }
        repondre(['ok' => true, 'anniversaires' => anniversairesIcs($ics)]);

    // Donne un code de partage (crée la famille si cet appareil n'en a pas encore).
    case 'code':
        $verrou = verrouiller();
        $corps = corpsJson();
        $cle = $corps['famille'] ?? '';
        if (!preg_match('/^[a-f0-9]{32}$/', $cle) || !is_file(dossierDonnees() . '/' . fichierFamille($cle))) {
            $cle = bin2hex(random_bytes(16));
            ecrireFamille($cle, 0, null);
        }
        $codes = array_filter(lireJson('codes.json'), fn($c) => $c['expire'] > time());
        do {
            $code = '';
            for ($i = 0; $i < 4; $i++) {
                $code .= CODE_LETTRES[random_int(0, strlen(CODE_LETTRES) - 1)];
            }
        } while (isset($codes[$code]));
        $codes[$code] = ['famille' => $cle, 'expire' => time() + CODE_VALIDITE];
        ecrireJson('codes.json', $codes);
        repondre(['ok' => true, 'code' => $code, 'expire' => CODE_VALIDITE, 'famille' => $cle]);

    // Échange un code contre la clé de la famille.
    case 'rejoindre':
        $verrou = verrouiller();
        verifierEssais();
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)(corpsJson()['code'] ?? '')));
        $codes = lireJson('codes.json');
        if (!isset($codes[$code]) || $codes[$code]['expire'] <= time()) {
            verifierEssais(true);
            erreur('Code inconnu ou expiré.', 404);
        }
        repondre(['ok' => true, 'famille' => $codes[$code]['famille']]);

    // L'état partagé de la famille.
    case 'lire':
        $donnees = lireFamille(cleFamille());
        repondre(['ok' => true, 'version' => $donnees->version ?? 0, 'etat' => $donnees->etat ?? null]);

    // Enregistre l'état partagé, seulement si personne ne l'a modifié depuis la dernière lecture.
    case 'ecrire':
        $verrou = verrouiller();
        $cle = cleFamille();
        $brut = file_get_contents('php://input');
        if (strlen($brut) > TAILLE_MAX_ETAT) {
            erreur('Données trop volumineuses.', 413);
        }
        $corps = json_decode($brut ?: '{}');
        $actuel = lireFamille($cle);
        $version = $actuel->version ?? 0;
        if (!($corps instanceof stdClass) || ($corps->version ?? -1) !== $version) {
            repondre(['ok' => false, 'conflit' => true, 'version' => $version, 'etat' => $actuel->etat ?? null], 409);
        }
        if (!(($corps->etat ?? null) instanceof stdClass) || !is_array($corps->etat->widgets ?? null)) {
            erreur('État invalide.');
        }
        ecrireFamille($cle, $version + 1, $corps->etat);
        repondre(['ok' => true, 'version' => $version + 1]);

    // Widgets premium : débloquer (POST) ou savoir si c'est débloqué (GET).
    case 'premium':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $cle = cleFamille();
            repondre(['ok' => true, 'premium' => in_array(hash('sha256', $cle), lireJson('premium.json'), true)]);
        }
        $verrou = verrouiller();
        verifierEssais();
        $corps = corpsJson();
        if (!bonMotDePasse((string)($corps['mot_de_passe'] ?? ''))) {
            verifierEssais(true);
            erreur('Mot de passe incorrect.', 403);
        }
        $cle = $corps['famille'] ?? '';
        if (!preg_match('/^[a-f0-9]{32}$/', $cle) || !is_file(dossierDonnees() . '/' . fichierFamille($cle))) {
            $cle = bin2hex(random_bytes(16));
            ecrireFamille($cle, 0, null);
        }
        $premium = lireJson('premium.json');
        if (!in_array(hash('sha256', $cle), $premium, true)) {
            $premium[] = hash('sha256', $cle);
            ecrireJson('premium.json', $premium);
        }
        repondre(['ok' => true, 'famille' => $cle]);

    // ---- Chauffage ------------------------------------------------------

    // Home Assistant : l'état d'un thermostat (climate.…), et sa nouvelle consigne si "temperature".
    case 'chauffage_ha':
        cleFamille(); // réservé aux appareils d'une famille (pas un relais ouvert à tous)
        $corps = corpsJson();
        $base = urlPubliqueHttps((string)($corps['url'] ?? ''));
        $entite = (string)($corps['entite'] ?? '');
        if (!preg_match('/^climate\.[a-z0-9_]+$/', $entite)) {
            erreur('Entité invalide : elle doit commencer par « climate. » (ex. climate.salon).');
        }
        $jeton = trim((string)($corps['jeton'] ?? ''));
        if ($jeton === '') {
            erreur('Il manque le jeton d\'accès Home Assistant (⚙️ du widget).');
        }
        $entetes = ['Authorization' => 'Bearer ' . $jeton];
        if (isset($corps['temperature'])) {
            $t = round((float)$corps['temperature'] * 2) / 2;
            if ($t < 5 || $t > 30) {
                erreur('Température hors limites (5 à 30 °C).');
            }
            $r = requeteHttp('POST', $base . '/api/services/climate/set_temperature', $entetes, ['entity_id' => $entite, 'temperature' => $t]);
            if ($r['statut'] !== 200) {
                erreur('Home Assistant a refusé le changement (' . $r['statut'] . ').', 502);
            }
        }
        $r = requeteHttp('GET', $base . '/api/states/' . $entite, $entetes);
        if ($r['statut'] === 401) {
            erreur('Jeton refusé par Home Assistant : vérifiez-le (⚙️ du widget).', 502);
        }
        if ($r['statut'] === 404) {
            erreur('Entité introuvable dans Home Assistant : ' . $entite, 502);
        }
        if ($r['statut'] !== 200) {
            erreur('Home Assistant ne répond pas (' . $r['statut'] . ').', 502);
        }
        $a = $r['json']['attributes'] ?? [];
        repondre([
            'ok' => true,
            'nom' => $a['friendly_name'] ?? $entite,
            'mesuree' => isset($a['current_temperature']) ? (float)$a['current_temperature'] : null,
            'consigne' => isset($a['temperature']) ? (float)$a['temperature'] : null,
            'mode' => $r['json']['state'] ?? null,          // heat, off, auto…
            'action' => $a['hvac_action'] ?? null,          // heating, idle, off…
            'min' => (float)($a['min_temp'] ?? 7),
            'max' => (float)($a['max_temp'] ?? 30),
            'pas' => (float)($a['target_temp_step'] ?? 0.5),
        ]);

    // Netatmo : prépare la connexion (identifiants de l'application Netatmo de la famille).
    case 'netatmo_connexion':
        $cle = cleFamille();
        $corps = corpsJson();
        $id = trim((string)($corps['client_id'] ?? ''));
        $secret = trim((string)($corps['client_secret'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9]{10,64}$/', $id) || !preg_match('/^[A-Za-z0-9]{10,128}$/', $secret)) {
            erreur('Identifiant ou secret Netatmo invalide (copiez-les depuis dev.netatmo.com).');
        }
        $jeton = bin2hex(random_bytes(16));
        $verrou = verrouiller();
        $fichier = fichierChauffage($cle);
        $d = lireJson($fichier);
        $d['netatmo'] = array_merge($d['netatmo'] ?? [], ['client_id' => $id, 'client_secret' => $secret]);
        ecrireJson($fichier, $d);
        $etats = array_filter(lireJson('chauffage-etats.json'), fn($e) => $e['expire'] > time());
        $etats[$jeton] = ['fichier' => $fichier, 'retour' => retourNetatmo(), 'expire' => time() + 1800];
        ecrireJson('chauffage-etats.json', $etats);
        repondre(['ok' => true, 'url' => NETATMO_API . '/oauth2/authorize?' . http_build_query([
            'client_id' => $id,
            'redirect_uri' => retourNetatmo(),
            'scope' => NETATMO_PORTEE,
            'state' => $jeton,
        ]), 'retour' => retourNetatmo()]);

    // Netatmo : retour après la connexion (via chauffage.php).
    case 'netatmo_retour':
        $etatRecu = (string)($_GET['state'] ?? '');
        $verrou = verrouiller();
        $etats = array_filter(lireJson('chauffage-etats.json'), fn($e) => $e['expire'] > time());
        $etat = $etats[$etatRecu] ?? null;
        unset($etats[$etatRecu]);
        ecrireJson('chauffage-etats.json', $etats);
        flock($verrou, LOCK_UN);
        header('Content-Type: text/html; charset=utf-8');
        if (!$etat || empty($_GET['code'])) {
            header('Location: ./?chauffage=' . rawurlencode(isset($_GET['error']) ? 'Connexion Netatmo annulée.' : 'Le lien a expiré. Recommencez depuis le widget.'));
            exit;
        }
        $d = lireJson($etat['fichier']);
        $r = requeteHttp('POST', NETATMO_API . '/oauth2/token', [], [
            'grant_type' => 'authorization_code',
            'client_id' => $d['netatmo']['client_id'] ?? '',
            'client_secret' => $d['netatmo']['client_secret'] ?? '',
            'code' => (string)$_GET['code'],
            'redirect_uri' => $etat['retour'] ?? retourNetatmo(), // la même adresse qu'à l'aller
            'scope' => NETATMO_PORTEE,
        ], true);
        if ($r['statut'] !== 200 || empty($r['json']['access_token'])) {
            header('Location: ./?chauffage=' . rawurlencode('Netatmo a refusé la connexion (' . $r['statut'] . ').'));
            exit;
        }
        $verrou = verrouiller();
        $d = lireJson($etat['fichier']);
        $d['netatmo']['acces'] = $r['json']['access_token'];
        $d['netatmo']['rafraichir'] = $r['json']['refresh_token'] ?? '';
        $d['netatmo']['expire'] = time() + (int)($r['json']['expires_in'] ?? 3600);
        ecrireJson($etat['fichier'], $d);
        header('Location: ./?chauffage=ok');
        exit;

    // Netatmo : les pièces, leur température et leur consigne.
    case 'netatmo_etat':
        $fichier = fichierChauffage(cleFamille());
        $entetes = ['Authorization' => 'Bearer ' . jetonNetatmo($fichier)];
        $r = requeteHttp('GET', NETATMO_API . '/api/homesdata', $entetes);
        if ($r['statut'] !== 200) {
            erreur('Netatmo ne répond pas (' . $r['statut'] . ').', 502);
        }
        $pieces = [];
        foreach ($r['json']['body']['homes'] ?? [] as $maison) {
            $noms = [];
            foreach ($maison['rooms'] ?? [] as $piece) {
                $noms[$piece['id']] = $piece['name'] ?? 'Pièce';
            }
            if (!$noms) {
                continue;
            }
            $s = requeteHttp('GET', NETATMO_API . '/api/homestatus?' . http_build_query(['home_id' => $maison['id']]), $entetes);
            foreach ($s['json']['body']['home']['rooms'] ?? [] as $piece) {
                $pieces[] = [
                    'maison' => $maison['id'],
                    'id' => $piece['id'],
                    'nom' => $noms[$piece['id']] ?? 'Pièce',
                    'mesuree' => isset($piece['therm_measured_temperature']) ? (float)$piece['therm_measured_temperature'] : null,
                    'consigne' => isset($piece['therm_setpoint_temperature']) ? (float)$piece['therm_setpoint_temperature'] : null,
                    'mode' => $piece['therm_setpoint_mode'] ?? null,
                ];
            }
        }
        repondre(['ok' => true, 'pieces' => $pieces]);

    // Netatmo : nouvelle consigne pour une pièce (mode manuel, jusqu'à la fin de la durée par défaut).
    case 'netatmo_consigne':
        $fichier = fichierChauffage(cleFamille());
        $corps = corpsJson();
        $t = round((float)($corps['temperature'] ?? 0) * 2) / 2;
        if ($t < 7 || $t > 30) {
            erreur('Température hors limites (7 à 30 °C).');
        }
        $r = requeteHttp('POST', NETATMO_API . '/api/setroomthermpoint', ['Authorization' => 'Bearer ' . jetonNetatmo($fichier)], [
            'home_id' => (string)($corps['maison'] ?? ''),
            'room_id' => (string)($corps['piece'] ?? ''),
            'mode' => 'manual',
            'temp' => $t,
        ], true);
        if ($r['statut'] !== 200) {
            erreur('Netatmo a refusé le changement (' . $r['statut'] . ').', 502);
        }
        repondre(['ok' => true]);

    // ---- Solde bancaire ----------------------------------------------

    // Les banques disponibles (pour choisir où se connecter).
    case 'banque_banques':
        famillePremium();
        repondre(['ok' => true, 'banques' => array_map(fn($b) => $b['nom'], banquesDisponibles())]);

    // Prépare la connexion à une banque : renvoie l'adresse où l'envoyer.
    case 'banque_connexion':
        $cle = famillePremium();
        $nom = (string)(corpsJson()['banque'] ?? '');
        $banque = null;
        foreach (banquesDisponibles() as $b) {
            if ($b['nom'] === $nom) {
                $banque = $b;
            }
        }
        if (!$banque) {
            erreur('Banque inconnue : ' . $nom);
        }
        $application = appelBanque('GET', '/application');
        $retour = $application['json']['redirect_urls'][0] ?? null;
        if ($application['statut'] !== 200 || !$retour) {
            erreur(messageBanque($application), 502);
        }
        $duree = $banque['duree'] > 0 ? min($banque['duree'], BANQUE_ACCES_MAX) : 90 * 86400;
        $fin = time() + $duree - 3600;
        $jeton = bin2hex(random_bytes(16));
        $r = appelBanque('POST', '/auth', [
            'access' => ['valid_until' => gmdate('Y-m-d\TH:i:s\Z', $fin)],
            'aspsp' => ['name' => $banque['nom'], 'country' => $banque['pays']],
            'state' => $jeton,
            'redirect_url' => $retour,
            'psu_type' => 'personal',
        ], entetesPresence());
        if ($r['statut'] !== 200 || empty($r['json']['url'])) {
            erreur(messageBanque($r), 502);
        }
        $verrou = verrouiller();
        $etats = array_filter(lireJson('banque-etats.json'), fn($e) => $e['expire'] > time());
        $etats[$jeton] = [
            'famille' => hash('sha256', $cle),
            'banque' => $banque['nom'],
            'fin' => $fin,
            'expire' => time() + 1800, // 30 minutes pour se connecter à la banque
        ];
        ecrireJson('banque-etats.json', $etats);
        repondre(['ok' => true, 'url' => $r['json']['url']]);

    // Retour de la banque (via banque.php) : on enregistre les comptes autorisés.
    case 'banque_retour':
        $jeton = (string)($_GET['state'] ?? '');
        $verrou = verrouiller();
        $etats = array_filter(lireJson('banque-etats.json'), fn($e) => $e['expire'] > time());
        $etat = $etats[$jeton] ?? null;
        unset($etats[$jeton]);
        ecrireJson('banque-etats.json', $etats);
        flock($verrou, LOCK_UN);
        if (!$etat) {
            retourNidoo('Le lien a expiré. Recommencez depuis le widget.');
        }
        if (isset($_GET['error']) || empty($_GET['code'])) {
            retourNidoo('Connexion annulée par la banque' . (isset($_GET['error_description']) ? ' : ' . $_GET['error_description'] : '.'));
        }
        $r = appelBanque('POST', '/sessions', ['code' => (string)$_GET['code']], entetesPresence());
        if ($r['statut'] !== 200) {
            retourNidoo(messageBanque($r));
        }
        $fin = $etat['fin'];
        if (!empty($r['json']['access']['valid_until'])) {
            $fin = strtotime($r['json']['access']['valid_until']) ?: $fin;
        }
        $verrou = verrouiller();
        $fichier = fichierBanque($etat['famille']);
        $donnees = lireJson($fichier);
        $comptes = $donnees['comptes'] ?? [];
        $nombre = 0;
        foreach ($r['json']['accounts'] ?? [] as $a) {
            if (empty($a['uid'])) {
                continue;
            }
            // L'identifiant "uid" change à chaque connexion ; "identification_hash" reste le même :
            // c'est lui que le widget retient, pour survivre aux reconnexions.
            $id = $a['identification_hash'] ?? $a['uid'];
            $numero = $a['account_id']['iban'] ?? ($a['account_id']['other']['identification'] ?? '');
            $comptes[$id] = [
                'uid' => $a['uid'],
                'nom' => trim((string)($a['product'] ?? '')) ?: trim((string)($a['details'] ?? '')) ?: trim((string)($a['name'] ?? '')) ?: 'Compte',
                'titulaire' => trim((string)($a['name'] ?? '')),
                'numero' => $numero ? substr(preg_replace('/\s+/', '', $numero), -4) : '',
                'devise' => $a['currency'] ?? 'EUR',
                'banque' => $etat['banque'],
                'fin' => $fin,
            ];
            $nombre++;
        }
        $donnees['comptes'] = $comptes;
        ecrireJson($fichier, $donnees);
        retourNidoo($nombre ? 'ok' : 'La banque n\'a autorisé aucun compte.');

    // Les comptes reliés à la famille.
    case 'banque_comptes':
        $donnees = lireJson(fichierBanque(hash('sha256', famillePremium())));
        $liste = [];
        foreach ($donnees['comptes'] ?? [] as $id => $c) {
            $liste[] = ['id' => $id] + array_intersect_key($c, array_flip(['nom', 'titulaire', 'numero', 'devise', 'banque', 'fin']));
        }
        repondre(['ok' => true, 'comptes' => $liste]);

    // Le solde d'un compte (gardé en mémoire : la banque n'est relue que de temps en temps).
    case 'banque_solde':
        $fichier = fichierBanque(hash('sha256', famillePremium()));
        $id = (string)($_GET['compte'] ?? '');
        $present = ($_GET['present'] ?? '') === '1';
        $donnees = lireJson($fichier);
        $compte = $donnees['comptes'][$id] ?? null;
        if (!$compte) {
            erreur('Ce compte n\'est plus relié : reconnectez la banque.', 404);
        }
        $memoire = $donnees['soldes'][$id] ?? null;
        // Délai avant de relire la banque : court si quelqu'un a touché 👁, sinon 6 heures
        // (15 minutes après un échec).
        if ($present) {
            $delai = BANQUE_RELIRE_PRESENT;
        } else {
            $delai = isset($memoire['echec']) ? BANQUE_REESSAYER : BANQUE_RELIRE;
        }
        $derniere = max($memoire['lu'] ?? 0, $memoire['essai'] ?? 0);
        $relire = !$memoire || time() - $derniere >= $delai;
        $probleme = $memoire['echec'] ?? null;
        if ($relire && $compte['fin'] > time()) {
            $r = appelBanque('GET', '/accounts/' . rawurlencode($compte['uid']) . '/balances', null,
                $present ? entetesPresence() : []);
            $verrou = verrouiller();
            $donnees = lireJson($fichier);
            $memoire = $donnees['soldes'][$id] ?? [];
            if ($r['statut'] === 200) {
                $soldes = [];
                foreach ($r['json']['balances'] ?? [] as $b) {
                    $soldes[] = [
                        'type' => $b['balance_type'] ?? '',
                        'nom' => $b['name'] ?? '',
                        'montant' => (float)($b['balance_amount']['amount'] ?? 0),
                        'devise' => $b['balance_amount']['currency'] ?? $compte['devise'],
                    ];
                }
                $memoire = ['lu' => time(), 'soldes' => $soldes];
                $probleme = null;
            } else {
                $memoire['echec'] = messageBanque($r);
                $memoire['essai'] = time();
                $probleme = $memoire['echec'];
            }
            $donnees['soldes'][$id] = $memoire;
            ecrireJson($fichier, $donnees);
        }
        $choisi = choisirSolde($memoire['soldes'] ?? [], (string)($_GET['type'] ?? ''));
        repondre([
            'ok' => true,
            'solde' => $choisi,
            'soldes' => $memoire['soldes'] ?? [],
            'lu' => $memoire['lu'] ?? null,
            'fin' => $compte['fin'],
            'probleme' => $probleme,
        ]);

    default:
        erreur('Action inconnue : ' . $action);
}
