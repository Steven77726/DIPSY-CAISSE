# Passerelle Dipsy Tables ↔ Dipsy Caisse

## Source de vérité et identité

Les données de réservation font autorité dans **l’état Dipsy Tables versionné sur Supabase**, `dipsy_tables_state`. Sa projection `dipsy_reservations` est mise à jour dans la même transaction. Dipsy Caisse ne recherche jamais une réservation par son nom, son téléphone ou sa table.

Chaque réservation conserve son UUID d’origine, également enregistré sous `reservation_id`. Un ancien identifiant textuel non UUID est converti de façon déterministe à partir de cet identifiant seul ; sa valeur d’origine reste dans `legacy_id` et dans la sauvegarde. Un identifiant absent ou dupliqué bloque la migration : il exige une réconciliation explicite, sans rapprochement automatique par nom.

`caisse_reservation_cases.reservation_id` est une clé primaire et une clé étrangère. Le client et la commande sont uniques et rattachés par des clés étrangères composites à la même réservation. Ouvrir deux fois ou simultanément la même réservation retourne la même fiche, le même client et la même commande. Deux homonymes possédant deux UUID gardent deux fiches distinctes.

## Première activation sur les appareils existants

Les réservations existantes sont dans les navigateurs des appareils, et non dans le projet Supabase actuel. L’ancienne configuration du dépôt pointait vers `vkkkpijncevbwzvopctp`, inaccessible lors de la préparation. La nouvelle passerelle utilise `wseewiaaygyzkalpslee` ; elle n’écrit pas dans l’ancien projet.

Sur **chaque appareil et profil de navigateur contenant des réservations** :

1. Fermer les anciens onglets Dipsy Tables, puis ouvrir l’URL habituelle dans le même navigateur. Ne pas effacer ses données ni changer d’origine. Si le nombre de réservations est inattendu, ne pas confirmer la migration.
2. Cliquer **Connexion sécurisée** et utiliser une adresse confirmée figurant dans la liste d’accès Dipsy. Le choix Steven/Naty du service n’accorde aucun droit. Pour le premier compte, **Première connexion : créer mon accès**, confirmer l’e-mail puis revenir se connecter. Le propriétaire choisit son mot de passe lui-même.
3. Cliquer **Préparer la migration**. La migration exige le rôle administrateur. Vérifier le nombre de réservations locales et partagées, puis télécharger la copie de secours proposée.
4. Si le même UUID comporte des versions différentes, choisir explicitement celle à conserver. Les UUID distincts sont réunis ; une réservation supprimée n’est pas rétablie automatiquement par une ancienne copie.
5. Confirmer. L’application conserve la copie locale d’origine, les notes et l’historique ; le serveur conserve aussi le snapshot importé. Le bouton CAISSE devient opérationnel après la confirmation serveur. Répéter sur les autres appareils avant d’utiliser exclusivement l’état partagé.

Une sauvegarde JSON locale illisible déclenche un mode de lecture seule et permet de télécharger les données brutes. L’application ne remplace pas cette sauvegarde par une liste vide. Un manque d’espace local ou une erreur de migration bloque l’activation.

## Ouverture et connexion

Le bouton **CAISSE**, présent dans le titre de chaque fiche de réservation, ouvre `https://steven77726.github.io/DIPSY-CAISSE/?reservation_id=<UUID>`. Aucun nom, téléphone, date, jeton ou mot de passe ne figure dans le lien. Les informations préremplies proviennent du serveur après vérification des droits.

Si le nouvel onglet conserve son lien avec Dipsy Tables, la session peut être transmise par `postMessage` : origine exacte, fenêtre émettrice, UUID et nonce uniques sont contrôlés, la réponse est acceptée une seule fois et l’écoute expire après 30 secondes. Les jetons ne figurent jamais dans une URL ou un journal. Si le navigateur isole les onglets, Dipsy Caisse demande une connexion normale ; la réservation reste désignée par son UUID.

La caisse libre reste disponible pour les commandes sans réservation. Les réservations liées, clients, tables associées, articles, paiements et journaux correspondants sont exclus des lectures anonymes. Une personne authentifiée doit aussi avoir une adresse confirmée et un accès actif. Les mutations directes REST restent interdites.

## Corrections et conflits

Dans Dipsy Tables, les corrections mettent à jour l’état versionné. Dans Dipsy Caisse, **Corriger la réservation** met à jour ce même état, puis la projection et la fiche, atomiquement. Les champs de contexte du ticket et l’éditeur client générique ne permettent pas de contourner ce flux.

Les écritures de Tables vérifient la version de l’état partagé ; les corrections de Caisse vérifient la version de la réservation. Une ancienne version est refusée. La saisie en cours reste visible ; l’utilisateur compare la version serveur et sa saisie avant de choisir. Les articles, prix historiques et paiements ne sont jamais réécrits par une correction du nom, du téléphone, de la date ou de la table.

Les opérations envoyées gardent leur identifiant en cas de réponse perdue. Tables conserve sa file locale avant envoi ; Caisse utilise sa file IndexedDB durable. Le résultat n’est confirmé qu’après réponse serveur. Un conflit explicitement refusé peut être remplacé après comparaison ; une opération dont le résultat est inconnu reste à vérifier. Le retour à un serveur de version inférieure est signalé au lieu d’écraser la copie locale.

## Déploiement, sauvegarde et reprise

La migration additive est `supabase/migrations/20261116225040_reservation_bridge.sql`. Elle s’applique après le schéma caisse et l’activation publique existants. Elle ne contient aucune réservation réelle ni adresse d’administrateur.

Les quinze tables caisse/passerelle, leurs clés d’opération et les identités Auth correspondantes doivent être restaurées ensemble. Les scripts de sauvegarde incluent les quatre tables `dipsy_*` de la passerelle et toutes les tables `caisse_*`. La sauvegarde nocturne reste à configurer ; les tests de restauration isolée ne constituent pas une sauvegarde de production.

Pour suspendre la liaison, désactiver les accès de l’équipe dans `caisse_access` et conserver les données et files locales. Ne pas supprimer ou réattribuer les UUID et ne pas restaurer une ancienne interface qui réactive l’ancienne synchronisation globale. Restaurer d’abord sur une base isolée, contrôler les quinze tables et rejouer une ancienne clé de paiement avant la reprise.

## Vérifications

Tests PostgreSQL : authentification et droits, anonymat refusé malgré la caisse libre, migration sans perte, homonymes, unicité et réouverture, corrections bidirectionnelles, conflits, suppression conservée, paiement mixte rejoué une seule fois et restauration des quinze tables. Tests de migration côté Tables : UUID stables, sauvegarde non mutée, identifiant absent/dupliqué, homonymes et fusion de trois versions. Tests de session : origine, fenêtre, nonce et réponse unique.

Parcours navigateur réalisé avec une base PostgreSQL et des comptes **fictifs isolés** : deux homonymes, migration, ouverture de la bonne fiche, commande, correction dans chaque sens et saisie concurrente conservée. La première confirmation d’e-mail réelle et la migration des navigateurs du restaurant restent des actions à effectuer sur ces appareils.
