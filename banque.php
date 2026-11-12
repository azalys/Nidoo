<?php
/*
 * Page de retour après la connexion à la banque (Enable Banking renvoie ici,
 * c'est l'adresse « Redirect URL » réglée dans l'application Enable Banking).
 * Elle passe simplement la main à api.php, qui enregistre les comptes autorisés
 * puis ramène sur Nidoo.
 */
$parametres = array_intersect_key($_GET, array_flip(['code', 'state', 'error', 'error_description']));
header('Location: api.php?action=banque_retour&' . http_build_query($parametres));
