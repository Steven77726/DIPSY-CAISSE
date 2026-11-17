# Passerelle Dipsy Tables ↔ Dipsy Caisse

## Source de vérité et identité

Les données de réservation font autorité dans **l’état Dipsy Tables versionné sur Supabase**, `dipsy_tables_state`. Sa projection `dipsy_reservations` est mise à jour dans la même transaction. Dipsy Caisse ne recherche jamais une réservation par son nom, son téléphone ou sa table.

Chaque réservation conserve son UUID d’origine, également enregistré sous `reservation_id`. Un ancien identifiant textuel non UUID est converti de façon déterministe à partir de cet identifiant seul ; sa valeur d’origine reste dans `legacy_id` et dans la sauvegarde. Un identifiant absent ou dupliqué bloque la migration : il exige une réconciliation explicite, sans rapprochement automatique par nom.

`caisse_reservation_cases.reservation_id` est une clé primaire et une clé étrangère. Le client et la commande sont uniques et rattachés par des clés étrangères composites à la même réservation. Ouvrir deux fois ou simultanément la même réservation retourne la même fiche, le même client et la même commande. Deux homonymes possédant deux UUID gardent deux fiches distinctes.

## Accès libre et reprise des appareils

À la demande explicite du propriétaire, les deux applications utilisent désormais un accès libre, y compris aux réservations, clients et encaissements liés. Toute personne ayant le lien peut consulter et modifier ces données. Le rôle technique public existant enregistre les opérations sans créer de mot de passe partagé ni exposer de clé secrète.

`caisse_runtime.bridge_public_access` active la passerelle libre uniquement si `public_access` est aussi actif. Les écritures directes REST restent interdites par les privilèges et RLS ; les RPC contrôlent les versions, clés d’opération, contraintes et clôtures. Les accès de l’équipe restent modifiables uniquement par un véritable administrateur authentifié.

Sur chaque ancien appareil, ouvrir l’URL habituelle de Dipsy Tables sans effacer les données. La copie d’origine est conservée avant la migration. Les UUID distincts sont réunis automatiquement et le serveur conserve un snapshot immuable de l’import. Les variantes du même UUID et la réapparition d’une réservation supprimée demandent un choix explicite. Aucun identifiant absent ou dupliqué n’est inventé silencieusement. « Copie de secours » permet de télécharger les données d’origine.

Le bouton CAISSE ouvre `https://steven77726.github.io/DIPSY-CAISSE/?reservation_id=<UUID>` sans connexion lorsque le mode libre est activé. Les données proviennent du serveur, sans nom ni téléphone dans le lien. Aucun doublon de fiche n’est créé à la réouverture.

## Articles et état des paiements

« Articles & prix » dans Tables, ou « Gérer la carte » dans Caisse, modifie le nom, la référence, le prix, la TVA, la catégorie, le groupe comptable et la disponibilité. La TVA n’est jamais déduite d’une catégorie. Chaque nouvel article ajouté à un ticket prend une copie de ces informations ; les tickets existants conservent leur prix historique et leur référence.

« ARTICLES » sur une réservation ouvre son ticket exact. « Corriger » permet de changer l’article, le nom, la quantité ou le prix avant tout règlement. Caisse propose aussi la correction de référence, TVA et groupe sur le ticket. `correct_line` est une opération explicite avec UUID, version, verrou commun aux règlements et journal avant/après. Toute correction est refusée après le premier versement ou la clôture ; elle ne change jamais rétroactivement la répartition comptable d’un encaissement.

Le plan et les fiches utilisent un snapshot confirmé, indexé par `reservation_id`. Solde intégralement payé et statut `paid` : vert ; commande vide, absente, en cours ou partielle : rouge clair ; état inconnu, erreur ou hors ligne : gris. Les événements Realtime déclenchent une relecture, complétée par une vérification périodique. Une correction non confirmée ne devient pas un résultat enregistré.

## Corrections et conflits

