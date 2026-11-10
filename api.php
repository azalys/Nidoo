<?php
/*
 * API de Nidoo.
 *
 * Sert plus tard à aller chercher des informations à l'extérieur
 * (ex. Google Agenda), ce que le navigateur ne peut pas faire seul.
 *
 * Appel depuis le JavaScript :
 *   fetch('api.php?action=ping').then(r => r.json())
 *
 * Pour ajouter une action : ajouter un "case" dans le switch ci-dessous.
 */

header('Content-Type: application/json; charset=utf-8');

function repondre(array $donnees, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    // Vérifie que l'API fonctionne.
    case 'ping':
        repondre(['ok' => true, 'heure' => date('c')]);

    default:
        repondre(['ok' => false, 'erreur' => 'Action inconnue : ' . $action], 400);
}
