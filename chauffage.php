<?php
/*
 * Page de retour après la connexion à Netatmo (widget Chauffage) : c'est l'adresse
 * « Redirect URI » à déclarer dans l'application Netatmo (dev.netatmo.com).
 * Elle passe la main à api.php, qui enregistre l'accès puis ramène sur Nidoo.
 */
$parametres = array_intersect_key($_GET, array_flip(['code', 'state', 'error']));
header('Location: api.php?action=netatmo_retour&' . http_build_query($parametres));