Dans Dipsy Tables, les corrections mettent à jour l’état versionné. Dans Dipsy Caisse, **Corriger la réservation** met à jour ce même état, puis la projection et la fiche, atomiquement. Les champs de contexte du ticket et l’éditeur client générique ne permettent pas de contourner ce flux.

Les écritures de Tables vérifient la version de l’état partagé ; les corrections de Caisse vérifient la version de la réservation. Une ancienne version est refusée. La saisie en cours reste visible ; l’utilisateur compare la version serveur et sa saisie avant de choisir. Les articles, prix historiques et paiements ne sont jamais réécrits par une correction du nom, du téléphone, de la date ou de la table.

Les opérations envoyées gardent leur identifiant en cas de réponse perdue. Tables conserve sa file locale avant envoi ; Caisse utilise sa file IndexedDB durable. Le résultat n’est confirmé qu’après réponse serveur. Un conflit explicitement refusé peut être remplacé après comparaison ; une opération dont le résultat est inconnu reste à vérifier. Le retour à un serveur de version inférieure est signalé au lieu d’écraser la copie locale.

## Déploiement, sauvegarde et reprise

Appliquer, dans cet ordre : `20261116225040_reservation_bridge.sql`, `20261117103425_article_corrections.sql`, puis `20261117114608_bridge_free_access.sql`. La dernière migration laisse le nouvel accès désactivé jusqu’à son activation explicite dans `caisse_runtime`. Elle s’applique après le schéma caisse et l’activation publique existants. Elle ne contient aucune réservation réelle ni adresse d’administrateur.

Les quinze tables caisse/passerelle, leurs clés d’opération et les identités Auth correspondantes doivent être restaurées ensemble. Les scripts de sauvegarde incluent les quatre tables `dipsy_*` de la passerelle et toutes les tables `caisse_*`. La sauvegarde nocturne reste à configurer ; les tests de restauration isolée ne constituent pas une sauvegarde de production.

Pour suspendre l’accès libre à la liaison, mettre `bridge_public_access=false` dans `caisse_runtime` ; pour fermer aussi la caisse libre, mettre `public_access=false`. Désactiver seulement les accès de l’équipe dans `caisse_access` ne ferme pas le mode public. Toujours et conserver les données et files locales. Ne pas supprimer ou réattribuer les UUID et ne pas restaurer une ancienne interface qui réactive l’ancienne synchronisation globale. Restaurer d’abord sur une base isolée, contrôler les quinze tables et rejouer une ancienne clé de paiement avant la reprise.

## Vérifications

Tests PostgreSQL : authentification et droits, anonymat refusé malgré la caisse libre, migration sans perte, homonymes, unicité et réouverture, corrections bidirectionnelles, conflits, suppression conservée, paiement mixte rejoué une seule fois et restauration des quinze tables. Tests de migration côté Tables : UUID stables, sauvegarde non mutée, identifiant absent/dupliqué, homonymes et fusion de trois versions. Tests de session : origine, fenêtre, nonce et réponse unique.

Parcours navigateur réalisé avec une base PostgreSQL et des comptes **fictifs isolés** : deux homonymes, migration, ouverture de la bonne fiche, commande, correction dans chaque sens et saisie concurrente conservée. La première confirmation d’e-mail réelle et la migration des navigateurs du restaurant restent des actions à effectuer sur ces appareils.

## Validation des évolutions

14 contrôles PostgreSQL supplémentaires vérifient corrections, référence, TVA, versions concurrentes, clés rejouées, protections après paiement, activation et fermeture du mode libre. Tests Tables : paiement partiel, solde, UUID distincts et état sans confirmation. Parcours navigateur sur données fictives : fiche complète modifiée, ticket corrigé, ouverture sans compte, règlement final et changement automatique de couleur. Les réservations encore locales sur les appareils du restaurant ne sont présentes sur Supabase qu’après leur première ouverture avec cette version.
