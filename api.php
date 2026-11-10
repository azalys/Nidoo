<?php
/*
 * API de Nidoo : ce que le navigateur ne peut pas faire seul.
 *
 *   api.php?action=ping                 vérifie que l'API fonctionne
 *   api.php?action=agenda&url=...       événements des 7 prochains jours d'un agenda iCal
 *
 * Partage entre appareils (voir js/synchro.js) :
 *   POST api.php?action=code             donne un code de 4 caractères valable 10 min
 *   POST api.php?action=rejoindre        échange un code contre la clé de la famille
 *   GET  api.php?action=lire             l'état partagé (en-tête X-Nidoo-Famille : la clé)
 *   POST api.php?action=ecrire           enregistre l'état partagé (si personne ne l'a changé entre-temps)
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

function telecharger(string $url): string
{
    $dossier = sys_get_temp_dir() . '/nidoo-cache';
    if (!is_dir($dossier)) {
        @mkdir($dossier, 0700, true);
    }
    $fichier = $dossier . '/' . md5($url);
    if (is_file($fichier) && time() - filemtime($fichier) < CACHE_SECONDES) {
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
        $ics = telecharger($url);
        if (strpos($ics, 'BEGIN:VCALENDAR') === false) {
            erreur("Ce n'est pas un agenda iCal. Vérifiez l'adresse.", 502);
        }
        $aujourdhui = new DateTimeImmutable('today');
        repondre([
            'ok' => true,
            'evenements' => evenementsAgenda($ics, $aujourdhui, $aujourdhui->modify('+' . JOURS_AGENDA . ' days')),
        ]);

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

    default:
        erreur('Action inconnue : ' . $action);
}
